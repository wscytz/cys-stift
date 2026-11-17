import { describe, expect, it } from 'vitest'
import { sceneRevision } from '../scene-revision'
import type { CanvasElement } from '../canvas-host'

const card = (overrides: Partial<CanvasElement> = {}): CanvasElement => ({
  id: 'c1',
  kind: 'card',
  x: 30,
  y: 30,
  w: 160,
  h: 96,
  rotation: 0,
  ...overrides,
})

describe('sceneRevision — card h 派生值归一(stale-guard 假阳性防护)', () => {
  it('仅 card h 不同 → 同一修订号(引擎 syncCardHeights 静默自愈,非用户编辑)', () => {
    const before = [card({ h: 96 })]
    const after = [card({ h: 58 })]
    expect(sceneRevision(after)).toBe(sceneRevision(before))
  })

  it('card x/y 漂移 → 不同修订号(拖拽是真实变更,必须拦截)', () => {
    const before = [card({})]
    const after = [card({ x: 31 })]
    expect(sceneRevision(after)).not.toBe(sceneRevision(before))
  })

  it('card 内容字段漂移 → 不同修订号(正文编辑会影响派生 h,但 body 本身必须拦截)', () => {
    const before = [card({})]
    const after = [card({ text: '改了' })]
    expect(sceneRevision(after)).not.toBe(sceneRevision(before))
  })

  it('card w 漂移 → 不同修订号(宽度是真实状态)', () => {
    const before = [card({})]
    const after = [card({ w: 200 })]
    expect(sceneRevision(after)).not.toBe(sceneRevision(before))
  })

  it('非 card 元素的 h 是真实状态 → 参与修订号(text/frame 尺寸不受派生影响)', () => {
    const t = (h: number): CanvasElement => ({ id: 't1', kind: 'text', x: 0, y: 0, w: 100, h, rotation: 0, text: '字' })
    expect(sceneRevision([t(40)])).not.toBe(sceneRevision([t(48)]))
  })

  it('meta/curve/elbow 照常参与(手动编辑不可被归一隐藏)', () => {
    const arrow = (over: Partial<CanvasElement>): CanvasElement => ({
      id: 'a1', kind: 'arrow', x: 0, y: 0, w: 0, h: 0, rotation: 0, from: 'c1', to: 'c2', ...over,
    })
    const base = [arrow({})]
    expect(sceneRevision([arrow({ curve: { cx: 5, cy: 5 } })])).not.toBe(sceneRevision(base))
    expect(sceneRevision([arrow({ elbow: [{ x: 1, y: 1 }] })])).not.toBe(sceneRevision(base))
    expect(sceneRevision([arrow({ meta: { k: 1 } })])).not.toBe(sceneRevision(base))
  })

  it('顺序无关(id 排序后比对)', () => {
    const a = [card({ id: 'a' }), card({ id: 'b' })]
    const b = [card({ id: 'b' }), card({ id: 'a' })]
    expect(sceneRevision(a)).toBe(sceneRevision(b))
  })
})
