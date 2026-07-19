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
import type { CanvasId, CardService } from '@cys-stift/domain'
import { InMemoryCanvasHost, type CanvasHost, type CanvasElement } from '@cys-stift/canvas-engine'
import { parseDslStrictWithDiagnostics } from './dsl-parser'
import { applyLayout } from '@/features/canvas/apply-layout'
import { applyClusters, type CardCluster } from './cluster'
import { diffCanvasSnapshots } from '@/features/canvas/canvas-diff'
import { summarizeMovement } from '@/features/canvas/layout-movement'
import { Thumb, DiffGroup, summarizeEl, confirmStyles } from './canvas-thumb'
import { MarkdownBody } from '@/app/inbox/markdown'
import { useI18n } from '@/lib/i18n'
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

export function AiConfirmDialog(props: AiConfirmDialogProps) {
  const { t } = useI18n()
  const [phase, setPhase] = useState<Phase>('confirming')
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

  useEffect(() => {
    if (props.mode === 'dsl') {
      if (preview?.kind !== 'ok') { setBeforeState(null); setAfterState(null); return }
      let cancelled = false
      const before = props.liveHost.getElements()
      const afterHost = new InMemoryCanvasHost()
      afterHost.applyWithoutEcho(() => { for (const el of before) afterHost.upsert(el) })
      applyLayout(afterHost, preview.ops)
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
        const { applied } = applyLayout(props.liveHost, preview.ops)
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
        if (applied === 0) pushToast({ kind: 'info', message: t('canvas.aiLayoutNoneApplied') })
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
      } else { // outline
        const body = editing ? editedMarkdown : props.outlineMarkdown
        props.service.create({
          title: t('ai.confirm.outlineCardTitle'),
          body,
          source: { kind: 'manual', deviceId: 'web' },
        })
        pushToast({ kind: 'success', message: t('ai.confirm.outlineCreated') })
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
      <Modal open onClose={props.onRejected} title={t('agent.parseError')} closeLabel={t('common.close')}>
        <ul className="ac__errors">
          {proposalErrors.slice(0, 5).map((e, index) => (<li key={`${e.line}-${index}`}>{e.line > 0 ? `L${e.line}: ` : ''}{e.text || e.message}</li>))}
        </ul>
        <div className="ac__actions">
          <Button variant="ghost" onClick={() => setEditing((v) => !v)}>{t('agent.edit')}</Button>
          <Button variant="ghost" onClick={() => { recordReject(); props.onRejected() }}>{t('agent.retry')}</Button>
        </div>
        {editing && (
          <textarea className="ac__edit" value={editedDsl} onChange={(e) => setEditedDsl(e.target.value)} rows={Math.min(8, editedDsl.split('\n').length)} />
        )}
        <style>{confirmStyles}</style>
      </Modal>
    )
  }

  return (
    <Modal open onClose={props.onRejected} title={title} closeLabel={t('common.close')}>
      <div className="ac">
        <p className="ac__title">{title}</p>

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
            {diff.added.length > 0 && (
              <DiffGroup color="blue" label={t('agent.added', { n: String(diff.added.length) })} items={diff.added.map((e) => summarizeEl(e))} />
            )}
            {diff.removed.length > 0 && (
              <DiffGroup color="red" label={t('agent.removed', { n: String(diff.removed.length) })} items={diff.removed.map((e) => summarizeEl(e))} />
            )}
            {diff.changed.length > 0 && (
              <DiffGroup color="yellow" label={t('agent.changed', { n: String(diff.changed.length) })} items={diff.changed.map((c) => `${summarizeEl(c.after)} (${c.fields.join(', ')})`)} />
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
          <Button variant="primary" onClick={() => void handleApply()} disabled={phase === 'applying' || phase === 'applied' || (props.mode !== 'outline' && (!afterState || ((props.mode === 'dsl' || props.mode === 'cluster') && totalChanges === 0)))}>
            {phase === 'applying' ? t('agent.applying') : t('agent.apply')}
          </Button>
          {props.mode !== 'cluster' && (
            <Button variant="ghost" onClick={() => setEditing((v) => !v)}>{t('agent.edit')}</Button>
          )}
          <Button variant="ghost" onClick={() => { recordReject(); props.onRejected() }}>{t('agent.reject')}</Button>
        </div>
      </div>
      <style>{confirmStyles}</style>
    </Modal>
  )
}
