/**
 * focus-mode mutual-exclusion resolver —— 专注编辑(focusEdit)与画布焦点(focusMode)
 * 是两个互斥的「独占注意力」态。本纯函数封装切换决策,供 canvas page 的
 * toggleFocusEdit handler + ⌘. keydown handler 共用,使互斥逻辑可单测(原 inline
 * 在 page 里 2 行对称,无测试覆盖 —— final review 的 fast-follow)。
 *
 * 规则:切一个;若进入(true),把另一个关掉。两个都关是允许的(常态)。
 */
export type FocusAction = 'toggle-edit' | 'toggle-canvas-focus'

export interface FocusStates {
  focusEdit: boolean
  focusMode: boolean
}

export function nextFocusStates(action: FocusAction, cur: FocusStates): FocusStates {
  if (action === 'toggle-edit') {
    const focusEdit = !cur.focusEdit
    return { focusEdit, focusMode: focusEdit ? false : cur.focusMode }
  }
  // toggle-canvas-focus
  const focusMode = !cur.focusMode
  return { focusMode, focusEdit: focusMode ? false : cur.focusEdit }
}
