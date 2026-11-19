import { describe, it, expect } from 'vitest'
import { interpolateMessage } from '../i18n/interpolate'

describe('interpolateMessage — 单遍正则插值(审核 P3 三类坑全避)', () => {
  it('同一参数出现多次全部替换(双占位符修复本体)', () => {
    expect(interpolateMessage('{a} 不存在,先写 [{a} create]', { a: '#ghost' }))
      .toBe('#ghost 不存在,先写 [#ghost create]')
  })

  it('参数值里的 $& / $` / $\' 不当替换模式展开', () => {
    expect(interpolateMessage('标题 {t}', { t: 'A $& B' })).toBe('标题 A $& B')
    expect(interpolateMessage('{t}', { t: "x $` y" })).toBe("x $` y")
    expect(interpolateMessage('{t}', { t: "z $' w" })).toBe("z $' w")
    expect(interpolateMessage('{t}', { t: '$$' })).toBe('$$')
  })

  it('单遍:参数值里的 {other} 不被后续参数嵌套替换', () => {
    expect(interpolateMessage('{a} 和 {b}', { a: '{b}', b: '真值' }))
      .toBe('{b} 和 真值')
  })

  it('未知占位符原样保留;null/undefined → 空串', () => {
    expect(interpolateMessage('保持 {unknown} 原样', { a: 1 })).toBe('保持 {unknown} 原样')
    expect(interpolateMessage('空 {x}', { x: null })).toBe('空 ')
    expect(interpolateMessage('空 {x}', { x: undefined })).toBe('空 ')
  })
})
