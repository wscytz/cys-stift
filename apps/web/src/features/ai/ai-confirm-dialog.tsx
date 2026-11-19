'use client'
/**
 * ai-confirm-dialog — 画布 AI 排版/聚类/大纲 确认门(审核 #1 修复)。
 *
 * 画布三 action(layout/cluster/outline)原来直接 applyLayout/applyClusters/建卡,
 * 用户只看 spinner → 画布突然变,不知 AI 改了啥。本组件把 /ask AgentConfirmCard 的
 * before/after 缩略图 + 摘要 + 应用/编辑/拒绝 范式做成 Modal 确认门,给画布三 action。
 *
 * 三 mode(discriminated union props):
 *  - dsl: AI 排版 DSL → 克隆 liveHost 预演 applyLayout → before/after 缩略图 + diff;
 *          apply = applyLayout(liveHost) 单 undo;支持 DSL 编辑。位移反馈(summarizeMovement)。
 *  - cluster(Task 4 加):AI 分组 → 克隆 liveHost 预演 applyClusters → before/after(箭头);
 *          apply = liveHost.batch(applyClusters) 单 undo;不支持编辑。
 *  - outline(Task 5 加):AI 大纲 markdown → MarkdownBody 预览;apply = 建 inbox 卡;支持编辑。
 *
 * 不改 AgentConfirmCard —— /ask + companion 继续用它(它内联在对话流里,非 Modal)。
 */
import { useDeferredValue, useEffect, useMemo, useRef, useState } from 'react'
import { Button, Modal } from '@cys-stift/ui'
import type { CanvasId, CardId, CardService } from '@cys-stift/domain'
import { InMemoryCanvasHost, type CanvasHost, type CanvasElement } from '@cys-stift/canvas-engine'
import { parseDslStrictWithDiagnostics } from '@wscytz/dsl'
import { applyPlanIfClean } from '@/features/canvas/apply-layout'
import { makeOnCardCreate, makeOnCardRemove, makeOnCardUpdate } from './agent-confirm-card'
import { applyClusters, type CardCluster } from './cluster'
import { diffCanvasSnapshots } from '@/features/canvas/canvas-diff'
import { summarizeMovement } from '@/features/canvas/layout-movement'
import { Thumb, DiffGroup, confirmStyles } from './canvas-thumb'
import { MarkdownBody } from '@/app/inbox/markdown'
import { useI18n } from '@/lib/i18n'
import type { MessageKey } from '@/lib/i18n/messages'
import { humanizeApplyIssue } from '@/lib/dsl-issue-reasons'
import { pushToast } from '@/lib/toast-store'
import { addSample, genSampleId } from './sample-store'
import { settingsStore } from '@/lib/settings-store'
import { archiveStore } from '@/lib/archive-store'
import { buildArchivePayload } from '@/lib/build-archive-payload'
import { VERSION } from '@/lib/version'
import { decodeIntentJson } from './intent-validation'
import { compileIntent } from './intent-compiler'
import { commitIntentPlan } from './apply-plan'
import { intentRevision, intentSnapshotFromHost, makeIntentCommitPort, previewIntentPlan } from './intent-host-adapter'

type Phase = 'confirming' | 'applying' | 'applied' | 'error'

/** DSL 预览问题行。opIndex 是 plan 内的序号(无源行号时回落 #序号 显示);
 *  line 是 parser 回填的 1-based 源行号(空行/注释行不会让它与 opIndex 混同)。 */
interface DslPreviewIssue {
  opIndex: number
  line?: number
  message: string
}

export interface AiConfirmSampleContext {
  source: 'layout' | 'cluster' | 'outline'
  context: string
  targetCanvasId?: string
}

interface BaseProps {
  service: CardService
  onApplied: () => void
  onRejected: () => void
  sampleContext?: AiConfirmSampleContext
}

interface DslProps extends BaseProps {
  mode: 'dsl'
  dsl: string
  targetCanvasId: CanvasId
  liveHost: CanvasHost
}

interface IntentProps extends BaseProps {
  mode: 'intent'
  intent: string
  targetCanvasId: CanvasId
  liveHost: CanvasHost
}

interface ClusterProps extends BaseProps {
  mode: 'cluster'
  clusters: CardCluster[]
  targetCanvasId: CanvasId
  liveHost: CanvasHost
}

interface OutlineProps extends BaseProps {
  mode: 'outline'
  outlineMarkdown: string
  canvasId: CanvasId
}

// Task 4 加 ClusterProps;Task 5 加 OutlineProps。
export type AiConfirmDialogProps = DslProps | IntentProps | ClusterProps | OutlineProps

/**
 * A confirmation dialog is a snapshot, not a live editor. Keep a stable
 * identity for the proposal so unrelated parent renders do not silently move
 * its base revision forward. Editing the DSL/JSON changes the preview, but it
 * must still be applied against the canvas that was visible when the dialog
 * opened.
 */
function proposalIdentity(props: AiConfirmDialogProps): string | null {
  if (props.mode === 'dsl') return `dsl:${props.dsl}`
  if (props.mode === 'intent') return `intent:${props.intent}`
  if (props.mode === 'cluster') return `cluster:${JSON.stringify(props.clusters)}`
  return null
}

/**
 * 预览问题面板样式。红框(role=alert)= 闸门整单拒绝;黄框(role=status)= 计划
 * 干净但个别行会被跳过。与 DslDialog 的 .dsl-errors/.dsl-errors--soft 同一视觉
 * 语义,这里沿用 .ac 命名空间(confirmStyles 由 canvas-thumb 共享,不改它)。
 */
const dslIssueStyles = `
.ac__notice { margin: 0 0 var(--space-2); padding: var(--space-1) var(--space-2); border: var(--border-hairline); border-radius: var(--radius-sm); }
.ac__notice--blocked { border-color: var(--color-red); }
.ac__notice--skipped { border-color: var(--color-yellow); }
.ac__notice-title { margin: 0 0 var(--space-1); font-family: var(--font-display); font-size: var(--font-size-xs); font-weight: 600; color: var(--color-red); }
.ac__notice-title--skipped { color: var(--color-yellow); }
.ac__notice .ac__errors { margin-bottom: 0; }
.ac__notice--skipped .ac__errors { color: var(--color-black-soft); }
.ac__notice-more { margin: var(--space-1) 0 0; font-family: var(--font-mono); font-size: var(--font-size-xs); color: var(--color-gray); }
`

export function AiConfirmDialog(props: AiConfirmDialogProps) {
  const { t, locale } = useI18n()
  const [phase, setPhase] = useState<Phase>('confirming')
  const [applyFailure, setApplyFailure] = useState<{ applied: number; failed: number; skipped: number } | null>(null)
  const [editing, setEditing] = useState(false)
  const dslInitial = props.mode === 'dsl' ? props.dsl : props.mode === 'intent' ? props.intent : ''
  const [editedDsl, setEditedDsl] = useState(dslInitial)
  const mdInitial = props.mode === 'outline' ? props.outlineMarkdown : ''
  const [editedMarkdown, setEditedMarkdown] = useState(mdInitial)

  // DSL and cluster used to apply directly to the live host after the modal
  // had been open for an arbitrary amount of time. Capture the host revision
  // once per proposal and reject stale commits; Intent has the same contract
  // inside commitIntentPlan.
  const proposalKey = proposalIdentity(props)
  const proposalRevisionRef = useRef<{ key: string; host: CanvasHost; revision: string } | null>(null)
  if (proposalKey && (proposalRevisionRef.current === null || proposalRevisionRef.current.key !== proposalKey || proposalRevisionRef.current.host !== (props as DslProps | IntentProps | ClusterProps).liveHost)) {
    const liveHost = (props as DslProps | IntentProps | ClusterProps).liveHost
    proposalRevisionRef.current = { key: proposalKey, host: liveHost, revision: intentRevision(liveHost.getElements()) }
  }

  // ── dsl mode: parse + 预演 diff ──
  // useDeferredValue: 用户逐键编辑 textarea 时,editedDsl 每键变化;若 preview
  // useMemo 直接绑 editedDsl,每键都重算 parseDslWithDiagnostics + 克隆 liveHost
  // → applyLayout 预演 → diffCanvasSnapshots,大画布(多卡)明显卡。deferredDsl
  // 让 React 在空闲时才把新值 commit 给 preview(类似 300ms debounce 但无 timer,
  // React 调度原生,不引入新依赖且更 idiomatic)。textarea 仍绑 editedDsl(即时
  // 显示用户输入),apply 用 preview.ops(deferred 态,停顿后才更新)。
  const deferredDsl = useDeferredValue(editedDsl)
  const preview = useMemo(() => {
    if (props.mode !== 'dsl') return null
    const { ops, errors } = parseDslStrictWithDiagnostics(editing ? deferredDsl : props.dsl)
    if (errors.length > 0 && ops.length === 0) return { kind: 'parseError' as const, errors }
    return { kind: 'ok' as const, ops, errors }
    // editing 仍非 deferred(切换编辑态应立即重算);deferredDsl 是 debounced 值。
    // props 在依赖里保持原有行为(父组件换 DSL 立即重算)。
  }, [props, editing, deferredDsl])

  const intentPreview = useMemo(() => {
    if (props.mode !== 'intent') return null
    const decoded = decodeIntentJson(editing ? deferredDsl : props.intent)
    if (!decoded.ok) return { kind: 'parseError' as const, errors: decoded.diagnostics }
    const compiled = compileIntent(decoded.value, intentSnapshotFromHost(props.liveHost))
    if (!compiled.ok) return { kind: 'parseError' as const, errors: compiled.diagnostics }
    return { kind: 'ok' as const, plan: compiled.plan, diagnostics: compiled.diagnostics }
  }, [props, editing, deferredDsl])

  const [beforeState, setBeforeState] = useState<CanvasElement[] | null>(null)
  const [afterState, setAfterState] = useState<CanvasElement[] | null>(null)
  const [dslIssues, setDslIssues] = useState<DslPreviewIssue[]>([])
  // 闸门放行、但个别行仍会被跳过(如箭头写在 create 之前)时的软提示。
  // 与 dslIssues(闸门整单拒绝,apply 不会发生)必须分开:旧 UI 把两者都渲染成
  // 「应用已取消」,干净计划的跳过行于是谎称整单失败(2026-11-19 收束)。
  const [dslSkippedIssues, setDslSkippedIssues] = useState<DslPreviewIssue[]>([])

  useEffect(() => {
    if (props.mode === 'dsl') {
      if (preview?.kind !== 'ok') { setDslIssues([]); setDslSkippedIssues([]); setBeforeState(null); setAfterState(null); return }
      let cancelled = false
      const before = props.liveHost.getElements()
      const afterHost = new InMemoryCanvasHost()
      afterHost.applyWithoutEcho(() => { for (const el of before) afterHost.upsert(el) })
      const outcome = applyPlanIfClean(afterHost, preview.ops, undefined, () => ({ ok: true }))
      // v11:诊断的 opIndex 不是源行号(空行/注释行会让两者错位)——从 parser 回填的
      // op.line 取真实行号;没有 line(程序构造的 op)时回落 #序号。
      const issues = outcome.ok ? [] : outcome.diagnostics.map((diagnostic) => ({
        opIndex: diagnostic.opIndex,
        line: preview.ops[diagnostic.opIndex]?.line,
        message: diagnostic.message,
      }))
      // 计划干净时 report.opResults 里 status !== 'applied' 的行 = 本次会被跳过的行
      // (skipped/failed)。它们不是闸门阻断:其余行照常提交,UI 只能软提示。
      const skippedIssues = outcome.ok
        ? outcome.report.opResults
            .filter((result) => result.status !== 'applied' && result.reason !== undefined)
            .map((result) => ({
              opIndex: result.opIndex,
              line: preview.ops[result.opIndex]?.line,
              message: result.reason!,
            }))
        : []
      setDslIssues(issues)
      setDslSkippedIssues(skippedIssues)
      if (cancelled) return
      setBeforeState(before)
      setAfterState(afterHost.getElements())
      return () => { cancelled = true }
    }
    if (props.mode === 'intent') {
      if (intentPreview?.kind !== 'ok') { setBeforeState(null); setAfterState(null); return }
      const before = props.liveHost.getElements()
      setBeforeState(before)
      setAfterState(previewIntentPlan(props.liveHost, intentPreview.plan))
      return
    }
    if (props.mode === 'cluster') {
      let cancelled = false
      const before = props.liveHost.getElements()
      const afterHost = new InMemoryCanvasHost()
      afterHost.applyWithoutEcho(() => { for (const el of before) afterHost.upsert(el) })
      applyClusters(afterHost, props.clusters, props.service, String(props.targetCanvasId))
      if (cancelled) return
      setBeforeState(before)
      setAfterState(afterHost.getElements())
      return () => { cancelled = true }
    }
  }, [props, preview, intentPreview])

  const diff = useMemo(() => {
    if (!beforeState || !afterState) return null
    return diffCanvasSnapshots(beforeState, afterState)
  }, [beforeState, afterState])

  const totalChanges = diff ? diff.added.length + diff.removed.length + diff.changed.length : 0

  const recordReject = () => {
    if (!props.sampleContext) return
    if (props.mode === 'dsl' || props.mode === 'intent') {
      addSample(
        { id: genSampleId(), ts: Date.now(), kind: 'dsl', source: 'canvasLayout', context: props.sampleContext.context, aiOutput: props.mode === 'dsl' ? props.dsl : props.intent, outcome: 'rejected', targetCanvasId: props.sampleContext.targetCanvasId },
        settingsStore.get().aiSampleCapture,
      )
    }
  }

  const handleApply = async () => {
    if (phase === 'applying') return
    setPhase('applying')
    try {
      if (props.mode === 'intent') {
        if (intentPreview?.kind !== 'ok') { setPhase('confirming'); return }
        const report = await commitIntentPlan(
          intentPreview.plan,
          makeIntentCommitPort({ host: props.liveHost, service: props.service, canvasId: props.targetCanvasId }),
        )
        if (report.applied > 0) {
          void buildArchivePayload()
            .then((payload) => archiveStore.append('ai-layout', `Intent layout ${report.applied}/${report.totalOps}`, payload, VERSION))
            .catch((error) => console.warn('[archive] intent layout append failed', error))
        }
        if (props.sampleContext && report.applied > 0) {
          const edited = editing && editedDsl !== props.intent
          addSample(
            { id: genSampleId(), ts: Date.now(), kind: 'dsl', source: 'canvasLayout', context: props.sampleContext.context, aiOutput: props.intent, editedOutput: edited ? editedDsl : undefined, outcome: edited ? 'applied_edited' : 'applied', targetCanvasId: props.sampleContext.targetCanvasId },
            settingsStore.get().aiSampleCapture,
          )
        }
        if (report.failed > 0) {
          pushToast({ kind: 'error', message: t('agent.applyFailed') })
          if (report.applied === 0) { setPhase('error'); return }
        }
        else if (report.blocked > 0) pushToast({ kind: 'info', message: t('canvas.pasteDslPartial', { applied: String(report.applied), skipped: String(report.blocked + report.skipped) }) })
        else pushToast({ kind: 'success', message: t('canvas.pasteDslApplied', { n: String(report.applied) }) })
      } else if (props.mode === 'dsl') {
        if (preview?.kind !== 'ok' || !afterState) { setPhase('confirming'); return }
        const proposalRevision = proposalRevisionRef.current?.revision
        if (proposalRevision && intentRevision(props.liveHost.getElements()) !== proposalRevision) {
          // Do not let a stale preview overwrite a manual edit made while the
          // confirmation dialog was open. Closing the dialog leaves the live
          // canvas untouched and makes the next action start from fresh state.
          pushToast({ kind: 'info', message: t('agent.staleRevision') })
          props.onRejected()
          return
        }
        // 诚实位移反馈(迁自 page handleAILayout):apply 前后快照卡位置 → summarizeMovement。
        const cardIdsInOps = new Set(
          preview.ops
            .filter((op): op is typeof op & { type: 'card' } => op.type === 'card')
            .map((op) => String(op.cardId)),
        )
        const snapPositions = (): Record<string, { x: number; y: number }> => {
          const m: Record<string, { x: number; y: number }> = {}
          for (const el of props.liveHost.getElements()) {
            if (el.kind !== 'card') continue
            if (!cardIdsInOps.has(el.id)) continue
            m[el.id] = { x: el.x, y: el.y }
          }
          return m
        }
        const before = snapPositions()
        const outcome = applyPlanIfClean(
          props.liveHost,
          preview.ops,
          undefined,
          makeOnCardCreate(props.targetCanvasId, props.service).onCardCreate,
          makeOnCardUpdate(props.service),
          makeOnCardRemove(props.service),
        )
        if (!outcome.ok) {
          setPhase('confirming')
          pushToast({ kind: 'error', message: t('canvas.dslApplyBlocked', { n: String(outcome.diagnostics.length) }) })
          return
        }
        const { applied, skipped, failed } = outcome.report
        const notApplied = skipped + failed
        if (applied > 0) {
          void buildArchivePayload()
            .then((p) => archiveStore.append('ai-layout', `AI 重排 ${applied} 张`, p, VERSION))
            .catch((err) => console.warn('[archive] ai-layout append failed', err))
        }
        if (props.sampleContext && applied > 0) {
          const edited = editing && editedDsl && editedDsl !== props.dsl
          addSample(
            { id: genSampleId(), ts: Date.now(), kind: 'dsl', source: 'canvasLayout', context: props.sampleContext.context, aiOutput: props.dsl, editedOutput: edited ? editedDsl : undefined, outcome: edited ? 'applied_edited' : 'applied', targetCanvasId: props.sampleContext.targetCanvasId },
            settingsStore.get().aiSampleCapture,
          )
        }
        const after = snapPositions()
        const summary = summarizeMovement(before, after)
        // 结果提示必须与预览里的「将被跳过」一致:部分行被跳过时先说清应用/跳过条数,
        // 不能只报位移(新建/删除不进位移交集,会把「新增了卡但跳过一行」说成未改动)。
        // 闸门整单拒绝走上面的 dslApplyBlocked(error),与这里的部分成功语义不同。
        if (failed > 0) {
          pushToast({
            kind: 'error',
            message: t('canvas.aiLayoutFailed', { applied: String(applied), failed: String(failed), skipped: String(skipped) }),
          })
          // 全部失败时没有任何已应用行，允许原地重试；部分失败才禁用 Apply。
          if (applied === 0) {
            setPhase('confirming')
            return
          }
          // 部分失败：已应用的行不能安全重放（没有 hash 去重），禁用 Apply，
          // 让用户关闭后重新生成或手动修复失败项。
          setApplyFailure({ applied, failed, skipped })
          setPhase('confirming')
          return
        } else if (notApplied > 0) {
          pushToast({
            kind: 'info',
            message: t('canvas.aiLayoutAppliedSkipped', { applied: String(applied), skipped: String(notApplied) }),
          })
        } else if (applied === 0) pushToast({ kind: 'info', message: t('canvas.aiLayoutNoneApplied') })
        else if (summary.moved > 0) pushToast({ kind: 'success', message: t('canvas.aiLayoutMoved', { moved: String(summary.moved), avgPx: String(summary.avgPx) }) })
        else pushToast({ kind: 'info', message: t('canvas.aiLayoutUnchanged') })
      } else if (props.mode === 'cluster') {
        const proposalRevision = proposalRevisionRef.current?.revision
        if (proposalRevision && intentRevision(props.liveHost.getElements()) !== proposalRevision) {
          pushToast({ kind: 'info', message: t('agent.staleRevision') })
          props.onRejected()
          return
        }
        // cluster apply:applyClusters 内部无 batch → 外部包 batch 保单 undo。
        let res = { arrowsCreated: 0, clustersApplied: 0 }
        props.liveHost.batch(() => {
          res = applyClusters(props.liveHost, props.clusters, props.service, String(props.targetCanvasId))
        })
        if (res.arrowsCreated > 0) {
          void buildArchivePayload()
            .then((p) => archiveStore.append('cluster', `cluster: ${props.clusters.length} 组`, p, VERSION))
            .catch((err) => console.warn('[archive] cluster append failed', err))
        }
        pushToast({
          kind: res.arrowsCreated > 0 ? 'success' : 'info',
          message: res.arrowsCreated > 0 ? t('canvas.aiClusterDone', { n: String(res.arrowsCreated) }) : t('canvas.aiClusterNone'),
        })
      } else { // outline → 总结卡落画布(不自动连线),不再建 inbox 卡(用户嫌"不在画布搞笑")
        const body = editing ? editedMarkdown : props.outlineMarkdown
        // create() 配额满时抛 StorageQuotaError → 落外层 try/catch(applyFailed),
        // 不返回 null,故无 !created 分支。落画布用 moveToCanvas(走 write() 配额返 false)。
        const created = props.service.create({
          title: t('ai.confirm.outlineCardTitle'),
          body,
          source: { kind: 'manual', deviceId: 'web' },
        })
        // 落在当前画布上一个空位(z 取最大+1,网格错开),不自动建关系(用户手动连)。
        const existing = props.service.listOnCanvas(props.canvasId)
        const z = existing.reduce((m, c) => Math.max(m, c.canvasPosition?.z ?? 0), 0) + 1
        const moved = props.service.moveToCanvas(created.id, {
          canvasId: props.canvasId,
          x: 120 + (z % 5) * 40,
          y: 120 + (z % 5) * 40,
          w: 280,
          h: 140,
          z,
        })
        pushToast({
          kind: moved === false ? 'info' : 'success',
          message: moved === false ? t('storage.quotaExceeded') : t('ai.confirm.outlineCreated'),
        })
      }
      setPhase('applied')
      props.onApplied()
    } catch (err) {
      console.error('[AiConfirmDialog] apply failed', err)
      setPhase('error')
      pushToast({ kind: 'error', message: t('agent.applyFailed') })
    }
  }

  const title = props.mode === 'dsl' || props.mode === 'intent' ? t('ai.confirm.layoutTitle') : props.mode === 'cluster' ? t('ai.confirm.clusterTitle') : t('ai.confirm.outlineTitle')

  // parseError 态:显示错误 + 编辑/重试(retry = onRejected,用户手动重跑 AI)。
  const proposalErrors = props.mode === 'dsl' && preview?.kind === 'parseError'
    ? preview.errors.map((error) => ({ line: error.line, text: error.text, message: error.message }))
    : props.mode === 'intent' && intentPreview?.kind === 'parseError'
      ? intentPreview.errors.map((error) => ({ line: 0, text: error.path ?? '', message: error.message }))
      : null
  if (proposalErrors) {
    return (
      <Modal open onClose={props.onRejected} onEscape={props.onRejected} title={t('agent.parseError')} closeLabel={t('common.close')}>
        <ul className="ac__errors">
          {proposalErrors.slice(0, 5).map((e, index) => (<li key={`${e.line}-${index}`}>{e.line > 0 ? `L${e.line}: ` : ''}{e.message}{e.text && e.text !== e.message ? ` — ${e.text}` : ''}</li>))}
        </ul>
        <p className="ac__subtitle">{t('agent.parseErrorRetryHint')}</p>
        <div className="ac__actions">
          <Button variant="ghost" onClick={() => setEditing((v) => !v)}>{t('agent.edit')}</Button>
          <Button variant="ghost" onClick={() => { recordReject(); props.onRejected() }}>{t('common.close')}</Button>
        </div>
        {editing && (
          <textarea className="ac__edit" value={editedDsl} onChange={(e) => setEditedDsl(e.target.value)} rows={Math.min(8, editedDsl.split('\n').length)} />
        )}
        <style>{confirmStyles + dslIssueStyles}</style>
      </Modal>
    )
  }

  // 差异列表:card 用真实标题、箭头用两端卡标题、其余用类型人话名;字段名也映射成人话。
  const fieldLabel = (field: string): string => {
    const key = `canvas.diffField.${field}` as MessageKey
    const label = t(key)
    return label === key ? field : label
  }
  const labelEl = (el: CanvasElement): string => {
    if (el.kind === 'card') {
      const title = props.service.get(el.id as CardId)?.title
      return t('canvas.diffElementCard', { title: title || t('card.untitled') })
    }
    if (el.kind === 'arrow' && el.from && el.to) {
      const from = props.service.get(el.from as CardId)?.title || t('card.untitled')
      const to = props.service.get(el.to as CardId)?.title || t('card.untitled')
      return t('agent.arrowBetween', { from, to })
    }
    const key = `canvas.kind.${el.kind}` as MessageKey
    const label = t(key)
    return label === key ? el.kind : label
  }

  // 同一 op 可产多条诊断(如重复 id + create 冲突);列表逐条显示,标题按 op 去重计数。
  const dslIssueCount = (issues: DslPreviewIssue[]): number =>
    new Set(issues.map((issue) => issue.opIndex)).size
  // 源行号优先(parser 回填);程序构造的 op 没有 line 时回落 #序号。原因走
  // humanizeApplyIssue,与 DslDialog 共用同一套人话映射。
  const renderDslIssues = (issues: DslPreviewIssue[], keyPrefix: string) => (
    <>
      <ul className="ac__errors">
        {issues.slice(0, 4).map((issue, issueIdx) => (
          <li key={`${keyPrefix}-${issue.opIndex}-${issueIdx}`}>
            {issue.line !== undefined ? t('canvas.dslErrorLine', { line: issue.line }) : `#${issue.opIndex + 1}:`} {humanizeApplyIssue(issue.message, t)}
          </li>
        ))}
      </ul>
      {issues.length > 4 && (
        <p className="ac__notice-more">{t('canvas.dslPreviewMore', { n: String(issues.length - 4) })}</p>
      )}
    </>
  )

  return (
    <Modal open onClose={props.onRejected} onEscape={props.onRejected} title={title} closeLabel={t('common.close')}>
      <div className="ac">
        <p className="ac__subtitle">{t('ai.confirm.subtitle')}</p>

        {applyFailure && (
          <div className="ac__notice ac__notice--blocked" role="alert">
            <p className="ac__notice-title">
              {t('canvas.aiLayoutFailed', {
                applied: String(applyFailure.applied),
                failed: String(applyFailure.failed),
                skipped: String(applyFailure.skipped),
              })}
            </p>
            <p className="ac__notice-more">{t('ai.confirm.partialFailureHint')}</p>
          </div>
        )}

        {props.mode === 'outline' && (
          editing ? (
            <textarea
              className="ac__edit"
              value={editedMarkdown}
              onChange={(e) => setEditedMarkdown(e.target.value)}
              rows={Math.min(12, editedMarkdown.split('\n').length)}
            />
          ) : (
            <div className="ac__md-preview">
              <MarkdownBody source={editing ? editedMarkdown : props.outlineMarkdown} />
            </div>
          )
        )}

        {diff && (
          <div className="ac__diff">
            {totalChanges === 0 && <p className="ac__nochange">{t('agent.noChange')}</p>}
            {props.mode === 'dsl' && dslIssues.length > 0 && (
              <div className="ac__notice ac__notice--blocked" role="alert">
                <p className="ac__notice-title">{t('canvas.dslPreviewBlocked', { n: String(dslIssueCount(dslIssues)) })}</p>
                {renderDslIssues(dslIssues, 'blocked')}
              </div>
            )}
            {props.mode === 'dsl' && dslSkippedIssues.length > 0 && (
              <div className="ac__notice ac__notice--skipped" role="status">
                <p className="ac__notice-title ac__notice-title--skipped">{t('canvas.dslPreviewSkipped', { n: String(dslIssueCount(dslSkippedIssues)) })}</p>
                {renderDslIssues(dslSkippedIssues, 'skipped')}
              </div>
            )}
            {diff.added.length > 0 && (
              <DiffGroup color="blue" label={t('agent.added', { n: String(diff.added.length) })} items={diff.added.map(labelEl)} moreLabel={t('agent.moreItems', { n: String(diff.added.length - 8) })} />
            )}
            {diff.removed.length > 0 && (
              <DiffGroup color="red" label={t('agent.removed', { n: String(diff.removed.length) })} items={diff.removed.map(labelEl)} moreLabel={t('agent.moreItems', { n: String(diff.removed.length - 8) })} />
            )}
            {diff.changed.length > 0 && (
              <DiffGroup color="yellow" label={t('agent.changed', { n: String(diff.changed.length) })} items={diff.changed.map((c) => `${labelEl(c.after)} (${c.fields.map(fieldLabel).join(locale === 'en' ? ', ' : '、')})`)} moreLabel={t('agent.moreItems', { n: String(diff.changed.length - 8) })} />
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

        {(props.mode === 'dsl' || props.mode === 'intent') && editing && (
          <textarea className="ac__edit" value={editedDsl} onChange={(e) => setEditedDsl(e.target.value)} rows={Math.min(8, editedDsl.split('\n').length)} />
        )}

        <div className="ac__actions">
          <Button variant="primary" onClick={() => void handleApply()} disabled={applyFailure !== null || phase === 'applying' || phase === 'applied' || (props.mode !== 'outline' && (!afterState || ((props.mode === 'dsl' || props.mode === 'cluster') && totalChanges === 0)))}>
            {phase === 'applying' ? t('agent.applying') : t('agent.apply')}
          </Button>
          {props.mode !== 'cluster' && (
            <Button variant="ghost" onClick={() => setEditing((v) => !v)}>{t('agent.edit')}</Button>
          )}
          <Button
            variant="ghost"
            onClick={() => {
              // 部分失败时已有改动落画布，再记“拒绝”样本会与 applied 矛盾。
              if (!(applyFailure && applyFailure.applied > 0)) recordReject()
              props.onRejected()
            }}
          >
            {applyFailure && applyFailure.applied > 0 ? t('common.close') : t('agent.reject')}
          </Button>
        </div>
      </div>
      <style>{confirmStyles + dslIssueStyles}</style>
    </Modal>
  )
}
