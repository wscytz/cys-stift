import { describe, it, expect } from 'vitest'
import { parseDslWithDiagnostics } from '@cys-stift/dsl'
import { InMemoryCanvasHost } from '@cys-stift/canvas-engine'
import { applyLayout } from '../../canvas/apply-layout'

/**
 * qwen-max-7-21 · 预期能力测试 ④「AI 可驱动 · 应用侧」
 *
 * 文法侧(packages/cys-dsl 的 qwen-max-7-21-ai-grammar)验证 AI 输出能被解析;
 * 这里补**应用半边**:一段 AI 风格的重排 DSL(含关系式放置)→ applyLayout → 画布真结构化了。
 * 合起来 = 转义完整价值闭环:AI 写一段文字 → 画布被改(不碰 geometry API、不碰点序列)。
 */
describe('qwen-max-7-21-ai-apply · AI 重排 DSL 落地为结构化画布', () => {
  it('散卡 → AI 关系式归位 + 分框 + 连线 → 画布结构化(零失败)', () => {
    const host = new InMemoryCanvasHost()
    // 3 张已存在的卡(c1 锚点;关系式放置要求目标卡存在或带 create)。
    for (const id of ['c1', 'c2', 'c3']) {
      host.upsert({ id, kind: 'card', x: 0, y: 0, w: 200, h: 100, rotation: 0 })
    }

    const aiDsl = [
      '[card #c1] @pos(100,100)',
      '[card #c2] right-of #c1 @gap(24)', // 关系式:c2.x = c1.x + c1.w + 24 = 324
      '[card #c3] @pos(600,100)',
      '[frame #fr] @pos(40,40) @size(800,220) @text("一排") @color(blue)',
      '[arrow #a1] from #c1 to #c2 @label("next") @color(blue)',
    ].join('\n')

    const { ops, errors } = parseDslWithDiagnostics(aiDsl)
    expect(errors).toEqual([])
    const res = applyLayout(host, ops)
    expect(res.failed).toBe(0)
    expect(res.applied).toBeGreaterThanOrEqual(5)

    // 关系式放置生效:c2 精确落在 c1 右侧 24px,同排。
    expect(host.getElement('c2')!.x).toBe(324)
    expect(host.getElement('c2')!.y).toBe(100)
    // 三卡横排:x 递增、同 y。
    expect(host.getElement('c3')!.x).toBeGreaterThan(host.getElement('c2')!.x)
    expect(host.getElement('c3')!.y).toBe(100)
    // 框 + 箭头建起来了。
    expect(host.getElements().some((e) => e.kind === 'frame')).toBe(true)
    const arrow = host.getElements().find((e) => e.kind === 'arrow')
    expect(arrow).toMatchObject({ from: 'c1', to: 'c2', text: 'next' })
  })
})
