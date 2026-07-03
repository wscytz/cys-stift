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
import { useEffect, useMemo, useRef, useState } from 'react'
import { Button } from '@cys-stift/ui'
import type { CanvasId, CardId, CardService, ColorToken } from '@cys-stift/domain'
import { InMemoryCanvasHost, readToken, type CanvasHost, type CanvasElement } from '@cys-stift/canvas-engine'
import { parseDslWithDiagnostics } from '@/features/ai/dsl-parser'
import { applyLayout } from '@/features/canvas/apply-layout'
import { diffCanvasSnapshots } from '@/features/canvas/canvas-diff'
import { buildCanvasHostForCanvas, applyOpsAndPersist } from '@/features/canvas/canvas-host-builder'
import { useI18n } from '@/lib/i18n'
import { pushToast } from '@/lib/toast-store'
import { addSample, genSampleId } from './sample-store'
import { settingsStore } from '@/lib/settings-store'

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

/**
 * DSL create op 建新卡(空卡 + 几何)—— live 与 temp 路径共用。
 * mirror canvas-host-builder.ts:88-99 的 onCardCreate(ask-agent 建卡模板):
 * 同样的 createWithId 字段(title/body/type/canvasPosition{z,rotation}/color?/source)。
 */
export function makeOnCardCreate(canvasId: CanvasId, service: CardService) {
  return (p: { cardId: string; x: number; y: number; w: number; h: number; color?: string }) => {
    try {
      service.createWithId(p.cardId as CardId, {
        title: '',
        body: '',
        type: 'note',
        canvasPosition: { canvasId, x: p.x, y: p.y, w: p.w, h: p.h, z: Date.now(), rotation: 0 },
        ...(p.color ? { color: p.color as ColorToken } : {}),
        source: { kind: 'manual', deviceId: 'companion-agent' },
      })
    } catch (err) {
      console.error('[agent-confirm-card] createWithId failed', p.cardId, err)
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
    const { ops, errors } = parseDslWithDiagnostics(editing ? editedDsl : dsl)
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
      const before = liveHost
        ? liveHost.getElements()
        : (await buildCanvasHostForCanvas(targetCanvasId, service)).before
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
      let res: { applied: number; cardsUpdated: number; cardsCreated: number }
      if (liveHost) {
        // live:host.batch 单 undo;onCardCreate 建卡;画布页 bindCardWriteback + freeform
        // binding 持久化。不调 applyOpsAndPersist(会双写)。
        const r = applyLayout(liveHost, preview.ops, undefined, makeOnCardCreate(targetCanvasId, service))
        res = { applied: r.applied, cardsUpdated: 0, cardsCreated: r.newlyApplied.length }
      } else {
        // /ask 原 temp 路径(不变):重建 host(before)再 applyOpsAndPersist(内部再 applyLayout 一次落库)。
        const { host, before } = await buildCanvasHostForCanvas(targetCanvasId, service)
        const p = await applyOpsAndPersist(host, before, preview.ops, targetCanvasId, service)
        res = { applied: p.applied, cardsUpdated: p.cardsUpdated, cardsCreated: p.cardsCreated }
      }
      setPhase('applied')
      // 捕获样本:apply/apply_edited。开关关时 addSample 内部 no-op。
      if (sampleContext) {
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
      pushToast({
        kind: 'success',
        message: t('agent.applied', {
          n: String(res.applied),
          cards: String(res.cardsUpdated + res.cardsCreated),
        }),
      })
      onApplied({ applied: res.applied, cardsUpdated: res.cardsUpdated, cardsCreated: res.cardsCreated })
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
        <style>{styles}</style>
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

      <style>{styles}</style>
    </div>
  )
}

function canvasName(id: CanvasId): string {
  return String(id)
}

function summarizeEl(el: CanvasElement): string {
  if (el.kind === 'card') return `card #${el.id} @(${el.x},${el.y})`
  if (el.kind === 'arrow') return el.from && el.to ? `arrow ${el.from}→${el.to}` : `arrow #${el.id}`
  return `${el.kind} #${el.id}`
}

function DiffGroup({ color, label, items }: { color: 'blue' | 'red' | 'yellow'; label: string; items: string[] }) {
  return (
    <section className={`ac__group ac__group--${color}`}>
      <p className="ac__group-label">{label}</p>
      <ul className="ac__group-items">
        {items.slice(0, 8).map((it, i) => <li key={i}>{it}</li>)}
      </ul>
    </section>
  )
}

/** 简化缩略图:Canvas 2D 画元素 bbox。card=矩形,arrow=线,其他=框。 */
function Thumb({ elements, label }: { elements: CanvasElement[]; label: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const cv = canvasRef.current
    if (!cv) return
    const ctx = cv.getContext('2d')
    if (!ctx) return
    const W = cv.width, H = cv.height
    ctx.clearRect(0, 0, W, H)
    if (elements.length === 0) return
    // 算 bbox 范围 → 投影到缩略图。关系箭头(有 from/to)不贡献自己的 bbox ——
    // 其几何来自两端点卡,而卡已在 bbox 内;若把 arrow 的 el.x(端点编码,常 0)算进去,
    // 会把 minX/minY 拉到 0 缩小投影。
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
    for (const el of elements) {
      if (el.kind === 'arrow' && el.from && el.to) continue
      minX = Math.min(minX, el.x); minY = Math.min(minY, el.y)
      maxX = Math.max(maxX, el.x + (el.w || 0)); maxY = Math.max(maxY, el.y + (el.h || 0))
    }
    const pad = 8
    const sx = (W - pad * 2) / Math.max(1, maxX - minX)
    const sy = (H - pad * 2) / Math.max(1, maxY - minY)
    const s = Math.min(sx, sy)
    const ox = pad - minX * s, oy = pad - minY * s
    for (const el of elements) {
      ctx.strokeStyle = el.kind === 'card' ? readToken('--color-black', '#0a0a0a') : el.kind === 'arrow' ? readToken('--color-red', '#d40000') : readToken('--color-gray', '#6b6b6b')
      ctx.fillStyle = el.kind === 'card' ? readToken('--color-white-soft', '#ffffff') : 'transparent'
      ctx.lineWidth = 1
      if (el.kind === 'arrow' && el.from && el.to) {
        // 关系箭头:按 from/to 卡中心画红线(x/y 是端点编码,非 bbox,不能当矩形画)。
        const from = elements.find((e) => e.id === el.from)
        const to = elements.find((e) => e.id === el.to)
        if (!from || !to) continue // 悬空 arrow(端点缺)→ skip
        const fx = (from.x + (from.w || 20) / 2) * s + ox
        const fy = (from.y + (from.h || 20) / 2) * s + oy
        const tx = (to.x + (to.w || 20) / 2) * s + ox
        const ty = (to.y + (to.h || 20) / 2) * s + oy
        ctx.beginPath()
        ctx.moveTo(fx, fy)
        ctx.lineTo(tx, ty)
        ctx.stroke()
        continue
      }
      const x = el.x * s + ox, y = el.y * s + oy
      const w = (el.w || 20) * s, h = (el.h || 20) * s
      ctx.fillRect(x, y, w, h)
      ctx.strokeRect(x, y, w, h)
    }
  }, [elements])
  return (
    <div className="ac__thumb">
      <canvas ref={canvasRef} width={140} height={90} className="ac__thumb-canvas" />
      <span className="ac__thumb-label">{label}</span>
    </div>
  )
}

const styles = `
.ac { border: var(--border-hairline); border-radius: var(--radius-sm); padding: var(--space-2); margin: var(--space-2) 0; background: var(--color-white); max-width: 100%; box-sizing: border-box; min-width: 0; }
.ac--error { border-color: var(--color-red); }
.ac__title { margin: 0 0 var(--space-2); font-family: var(--font-mono); font-size: var(--font-size-xs); text-transform: uppercase; letter-spacing: 0.08em; color: var(--color-black-soft); }
.ac__diff { display: flex; flex-direction: column; gap: var(--space-1); margin-bottom: var(--space-2); }
.ac__group { padding: var(--space-1) var(--space-2); border-left: 3px solid var(--color-gray); }
.ac__group--blue { border-left-color: var(--color-blue); }
.ac__group--red { border-left-color: var(--color-red); }
.ac__group--yellow { border-left-color: var(--color-yellow); }
.ac__group-label { margin: 0 0 2px; font-family: var(--font-mono); font-size: var(--font-size-xs); color: var(--color-black-soft); }
.ac__group-items { margin: 0; padding: 0 0 0 var(--space-2); list-style: none; }
.ac__group-items li { font-family: var(--font-mono); font-size: var(--font-size-xs); color: var(--color-gray); }
.ac__nochange { margin: 0; font-family: var(--font-mono); font-size: var(--font-size-xs); color: var(--color-gray); }
.ac__thumbs { display: flex; align-items: center; gap: var(--space-2); margin-bottom: var(--space-2); overflow-x: auto; flex-wrap: nowrap; min-width: 0; }
.ac__thumb { display: flex; flex-direction: column; align-items: center; gap: 2px; }
.ac__thumb-canvas { border: var(--border-hairline); background: var(--color-gray-soft); max-width: 100%; height: auto; display: block; flex-shrink: 0; }
.ac__thumb-label { font-family: var(--font-mono); font-size: 10px; color: var(--color-gray); text-transform: uppercase; letter-spacing: 0.08em; }
.ac__arrow { color: var(--color-gray); font-family: var(--font-mono); }
.ac__edit { width: 100%; font-family: var(--font-mono); font-size: var(--font-size-xs); border: var(--border-hairline); padding: var(--space-1); border-radius: var(--radius-sm); resize: vertical; margin-bottom: var(--space-2); }
.ac__actions { display: flex; gap: var(--space-1); flex-wrap: wrap; }
.ac__errors { margin: 0 0 var(--space-2); padding-left: var(--space-3); font-family: var(--font-mono); font-size: var(--font-size-xs); color: var(--color-red); }
`
