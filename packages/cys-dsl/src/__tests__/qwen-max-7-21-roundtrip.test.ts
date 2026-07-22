import { describe, it, expect } from 'vitest'
import { serializeCanvas, serializeCanvasReadable } from '../canvas-dsl'
import { parseDslWithDiagnostics } from '../dsl-parser'
import type { CanvasElement } from '@cys-stift/canvas-engine'

/**
 * qwen-max-7-21 · 预期能力测试 ①「完整文字化」
 *
 * 转义的核心承诺:整张画布(几何 + 卡片内容)能压成一段文字,文字也能无损读回。
 * 这组锁住 v5 的「完整」——不止几何,还有 @title/@content(多行 / 转义 / unicode / emoji)。
 * 任何一项红 = 转义不再完整(卖点受损)。这是预期能力的基线,与具体 LLM 无关。
 */
describe('qwen-max-7-21-roundtrip · 完整文字化', () => {
  const canvas: CanvasElement[] = [
    { id: 'c1', kind: 'card', x: 100, y: 200, w: 240, h: 120, rotation: 0, color: 'blue' },
    { id: 'c2', kind: 'card', x: 500, y: 200, w: 240, h: 120, rotation: 0, color: 'red' },
    { id: 'f1', kind: 'frame', x: 60, y: 120, w: 720, h: 300, rotation: 0, text: '分组', color: 'yellow' },
    { id: 't1', kind: 'text', x: 60, y: 60, w: 0, h: 0, rotation: 0, text: '标题文字' },
    { id: 'a1', kind: 'arrow', x: 0, y: 0, w: 0, h: 0, rotation: 0, from: 'c1', to: 'c2', text: '关联', color: 'black', dash: 'dashed' },
  ]
  const content = (id: string) =>
    id === 'c1'
      ? { title: '灵感 A', content: '第一行\n第二行 "引号" 和 \\反斜杠 和 emoji 😀' }
      : id === 'c2'
        ? { title: '灵感 B', content: '简短正文' }
        : undefined

  it('serialize → parse 零诊断,活跃 kind 全部产出 op', () => {
    const text = serializeCanvas(canvas, content)
    const { ops, errors } = parseDslWithDiagnostics(text)
    expect(errors).toEqual([])
    expect(ops).toHaveLength(5) // 2 card + frame + text + arrow
  })

  it('卡片内容(title/content,含多行/转义/emoji)无损往返', () => {
    const text = serializeCanvas(canvas, content)
    const ops = parseDslWithDiagnostics(text).ops
    const c1 = ops.find((o) => o.type === 'card' && (o as { cardId: string }).cardId === 'c1')
    expect(c1).toMatchObject({
      title: '灵感 A',
      content: '第一行\n第二行 "引号" 和 \\反斜杠 和 emoji 😀',
    })
  })

  it('几何(位置/尺寸/颜色/箭头签名)无损往返', () => {
    const text = serializeCanvas(canvas, content)
    const ops = parseDslWithDiagnostics(text).ops
    const c1 = ops.find((o) => o.type === 'card' && (o as { cardId: string }).cardId === 'c1')
    expect(c1).toMatchObject({ x: 100, y: 200, color: 'blue' })
    const arrow = ops.find((o) => o.type === 'arrow')
    expect(arrow).toMatchObject({ from: 'c1', to: 'c2', label: '关联', dash: 'dashed' })
  })

  it('人读视图(readable)与机器视图(strict)同形态,都能读回', () => {
    const strict = serializeCanvas(canvas, content)
    const readable = serializeCanvasReadable(canvas, content)
    expect(readable).toBe(strict)
    expect(parseDslWithDiagnostics(readable).errors).toEqual([])
  })
})
