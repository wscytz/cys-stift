import { describe, it, expect, vi } from 'vitest'
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { InMemoryCanvasHost, type CanvasHost } from '@cys-stift/canvas-engine'

vi.mock('@/lib/i18n', () => ({
  useI18n: () => ({
    t: (key: string, params?: Record<string, unknown>) =>
      params
        ? `${key}(${Object.entries(params).map(([name, value]) => `${name}=${String(value)}`).join(',')})`
        : key,
    locale: 'zh' as const,
  }),
}))
vi.mock('@/lib/toast-store', () => ({ pushToast: vi.fn() }))
vi.mock('@/lib/archive-store', () => ({
  archiveStore: { append: vi.fn(), subscribe: () => () => {}, getVersion: () => 0 },
}))
vi.mock('@/lib/build-archive-payload', () => ({ buildArchivePayload: vi.fn() }))
vi.mock('@cys-stift/ui', () => ({
  Modal: ({ children, open }: { children?: React.ReactNode; open: boolean }) => (open ? React.createElement('div', null, children) : null),
  Button: ({ children, onClick, disabled }: { children?: React.ReactNode; onClick?: () => void; disabled?: boolean }) =>
    React.createElement('button', { onClick, disabled, type: 'button' }, children),
}))

import { DslDialog } from '../dsl-dialog'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

function mountDialog(host: InMemoryCanvasHost, service: unknown) {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  act(() => {
    root.render(
      <DslDialog
        open={true}
        onClose={() => {}}
        host={host as unknown as CanvasHost}
        service={service as Parameters<typeof DslDialog>[0]['service']}
        canvasName="demo"
      />,
    )
  })
  return { container, unmount: () => act(() => root.unmount()) }
}

function changeText(container: HTMLElement, value: string) {
  const textarea = container.querySelector('textarea')!
  act(() => {
    const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!
    setter.call(textarea, value)
    textarea.dispatchEvent(new Event('input', { bubbles: true }))
  })
}

function previewText(container: HTMLElement): string {
  return container.querySelector('.dsl-preview')?.textContent ?? ''
}

describe('DslDialog preview labels', () => {
  it('names a newly created card and an arrow by its endpoints', () => {
    const host = new InMemoryCanvasHost()
    host.upsert({ id: 'a', kind: 'card', x: 0, y: 0, w: 100, h: 50, rotation: 0, color: 'white' })
    const service = {
      get: (id: string) =>
        id === 'a'
          ? { title: 'Card A', body: 'old', type: 'note', tags: [], links: [], codeSnippets: [], quotes: [] }
          : undefined,
    }
    const { container, unmount } = mountDialog(host, service)
    changeText(
      container,
      '[card #g create] right-of #a @gap(40) @title("证据 G") @content("新增")\n[arrow #e6] from #a to #g',
    )
    const text = previewText(container)
    expect(text).toContain('canvas.diffElementCard(title=证据 G)')
    expect(text).toContain('canvas.kind.arrow Card A→证据 G')
    unmount()
  })

  it('lists content fields for a card update instead of a generic summary', () => {
    const host = new InMemoryCanvasHost()
    host.upsert({ id: 'a', kind: 'card', x: 0, y: 0, w: 100, h: 50, rotation: 0, color: 'white' })
    const service = {
      get: (id: string) =>
        id === 'a'
          ? { title: 'Card A', body: 'old body', type: 'note', tags: [], links: [], codeSnippets: [], quotes: [] }
          : undefined,
    }
    const { container, unmount } = mountDialog(host, service)
    changeText(container, '[card #a] @title("新标题") @content("新正文")')
    const text = previewText(container)
    expect(text).toContain('canvas.diffElementCard(title=Card A)')
    expect(text).toContain('canvas.diffField.title')
    expect(text).toContain('canvas.diffField.content')
    expect(text).toContain('canvas.dslPreviewChanges(added=0,removed=0,changed=1)')
    unmount()
  })

  it('disables apply when the canvas changes while the dialog is open', () => {
    const host = new InMemoryCanvasHost()
    host.upsert({ id: 'a', kind: 'card', x: 0, y: 0, w: 100, h: 50, rotation: 0, color: 'white' })
    const service = { get: () => undefined }
    const { container, unmount } = mountDialog(host, service)
    act(() => {
      host.upsert({ id: 'b', kind: 'card', x: 200, y: 0, w: 100, h: 50, rotation: 0, color: 'white' })
    })
    expect(container.querySelector('.dsl-preview--stale')).not.toBeNull()
    const apply = [...container.querySelectorAll('button')].find(
      (button) => button.textContent === 'canvas.dslApply',
    ) as HTMLButtonElement | undefined
    expect(apply?.disabled).toBe(true)
    unmount()
  })

  it('blocks a proposal whose anchor does not exist', () => {
    const host = new InMemoryCanvasHost()
    host.upsert({ id: 'e', kind: 'card', x: 0, y: 0, w: 100, h: 50, rotation: 0, color: 'white' })
    const service = { get: () => ({ title: 'Card E', body: '', type: 'note', tags: [], links: [], codeSnippets: [], quotes: [] }) }
    const { container, unmount } = mountDialog(host, service)
    changeText(container, '[card #e] right-of #ghost @gap(40)')
    const text = previewText(container)
    expect(text).toContain('canvas.dslPreviewBlocked')
    expect(text).toContain('ghost')
    const before = JSON.stringify(host.getElements())
    const apply = [...container.querySelectorAll('button')].find(
      (button) => button.textContent === 'canvas.dslApply',
    ) as HTMLButtonElement | undefined
    act(() => apply?.click())
    expect(JSON.stringify(host.getElements())).toBe(before)
    unmount()
  })
})
