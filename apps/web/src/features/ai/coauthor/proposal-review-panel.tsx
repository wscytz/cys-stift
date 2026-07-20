'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { elementCenter, type CanvasHost } from '@cys-stift/canvas-engine'
import { Button } from '@cys-stift/ui'
import type { ProposalLane, ProposalPayloadV1, ProposalReviewRecordV1 } from './proposal-contract'
import { createProposalReviewState, reduceProposalReview, type ProposalReviewState } from './proposal-reducer'
import type { SourceRefV1 } from './working-set-types'
import { recordReviewMetric } from './review-metrics'
import { useI18n } from '@/lib/i18n'
import type { CommitReceiptV1 } from '@/lib/proposal-transaction-journal'

const LANES: ProposalLane[] = ['semantic', 'idea', 'layout']

export type ProposalReviewActionResult =
  | { ok: true }
  | { ok: false; message: string; code?: string; itemIds?: string[] }

export function ProposalReviewPanel({
  payload,
  sourceRefs,
  host,
  canvasEl,
  initialReview,
  onReviewChange,
  onExecutionChange,
  previewChangedIds,
  commitReceipt,
  onPreview,
  onApply,
  onUndo,
  onExportJson,
  onExportMarkdown,
  onChangeScope,
  onClose,
}: {
  payload: ProposalPayloadV1
  sourceRefs: SourceRefV1[]
  host: CanvasHost
  canvasEl?: HTMLCanvasElement | null
  initialReview?: ProposalReviewRecordV1
  onReviewChange?: (review: ProposalReviewRecordV1) => void
  onExecutionChange?: (review: ProposalReviewRecordV1) => void
  previewChangedIds?: string[]
  commitReceipt?: CommitReceiptV1
  onPreview?: (review: ProposalReviewRecordV1) => Promise<ProposalReviewActionResult>
  onApply?: () => Promise<ProposalReviewActionResult>
  onUndo?: () => Promise<ProposalReviewActionResult>
  onExportJson?: () => void
  onExportMarkdown?: () => void
  onChangeScope?: () => void | Promise<void>
  onClose: () => void
}) {
  const { t } = useI18n()
  const lanes = LANES.filter((id) => payload.items.some((item) => item.lane === id))
  const [state, setState] = useState<ProposalReviewState>(() => {
    const initial = createProposalReviewState('fixture', payload)
    const generating = reduceProposalReview(payload, initial, { type: 'begin-generation' })
    const reviewing = generating.ok ? reduceProposalReview(payload, generating.state, { type: 'begin-review' }) : null
    return reviewing?.ok ? { ...reviewing.state, record: initialReview ?? reviewing.state.record } : initial
  })
  const [lane, setLane] = useState<ProposalLane>(() => lanes[0] ?? 'semantic')
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState<'preview' | 'apply' | 'undo' | null>(null)
  const openedAt = useRef(Date.now())
  const durationRecorded = useRef(false)
  const refs = useMemo(() => new Map(sourceRefs.map((ref) => [ref.refId, ref])), [sourceRefs])
  useEffect(() => { recordReviewMetric({ type: 'review-opened', proposalId: state.record.proposalId }) }, [state.record.proposalId])
  useEffect(() => {
    if (!initialReview) return
    setState((current) => JSON.stringify(current.record) === JSON.stringify(initialReview)
      ? current
      : { ...current, record: initialReview })
  }, [initialReview])
  useEffect(() => {
    if (lanes.length > 0 && !lanes.includes(lane)) setLane(lanes[0]!)
  }, [lane, lanes])
  const recordDuration = (outcome: 'applied' | 'closed') => {
    if (durationRecorded.current) return
    durationRecorded.current = true
    recordReviewMetric({ type: 'review-duration', proposalId: state.record.proposalId, durationMs: Date.now() - openedAt.current, outcome })
  }

  const locate = (refId: string) => {
    const ref = refs.get(refId)
    if (!ref) return
    recordReviewMetric({ type: 'source-located', proposalId: state.record.proposalId, lane })
    host.setSelectedIds([ref.entityId])
    const element = host.getElement(ref.entityId)
    if (element && canvasEl) {
      const view = host.getView(); const center = elementCenter(element)
      host.setView({ ...view, panX: canvasEl.clientWidth / 2 - center.x * view.zoom, panY: canvasEl.clientHeight / 2 - center.y * view.zoom })
    }
  }
  const decide = (itemId: string, decision: 'accepted' | 'rejected') => {
    const result = reduceProposalReview(payload, state, { type: 'decide', itemId, decision, at: new Date().toISOString() })
    if (!result.ok) {
      setMessage(result.code === 'DEPENDENCIES_REQUIRED' ? t('canvas.audit.dependenciesRequired') : result.message)
      if (result.code === 'DEPENDENCIES_REQUIRED') recordReviewMetric({ type: 'dependency-prompted', proposalId: state.record.proposalId, itemId, requiredCount: result.requiredItemIds?.length ?? 0 })
      return
    }
    setMessage('')
    setState(result.state)
    const item = payload.items.find((candidate) => candidate.itemId === itemId)
    if (item) recordReviewMetric({ type: 'decision', proposalId: state.record.proposalId, lane: item.lane, decision })
    onReviewChange?.(result.state.record)
  }
  const setKeepPosition = (elementId: string, enabled: boolean) => {
    const result = reduceProposalReview(payload, state, { type: 'set-keep-position', elementId, enabled, at: new Date().toISOString() })
    if (!result.ok) { setMessage(result.message); return }
    setMessage('')
    setState(result.state)
    onReviewChange?.(result.state.record)
  }
  const run = async (kind: 'preview' | 'apply' | 'undo', action: (() => Promise<ProposalReviewActionResult>) | undefined) => {
    if (!action || busy) return
    setBusy(kind); setMessage('')
    try {
      const result = await action()
      if (!result.ok) {
        setMessage(result.message)
        if (kind === 'preview' && result.itemIds?.length) {
          const execution = { ...state.record.execution }
          for (const itemId of result.itemIds) execution[itemId] = { state: 'blocked', reasonCode: result.code ?? 'COMPILE_BLOCKED' }
          const next = { ...state, record: { ...state.record, execution } }
          setState(next)
          onExecutionChange?.(next.record)
        }
      } else {
        if (kind === 'preview') {
          const execution = { ...state.record.execution }
          for (const [itemId, decision] of Object.entries(state.record.decisions)) if (decision === 'accepted') execution[itemId] = { state: 'ready' }
          const next = { ...state, record: { ...state.record, execution } }
          setState(next)
          onExecutionChange?.(next.record)
        }
        recordReviewMetric({ type: kind === 'preview' ? 'previewed' : kind === 'apply' ? 'applied' : 'undone', proposalId: state.record.proposalId })
        if (kind === 'apply') recordDuration('applied')
      }
    } finally { setBusy(null) }
  }
  const acceptedCount = Object.values(state.record.decisions).filter((decision) => decision === 'accepted').length
  const acceptedItems = payload.items.filter((item) => state.record.decisions[item.itemId] === 'accepted')
  const atomicGroups = [...new Set(acceptedItems.map((item) => item.atomicGroupId).filter((id): id is string => !!id))]
  const blockedItems = acceptedItems.filter((item) => state.record.execution[item.itemId]?.state === 'blocked')
  const commitReceiptId = commitReceipt?.receiptId

  return (
    <aside className="cv-proposal-review" aria-label={t('canvas.audit.reviewLabel')} style={{
      overflow: 'auto', background: 'var(--color-white)', border: '2px solid var(--color-black)',
      boxShadow: '4px 4px 0 0 var(--color-black)', borderRadius: 'var(--radius-sm)', padding: 'var(--space-2)',
    }}>
      <header style={{ display: 'flex', justifyContent: 'space-between', gap: 'var(--space-1)', alignItems: 'start' }}>
        <div><strong>{t('canvas.audit.reviewTitle')}</strong><p style={{ margin: 'var(--space-1) 0', fontSize: 'var(--font-size-xs)' }}>{t('canvas.audit.reviewBody')}</p></div>
        <button type="button" className="cv-chrome-toggle" onClick={() => { recordDuration('closed'); onClose() }} aria-label={t('canvas.audit.closeReview')}>×</button>
      </header>
      {payload.findings.length > 0 && <section aria-labelledby="proposal-findings-title" style={{ borderTop: '2px solid var(--color-black)', marginTop: 'var(--space-2)', paddingTop: 'var(--space-2)' }}>
        <h3 id="proposal-findings-title" style={{ margin: 0, fontSize: 'var(--font-size-sm)' }}>{t('canvas.audit.findings')}</h3>
        {payload.findings.map((finding) => <div key={finding.findingId} style={{ borderTop: 'var(--border-hairline)', marginTop: 'var(--space-1)', paddingTop: 'var(--space-1)' }}>
          <strong style={{ fontSize: 'var(--font-size-sm)' }}>{finding.title}</strong>
          <p style={{ margin: 'var(--space-1) 0', fontSize: 'var(--font-size-xs)' }}>{finding.explanation}</p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-1)' }}>
            {finding.evidence.map((edge) => <button key={`${finding.findingId}:${edge.refId}:${edge.role}`} type="button" onClick={() => locate(edge.refId)} className="cv-outline__item" style={{ fontSize: 'var(--font-size-xs)' }}>{t('canvas.audit.locateSource')} ({edge.role})</button>)}
          </div>
        </div>)}
      </section>}
      {lanes.length > 0 && <div role="tablist" aria-label={t('canvas.audit.lanes')} style={{ display: 'flex', gap: 'var(--space-1)', margin: 'var(--space-2) 0' }}>
        {lanes.map((id) => <button key={id} type="button" role="tab" aria-selected={lane === id} onClick={() => { setLane(id); recordReviewMetric({ type: 'lane-viewed', proposalId: state.record.proposalId, lane: id }) }} className="cv-companion-tab" style={{ background: lane === id ? 'var(--color-black)' : 'var(--color-white)', color: lane === id ? 'var(--color-white)' : 'var(--color-black)', border: '1px solid var(--color-black)', borderRadius: 'var(--radius-sm)', padding: '2px var(--space-1)' }}>{id === 'semantic' ? t('canvas.audit.logic') : id === 'idea' ? t('canvas.audit.ideas') : t('canvas.audit.layout')}</button>)}
      </div>}
      {message && <p role="status" style={{ color: 'var(--color-red)', fontSize: 'var(--font-size-xs)' }}>{message}</p>}
      {lanes.length > 0 && <div role="tabpanel" style={{ display: 'grid', gap: 'var(--space-2)' }}>
        {payload.items.filter((item) => item.lane === lane).map((item) => {
          const decision = state.record.decisions[item.itemId] ?? 'pending'
          return <section key={item.itemId} style={{ borderTop: 'var(--border-hairline)', paddingTop: 'var(--space-2)' }}>
            <p style={{ margin: 0, fontWeight: 600 }}>{item.reason}</p>
            {item.lane === 'idea' && <p style={{ margin: 'var(--space-1) 0', fontSize: 'var(--font-size-xs)' }}>{t('canvas.audit.ideaCandidate')}: {item.candidate.title}</p>}
            {item.lane === 'semantic' && <p style={{ margin: 'var(--space-1) 0', fontSize: 'var(--font-size-xs)' }}>{t('canvas.audit.action')}: {item.action.type}</p>}
            {item.lane === 'layout' && <p style={{ margin: 'var(--space-1) 0', fontSize: 'var(--font-size-xs)' }}>{t('canvas.audit.previewIntent')}</p>}
            {item.lane === 'layout' && <fieldset style={{ border: 0, padding: 0, margin: '0 0 var(--space-1)', display: 'grid', gap: 'var(--space-1)' }}>
              <legend style={{ fontSize: 'var(--font-size-xs)' }}>{t('canvas.audit.keepPosition')}</legend>
              {[...new Set(item.intent.ops.flatMap((op) => 'targets' in op ? op.targets : 'target' in op ? [op.target] : []))].map((id) => <label key={id} style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-1)', fontSize: 'var(--font-size-xs)' }}>
                <input type="checkbox" checked={state.record.keepPositionIds?.includes(id) ?? false} onChange={(event) => setKeepPosition(id, event.currentTarget.checked)} />
                {t('canvas.audit.keepPositionTarget', { id })}
              </label>)}
            </fieldset>}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-1)', marginBottom: 'var(--space-1)' }}>
              {item.evidence.map((edge) => <button key={`${edge.refId}:${edge.role}`} type="button" onClick={() => locate(edge.refId)} className="cv-outline__item" style={{ fontSize: 'var(--font-size-xs)' }}>{t('canvas.audit.locateSource')} ({edge.role})</button>)}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-1)' }}>
              <Button variant="primary" disabled={decision === 'accepted'} onClick={() => decide(item.itemId, 'accepted')}>{t('canvas.audit.accept')}</Button>
              <Button variant="ghost" disabled={decision === 'rejected'} onClick={() => decide(item.itemId, 'rejected')}>{t('canvas.audit.reject')}</Button>
              <span style={{ fontSize: 'var(--font-size-xs)' }}>{decision}</span>
            </div>
            {state.record.execution[item.itemId]?.state === 'blocked' && <p role="status" style={{ color: 'var(--color-red)', margin: 'var(--space-1) 0 0', fontSize: 'var(--font-size-xs)' }}>{t('canvas.audit.blockedReason', { reason: state.record.execution[item.itemId]?.reasonCode ?? 'COMPILE_BLOCKED' })}</p>}
          </section>
        })}
      </div>}
      <footer style={{ borderTop: '2px solid var(--color-black)', marginTop: 'var(--space-2)', paddingTop: 'var(--space-2)' }}>
        {previewChangedIds && <p style={{ fontSize: 'var(--font-size-xs)', margin: '0 0 var(--space-1)' }}>{t('canvas.audit.previewSummary', { count: previewChangedIds.length })}: {previewChangedIds.join(', ')}</p>}
        {acceptedCount > 0 && <p style={{ fontSize: 'var(--font-size-xs)', margin: '0 0 var(--space-1)' }}>{t('canvas.audit.atomicGroups')}: {atomicGroups.join(', ') || t('canvas.audit.none')} · {t('canvas.audit.blockedCount', { count: blockedItems.length })}</p>}
        {commitReceiptId && <p style={{ fontSize: 'var(--font-size-xs)', margin: '0 0 var(--space-1)' }}>{t('canvas.audit.receipt')}: {commitReceiptId}</p>}
        {commitReceipt?.itemReports.map((report) => <p key={report.itemId} style={{ fontSize: 'var(--font-size-xs)', margin: '0 0 var(--space-1)' }}>{report.itemId}: {t('canvas.audit.itemReport', { cards: report.changedCardIds.length, elements: report.changedElementIds.length })}</p>)}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-1)' }}>
          {!commitReceiptId && onChangeScope && <Button variant="ghost" disabled={busy !== null} onClick={() => { recordReviewMetric({ type: 'scope-reopened', proposalId: state.record.proposalId }); recordDuration('closed'); void onChangeScope() }}>{t('canvas.audit.changeScope')}</Button>}
          {!commitReceiptId && <Button variant="ghost" disabled={acceptedCount === 0 || busy !== null} onClick={() => void run('preview', onPreview ? () => onPreview(state.record) : undefined)}>{busy === 'preview' ? t('canvas.audit.preparing') : t('canvas.audit.previewAccepted')}</Button>}
          {!commitReceiptId && <Button variant="primary" disabled={!previewChangedIds || busy !== null} onClick={() => void run('apply', onApply)}>{busy === 'apply' ? t('canvas.audit.applying') : t('canvas.audit.applyPreview')}</Button>}
          {commitReceiptId && <Button variant="ghost" disabled={busy !== null} onClick={() => void run('undo', onUndo)}>{busy === 'undo' ? t('canvas.audit.undoing') : t('canvas.audit.undoProposal')}</Button>}
          {commitReceiptId && <Button variant="ghost" onClick={onExportJson}>{t('canvas.audit.exportJson')}</Button>}
          {commitReceiptId && <Button variant="ghost" onClick={onExportMarkdown}>{t('canvas.audit.exportMarkdown')}</Button>}
        </div>
      </footer>
    </aside>
  )
}
