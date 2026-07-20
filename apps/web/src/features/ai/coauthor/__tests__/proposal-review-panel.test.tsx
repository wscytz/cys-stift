import { describe, expect, it, vi } from 'vitest'
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import type { CanvasHost } from '@cys-stift/canvas-engine'
import { ProposalReviewPanel } from '../proposal-review-panel'
import type { ProposalPayloadV1 } from '../proposal-contract'
import { I18nProvider } from '@/lib/i18n'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const payload: ProposalPayloadV1 = {
  kind: 'cys-proposal-payload', version: 1, task: 'plan-structure-audit', summary: '', findings: [{
    findingId: 'finding', kind: 'orphan-step', title: 'Potential missing handoff', explanation: 'The selected step is disconnected.',
    evidence: [{ refId: 'ref', role: 'supports' }], uncertainty: 'low', proposalItemIds: ['logic'],
  }],
  items: [
    { itemId: 'logic', lane: 'semantic', evidence: [{ refId: 'ref', role: 'targets' }], dependsOn: [], conflictsWith: [], reason: 'Connect the steps', action: { type: 'relation.add', from: 'a', to: 'b', relation: 'blocks' } },
    { itemId: 'idea', lane: 'idea', evidence: [{ refId: 'ref', role: 'inspired-by' }], dependsOn: ['logic'], conflictsWith: [], reason: 'Ask a question', candidate: { title: 'Question', promptedByRefIds: ['ref'] } },
  ],
}

function host(): CanvasHost {
  return {
    getElements: () => [], getElement: () => undefined, getSelectedIds: () => [], setSelectedIds: vi.fn(), upsert: vi.fn(), remove: vi.fn(), batch: (fn) => fn(), applyWithoutEcho: (fn) => fn(),
    onUserChange: () => () => {}, onSelectionChange: () => () => {}, getView: () => ({ panX: 0, panY: 0, zoom: 1, gridMode: 'free' }), setView: () => {}, onViewChange: () => () => {},
  }
}

describe('ProposalReviewPanel', () => {
  it('locates evidence, persists decisions through its owner, and requires explicit prerequisites', () => {
    const rootElement = document.createElement('div')
    document.body.appendChild(rootElement)
    const root = createRoot(rootElement)
    const canvasHost = host()
    const onReviewChange = vi.fn()
    act(() => root.render(<I18nProvider><ProposalReviewPanel payload={payload} sourceRefs={[{ refId: 'ref', sourceKind: 'card', entityId: 'a', field: 'title', sourceRevision: 'r', selector: { exact: 'A', excerptHash: 'x' } }]} host={canvasHost} onReviewChange={onReviewChange} onClose={() => {}} /></I18nProvider>))
    expect(rootElement.textContent).toContain('逐项审查后再更改画布')
    expect(rootElement.textContent).toContain('Potential missing handoff')
    const locate = [...rootElement.querySelectorAll('button')].find((button) => button.textContent?.startsWith('定位来源'))
    expect(locate).toBeTruthy()
    act(() => locate?.click())
    expect(canvasHost.setSelectedIds).toHaveBeenCalledWith(['a'])
    const ideas = [...rootElement.querySelectorAll('button')].find((button) => button.textContent === '想法')
    act(() => ideas?.click())
    const accept = [...rootElement.querySelectorAll('button')].find((button) => button.textContent === '接受')
    act(() => accept?.click())
    expect(rootElement.textContent).toContain('请先逐项审查并接受所列前置项')
    const logic = [...rootElement.querySelectorAll('button')].find((button) => button.textContent === '逻辑')
    act(() => logic?.click())
    const acceptLogic = [...rootElement.querySelectorAll('button')].find((button) => button.textContent === '接受')
    act(() => acceptLogic?.click())
    expect(onReviewChange).toHaveBeenCalledWith(expect.objectContaining({ decisions: expect.objectContaining({ logic: 'accepted' }) }))
    act(() => root.unmount())
    rootElement.remove()
  })

  it('keeps an accepted item visible as blocked with its compile reason', async () => {
    const rootElement = document.createElement('div')
    document.body.appendChild(rootElement)
    const root = createRoot(rootElement)
    const onExecutionChange = vi.fn()
    await act(async () => root.render(<I18nProvider><ProposalReviewPanel payload={payload} sourceRefs={[{ refId: 'ref', sourceKind: 'card', entityId: 'a', field: 'title', sourceRevision: 'r', selector: { exact: 'A', excerptHash: 'x' } }]} host={host()} onExecutionChange={onExecutionChange} onPreview={async () => ({ ok: false, message: 'blocked', code: 'MISSING_ENDPOINT', itemIds: ['logic'] })} onClose={() => {}} /></I18nProvider>))
    const accept = [...rootElement.querySelectorAll('button')].find((button) => button.textContent === '接受')
    await act(async () => accept?.click())
    const preview = [...rootElement.querySelectorAll('button')].find((button) => button.textContent === '预览已接受项')
    await act(async () => preview?.click())
    expect(rootElement.textContent).toContain('已接受，但当前无法编译：MISSING_ENDPOINT')
    expect(rootElement.textContent).toContain('阻止 1 项')
    expect(onExecutionChange).toHaveBeenLastCalledWith(expect.objectContaining({ execution: expect.objectContaining({ logic: { state: 'blocked', reasonCode: 'MISSING_ENDPOINT' } }) }))
    act(() => root.unmount())
    rootElement.remove()
  })
})
