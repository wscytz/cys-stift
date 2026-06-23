import { describe, expect, it } from 'vitest'
import { arrowKeyDelta, selectAllIds, parseKeyboardAction } from '../self-built-keyboard'
import type { CanvasElement } from '../canvas-host'

describe('arrowKeyDelta', () => {
  it('方向键 1px', () => {
    expect(arrowKeyDelta('ArrowUp', false)).toEqual({ dx: 0, dy: -1 })
    expect(arrowKeyDelta('ArrowDown', false)).toEqual({ dx: 0, dy: 1 })
    expect(arrowKeyDelta('ArrowLeft', false)).toEqual({ dx: -1, dy: 0 })
    expect(arrowKeyDelta('ArrowRight', false)).toEqual({ dx: 1, dy: 0 })
  })
  it('shift 方向键 10px', () => {
    expect(arrowKeyDelta('ArrowUp', true)).toEqual({ dx: 0, dy: -10 })
  })
  it('非方向键 → null', () => {
    expect(arrowKeyDelta('Enter', false)).toBeNull()
  })
})

describe('selectAllIds', () => {
  it('返回所有元素 id', () => {
    const els = [
      { id: 'a', kind: 'card', x: 0, y: 0, w: 10, h: 10, rotation: 0 },
      { id: 'b', kind: 'card', x: 20, y: 0, w: 10, h: 10, rotation: 0 },
    ] as unknown as CanvasElement[]
    expect(selectAllIds(els)).toEqual(['a', 'b'])
  })
})

describe('parseKeyboardAction', () => {
  const mod = (extra: Record<string, unknown> = {}) => ({ isComposing: false, key: 'a', metaKey: false, ctrlKey: false, shiftKey: false, ...extra })
  it('Ctrl+Z → undo', () => {
    expect(parseKeyboardAction(mod({ key: 'z', ctrlKey: true }))).toBe('undo')
    expect(parseKeyboardAction(mod({ key: 'z', metaKey: true }))).toBe('undo')
  })
  it('Ctrl+Shift+Z → redo', () => {
    expect(parseKeyboardAction(mod({ key: 'z', ctrlKey: true, shiftKey: true }))).toBe('redo')
    expect(parseKeyboardAction(mod({ key: 'y', ctrlKey: true }))).toBe('redo') // Ctrl+Y 也 redo
  })
  it('Ctrl+A → selectAll', () => {
    expect(parseKeyboardAction(mod({ key: 'a', ctrlKey: true }))).toBe('selectAll')
  })
  it('普通键 → null', () => {
    expect(parseKeyboardAction(mod({ key: 'z' }))).toBeNull()
    expect(parseKeyboardAction(mod({ key: 'a' }))).toBeNull()
  })
})
