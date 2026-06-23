// apps/web/src/features/canvas/host/__tests__/self-built-marquee.test.ts
import { describe, expect, it } from 'vitest'
import { rectsIntersect, marqueeSelect } from '../self-built-marquee'
import type { CanvasElement } from '../canvas-host'

describe('rectsIntersect', () => {
  it('相交', () => {
    expect(rectsIntersect({ x: 0, y: 0, w: 10, h: 10 }, { x: 5, y: 5, w: 10, h: 10 })).toBe(true)
  })
  it('相离', () => {
    expect(rectsIntersect({ x: 0, y: 0, w: 10, h: 10 }, { x: 20, y: 0, w: 10, h: 10 })).toBe(false)
  })
  it('边接触算相交', () => {
    expect(rectsIntersect({ x: 0, y: 0, w: 10, h: 10 }, { x: 10, y: 0, w: 10, h: 10 })).toBe(true)
  })
})

describe('marqueeSelect', () => {
  const els = [
    { id: 'a', kind: 'card', x: 0, y: 0, w: 10, h: 10, rotation: 0 },
    { id: 'b', kind: 'card', x: 20, y: 0, w: 10, h: 10, rotation: 0 },
    { id: 'c', kind: 'card', x: 0, y: 20, w: 10, h: 10, rotation: 0 },
  ] as unknown as CanvasElement[]
  it('框选命中相交的元素', () => {
    // 框 x∈[-5,19], y∈[-5,19]:只与 a(x∈[0,10])相交;b 左边 x=20 > 框右 19、c 上边 y=20 > 框下 19,均不相交。
    expect(marqueeSelect({ x: -5, y: -5, w: 24, h: 24 }, els)).toEqual(['a'])
  })
  it('大框全选', () => {
    expect(marqueeSelect({ x: -10, y: -10, w: 100, h: 100 }, els).sort()).toEqual(['a', 'b', 'c'])
  })
  it('空框(0 尺寸)→ 空', () => {
    expect(marqueeSelect({ x: 5, y: 5, w: 0, h: 0 }, els)).toEqual([])
  })
})
