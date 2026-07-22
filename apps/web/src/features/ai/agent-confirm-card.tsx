'use client'

/**
 * agent-confirm-card — /ask agent 的 DSL 提议确认门。
 *
 * AI 回复里提取的 cys-dsl 块 → 本组件渲染:变更摘要(added/removed/changed)
 * + before/after 缩略图 + [应用][拒绝][让AI改] 三按钮。
 *
 * 机制(脱离 /canvas 页,无实时 host):
 *  - buildCanvasHostForCanvas(targetCanvasId) → before host
 *  - parseDslWithDiagnostics(dsl) → ops(格式错显示错误,不阻塞对话)
 *  - 克隆 before host → applyLayout(预演)→ after elements
 *  - diffCanvasSnapshots(before, after) → 变更摘要
 *  - [应用] → applyOpsAndPersist(落库:freeform save + card 回写)
 *  - [拒绝] → onRejected(调用方喂回 AI「用户拒绝,换方案」)
 *  - [让AI改] → 展开DSL 文本编辑(用户手改后应用)
 *
 * 缩略图:简化 Canvas 2D,只画元素 bbox(card 矩形 + arrow 线 + rect/text 框),
 * 不画标题/正文(够直观且轻量)。before/after 并排对比。
 */
import { useEffect, useMemo, useState } from 'react'
import { Button } from '@cys-stift/ui'
import type { CanvasId, CardId, CardService, ColorToken } from '@cys-stift/domain'
import { InMemoryCanvasHost, type CanvasHost, type CanvasElement } from '@cys-stift/canvas-engine'
import { parseDslStrictWithDiagnostics } from '@cys-stift/dsl'
import type { SanitizeDiagnostic } from '@cys-stift/dsl'
import { applyLayout, type CardCreateHandler, type CardUpdateHandler } from '@/features/canvas/apply-layout'
import { diffCanvasSnapshots } from '@/features/canvas/canvas-diff'
import { buildCanvasHostForCanvas, applyOpsAndPersist, type PersistResult } from '@/features/canvas/canvas-host-builder'
import { useI18n } from '@/lib/i18n'
import { pushToast } from '@/lib/toast-store'
import { addSample, genSampleId } from './sample-store'
import { Thumb, DiffGroup, summarizeEl, confirmStyles } from './canvas-thumb'
import { settingsStore } from '@/lib/settings-store'
import { archiveStore, type ArchivePayload, type ArchiveStateSnapshot } from '@/lib/archive-store'
import { buildArchivePayload } from '@/lib/build-archive-payload'
import { VERSION } from '@/lib/version'

interface Props {
  dsl: string
  targetCanvasId: CanvasId
  service: CardService
  /** 可选 live host:提供则 Apply 直接改它(单 undo,靠画布页 writeback 持久化),
   *  不提供则走 /ask 原 temp host + applyOpsAndPersist 路径(不变)。 */
  liveHost?: CanvasHost
  onApplied: (result: { applied: number; cardsUpdated: number; cardsCreated: number }) => void
  onRejected: () => void
  /** 捕获样本用上下文(透传自调用方 /ask + companion)。有则在 apply/reject 时记样本。 */
  sampleContext?: { source: 'ask' | 'companion'; question?: string; context: string; targetCanvasId?: string }
}

type Phase = 'confirming' | 'applying' | 'applied' | 'error'

type ApplyOutcome = Pick<PersistResult, 'applied' | 'failed' | 'cardsUpdated' | 'cardsCreated' | 'cardsFailed'> & {
  /** Legacy/live mocks may omit this; only an explicit false is failure. */
  ok?: boolean
  committed?: boolean
  cardUpdatesFailed?: number
  sanitizeDiagnostics?: SanitizeDiagnostic[]
  undo?: () => Promise<boolean>
  rollback?: () => Promise<boolean>
}

/** Full element revision for the legacy DSL confirmation path.  The intent
 * path has its own revision helper; this one deliberately includes `meta`
 * (freedraw points and future element fields) so a manual edit cannot be
 * hidden by the narrower visual diff contract. */
function canvasRevision(elements: readonly CanvasElement[]): string {
  return JSON.stringify(
    elements
      .slice()
      .sort((a, b) => a.id.localeCompare(b.id)),
  )
}

/**
 * Hosts are allowed to return their live element objects. Keep the preview
 * snapshot detached so a later in-place drag/upsert cannot silently mutate the
 * baseline used by the stale-proposal guard or the before/after diff.
 */
function cloneCanvasElements(elements: readonly CanvasElement[]): CanvasElement[] {
  return elements.map((element) => ({
    ...element,
    ...(element.curve ? { curve: { ...element.curve } } : {}),
    ...(element.elbow ? { elbow: element.elbow.map((point) => ({ ...point })) } : {}),
    ...(element.meta
      ? {
          meta: {
            ...element.meta,
            ...(Array.isArray(element.meta.points)
              ? {
                  points: (element.meta.points as unknown[]).map((point) =>
                    Array.isArray(point) ? [...point] : point,
                  ),
                }
              : {}),
          },
        }
      : {}),
  }))
}

/**
 * DSL create op 建新卡(几何 + v5 内容)—— live 与 temp 路径共用。
 * mirror canvas-host-builder.ts 的 onCardCreate(ask-agent 建卡模板):同样的
 * createWithId 字段(title/body/type/canvasPosition{z,rotation}/color?/source)。
 * v5:带 @title/@content 时写入(不再落空标题卡)。
 */
export function makeOnCardCreate(canvasId: CanvasId, service: CardService): {
  onCardCreate: CardCreateHandler
  getFailed: () => number
} {
  let failed = 0
  const onCardCreate: CardCreateHandler = (p) => {
    try {
      service.createWithId(p.cardId as CardId, {
        title: p.title ?? '',
        body: p.content ?? '',
        type: 'note',
        canvasPosition: { canvasId, x: p.x, y: p.y, w: p.w, h: p.h, z: Date.now(), rotation: 0 },
        ...(p.color ? { color: p.color as ColorToken } : {}),
        source: { kind: 'manual', deviceId: 'companion-agent' },
      })
      return { ok: true } as const
    } catch (err) {
      // case 2a(修 createWithId swallow):不再静默,累加 failed → live 路径调用方读 getFailed() toast。
      failed++
      console.error('[agent-confirm-card] createWithId failed', p.cardId, err)
      return {
        ok: false,
        reason: err instanceof Error ? err.message : String(err),
      } as const
    }
  }
  return { onCardCreate, getFailed: () => failed }
}

/**
 * DSL update op 写现有卡内容(@title/@content)—— live 路径专用。
 * live host 的几何走画布页 bindCardWriteback,但内容无对应回写,故由本 handler 直接
 * service.update(title/body)。写失败抛错 → applyLayout 计入 r.failed(live 路径 res.failed
 * 反映);title/body 与当前一致时跳过(无谓写入)。
 */
export function makeOnCardUpdate(service: CardService): CardUpdateHandler {
  return ({ cardId, title, content }) => {
    const current = service.get(cardId as CardId)
    if (!current) throw new Error(`card not found: ${cardId}`)
    const patch: { title?: string; body?: string } = {}
    if (title !== undefined && title !== current.title) patch.title = title
    if (content !== undefined && content !== current.body) patch.body = content
    if (patch.title === undefined && patch.body === undefined) return
    const updated = service.update(cardId as CardId, patch) as unknown
    if (updated === null || updated === false || updated === undefined) {
      throw new Error(`card content update failed: ${cardId}`)
    }
  }
}

export function AgentConfirmCard({ dsl, targetCanvasId, service, liveHost, onApplied, onRejected, sampleContext }: Props) {
  const { t } = useI18n()
  const [phase, setPhase] = useState<Phase>('confirming')
  const [editing, setEditing] = useState(false)
  const [editedDsl, setEditedDsl] = useState(dsl)
  const [beforeState, setBeforeState] = useState<CanvasElement[] | null>(null)
  const [afterState, setAfterState] = useState<CanvasElement[] | null>(null)

  // 解析 + 预演 diff(目标画布状态变化)。
  const preview = useMemo(() => {
    const { ops, errors } = parseDslStrictWithDiagnostics(editing ? editedDsl : dsl)
    if (errors.length > 0 && ops.length === 0) {
      return { kind: 'parseError' as const, errors }
    }
    return { kind: 'ok' as const, ops, errors }
  }, [dsl, editedDsl, editing])

  // 异步构建 before/after(目标画布 host 是 async load)。
  useEffect(() => {
    let cancelled = false
    setPhase('confirming')
    setBeforeState(null)
    setAfterState(null)
    if (preview.kind !== 'ok') return
    void (async () => {
      // live 模式:before 直接读 live host(同步,反映当前画布含未存改动)。
      // temp 模式(/ask):重建 temp host(async load)。
      const before = cloneCanvasElements(
        liveHost
          ? liveHost.getElements()
          : (await buildCanvasHostForCanvas(targetCanvasId, service)).before,
      )
      if (cancelled) return
      // afterHost 仍是 InMemoryCanvasHost 克隆(预演绝不改 live host)。
      const afterHost = new InMemoryCanvasHost()
      afterHost.applyWithoutEcho(() => {
        for (const el of before) afterHost.upsert(el)
      })
      applyLayout(afterHost, preview.ops)
      if (cancelled) return
      setBeforeState(before)
      setAfterState(afterHost.getElements())
    })()
    return () => { cancelled = true }
  }, [targetCanvasId, service, preview, liveHost])

  const diff = useMemo(() => {
    if (!beforeState || !afterState) return null
    return diffCanvasSnapshots(beforeState, afterState)
  }, [beforeState, afterState])

  const recordReject = () => {
    // 拒绝路径捕获(parseError 态 + confirming 态共用)。开关关时 addSample 内部 no-op。
    if (!sampleContext) return
    addSample(
      {
        id: genSampleId(),
        ts: Date.now(),
        kind: 'dsl',
        source: sampleContext.source,
        question: sampleContext.question,
        context: sampleContext.context,
        aiOutput: dsl,
        outcome: 'rejected',
        targetCanvasId: sampleContext.targetCanvasId,
      },
      settingsStore.get().aiSampleCapture,
    )
  }

  const handleApply = async () => {
    if (preview.kind !== 'ok' || !afterState) return
    setPhase('applying')
    try {
      // The preview is a snapshot. Re-read the target immediately before the
      // destructive write and refuse a stale proposal; otherwise a user edit
      // made while the confirmation card was open would be overwritten.
      const currentBefore = liveHost
        ? liveHost.getElements()
        : (await buildCanvasHostForCanvas(targetCanvasId, service)).before
      if (canvasRevision(currentBefore) !== canvasRevision(beforeState ?? [])) {
        setPhase('error')
        pushToast({ kind: 'info', message: t('agent.staleRevision') })
        onRejected()
        return
      }

      // Capture the operation's before-state while the stale revision still
      // matches. The after-state is captured only after a committed apply; both
      // are stored in one archive payload for an auditable before/after pair.
      let archiveBefore: ArchiveStateSnapshot | undefined
      try {
        archiveBefore = archiveState(await buildArchivePayload())
      } catch (error) {
        // Archiving is observability, not a reason to block a user mutation.
        console.warn('[archive] ai-agent before snapshot failed', error)
      }

      // Building a full archive snapshot is asynchronous. Re-check immediately
      // before mutation so a manual edit made during that await cannot revive a
      // stale proposal.
      let tempCommitHost: Awaited<ReturnType<typeof buildCanvasHostForCanvas>> | undefined
      const beforeCommit = liveHost
        ? liveHost.getElements()
        : (tempCommitHost = await buildCanvasHostForCanvas(targetCanvasId, service)).before
      if (canvasRevision(beforeCommit) !== canvasRevision(beforeState ?? [])) {
        setPhase('error')
        pushToast({ kind: 'info', message: t('agent.staleRevision') })
        onRejected()
        return
      }

      let res: ApplyOutcome
      if (liveHost) {
        // live:host.batch 单 undo;onCardCreate 建卡;画布页 bindCardWriteback + freeform
        // binding 持久化几何;v5 内容(@title/@content)经 onCardUpdate 直接 service.update
        // (bindCardWriteback 不写内容)。不调 applyOpsAndPersist(会双写)。
        const creator = makeOnCardCreate(targetCanvasId, service)
        const r = applyLayout(liveHost, preview.ops, undefined, creator.onCardCreate, makeOnCardUpdate(service))
        res = { ok: true, committed: true, applied: r.applied, failed: r.failed, cardsUpdated: r.cardsUpdated, cardsCreated: r.cardsCreated, cardsFailed: creator.getFailed(), ...(r.sanitizeDiagnostics ? { sanitizeDiagnostics: r.sanitizeDiagnostics } : {}) }
      } else {
        // /ask temp 路径:复用刚通过 revision 检查的 host，避免检查后再异步
        // rebuild 留出新的竞态窗口；applyOpsAndPersist 在该 host 上应用并落库。
        const { host, before } = tempCommitHost ?? await buildCanvasHostForCanvas(targetCanvasId, service)
        const p = await applyOpsAndPersist(host, before, preview.ops, targetCanvasId, service)
        res = {
          ok: p.ok,
          committed: p.committed,
          applied: p.applied,
          failed: p.failed ?? p.cardsFailed ?? 0,
          cardsUpdated: p.cardsUpdated,
          cardsCreated: p.cardsCreated,
          cardsFailed: p.cardsFailed ?? 0,
          cardUpdatesFailed: p.cardUpdatesFailed,
          undo: p.undo,
          rollback: p.rollback,
          ...(p.sanitizeDiagnostics ? { sanitizeDiagnostics: p.sanitizeDiagnostics } : {}),
        }
      }
      const committed = res.ok !== false && res.committed !== false
      const appliedSuccessfully = committed && res.applied > 0
      setPhase(appliedSuccessfully ? 'applied' : 'error')
      // T5:风险 op 存档 —— agent apply 成功(res.applied > 0)后落档(b 类,
      // fire-and-forget,不阻塞 UI;append 失败 console.warn 不影响用户流程)。
      if (appliedSuccessfully) {
        try {
          // Await snapshot construction before exposing Undo. append itself stays
          // fire-and-forget, but `after` can no longer race the toast action.
          const afterPayload = await buildArchivePayload()
          const after = archiveState(afterPayload)
          const payload: ArchivePayload = archiveBefore
            ? {
                ...afterPayload,
                operation: { kind: 'ai-agent', before: archiveBefore, after },
              }
            : afterPayload
          void archiveStore
            .append('ai-agent', `agent: ${dsl.split('\n').filter(Boolean).length} 行`, payload, VERSION)
            .catch((err) => console.warn('[archive] ai-agent append failed', err))
        } catch (error) {
          console.warn('[archive] ai-agent after snapshot failed', error)
        }
      }
      // 捕获样本:apply/apply_edited。开关关时 addSample 内部 no-op。
      if (sampleContext && appliedSuccessfully) {
        const edited = editing && editedDsl && editedDsl !== dsl
        addSample(
          {
            id: genSampleId(),
            ts: Date.now(),
            kind: 'dsl',
            source: sampleContext.source,
            question: sampleContext.question,
            context: sampleContext.context,
            aiOutput: dsl,
            editedOutput: edited ? editedDsl : undefined,
            outcome: edited ? 'applied_edited' : 'applied',
            targetCanvasId: sampleContext.targetCanvasId,
          },
          settingsStore.get().aiSampleCapture,
        )
      }
      if (appliedSuccessfully) {
        const restore = res.undo ?? res.rollback
        let undoUsed = false
        const undo = restore
          ? async (): Promise<boolean> => {
              if (undoUsed) return false
              undoUsed = true
              return restore()
            }
          : undefined
        const actions = undo
          ? [{
              label: t('agent.undo'),
              onClick: () => {
                void undo().then((undone) => {
                  if (undone) setPhase('confirming')
                  pushToast({
                    kind: undone ? 'info' : 'error',
                    message: t(undone ? 'agent.undone' : 'agent.undoFailed'),
                  })
                }).catch((error) => {
                  console.error('[AgentConfirmCard] undo failed', error)
                  pushToast({ kind: 'error', message: t('agent.undoFailed') })
                })
              },
            }]
          : undefined
        pushToast({
          kind: res.failed > 0 ? 'info' : 'success',
          message: t('agent.applied', {
            n: String(res.applied),
            cards: String(res.cardsUpdated + res.cardsCreated),
          }),
          ...(actions ? { actions } : {}),
        })
      } else {
        pushToast({ kind: 'error', message: t('agent.applyFailed') })
      }
      // case 2a:createWithId 失败的卡(cardsFailed>0)单独 info toast,让用户知道有卡没建成
      if (res.cardsFailed > 0) {
        pushToast({ kind: 'info', message: t('agent.cardsFailed', { n: String(res.cardsFailed) }) })
      }
      // case 1/11/7:sanitize diagnostic(引用不存在的卡/端点)透出 UI,让用户知道 AI 提议有悬空引用
      if (res.sanitizeDiagnostics && res.sanitizeDiagnostics.length > 0) {
        pushToast({ kind: 'info', message: t('agent.sanitizeDiagnostics', { n: String(res.sanitizeDiagnostics.length) }) })
      }
      if (appliedSuccessfully) {
        onApplied({ applied: res.applied, cardsUpdated: res.cardsUpdated, cardsCreated: res.cardsCreated })
      }
    } catch (err) {
      console.error('[AgentConfirmCard] apply failed', err)
      setPhase('error')
      pushToast({ kind: 'error', message: t('agent.applyFailed') })
    }
  }

  if (preview.kind === 'parseError') {
    return (
      <div className="ac ac--error">
        <p className="ac__title">{t('agent.parseError')}</p>
        <ul className="ac__errors">
          {preview.errors.slice(0, 5).map((e) => (
            <li key={e.line}>L{e.line}: {e.text}</li>
          ))}
        </ul>
        <Button variant="ghost" onClick={() => { recordReject(); onRejected() }}>{t('agent.retry')}</Button>
        <style>{confirmStyles}</style>
      </div>
    )
  }

  const totalChanges = diff ? diff.added.length + diff.removed.length + diff.changed.length : 0

  return (
    <div className="ac">
      <p className="ac__title">
        {phase === 'applied'
          ? t('agent.appliedTitle')
          : t('agent.proposeTitle', { canvas: canvasName(targetCanvasId) })}
      </p>

      {diff && (
        <div className="ac__diff">
          {totalChanges === 0 && <p className="ac__nochange">{t('agent.noChange')}</p>}
          {diff.added.length > 0 && (
            <DiffGroup color="blue" label={t('agent.added', { n: String(diff.added.length) })}
              items={diff.added.map((e) => summarizeEl(e))} />
          )}
          {diff.removed.length > 0 && (
            <DiffGroup color="red" label={t('agent.removed', { n: String(diff.removed.length) })}
              items={diff.removed.map((e) => summarizeEl(e))} />
          )}
          {diff.changed.length > 0 && (
            <DiffGroup color="yellow" label={t('agent.changed', { n: String(diff.changed.length) })}
              items={diff.changed.map((c) => `${summarizeEl(c.after)} (${c.fields.join(', ')})`)} />
          )}
        </div>
      )}

      {beforeState && afterState && (
        <div className="ac__thumbs">
          <Thumb elements={beforeState} label={t('agent.before')} />
          <span className="ac__arrow">→</span>
          <Thumb elements={afterState} label={t('agent.after')} />
        </div>
      )}

      {editing && (
        <textarea
          className="ac__edit"
          value={editedDsl}
          onChange={(e) => setEditedDsl(e.target.value)}
          rows={Math.min(8, editedDsl.split('\n').length)}
        />
      )}

      {phase !== 'applied' && (
        <div className="ac__actions">
          <Button variant="primary" onClick={() => void handleApply()} disabled={phase === 'applying' || !afterState || totalChanges === 0}>
            {phase === 'applying' ? t('agent.applying') : t('agent.apply')}
          </Button>
          <Button variant="ghost" onClick={() => setEditing((v) => !v)}>{t('agent.edit')}</Button>
          <Button variant="ghost" onClick={() => { recordReject(); onRejected() }}>{t('agent.reject')}</Button>
        </div>
      )}

      <style>{confirmStyles}</style>
    </div>
  )
}

function canvasName(id: CanvasId): string {
  return String(id)
}

/** Strip nested operation metadata before embedding a state as one side of a
 * new operation. This keeps archive before/after snapshots composable and
 * prevents accidental recursive growth when a caller reuses a payload. */
function archiveState(payload: ArchivePayload): ArchiveStateSnapshot {
  const { operation: _operation, ...state } = payload
  return state
}
