// apps/web/src/features/canvas/host/__tests__/self-built-text.test.ts
import { describe, expect, it } from 'vitest'
import { measureText, textEditKeyAction } from '../self-built-text'

/** mock ctx:measureText 返回 字符数×10 的宽度(可预测)。 */
function mockCtx() {
  return {
    set font(_f: string) { /* ignore */ },
    measureText: (s: string) => ({ width: s.length * 10 }),
  } as unknown as CanvasRenderingContext2D
}

describe('measureText', () => {
  it('单行:w=字符宽度和,h=lineHeight', () => {
    expect(measureText('hello', mockCtx(), '14px Inter', 18)).toEqual({ w: 50, h: 18 })
  })
  it('多行:w 取最长行,h=行数×lineHeight', () => {
    expect(measureText('hi\nhello!\nhey', mockCtx(), '14px Inter', 18)).toEqual({ w: 60, h: 54 }) // 60=max(20,60,30);54=3×18
  })
  it('空行按空格度量(避免 0 宽)', () => {
    expect(measureText('a\n', mockCtx(), '14px Inter', 18)).toEqual({ w: 10, h: 36 }) // 行2 ''→' ' = 10;2 行
  })
})

describe('textEditKeyAction', () => {
  it('IME 组合态(isComposing)→ null(不拦截 Enter/Escape)', () => {
    expect(textEditKeyAction({ isComposing: true, key: 'Enter', metaKey: false, ctrlKey: false })).toBeNull()
    expect(textEditKeyAction({ isComposing: true, key: 'Escape', metaKey: false, ctrlKey: false })).toBeNull()
  })
  it('Escape → cancel', () => {
    expect(textEditKeyAction({ isComposing: false, key: 'Escape', metaKey: false, ctrlKey: false })).toBe('cancel')
  })
  it('Ctrl/Cmd+Enter → commit', () => {
    expect(textEditKeyAction({ isComposing: false, key: 'Enter', metaKey: true, ctrlKey: false })).toBe('commit')
    expect(textEditKeyAction({ isComposing: false, key: 'Enter', metaKey: false, ctrlKey: true })).toBe('commit')
  })
  it('纯 Enter(无修饰)→ null(textarea 换行)', () => {
    expect(textEditKeyAction({ isComposing: false, key: 'Enter', metaKey: false, ctrlKey: false })).toBeNull()
  })
  it('普通字符 → null', () => {
    expect(textEditKeyAction({ isComposing: false, key: 'a', metaKey: false, ctrlKey: false })).toBeNull()
  })
})
