import { act, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { describe, expect, it, vi } from 'vitest'
import {
  CanvasCommandMenu,
  canvasMenuTriggerIntent,
} from '../canvas-command-menu'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

function Harness({ onSelect }: { onSelect: (id: string) => void }) {
  const [open, setOpen] = useState(false)
  const [initialFocus, setInitialFocus] = useState<'first' | 'last'>('first')
  const triggerRef = useRef<HTMLButtonElement>(null)
  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls="test-menu"
        onClick={() => {
          setInitialFocus('first')
          setOpen((value) => !value)
        }}
        onKeyDown={(event) => {
          const intent = canvasMenuTriggerIntent(event.key)
          if (!intent) return
          event.preventDefault()
          setInitialFocus(intent)
          setOpen(true)
        }}
      >
        Commands
      </button>
      <CanvasCommandMenu
        id="test-menu"
        label="Commands"
        open={open}
        initialFocus={initialFocus}
        triggerRef={triggerRef}
        onClose={() => setOpen(false)}
        items={[
          { id: 'one', label: 'One', onSelect: () => onSelect('one') },
          { id: 'disabled', label: 'Disabled', disabled: true, onSelect: () => onSelect('disabled') },
          { id: 'two', label: 'Two', onSelect: () => onSelect('two') },
        ]}
      />
    </>
  )
}

const key = (target: Element, value: string) => {
  act(() => {
    target.dispatchEvent(new KeyboardEvent('keydown', { key: value, bubbles: true }))
  })
}

describe('CanvasCommandMenu WAI-ARIA keyboard contract', () => {
  it('focuses enabled items, navigates, and restores trigger focus on Escape', async () => {
    const onSelect = vi.fn()
    const host = document.createElement('div')
    document.body.appendChild(host)
    const root = createRoot(host)
    act(() => root.render(<Harness onSelect={onSelect} />))
    const trigger = host.querySelector('button')!

    await act(async () => {
      trigger.click()
      await Promise.resolve()
    })
    const menu = document.querySelector<HTMLElement>('#test-menu')!
    const items = [...menu.querySelectorAll<HTMLButtonElement>('[role="menuitem"]')]
    expect(trigger.getAttribute('aria-expanded')).toBe('true')
    expect(document.activeElement).toBe(items[0])

    key(items[0]!, 'ArrowDown')
    expect(document.activeElement).toBe(items[2])
    key(items[2]!, 'ArrowDown')
    expect(document.activeElement).toBe(items[0])
    key(items[0]!, 'End')
    expect(document.activeElement).toBe(items[2])
    key(items[2]!, 'Home')
    expect(document.activeElement).toBe(items[0])
    key(items[0]!, 'ArrowUp')
    expect(document.activeElement).toBe(items[2])

    key(items[2]!, 'Escape')
    expect(document.querySelector('#test-menu')).toBeNull()
    expect(document.activeElement).toBe(trigger)
    expect(trigger.getAttribute('aria-expanded')).toBe('false')

    act(() => root.unmount())
    host.remove()
  })

  it('closes on Tab without trapping focus and executes a menu command once', () => {
    const onSelect = vi.fn()
    const host = document.createElement('div')
    document.body.appendChild(host)
    const root = createRoot(host)
    act(() => root.render(<Harness onSelect={onSelect} />))
    const trigger = host.querySelector('button')!
    act(() => trigger.click())
    const first = document.querySelector<HTMLButtonElement>('#test-menu [role="menuitem"]')!

    act(() => first.click())
    expect(onSelect).toHaveBeenCalledWith('one')
    expect(document.querySelector('#test-menu')).toBeNull()

    act(() => trigger.click())
    const reopened = document.querySelector<HTMLButtonElement>('#test-menu [role="menuitem"]')!
    key(reopened, 'Tab')
    expect(document.querySelector('#test-menu')).toBeNull()

    act(() => root.unmount())
    host.remove()
  })

  it('maps ArrowDown/ArrowUp trigger keys to first/last focus', () => {
    expect(canvasMenuTriggerIntent('ArrowDown')).toBe('first')
    expect(canvasMenuTriggerIntent('ArrowUp')).toBe('last')
    expect(canvasMenuTriggerIntent('Enter')).toBeNull()
  })
})
