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

  // 关系箭头:bbox w=h=0,按端点框选(任一端点在框内)。
  const arrowEls = [
    { id: 'ca', kind: 'card', x: 0, y: 0, w: 100, h: 100, rotation: 0 },
    { id: 'cb', kind: 'card', x: 200, y: 0, w: 100, h: 100, rotation: 0 },
    { id: 'ar', kind: 'arrow', x: 0, y: 0, w: 0, h: 0, rotation: 0, from: 'ca', to: 'cb' },
  ] as unknown as CanvasElement[]
  it('关系箭头:框覆盖任一端点 → 选中', () => {
    // 端点 from≈(100,50);框 (95,45,20,20) 覆盖 from。
    expect(marqueeSelect({ x: 95, y: 45, w: 20, h: 20 }, arrowEls)).toContain('ar')
  })
  it('关系箭头:框覆盖线段中点(不含端点)→ 选中(线段穿过框)', () => {
    // 中点 (150,50),框 (145,45,10,10) 覆盖线段一段但不含两端点 → 线段相交仍选中。
    expect(marqueeSelect({ x: 145, y: 45, w: 10, h: 10 }, arrowEls)).toContain('ar')
  })
  it('关系箭头:框完全偏离线段 → 不选中', () => {
    expect(marqueeSelect({ x: 500, y: 500, w: 20, h: 20 }, arrowEls)).not.toContain('ar')
  })

  it('curve:框住曲线鼓包而不碰直线弦 → 选中', () => {
    const curve: CanvasElement = {
      id: 'curve',
      kind: 'arrow',
      x: 0,
      y: 0,
      w: 100,
      h: 0,
      rotation: 0,
      route: 'curve',
      curve: { cx: 50, cy: 100 },
    }
    expect(marqueeSelect({ x: 45, y: 45, w: 10, h: 10 }, [curve])).toEqual(['curve'])
  })

  it('curve:框只穿直线弦但不碰真实曲线 → 不选中', () => {
    const curve: CanvasElement = {
      id: 'curve',
      kind: 'arrow',
      x: 0,
      y: 0,
      w: 100,
      h: 0,
      rotation: 0,
      route: 'curve',
      curve: { cx: 50, cy: 100 },
    }
    expect(marqueeSelect({ x: 45, y: -2, w: 10, h: 4 }, [curve])).toEqual([])
  })

  it('elbow:框住任一折线段或折点都选中', () => {
    const elbow: CanvasElement = {
      id: 'elbow',
      kind: 'arrow',
      x: 0,
      y: 0,
      w: 100,
      h: 100,
      rotation: 0,
      route: 'elbow',
      elbow: [{ x: 0, y: 100 }],
    }
    expect(marqueeSelect({ x: -2, y: 45, w: 4, h: 10 }, [elbow])).toEqual(['elbow'])
    expect(marqueeSelect({ x: 45, y: 98, w: 10, h: 4 }, [elbow])).toEqual(['elbow'])
    expect(marqueeSelect({ x: -2, y: 98, w: 4, h: 4 }, [elbow])).toEqual(['elbow'])
  })

  it('straight:线段与框边共线或只触角都算相交', () => {
    const horizontal: CanvasElement = {
      id: 'horizontal',
      kind: 'arrow',
      x: 0,
      y: 0,
      w: 100,
      h: 0,
      rotation: 0,
    }
    const diagonal: CanvasElement = {
      id: 'diagonal',
      kind: 'arrow',
      x: 0,
      y: 0,
      w: 100,
      h: 100,
      rotation: 0,
    }
    expect(marqueeSelect({ x: 25, y: 0, w: 50, h: 10 }, [horizontal])).toEqual(['horizontal'])
    expect(marqueeSelect({ x: 50, y: 40, w: 10, h: 10 }, [diagonal])).toEqual(['diagonal'])
  })

  // R1.3:负 bbox(如 .cystift 导入用负 w/h 编码方向)必须先归一化再判相交,
  // 否则 rectsIntersect 把负 w/h 当空范围 → 漏选。hitTest/视锥剔除已 normalize,
  // marquee 应一致。
  it('selects negative-bbox elements (normalizes before intersect)', () => {
    // rect 视觉框 = 100..200 x 100..200,用负 w/h 编码(x=200,w=-100 → 视觉 100..200)
    const el: CanvasElement = { id: 'r', kind: 'rect', x: 200, y: 200, w: -100, h: -100, rotation: 0 }
    const selected = marqueeSelect({ x: 110, y: 110, w: 50, h: 50 }, [el])
    expect(selected).toEqual(['r'])
  })
})
