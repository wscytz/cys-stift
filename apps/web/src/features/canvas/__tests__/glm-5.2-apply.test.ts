import { describe, expect, it } from 'vitest'
import { InMemoryCanvasHost } from '@cys-stift/canvas-engine'
import { parseDsl } from '@cys-stift/dsl'
import { applyLayout } from '../apply-layout'
import type { CardCreateParams, CardUpdateContent } from '../apply-layout'

/**
 * glm-5.2 独立交叉验证(应用侧集成)—— AI 输出 → 真实 host 的端到端落地。
 *
 * 独立角度:不单测 sanitize/solve 的内部,而是把 applyLayout 当"AI DSL → 画布"的总入口,
 * 验它对 InMemoryCanvasHost 的真实副作用:关系式坐标解算、内容回调、幂等重放、
 * 箭头端点解析。这是"转义 + 引擎"两层接合处,最易脱节。
 */
describe('glm-5.2 applyLayout —— AI DSL → InMemoryCanvasHost 端到端', () => {
  describe('关系式坐标被解算为绝对坐标并落入 host', () => {
    it('right-of:x = anchor.x + anchor.w + gap;y = anchor.y', () => {
      const host = new InMemoryCanvasHost()
      const ops = parseDsl(
        [
          '[card #root create] @pos(100, 100) @size(240, 120) @color(blue)',
          '[card #right create] right-of #root @gap(40) @size(200, 100) @color(yellow)',
        ].join('\n'),
      )
      const report = applyLayout(host, ops)
      expect(report.failed).toBe(0)
      expect(host.getElement('right')).toMatchObject({ x: 100 + 240 + 40, y: 100, w: 200, h: 100 })
    })

    it('below:y = anchor.y + anchor.h + gap;x = anchor.x', () => {
      const host = new InMemoryCanvasHost()
      const ops = parseDsl(
        [
          '[card #root create] @pos(100, 100) @size(240, 120)',
          '[card #under create] below #root @gap(30) @size(200, 100)',
        ].join('\n'),
      )
      applyLayout(host, ops)
      expect(host.getElement('under')).toMatchObject({ x: 100, y: 100 + 120 + 30 })
    })

    it('关系链:c → right-of b → right-of a,坐标逐级派生', () => {
      const host = new InMemoryCanvasHost()
      const ops = parseDsl(
        [
          '[card #a create] @pos(0, 0) @size(100, 50)',
          '[card #b create] right-of #a @gap(10) @size(100, 50)',
          '[card #c create] right-of #b @gap(10) @size(100, 50)',
        ].join('\n'),
      )
      applyLayout(host, ops)
      expect(host.getElement('a')).toMatchObject({ x: 0 })
      expect(host.getElement('b')).toMatchObject({ x: 110 })
      expect(host.getElement('c')).toMatchObject({ x: 220 })
    })
  })

  describe('v5 内容经 handler 桥接写回 CardService 侧', () => {
    it('create + @title/@content → onCardCreate 收到 title/content,host 收到几何', () => {
      const host = new InMemoryCanvasHost()
      let created: CardCreateParams | undefined
      const ops = parseDsl(
        '[card #c1 create] @pos(10,20) @size(100,80) @title("标题") @content("正文\\n第二行")',
      )
      applyLayout(host, ops, undefined, (p) => {
        created = p
        return { ok: true }
      })
      expect(created).toMatchObject({ cardId: 'c1', title: '标题', content: '正文\n第二行' })
      expect(host.getElement('c1')).toMatchObject({ x: 10, y: 20, w: 100, h: 80 })
    })

    it('update 现有 card 的 @title/@content → onCardUpdate 触发,几何不变', () => {
      const host = new InMemoryCanvasHost()
      host.upsert({ id: 'c1', kind: 'card', x: 50, y: 60, w: 100, h: 80, rotation: 0 })
      let updated: CardUpdateContent | undefined
      const ops = parseDsl('[card #c1] @pos(50,60) @size(100,80) @title("新") @content("新正文")')
      applyLayout(host, ops, undefined, undefined, (p) => {
        updated = p
      })
      expect(updated).toMatchObject({ cardId: 'c1', title: '新', content: '新正文' })
      expect(host.getElement('c1')).toMatchObject({ x: 50, y: 60, w: 100, h: 80 })
    })

    it('几何-only update(无 @title/@content)→ onCardUpdate 不触发', () => {
      const host = new InMemoryCanvasHost()
      host.upsert({ id: 'c1', kind: 'card', x: 0, y: 0, w: 10, h: 10, rotation: 0 })
      let called = false
      applyLayout(
        host,
        parseDsl('[card #c1] @pos(5,5) @size(10,10)'),
        undefined,
        undefined,
        () => {
          called = true
        },
      )
      expect(called).toBe(false)
    })
  })

  describe('幂等重放:appliedHashes 挡住重复 op', () => {
    it('同一 DSL 第二次 apply → 全部 skipped(不重复建/改)', () => {
      const host = new InMemoryCanvasHost()
      const applied = new Set<string>()
      const ops = parseDsl('[card #c1 create] @pos(0,0) @size(10,10)')
      const r1 = applyLayout(host, ops, applied, () => ({ ok: true }))
      expect(r1.applied).toBe(1)
      const r2 = applyLayout(host, ops, applied, () => ({ ok: true }))
      expect(r2.applied).toBe(0)
      expect(r2.skipped).toBe(1)
    })
  })

  describe('箭头端点在同批 create 后被解析(影子 map 前向)', () => {
    it('同批 create 两张卡 + 关系箭头 → 箭头落入 host,from/to 正确', () => {
      const host = new InMemoryCanvasHost()
      const ops = parseDsl(
        [
          '[card #a create] @pos(0,0) @size(50,50)',
          '[card #b create] @pos(100,0) @size(50,50)',
          '[arrow #e] from #a to #b @label("rel") @color(black) @dash(solid) @arrowhead(arrow)',
        ].join('\n'),
      )
      const report = applyLayout(host, ops)
      expect(report.failed).toBe(0)
      expect(host.getElement('e')).toMatchObject({ kind: 'arrow', from: 'a', to: 'b', text: 'rel' })
    })

    it('自由箭头(@pos+@size,无 from/to)落入 host,负 w/h 保留(编码方向)', () => {
      const host = new InMemoryCanvasHost()
      const ops = parseDsl('[arrow #fa] @pos(10,20) @size(100,-50) @color(red) @dash(solid) @arrowhead(arrow)')
      applyLayout(host, ops)
      expect(host.getElement('fa')).toMatchObject({ x: 10, y: 20, w: 100, h: -50, color: 'red' })
    })
  })
})
