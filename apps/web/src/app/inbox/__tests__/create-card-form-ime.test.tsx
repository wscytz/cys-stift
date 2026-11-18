import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { CreateCardForm } from '../create-card-form'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

vi.mock('@/lib/i18n', () => ({ useI18n: () => ({ t: (key: string) => key }) }))
vi.mock('@/lib/draft-store', () => ({
  useDraft: () => ({ draft: null, ready: true }),
  isDraftPersistOk: () => true,
  draftStore: { clear: vi.fn(), upsert: vi.fn() },
}))

let root: Root | undefined
let container: HTMLDivElement
const onCreate = vi.fn().mockResolvedValue(true)

function input(selector: string): HTMLInputElement {
  const result = container.querySelector<HTMLInputElement>(selector)
  if (!result) throw new Error(`Missing input: ${selector}`)
  return result
}

function type(target: HTMLInputElement, value: string) {
  act(() => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(target, value)
    target.dispatchEvent(new Event('input', { bubbles: true }))
  })
}

function press(target: HTMLInputElement, key: string, isComposing = false): KeyboardEvent {
  const event = new KeyboardEvent('keydown', { key, isComposing, bubbles: true, cancelable: true })
  act(() => target.dispatchEvent(event))
  return event
}

function tags(): string[] {
  return Array.from(container.querySelectorAll<HTMLButtonElement>('.ccf__tag-remove'))
    .map((button) => button.getAttribute('aria-label')!)
}

describe('Inbox tag input composition', () => {
  beforeEach(() => {
    onCreate.mockClear()
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
    act(() => root!.render(<CreateCardForm onCreate={onCreate} />))
  })

  afterEach(() => {
    act(() => root?.unmount())
    container.remove()
    root = undefined
  })

  it.each(['Enter', ','])('keeps composing text until a non-composing %s commits the trimmed tag', (key) => {
    const tagInput = input('[aria-label="tag.add"]')
    type(tagInput, '  灵感  ')
    const composing = press(tagInput, key, true)
    expect(composing.defaultPrevented).toBe(false)
    expect(tagInput.value).toBe('  灵感  ')
    expect(tags()).toEqual([])
    expect(onCreate).not.toHaveBeenCalled()

    const committed = press(tagInput, key)
    expect(committed.defaultPrevented).toBe(true)
    expect(tags()).toEqual(['tag.remove: 灵感'])
    expect(tagInput.value).toBe('')
    expect(onCreate).not.toHaveBeenCalled()
  })

  it('deduplicates trimmed tags, ignores blanks, and supports blur and removal', () => {
    const tagInput = input('[aria-label="tag.add"]')
    type(tagInput, 'ideas')
    press(tagInput, 'Enter')
    type(tagInput, ' ideas ')
    press(tagInput, ',')
    type(tagInput, '  ')
    press(tagInput, 'Enter')
    expect(tags()).toEqual(['tag.remove: ideas'])

    type(tagInput, 'next')
    act(() => tagInput.dispatchEvent(new FocusEvent('focusout', { bubbles: true })))
    expect(tags()).toEqual(['tag.remove: ideas', 'tag.remove: next'])
    expect(tagInput.value).toBe('')

    act(() => container.querySelector<HTMLButtonElement>('.ccf__tag-remove')!.click())
    expect(tags()).toEqual(['tag.remove: next'])
  })

  it('submits only committed tags and clears them after successful creation', async () => {
    type(input('input[name$="-title"]'), '  A captured thought  ')
    const tagInput = input('[aria-label="tag.add"]')
    type(tagInput, '灵感')
    press(tagInput, 'Enter')
    type(tagInput, 'uncommitted')

    await act(async () => {
      container.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
    })

    expect(onCreate).toHaveBeenCalledTimes(1)
    expect(onCreate.mock.calls[0]![0]).toMatchObject({ title: 'A captured thought', tags: [{ value: '灵感' }] })
    expect(tags()).toEqual([])
    expect(tagInput.value).toBe('')
  })
})
