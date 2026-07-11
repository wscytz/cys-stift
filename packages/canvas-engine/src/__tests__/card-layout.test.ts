/**
 * resolveCardLayout - 卡片显示模式 -> 行数 + 高度(纯函数,卡高派生核心)。
 * mock ctx:每字 7px(width=100 -> wrap 宽 80 -> 11 字/行)。
 */
import { describe, it, expect } from 'vitest'
import {
  resolveCardLayout,
  CARD_TITLE_AREA,
  CARD_LINE_H,
  CARD_BOTTOM_PAD,
  CARD_AUTO_MAX_LINES,
  type CardDisplayMode,
} from '../self-built-render'

function mockCtx(): CanvasRenderingContext2D {
  return { measureText: (s: string) => ({ width: s.length * 7 }) } as unknown as CanvasRenderingContext2D
}

const W = 100 // wrap 宽 = 100 - 2*10 = 80 -> 11 字/行(每字 7px)
const BASE_H = CARD_TITLE_AREA + CARD_BOTTOM_PAD // 58
const H = (n: number) => BASE_H + n * CARD_LINE_H

describe('resolveCardLayout', () => {
  it('title 模式:0 行,最小高(无论 body)', () => {
    const r = resolveCardLayout('title', 'whatever body', W, mockCtx())
    expect(r.lineCount).toBe(0)
    expect(r.height).toBe(BASE_H)
  })

  it('subtitle 模式:body 非空 -> 1 行;空 -> 0 行', () => {
    expect(resolveCardLayout('subtitle', '一段正文', W, mockCtx())).toEqual({ lineCount: 1, height: H(1) })
    expect(resolveCardLayout('subtitle', '', W, mockCtx())).toEqual({ lineCount: 0, height: BASE_H })
  })

  it('compact 模式:短 body -> 实际行数;长 body -> 截到 3 行', () => {
    // 11 字 = 1 行
    expect(resolveCardLayout('compact', 'a'.repeat(11), W, mockCtx())).toEqual({ lineCount: 1, height: H(1) })
    // 55 字 = 5 行 -> 截到 3
    expect(resolveCardLayout('compact', 'a'.repeat(55), W, mockCtx())).toEqual({ lineCount: 3, height: H(3) })
  })

  it('auto 模式:短 body -> 全行;超长 -> 截到 CARD_AUTO_MAX_LINES', () => {
    // 55 字 = 5 行 -> 全显
    expect(resolveCardLayout('auto', 'a'.repeat(55), W, mockCtx())).toEqual({ lineCount: 5, height: H(5) })
    // 341 字 = 31 行 -> 截到 30
    expect(resolveCardLayout('auto', 'a'.repeat(341), W, mockCtx())).toEqual({
      lineCount: CARD_AUTO_MAX_LINES,
      height: H(CARD_AUTO_MAX_LINES),
    })
  })

  it('空 body:所有模式 -> 0 行,最小高', () => {
    for (const m of ['compact', 'auto', 'title', 'subtitle'] as CardDisplayMode[]) {
      expect(resolveCardLayout(m, '', W, mockCtx())).toEqual({ lineCount: 0, height: BASE_H })
    }
  })

  it('compact 是默认密度(3 行截断,等价旧行为)', () => {
    // 旧行为:Math.min(3, lines.length)。55 字 -> 5 wrapped -> 3。
    expect(resolveCardLayout('compact', 'a'.repeat(55), W, mockCtx()).lineCount).toBe(3)
  })
})
