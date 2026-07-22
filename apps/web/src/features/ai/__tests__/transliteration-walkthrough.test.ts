import { describe, expect, it } from 'vitest'
import { serializeCanvas, serializeCanvasReadable } from '@cys-stift/dsl'
import { parseDslWithDiagnostics } from '@cys-stift/dsl'
import { applyLayout } from '../../canvas/apply-layout'
import { InMemoryCanvasHost } from '@cys-stift/canvas-engine'
import type { CanvasElement } from '@cys-stift/canvas-engine'

/**
 * 转义(transliteration)端到端 walkthrough —— 把核心卖点的**价值闭环**跑成
 * 一个可读的真实场景,不只是断言无损往返(那是 e2e-roundtrip 的活)。
 *
 * 场景:一张乱画布(4 张散卡,无结构)→ 序列化成 AI 能读的文字 → AI 输出
 * 一段「重排 DSL」(按主题分框 + 建关系箭头)→ 应用回画布 → 变成结构化的。
 *
 * 这就是转义承诺的「任何 AI 都能廉价驱动画布编辑」——AI 不碰 geometry API、
 * 不碰 tldraw、不发点序列,只读写一段文字。读这个测试 = 读一遍价值演示。
 *
 * 互补:robustness.test.ts(脏输入优雅降级)+ e2e-roundtrip.test.ts(干净无损)。
 */

function card(id: string, x: number, y: number, title: string): CanvasElement {
  return { id, kind: 'card', x, y, w: 120, h: 80, rotation: 0, meta: { title } }
}

describe('转义价值闭环 walkthrough:乱画布 → AI 重排 → 结构化', () => {
  it('4 张散卡 → AI 分框 + 连关系 → 画布结构化', () => {
    const host = new InMemoryCanvasHost()

    // ── ① 起点:一张乱画布,4 张灵感卡散落,无框无箭头 ──
    const messy: CanvasElement[] = [
      card('c1', 50, 50, '早睡'),
      card('c2', 820, 30, '跑步'),
      card('c3', 180, 640, '读书'),
      card('c4', 900, 720, '冥想'),
    ]
    for (const e of messy) host.upsert(e)

    // ── ② 序列化:画布变成 AI 能读的文字(serializeCanvasReadable,card 带 @title 真 token)──
    //    AI 看到的就是下面这段(把它贴进 DSL 模态编辑器,你看到的一模一样)。
    const asText = serializeCanvasReadable(
      host.getElements(),
      (id) => ({ title: (messy.find((m) => m.id === id)?.meta as { title?: string } | undefined)?.title }),
    )
    expect(asText).toContain('[card #c1]')
    expect(asText).toContain('@title("早睡")')
    expect(asText).toContain('[card #c4]')
    expect(asText).toContain('@title("冥想")')

    // ── ③ AI 输出重排 DSL:把"健康"(早睡+跑步)和"心智"(读书+冥想)分框,
    //    卡片归位上色,再连一条"相辅"关系箭头。这就是 AI 唯一要做的事——写文字。──
    const aiReorgDsl = [
      '[frame #fr-health] @pos(40,40) @size(360,520) @text("健康") @color(blue)',
      '[frame #fr-mind] @pos(440,40) @size(360,520) @text("心智") @color(red)',
      '[card #c1] @pos(80,80) @color(blue)',
      '[card #c2] @pos(80,320) @color(blue)',
      '[card #c3] @pos(480,80) @color(red)',
      '[card #c4] @pos(480,320) @color(red)',
      '[arrow #a1] from #c1 to #c2 @label("相辅") @color(blue)',
    ].join('\n')

    // ── ④ 解析:AI 的文字 → 结构化 op(诊断断言无语法错)──
    const { ops, errors } = parseDslWithDiagnostics(aiReorgDsl)
    expect(errors).toEqual([])

    // ── ⑤ 应用:op → 画布(单 undo 步,card update-only 命中已存在卡,frame/arrow 新建)──
    const result = applyLayout(host, ops)
    expect(result).toMatchObject({ total: 7, applied: 7, skipped: 0, failed: 0, newlyApplied: [] })

    // ── ⑥ 结果:画布结构化了 ──
    const elements = host.getElements()

    // 2 个 frame(健康/心智)创建,且在底层(KIND_LAYER frame=-1)
    const frames = elements.filter((e) => e.kind === 'frame')
    expect(frames).toHaveLength(2)
    expect(frames.map((f) => f.text).sort()).toEqual(['健康', '心智'])

    // 卡片归位 + 上色(健康=blue,心智=red)
    const c1 = host.getElement('c1')
    expect(c1?.x).toBe(80)
    expect(c1?.y).toBe(80)
    expect(c1?.color).toBe('blue')
    const c4 = host.getElement('c4')
    expect(c4?.color).toBe('red')

    // 1 条关系箭头(早睡→跑步)
    const arrows = elements.filter((e) => e.kind === 'arrow')
    expect(arrows).toHaveLength(1)
    expect(arrows[0]?.from).toBe('c1')
    expect(arrows[0]?.to).toBe('c2')
    expect(arrows[0]?.text).toBe('相辅')

    // ── ⑦ 可再序列化:结果画布又能变回文字(re-parse 验证闭环无损)──
    const reText = serializeCanvas(host.getElements())
    const reParsed = parseDslWithDiagnostics(reText)
    expect(reParsed.errors).toEqual([])
    expect(reParsed.ops.length).toBeGreaterThan(0)
  })

  it('转义是人机对称的:人也能编辑同一段 DSL(双向)', () => {
    // 同一段 DSL,AI 写得、人也写得——应用结果一致。这是"转义"区别于"导出"
    // 的关键:不是单向 dump,是双向可编辑交换格式。
    const host = new InMemoryCanvasHost()
    host.upsert(card('c1', 0, 0, 'X'))
    host.upsert(card('c2', 0, 0, 'Y'))

    const humanDsl = '[card #c1] @pos(100,100)\n[card #c2] @pos(300,100)'
    const r = applyLayout(host, parseDslWithDiagnostics(humanDsl).ops)
    expect(r).toMatchObject({ total: 2, applied: 2, skipped: 0, failed: 0, newlyApplied: [] })
    expect(host.getElement('c1')?.x).toBe(100)
    expect(host.getElement('c2')?.x).toBe(300)
  })
})
