import { describe, expect, it } from 'vitest'
import { freedrawToRect } from '../freedraw-convert'
import type { CanvasElement } from '../canvas-host'

function fd(points: [number, number][], id = 'f', color?: string): CanvasElement {
  const el: CanvasElement = {
    id, kind: 'freedraw', x: 0, y: 0, w: 0, h: 0, rotation: 0, meta: { points },
  }
  if (color !== undefined) el.color = color
  return el
}

describe('freedrawToRect', () => {
  it('读 bbox → rect 元素(新 id,kind=rect,正尺寸)', () => {
    // 笔画 bbox:x=10 y=20 w=90 h=60
    const r = freedrawToRect(fd([[10, 20], [100, 80], [50, 50]]), 'r1')!
    expect(r.id).toBe('r1')
    expect(r.kind).toBe('rect')
    expect(r).toMatchObject({ x: 10, y: 20, w: 90, h: 60, rotation: 0 })
  })

  it('保留原 freedraw 的 color(红笔画 → 红 rect)', () => {
    const r = freedrawToRect(fd([[0, 0], [50, 50]], 'f', 'red'), 'r2')!
    expect(r.color).toBe('red')
  })

  it('无 color 的笔画 → rect 不带 color(undefined,走默认描边)', () => {
    const r = freedrawToRect(fd([[0, 0], [50, 50]]), 'r3')!
    expect(r.color).toBeUndefined()
  })

  it('纯函数:原 freedraw 不被改', () => {
    const el = fd([[10, 10], [40, 50]])
    const snap = JSON.parse(JSON.stringify(el))
    freedrawToRect(el, 'r4')
    expect(el).toEqual(snap)
  })

  it('非 freedraw → null', () => {
    const card: CanvasElement = { id: 'c', kind: 'card', x: 0, y: 0, w: 1, h: 1, rotation: 0 }
    expect(freedrawToRect(card, 'r5')).toBeNull()
  })

  it('点序列 <2 → null(无法定 bbox)', () => {
    expect(freedrawToRect(fd([[5, 5]]), 'r6')).toBeNull()
    expect(freedrawToRect(fd([]), 'r7')).toBeNull()
  })
})
