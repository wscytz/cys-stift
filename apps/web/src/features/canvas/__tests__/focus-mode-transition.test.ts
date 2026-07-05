import { describe, it, expect } from 'vitest'
import { nextFocusStates } from '../focus-mode-transition'

describe('nextFocusStates (focus-mode mutual exclusion)', () => {
  it('toggle-edit from idle {F,F} → enters edit {T,F}', () => {
    expect(nextFocusStates('toggle-edit', { focusEdit: false, focusMode: false }))
      .toEqual({ focusEdit: true, focusMode: false })
  })
  it('toggle-edit exits edit {T,F} → idle {F,F}', () => {
    expect(nextFocusStates('toggle-edit', { focusEdit: true, focusMode: false }))
      .toEqual({ focusEdit: false, focusMode: false })
  })
  it('toggle-edit entering while canvas-focus on → exits canvas-focus {T→F}', () => {
    // 互斥:进专注编辑必退画布焦点
    expect(nextFocusStates('toggle-edit', { focusEdit: false, focusMode: true }))
      .toEqual({ focusEdit: true, focusMode: false })
  })
  it('toggle-canvas-focus from idle → enters canvas-focus {F,T}', () => {
    expect(nextFocusStates('toggle-canvas-focus', { focusEdit: false, focusMode: false }))
      .toEqual({ focusEdit: false, focusMode: true })
  })
  it('toggle-canvas-focus exits canvas-focus {F,T} → idle {F,F}', () => {
    expect(nextFocusStates('toggle-canvas-focus', { focusEdit: false, focusMode: true }))
      .toEqual({ focusEdit: false, focusMode: false })
  })
  it('toggle-canvas-focus entering while edit on → exits edit {T→F} (互斥)', () => {
    expect(nextFocusStates('toggle-canvas-focus', { focusEdit: true, focusMode: false }))
      .toEqual({ focusEdit: false, focusMode: true })
  })
})
