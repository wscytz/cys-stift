import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { InMemoryCanvasHost, type CanvasElement } from '@cys-stift/canvas-engine'
import type { CanvasId, CardId, CardService } from '@cys-stift/domain'
import { messages, type MessageKey } from '@/lib/i18n/messages'
import { AiConfirmDialog } from '../ai-confirm-dialog'
import { AgentConfirmCard } from '../agent-confirm-card'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const state = vi.hoisted(() => ({ locale: 'zh' as 'zh' | 'en' }))

vi.mock('@/lib/i18n', () => ({
  useI18n: () => ({
    locale: state.locale,
    t: (key: MessageKey, params?: Record<string, string | number>) => {
      let translated: string = messages[key]?.[state.locale] ?? key
      for (const [name, value] of Object.entries(params ?? {})) {
        translated = translated.replaceAll(`{${name}}`, String(value))
      }
      return translated
    },
  }),
}))
vi.mock('../canvas-thumb', async (importOriginal) => ({
  ...await importOriginal<typeof import('../canvas-thumb')>(),
  Thumb: () => null,
}))
vi.mock('@/lib/canvas-store', () => ({
  DEFAULT_CANVAS_NAME: 'Default',
  canvasStore: { get: () => ({ canvases: [] }) },
}))

let root: Root | undefined
let container: HTMLDivElement

const canvasId = 'canvas-test' as CanvasId
const onApplied = vi.fn()
const onRejected = vi.fn()

function element(id: string, kind: CanvasElement['kind'], overrides: Partial<CanvasElement> = {}): CanvasElement {
  return { id, kind, x: 0, y: 0, w: 240, h: 120, rotation: 0, color: 'white', ...overrides }
}

function mount(dsl: string, elements: CanvasElement[] = [], mode: 'dialog' | 'inline' = 'dialog') {
  const liveHost = new InMemoryCanvasHost()
  liveHost.applyWithoutEcho(() => elements.forEach((item) => liveHost.upsert(item)))
  const titles: Record<string, string> = { 'card-source': 'Planning', 'card-target': 'Next step' }
  const service = {
    get: (cardId: CardId) => titles[cardId] === undefined ? undefined : { title: titles[cardId] },
  } as CardService
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  act(() => root!.render(mode === 'dialog' ? (
    <AiConfirmDialog mode="dsl" dsl={dsl} liveHost={liveHost} targetCanvasId={canvasId} service={service} onApplied={onApplied} onRejected={onRejected} />
  ) : (
    <AgentConfirmCard dsl={dsl} liveHost={liveHost} targetCanvasId={canvasId} service={service} onApplied={onApplied} onRejected={onRejected} />
  )))
  return liveHost
}

function items(color: 'blue' | 'red' | 'yellow'): string[] {
  return Array.from(container.querySelectorAll(`.ac__group--${color} li`))
    .map((item) => item.textContent ?? '')
}

function button(text: string): HTMLButtonElement {
  const match = Array.from(container.querySelectorAll('button')).find((item) => item.textContent === text)
  if (!match) throw new Error(`Missing button: ${text}`)
  return match
}

function escape(target: EventTarget, isComposing = false) {
  act(() => target.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, isComposing })))
}

beforeEach(() => {
  state.locale = 'zh'
  onApplied.mockClear()
  onRejected.mockClear()
})

afterEach(() => {
  act(() => root?.unmount())
  container?.remove()
  root = undefined
})

describe.each(['dialog', 'inline'] as const)('%s confirmation diff labels', (mode) => {
  it.each([
    { locale: 'zh' as const, expected: '卡片「Planning」', fields: ['横向位置', '纵向位置', '宽度', '颜色'] },
    { locale: 'en' as const, expected: 'Card “Planning”', fields: ['horizontal position', 'vertical position', 'width', 'color'] },
  ])('shows card titles and localized changed fields in $locale without applying the preview', ({ locale, expected, fields }) => {
    state.locale = locale
    const initial = element('card-source', 'card')
    const liveHost = mount('[card #card-source] @pos(80,160) @size(320,120) @color(red)', [initial], mode)

    const separator = mode === 'dialog' && locale === 'zh' ? '、' : ', '
    expect(items('yellow')).toEqual([`${expected} (${fields.join(separator)})`])
    expect(liveHost.getElements()).toEqual([initial])
    expect(onApplied).not.toHaveBeenCalled()
    expect(onRejected).not.toHaveBeenCalled()
  })

  it.each([
    { locale: 'zh' as const, expected: ['「Planning」→「Next step」', '「Planning」→「(无标题)」', '箭头'] },
    { locale: 'en' as const, expected: ['“Planning” → “Next step”', '“Planning” → “(untitled)”', 'Arrow'] },
  ])('names arrow endpoints and falls back for missing titles or unattached arrows in $locale', ({ locale, expected }) => {
    state.locale = locale
    const initial = [
      element('card-source', 'card'),
      element('card-target', 'card', { x: 320 }),
      element('card-untitled', 'card', { x: 640 }),
    ]
    const liveHost = mount([
      '[arrow #named-arrow] from #card-source to #card-target',
      '[arrow #untitled-arrow] from #card-source to #card-untitled',
      '[arrow #free-arrow] @pos(0,0) @size(160,160)',
    ].join('\n'), initial, mode)

    expect(items('blue')).toEqual(expected)
    expect(liveHost.getElements()).toEqual(initial)
  })

  it.each([
    { locale: 'zh' as const, expected: ['卡片「Planning」', '卡片「(无标题)」', '分组框'] },
    { locale: 'en' as const, expected: ['Card “Planning”', 'Card “(untitled)”', 'Box'] },
  ])('labels removed named cards, missing cards, and shapes in $locale', ({ locale, expected }) => {
    state.locale = locale
    const initial = [element('card-source', 'card'), element('card-untitled', 'card'), element('box-old', 'rect')]
    const liveHost = mount('[card #card-source delete]\n[card #card-untitled delete]\n[rect #box-old delete]', initial, mode)

    expect(items('red').sort()).toEqual([...expected].sort())
    expect(liveHost.getElements()).toHaveLength(initial.length)
    expect(liveHost.getElements()).toEqual(expect.arrayContaining(initial))
  })

  it.each([
    { locale: 'zh' as const, expected: '「Planning」→「Next step」' },
    { locale: 'en' as const, expected: '“Planning” → “Next step”' },
  ])('previews a canonical arrow deletion with endpoint titles in $locale', ({ locale, expected }) => {
    state.locale = locale
    const initial = [
      element('card-source', 'card'),
      element('card-target', 'card', { x: 320 }),
      element('arrow-old', 'arrow', { from: 'card-source', to: 'card-target' }),
    ]
    const liveHost = mount('[arrow #arrow-old delete]', initial, mode)

    expect(items('red')).toEqual([expected])
    expect(liveHost.getElements()).toHaveLength(initial.length)
    expect(liveHost.getElements()).toEqual(expect.arrayContaining(initial))
  })

  it.each([
    { locale: 'zh' as const, box: '分组框', more: '还有 2 项' },
    { locale: 'en' as const, box: 'Box', more: '+2 more' },
  ])('localizes shape labels and summarizes additions beyond eight rows in $locale', ({ locale, box, more }) => {
    state.locale = locale
    mount(Array.from({ length: 10 }, (_, index) => `[rect #box-${index}] @pos(${index * 80},0) @size(40,40)`).join('\n'), [], mode)

    expect(items('blue')).toEqual([...Array.from({ length: 8 }, () => box), more])
  })
})

describe('AI confirmation Escape routing', () => {
  it.each([
    '[card #card-source delete] garbage',
    '[arrow #arrow-old delete] garbage',
    '[card #card-source delete',
  ])('rejects malformed deletion directives without mutating the live canvas: %s', (dsl) => {
    const initial = [element('card-source', 'card'), element('arrow-old', 'arrow')]
    const liveHost = mount(dsl, initial)

    expect(container.querySelector('.ac__errors')).not.toBeNull()
    expect(items('red')).toEqual([])
    expect(Array.from(container.querySelectorAll('button')).some((item) => item.textContent === messages['agent.apply'].zh)).toBe(false)
    expect(liveHost.getElements()).toHaveLength(initial.length)
    expect(liveHost.getElements()).toEqual(expect.arrayContaining(initial))
  })

  it.each([
    { name: 'valid preview', dsl: '[rect #box] @pos(80,80) @size(160,80)' },
    { name: 'parse error', dsl: '[rect]' },
  ])('preserves IME input and rejects on ordinary Escape from the $name editor', ({ dsl }) => {
    mount(dsl)
    act(() => button(messages['agent.edit'].zh).click())
    const editor = container.querySelector('textarea')!
    expect(editor).not.toBeNull()
    editor.focus()

    escape(editor, true)
    expect(onRejected).not.toHaveBeenCalled()
    expect(document.activeElement).toBe(editor)

    escape(editor)
    expect(onRejected).toHaveBeenCalledTimes(1)
    expect(onApplied).not.toHaveBeenCalled()

    act(() => root!.unmount())
    root = undefined
    escape(document)
    expect(onRejected).toHaveBeenCalledTimes(1)
  })

  it('ignores Escape while focus is outside the dialog', () => {
    mount('[rect #box] @pos(80,80) @size(160,80)')
    const outside = document.createElement('button')
    document.body.appendChild(outside)
    outside.focus()
    escape(outside)
    expect(onRejected).not.toHaveBeenCalled()
    outside.remove()

    container.querySelector<HTMLButtonElement>('button')!.focus()
    escape(document.activeElement!)
    expect(onRejected).toHaveBeenCalledTimes(1)
  })

  it('lets an editor consume Escape before the dialog rejects', () => {
    mount('[rect #box] @pos(80,80) @size(160,80)')
    act(() => button(messages['agent.edit'].zh).click())
    const editor = container.querySelector('textarea')!
    editor.focus()
    const consume = (event: KeyboardEvent) => event.stopPropagation()
    editor.addEventListener('keydown', consume)
    escape(editor)
    expect(onRejected).not.toHaveBeenCalled()

    editor.removeEventListener('keydown', consume)
    escape(editor)
    expect(onRejected).toHaveBeenCalledTimes(1)
  })
})
