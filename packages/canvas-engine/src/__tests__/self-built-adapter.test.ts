import { describe, expect, it } from 'vitest'
import { SelfBuiltAdapter } from '../self-built-adapter'
import type { CanvasElement } from '../canvas-host'

describe('SelfBuiltAdapter drag → onUserChange', () => {
  it('upsert during drag emits UserChange (canvas-binding writes back via this)', () => {
    const host = new SelfBuiltAdapter(document.createElement('canvas'))
    const changes: { updated: unknown[]; removed: string[] }[] = []
    host.onUserChange((c) => changes.push(c))
    host.upsert({ id: 'c1', kind: 'card', x: 0, y: 0, w: 10, h: 10, rotation: 0 })
    host.upsert({ id: 'c1', kind: 'card', x: 5, y: 6, w: 10, h: 10, rotation: 0 })
    expect(changes).toHaveLength(2)
    expect(changes[1]!.updated[0]).toMatchObject({ id: 'c1', x: 5, y: 6 })
  })

  it('drag under applyWithoutEcho does NOT emit (writeback-loop suppression)', () => {
    const host = new SelfBuiltAdapter(document.createElement('canvas'))
    let fired = 0
    host.onUserChange(() => fired++)
    host.applyWithoutEcho(() => host.upsert({ id: 'c1', kind: 'card', x: 1, y: 1, w: 1, h: 1, rotation: 0 }))
    expect(fired).toBe(0)
  })
})

describe('SelfBuiltAdapter pan/zoom', () => {
  it('wheel zoom adjusts zoom + pan (zoom-to-cursor at cursor point)', () => {
    const host = new SelfBuiltAdapter(document.createElement('canvas'))
    host.setView({ panX: 0, panY: 0, zoom: 1, gridMode: 'free' })
    // delta < 0(放大)单步应用 1.1 因子;cursor 下页坐标应缩放前后不变。
    // ctrlKey=true → 走 zoom 分支(pinch / ctrl+滚轮)。
    const sx = 100
    const sy = 100
    ;(host as unknown as {
      onWheel: (sx: number, sy: number, deltaX: number, deltaY: number, ctrlKey: boolean) => void
    }).onWheel(sx, sy, 0, -1, true)
    const v = host.getView()
    expect(v.zoom).toBeCloseTo(1.1, 5)
    // zoom-to-cursor: page coord under cursor 不变 → panX 补偿
    expect((sx - v.panX) / v.zoom).toBeCloseTo(100, 5)
    expect((sy - v.panY) / v.zoom).toBeCloseTo(100, 5)
  })

  it('zoom clamps to [0.1, 8]', () => {
    const host = new SelfBuiltAdapter(document.createElement('canvas'))
    host.setView({ panX: 0, panY: 0, zoom: 1, gridMode: 'free' })
    const h = host as unknown as {
      onWheel: (sx: number, sy: number, deltaX: number, deltaY: number, ctrlKey: boolean) => void
    }
    h.onWheel(0, 0, 0, 100, true) // 大幅缩小
    expect(host.getView().zoom).toBeGreaterThanOrEqual(0.1)
    host.setView({ panX: 0, panY: 0, zoom: 7.9, gridMode: 'free' })
    h.onWheel(0, 0, 0, -100, true) // 大幅放大
    expect(host.getView().zoom).toBeLessThanOrEqual(8)
  })
})

describe('SelfBuiltAdapter freedraw input', () => {
  function dispatch(canvas: HTMLCanvasElement, type: string, x: number, y: number) {
    canvas.dispatchEvent(
      new PointerEvent(type, {
        pointerId: 1,
        pointerType: 'mouse',
        bubbles: true,
        clientX: x,
        clientY: y,
      }),
    )
  }

  it('select 模式(默认)不产 freedraw', () => {
    const host = new SelfBuiltAdapter(document.createElement('canvas'))
    const canvas = (host as unknown as { canvas: HTMLCanvasElement }).canvas
    dispatch(canvas, 'pointerdown', 10, 10)
    dispatch(canvas, 'pointermove', 50, 50)
    dispatch(canvas, 'pointerup', 50, 50)
    expect(host.getElements().filter((e) => e.kind === 'freedraw')).toHaveLength(0)
  })

  it('freedraw 模式:down/move/up 产一个 freedraw 元素,点序列 + bbox 正确', () => {
    const host = new SelfBuiltAdapter(document.createElement('canvas'))
    const canvas = (host as unknown as { canvas: HTMLCanvasElement }).canvas
    ;(host as unknown as { setTool: (t: string) => void }).setTool('freedraw')

    const changes: { updated: CanvasElement[]; removed: string[] }[] = []
    host.onUserChange((c) => changes.push(c as never))

    dispatch(canvas, 'pointerdown', 10, 10)
    dispatch(canvas, 'pointermove', 40, 50)
    dispatch(canvas, 'pointerup', 40, 50)

    const freedraws = host.getElements().filter((e) => e.kind === 'freedraw')
    expect(freedraws).toHaveLength(1)
    expect(freedraws[0]).toMatchObject({ kind: 'freedraw', x: 10, y: 10, w: 30, h: 40 })
    expect((freedraws[0]!.meta?.points as unknown[]).length).toBe(2)
    // commit 触发一次 onUserChange
    expect(changes.some((c) => c.updated.some((e) => e.kind === 'freedraw'))).toBe(true)
  })

  it('getTool/setTool', () => {
    const host = new SelfBuiltAdapter(document.createElement('canvas'))
    const h = host as unknown as { getTool: () => string; setTool: (t: string) => void }
    expect(h.getTool()).toBe('select')
    h.setTool('freedraw')
    expect(h.getTool()).toBe('freedraw')
  })
})

describe('SelfBuiltAdapter text 模式', () => {
  function dispatch(canvas: HTMLCanvasElement, type: string, x: number, y: number) {
    canvas.dispatchEvent(
      new PointerEvent(type, {
        pointerId: 1,
        pointerType: 'mouse',
        bubbles: true,
        clientX: x,
        clientY: y,
      }),
    )
  }

  it('text 模式:pointerdown 不触发 drag/pan/freedraw(no-op)', () => {
    const host = new SelfBuiltAdapter(document.createElement('canvas'))
    const canvas = (host as unknown as { canvas: HTMLCanvasElement }).canvas
    ;(host as unknown as { setTool: (t: string) => void }).setTool('text')
    host.upsert({ id: 'c1', kind: 'card', x: 0, y: 0, w: 100, h: 100, rotation: 0 }) // 可被拖拽的卡片
    let fired = 0
    host.onUserChange(() => fired++)
    dispatch(canvas, 'pointerdown', 50, 50) // 命中卡片
    dispatch(canvas, 'pointermove', 80, 80)
    dispatch(canvas, 'pointerup', 80, 80)
    expect(fired).toBe(0) // text 模式 pointerdown/move/up 全 no-op → 不触发 onUserChange。listener 在 upsert(c1) 之后才加,所以初始 upsert 那次也没被计数 → fired 恒为 0。
  })
})

describe('SelfBuiltAdapter selection', () => {
  function dispatch(canvas: HTMLCanvasElement, type: string, x: number, y: number) {
    canvas.dispatchEvent(
      new PointerEvent(type, {
        pointerId: 1,
        pointerType: 'mouse',
        bubbles: true,
        clientX: x,
        clientY: y,
      }),
    )
  }

  it('getSelectedIds/setSelectedIds round-trip', () => {
    const host = new SelfBuiltAdapter(document.createElement('canvas'))
    const h = host as unknown as { getSelectedIds: () => string[]; setSelectedIds: (ids: string[]) => void }
    expect(h.getSelectedIds()).toEqual([])
    h.setSelectedIds(['a', 'b'])
    expect(h.getSelectedIds()).toEqual(['a', 'b'])
  })

  it('select 模式点元素 → 选中该元素(单选替换)', () => {
    const host = new SelfBuiltAdapter(document.createElement('canvas'))
    const canvas = (host as unknown as { canvas: HTMLCanvasElement }).canvas
    host.upsert({ id: 'c1', kind: 'card', x: 0, y: 0, w: 100, h: 100, rotation: 0 })
    host.upsert({ id: 'c2', kind: 'card', x: 200, y: 0, w: 100, h: 100, rotation: 0 })
    ;(host as unknown as { setSelectedIds: (ids: string[]) => void }).setSelectedIds(['c2'])
    dispatch(canvas, 'pointerdown', 50, 50) // 命中 c1
    expect((host as unknown as { getSelectedIds: () => string[] }).getSelectedIds()).toEqual(['c1'])
  })

  it('点空白 → 清空选择', () => {
    const host = new SelfBuiltAdapter(document.createElement('canvas'))
    const canvas = (host as unknown as { canvas: HTMLCanvasElement }).canvas
    host.upsert({ id: 'c1', kind: 'card', x: 0, y: 0, w: 100, h: 100, rotation: 0 })
    ;(host as unknown as { setSelectedIds: (ids: string[]) => void }).setSelectedIds(['c1'])
    dispatch(canvas, 'pointerdown', 500, 500) // 空白
    expect((host as unknown as { getSelectedIds: () => string[] }).getSelectedIds()).toEqual([])
  })

  function keydown(key: string, target: unknown = window) {
    const ev = new KeyboardEvent('keydown', { key, bubbles: true })
    Object.defineProperty(ev, 'target', { value: target, writable: false })
    window.dispatchEvent(ev)
  }

  it('Delete 键删选中元素(非 text 模式 + target 非 input)', () => {
    const host = new SelfBuiltAdapter(document.createElement('canvas'))
    const canvas = (host as unknown as { canvas: HTMLCanvasElement }).canvas
    host.upsert({ id: 'c1', kind: 'card', x: 0, y: 0, w: 100, h: 100, rotation: 0 })
    host.upsert({ id: 'c2', kind: 'card', x: 200, y: 0, w: 100, h: 100, rotation: 0 })
    dispatch(canvas, 'pointerdown', 50, 50) // 选中 c1
    const removed: string[] = []
    host.onUserChange((c) => removed.push(...c.removed))
    keydown('Delete')
    expect(host.getElement('c1')).toBeUndefined()
    expect(host.getElement('c2')).toBeDefined() // 只删选中的
    expect(removed).toContain('c1')
    expect((host as unknown as { getSelectedIds: () => string[] }).getSelectedIds()).toEqual([])
  })

  it('text 模式 Delete 不删(文本编辑中)', () => {
    const host = new SelfBuiltAdapter(document.createElement('canvas'))
    host.upsert({ id: 'c1', kind: 'card', x: 0, y: 0, w: 10, h: 10, rotation: 0 })
    ;(host as unknown as { setSelectedIds: (i: string[]) => void }).setSelectedIds(['c1'])
    ;(host as unknown as { setTool: (t: string) => void }).setTool('text')
    keydown('Delete')
    expect(host.getElement('c1')).toBeDefined() // 没删
  })

  it('焦点在 textarea 时 Delete 不删', () => {
    const host = new SelfBuiltAdapter(document.createElement('canvas'))
    host.upsert({ id: 'c1', kind: 'card', x: 0, y: 0, w: 10, h: 10, rotation: 0 })
    ;(host as unknown as { setSelectedIds: (i: string[]) => void }).setSelectedIds(['c1'])
    const fakeTextarea = { tagName: 'TEXTAREA' } as unknown as EventTarget
    keydown('Delete', fakeTextarea)
    expect(host.getElement('c1')).toBeDefined() // 没删
  })
})

describe('SelfBuiltAdapter resize', () => {
  function dispatch(canvas: HTMLCanvasElement, type: string, x: number, y: number) {
    canvas.dispatchEvent(
      new PointerEvent(type, { pointerId: 1, pointerType: 'mouse', bubbles: true, clientX: x, clientY: y }),
    )
  }

  it('select 模式拖 SE handle → 缩放元素(fixed=nw)', () => {
    const host = new SelfBuiltAdapter(document.createElement('canvas'))
    const canvas = (host as unknown as { canvas: HTMLCanvasElement }).canvas
    host.upsert({ id: 'c1', kind: 'card', x: 100, y: 100, w: 100, h: 100, rotation: 0 })
    ;(host as unknown as { setSelectedIds: (i: string[]) => void }).setSelectedIds(['c1'])
    // SE 角在 (200,200);down 在 SE → 进 resize;move 到 (150,150) → se 缩到 {100,100,50,50}
    dispatch(canvas, 'pointerdown', 200, 200)
    dispatch(canvas, 'pointermove', 150, 150)
    dispatch(canvas, 'pointerup', 150, 150)
    expect(host.getElement('c1')).toMatchObject({ x: 100, y: 100, w: 50, h: 50 })
  })

  it('freedraw 模式不 resize(工具不是 select)', () => {
    const host = new SelfBuiltAdapter(document.createElement('canvas'))
    const canvas = (host as unknown as { canvas: HTMLCanvasElement }).canvas
    host.upsert({ id: 'c1', kind: 'card', x: 100, y: 100, w: 100, h: 100, rotation: 0 })
    ;(host as unknown as { setSelectedIds: (i: string[]) => void }).setSelectedIds(['c1'])
    ;(host as unknown as { setTool: (t: string) => void }).setTool('freedraw')
    dispatch(canvas, 'pointerdown', 200, 200) // freedraw 模式 → 画笔画,不 resize
    dispatch(canvas, 'pointermove', 150, 150)
    dispatch(canvas, 'pointerup', 150, 150)
    expect(host.getElement('c1')).toMatchObject({ x: 100, y: 100, w: 100, h: 100 }) // 没缩放
  })

  it('没选中元素时不 resize(pointerdown 走 hit/drag)', () => {
    const host = new SelfBuiltAdapter(document.createElement('canvas'))
    const canvas = (host as unknown as { canvas: HTMLCanvasElement }).canvas
    host.upsert({ id: 'c1', kind: 'card', x: 100, y: 100, w: 100, h: 100, rotation: 0 })
    // 没 setSelectedIds → selectedIds 空 → handle 检查跳过 → down 在 SE(200,200)其实 hitTest 命中 c1 body → drag
    dispatch(canvas, 'pointerdown', 200, 200)
    dispatch(canvas, 'pointermove', 150, 150)
    dispatch(canvas, 'pointerup', 150, 150)
    // 拖动(c1 中心 150,150 → offset 50,50;move 到 150,150 → x=100,y=100)其实没移;但绝不是 resize
    expect(host.getElement('c1')).toMatchObject({ w: 100, h: 100 }) // 尺寸没变
  })
})

describe('SelfBuiltAdapter multiselect', () => {
  function dispatch(canvas: HTMLCanvasElement, type: string, x: number, y: number, shift = false) {
    canvas.dispatchEvent(
      new PointerEvent(type, { pointerId: 1, pointerType: 'mouse', bubbles: true, clientX: x, clientY: y, shiftKey: shift }),
    )
  }

  it('shift-click 切换选择(累加/移除)', () => {
    const host = new SelfBuiltAdapter(document.createElement('canvas'))
    const canvas = (host as unknown as { canvas: HTMLCanvasElement }).canvas
    host.upsert({ id: 'a', kind: 'card', x: 0, y: 0, w: 50, h: 50, rotation: 0 })
    host.upsert({ id: 'b', kind: 'card', x: 100, y: 0, w: 50, h: 50, rotation: 0 })
    dispatch(canvas, 'pointerdown', 25, 25) // 选 a
    dispatch(canvas, 'pointerup', 25, 25)
    dispatch(canvas, 'pointerdown', 125, 25, true) // shift+点 b → 累加
    dispatch(canvas, 'pointerup', 125, 25, true)
    expect((host as unknown as { getSelectedIds: () => string[] }).getSelectedIds().sort()).toEqual(['a', 'b'])
    dispatch(canvas, 'pointerdown', 125, 25, true) // shift+再点 b → 移除
    dispatch(canvas, 'pointerup', 125, 25, true)
    expect((host as unknown as { getSelectedIds: () => string[] }).getSelectedIds()).toEqual(['a'])
  })

  it('组移动:拖任一选中元素,全组移', () => {
    const host = new SelfBuiltAdapter(document.createElement('canvas'))
    const canvas = (host as unknown as { canvas: HTMLCanvasElement }).canvas
    host.upsert({ id: 'a', kind: 'card', x: 0, y: 0, w: 50, h: 50, rotation: 0 })
    host.upsert({ id: 'b', kind: 'card', x: 100, y: 0, w: 50, h: 50, rotation: 0 })
    ;(host as unknown as { setSelectedIds: (i: string[]) => void }).setSelectedIds(['a', 'b'])
    dispatch(canvas, 'pointerdown', 25, 25) // 拖 a(已选中)
    dispatch(canvas, 'pointermove', 35, 35) // +10,+10
    dispatch(canvas, 'pointerup', 35, 35)
    expect(host.getElement('a')).toMatchObject({ x: 10, y: 10 })
    expect(host.getElement('b')).toMatchObject({ x: 110, y: 10 }) // b 也移 +10
  })

  it('混合选区组移动:card 走 bbox、freedraw 走点序列,都跟着移', () => {
    const host = new SelfBuiltAdapter(document.createElement('canvas'))
    const canvas = (host as unknown as { canvas: HTMLCanvasElement }).canvas
    host.upsert({ id: 'c', kind: 'card', x: 0, y: 0, w: 50, h: 50, rotation: 0 })
    host.upsert({ id: 'd', kind: 'freedraw', x: 100, y: 0, w: 50, h: 50, rotation: 0, meta: { points: [[100, 0], [150, 50]] } })
    ;(host as unknown as { setSelectedIds: (i: string[]) => void }).setSelectedIds(['c', 'd'])
    dispatch(canvas, 'pointerdown', 25, 25) // 拖 card c
    dispatch(canvas, 'pointermove', 35, 35) // +10,+10
    dispatch(canvas, 'pointerup', 35, 35)
    expect(host.getElement('c')).toMatchObject({ x: 10, y: 10 }) // card bbox 移
    const d = host.getElement('d')!
    expect(d).toMatchObject({ x: 110, y: 10 }) // freedraw bbox 移
    expect(d.meta?.points).toEqual([[110, 10], [160, 60]]) // 且点序列也跟着移 +10
  })

  it('shift+空白拖拽 → 框选(命中相交元素)', () => {
    const host = new SelfBuiltAdapter(document.createElement('canvas'))
    const canvas = (host as unknown as { canvas: HTMLCanvasElement }).canvas
    host.upsert({ id: 'a', kind: 'card', x: 0, y: 0, w: 50, h: 50, rotation: 0 })
    host.upsert({ id: 'b', kind: 'card', x: 100, y: 0, w: 50, h: 50, rotation: 0 })
    host.upsert({ id: 'c', kind: 'card', x: 0, y: 100, w: 50, h: 50, rotation: 0 })
    dispatch(canvas, 'pointerdown', -10, -10, true) // shift+空白
    dispatch(canvas, 'pointermove', 60, 60, true)
    dispatch(canvas, 'pointerup', 60, 60, true)
    expect((host as unknown as { getSelectedIds: () => string[] }).getSelectedIds()).toEqual(['a']) // 框选只命中 a
  })
})

describe('SelfBuiltAdapter connect', () => {
  function dispatch(canvas: HTMLCanvasElement, type: string, x: number, y: number) {
    canvas.dispatchEvent(
      new PointerEvent(type, { pointerId: 1, pointerType: 'mouse', bubbles: true, clientX: x, clientY: y }),
    )
  }

  it('connect 模式:从 a 拖到 b → commit arrow(from=a to=b)', () => {
    const host = new SelfBuiltAdapter(document.createElement('canvas'))
    const canvas = (host as unknown as { canvas: HTMLCanvasElement }).canvas
    host.upsert({ id: 'a', kind: 'card', x: 0, y: 0, w: 100, h: 100, rotation: 0 })
    host.upsert({ id: 'b', kind: 'card', x: 300, y: 0, w: 100, h: 100, rotation: 0 })
    ;(host as unknown as { setTool: (t: string) => void }).setTool('connect')
    const changes: { updated: CanvasElement[]; removed: string[] }[] = []
    host.onUserChange((c) => changes.push(c as never))

    dispatch(canvas, 'pointerdown', 50, 50) // 命中 a
    dispatch(canvas, 'pointermove', 350, 50) // 拖到 b 上
    dispatch(canvas, 'pointerup', 350, 50) // 松手在 b

    const arrows = host.getElements().filter((e) => e.kind === 'arrow')
    expect(arrows).toHaveLength(1)
    expect(arrows[0]).toMatchObject({ kind: 'arrow', from: 'a', to: 'b' })
    expect(changes.some((c) => c.updated.some((e) => e.kind === 'arrow'))).toBe(true)
  })

  it('connect 松手在空白 → 取消(不 commit arrow)', () => {
    const host = new SelfBuiltAdapter(document.createElement('canvas'))
    const canvas = (host as unknown as { canvas: HTMLCanvasElement }).canvas
    host.upsert({ id: 'a', kind: 'card', x: 0, y: 0, w: 100, h: 100, rotation: 0 })
    ;(host as unknown as { setTool: (t: string) => void }).setTool('connect')
    dispatch(canvas, 'pointerdown', 50, 50) // 命中 a
    dispatch(canvas, 'pointermove', 500, 500) // 拖到空白
    dispatch(canvas, 'pointerup', 500, 500)
    expect(host.getElements().filter((e) => e.kind === 'arrow')).toHaveLength(0)
  })

  it('connect 模式 down 在空白 → 不开连接(无 from)', () => {
    const host = new SelfBuiltAdapter(document.createElement('canvas'))
    const canvas = (host as unknown as { canvas: HTMLCanvasElement }).canvas
    host.upsert({ id: 'a', kind: 'card', x: 0, y: 0, w: 100, h: 100, rotation: 0 })
    ;(host as unknown as { setTool: (t: string) => void }).setTool('connect')
    dispatch(canvas, 'pointerdown', 500, 500) // 空白
    dispatch(canvas, 'pointermove', 50, 50)
    dispatch(canvas, 'pointerup', 50, 50)
    expect(host.getElements().filter((e) => e.kind === 'arrow')).toHaveLength(0)
  })
})

describe('SelfBuiltAdapter undo coalescing (drag/resize/batch → 1 step)', () => {
  function dispatch(canvas: HTMLCanvasElement, type: string, x: number, y: number) {
    canvas.dispatchEvent(
      new PointerEvent(type, { pointerId: 1, pointerType: 'mouse', bubbles: true, clientX: x, clientY: y }),
    )
  }

  // 通过 undo 步数验证 coalescing:undo 到空,统计可 undo 的步数(= undoStack 深度)。
  function undoSteps(host: SelfBuiltAdapter): number {
    const h = host as unknown as { canUndo: () => boolean; undo: () => void }
    let count = 0
    while (h.canUndo()) { h.undo(); count++ }
    return count
  }

  it('drag:down→move×3→up 合并为 1 undo 步(不是 3+)', () => {
    const host = new SelfBuiltAdapter(document.createElement('canvas'))
    const canvas = (host as unknown as { canvas: HTMLCanvasElement }).canvas
    // 初始元素(程序性 upsert = 1 undo 步)
    host.upsert({ id: 'c1', kind: 'card', x: 0, y: 0, w: 100, h: 100, rotation: 0 })
    const before = undoSteps(host) // 初始 upsert = 1 步
    expect(before).toBe(1)

    // 重新建一个干净的 host 跑 drag(避免初始 upsert 干扰计数)
    const host2 = new SelfBuiltAdapter(document.createElement('canvas'))
    const canvas2 = (host2 as unknown as { canvas: HTMLCanvasElement }).canvas
    host2.upsert({ id: 'c1', kind: 'card', x: 0, y: 0, w: 100, h: 100, rotation: 0 }) // +1 步
    dispatch(canvas2, 'pointerdown', 50, 50) // 命中 → drag 开始(批前 +1 步 + coalescing)
    dispatch(canvas2, 'pointermove', 60, 60) // 改位置(coalesced,不推)
    dispatch(canvas2, 'pointermove', 70, 70) // 改位置(coalesced)
    dispatch(canvas2, 'pointermove', 80, 80) // 改位置(coalesced)
    dispatch(canvas2, 'pointerup', 80, 80) // 结束
    expect(host2.getElement('c1')).toMatchObject({ x: 30, y: 30 }) // 实际拖动了
    // 总 undo 步 = 初始 upsert(1) + drag(1) = 2,不是 1+4=5
    expect(undoSteps(host2)).toBe(2)
  })

  it('resize:down(handle)→move×2→up 合并为 1 undo 步', () => {
    const host = new SelfBuiltAdapter(document.createElement('canvas'))
    const canvas = (host as unknown as { canvas: HTMLCanvasElement }).canvas
    host.upsert({ id: 'c1', kind: 'card', x: 100, y: 100, w: 100, h: 100, rotation: 0 }) // +1 步
    ;(host as unknown as { setSelectedIds: (i: string[]) => void }).setSelectedIds(['c1'])
    dispatch(canvas, 'pointerdown', 200, 200) // SE 角 → resize 开始(+1 步 + coalescing)
    dispatch(canvas, 'pointermove', 180, 180) // 缩放(coalesced)
    dispatch(canvas, 'pointermove', 160, 160) // 缩放(coalesced)
    dispatch(canvas, 'pointerup', 160, 160)
    expect(host.getElement('c1')).toMatchObject({ x: 100, y: 100, w: 60, h: 60 }) // 实际缩放了
    // 总 = 初始(1) + resize(1) = 2,不是 1+3=4
    expect(undoSteps(host)).toBe(2)
  })

  it('batch:批内多次 upsert/remove 合并为 1 undo 步', () => {
    const host = new SelfBuiltAdapter(document.createElement('canvas'))
    host.batch(() => {
      host.upsert({ id: 'a', kind: 'card', x: 0, y: 0, w: 10, h: 10, rotation: 0 })
      host.upsert({ id: 'b', kind: 'card', x: 20, y: 0, w: 10, h: 10, rotation: 0 })
      host.remove('a')
    })
    // 批内 3 次变更 → 1 undo 步
    expect(undoSteps(host)).toBe(1)
    // undo 后恢复到批前(空)
    const h = host as unknown as { undo: () => void }
    h.undo()
    expect(host.getElements()).toHaveLength(0)
  })

  it('单次程序性 upsert 仍各自 1 步(不被 coalescing 吞)', () => {
    const host = new SelfBuiltAdapter(document.createElement('canvas'))
    host.upsert({ id: 'a', kind: 'card', x: 0, y: 0, w: 10, h: 10, rotation: 0 })
    host.upsert({ id: 'b', kind: 'card', x: 20, y: 0, w: 10, h: 10, rotation: 0 })
    host.upsert({ id: 'c', kind: 'card', x: 40, y: 0, w: 10, h: 10, rotation: 0 })
    expect(undoSteps(host)).toBe(3)
  })

  it('drag coalescing 在 onUp 后关闭:后续单次 upsert 恢复各自 1 步', () => {
    const host = new SelfBuiltAdapter(document.createElement('canvas'))
    const canvas = (host as unknown as { canvas: HTMLCanvasElement }).canvas
    host.upsert({ id: 'c1', kind: 'card', x: 0, y: 0, w: 100, h: 100, rotation: 0 }) // +1
    dispatch(canvas, 'pointerdown', 50, 50) // drag 开始 +1 + coalescing
    dispatch(canvas, 'pointermove', 60, 60)
    dispatch(canvas, 'pointerup', 60, 60) // coalescing 关
    // 之后单次程序性 upsert 应各自 +1(说明 coalescing 已复位为 false)
    host.upsert({ id: 'c2', kind: 'card', x: 200, y: 0, w: 10, h: 10, rotation: 0 }) // +1
    expect(undoSteps(host)).toBe(3) // 初始(1) + drag(1) + 单次(1)
  })

  it('嵌套 batch 不重复推快照', () => {
    const host = new SelfBuiltAdapter(document.createElement('canvas'))
    host.batch(() => {
      host.upsert({ id: 'a', kind: 'card', x: 0, y: 0, w: 10, h: 10, rotation: 0 })
      host.batch(() => {
        host.upsert({ id: 'b', kind: 'card', x: 20, y: 0, w: 10, h: 10, rotation: 0 })
      })
      host.upsert({ id: 'c', kind: 'card', x: 40, y: 0, w: 10, h: 10, rotation: 0 })
    })
    // 整个外层 batch = 1 undo 步(内层不额外推)
    expect(undoSteps(host)).toBe(1)
  })
})

describe('SelfBuiltAdapter undo/redo', () => {
  it('pushUndo(经 user-change)存栈;undo 恢复;redo 重做', () => {
    const host = new SelfBuiltAdapter(document.createElement('canvas'))
    const h = host as unknown as { undo: () => void; redo: () => void; canUndo: () => boolean; canRedo: () => boolean }
    host.upsert({ id: 'c1', kind: 'card', x: 0, y: 0, w: 10, h: 10, rotation: 0 }) // 进栈前快照=空
    expect(h.canUndo()).toBe(true)
    host.upsert({ id: 'c2', kind: 'card', x: 0, y: 0, w: 10, h: 10, rotation: 0 })
    // undo → 回到只有 c2(撤掉 c2 的 upsert,恢复 c2 upsert 前的快照=只有 c1)
    h.undo()
    expect(host.getElements().map((e) => e.id)).toEqual(['c1'])
    expect(h.canRedo()).toBe(true)
    h.redo()
    expect(host.getElements().map((e) => e.id).sort()).toEqual(['c1', 'c2'])
  })

  it('new user-change 清空 redo 栈', () => {
    const host = new SelfBuiltAdapter(document.createElement('canvas'))
    const h = host as unknown as { undo: () => void; redo: () => void; canRedo: () => boolean }
    host.upsert({ id: 'c1', kind: 'card', x: 0, y: 0, w: 10, h: 10, rotation: 0 })
    host.upsert({ id: 'c2', kind: 'card', x: 0, y: 0, w: 10, h: 10, rotation: 0 })
    h.undo() // 回到 c1
    expect(h.canRedo()).toBe(true)
    host.upsert({ id: 'c3', kind: 'card', x: 0, y: 0, w: 10, h: 10, rotation: 0 }) // 新变更清 redo
    expect(h.canRedo()).toBe(false)
  })

  it('undo 栈上限 50(第 51 步丢弃最旧)', () => {
    const host = new SelfBuiltAdapter(document.createElement('canvas'))
    const h = host as unknown as { canUndo: () => boolean; undo: () => void }
    for (let i = 0; i < 55; i++) {
      host.upsert({ id: 'c' + i, kind: 'card', x: i, y: 0, w: 10, h: 10, rotation: 0 })
    }
    // undo 50 次应还能再 undo(false);第 51 次到空
    let count = 0
    while (h.canUndo()) { h.undo(); count++ }
    expect(count).toBe(50)
  })

  it('R1.1:snapshot 深拷贝 points(undo 回滚能恢复原点序列,不被原地改动污染)', () => {
    const host = new SelfBuiltAdapter(document.createElement('canvas'))
    const h = host as unknown as { undo: () => void; canUndo: () => boolean }
    // upsert freedraw F(此时 pushUndo 存的是「空」快照)
    host.upsert({
      id: 'F', kind: 'freedraw', x: 0, y: 0, w: 10, h: 10, rotation: 0,
      meta: { points: [[1, 1], [2, 2]] },
    })
    // upsert G(此时 pushUndo 存的快照含 F 的原始 points — 若是浅拷贝,F 的 points 数组会被下面改动污染)
    host.upsert({ id: 'G', kind: 'card', x: 0, y: 0, w: 1, h: 1, rotation: 0 })
    // 模拟未来 bug / 外部原地改动 F 的 live points 数组
    const liveF = host.getElement('F')!
    const pts = (liveF.meta as { points: [number, number][] }).points
    pts[0]![0] = 9999
    pts.push([100, 100])
    // undo → 撤掉 G,恢复快照里的 F;若深拷贝正确,F 的 points 应是原始值 [[1,1],[2,2]]
    h.undo()
    const restored = host.getElement('F')
    expect((restored!.meta as { points: [number, number][] }).points).toEqual([[1, 1], [2, 2]])
  })
})

describe('SelfBuiltAdapter keyboard actions', () => {
  function keydown(key: string, opts: { ctrl?: boolean; meta?: boolean; shift?: boolean; isComposing?: boolean; target?: unknown } = {}) {
    const ev = new KeyboardEvent('keydown', {
      key,
      bubbles: true,
      ctrlKey: !!opts.ctrl,
      metaKey: !!opts.meta,
      shiftKey: !!opts.shift,
    })
    if (opts.isComposing !== undefined) Object.defineProperty(ev, 'isComposing', { value: opts.isComposing, configurable: true })
    if (opts.target !== undefined) Object.defineProperty(ev, 'target', { value: opts.target, configurable: true })
    window.dispatchEvent(ev)
  }

  it('方向键微移选中元素(+1px)', () => {
    const host = new SelfBuiltAdapter(document.createElement('canvas'))
    host.upsert({ id: 'c1', kind: 'card', x: 0, y: 0, w: 10, h: 10, rotation: 0 })
    ;(host as unknown as { setSelectedIds: (i: string[]) => void }).setSelectedIds(['c1'])
    keydown('ArrowRight')
    expect(host.getElement('c1')?.x).toBe(1)
    keydown('ArrowDown', { shift: true }) // +10
    expect(host.getElement('c1')?.y).toBe(10)
  })

  it('Ctrl+A 全选', () => {
    const host = new SelfBuiltAdapter(document.createElement('canvas'))
    host.upsert({ id: 'a', kind: 'card', x: 0, y: 0, w: 10, h: 10, rotation: 0 })
    host.upsert({ id: 'b', kind: 'card', x: 20, y: 0, w: 10, h: 10, rotation: 0 })
    keydown('a', { ctrl: true })
    expect((host as unknown as { getSelectedIds: () => string[] }).getSelectedIds().sort()).toEqual(['a', 'b'])
  })

  it('Ctrl+Z undo 微移', () => {
    const host = new SelfBuiltAdapter(document.createElement('canvas'))
    host.upsert({ id: 'c1', kind: 'card', x: 0, y: 0, w: 10, h: 10, rotation: 0 })
    ;(host as unknown as { setSelectedIds: (i: string[]) => void }).setSelectedIds(['c1'])
    keydown('ArrowRight') // x→1
    keydown('z', { ctrl: true }) // undo → x→0
    expect(host.getElement('c1')?.x).toBe(0)
  })

  it('IME 组合态 Ctrl+Z 不触发 undo', () => {
    const host = new SelfBuiltAdapter(document.createElement('canvas'))
    host.upsert({ id: 'c1', kind: 'card', x: 0, y: 0, w: 10, h: 10, rotation: 0 })
    ;(host as unknown as { setSelectedIds: (i: string[]) => void }).setSelectedIds(['c1'])
    keydown('ArrowRight') // x→1,进 undo 栈
    keydown('z', { ctrl: true, isComposing: true }) // IME 中 → 不 undo
    expect(host.getElement('c1')?.x).toBe(1) // 仍 1
  })
})

describe('SelfBuiltAdapter onViewChange', () => {
  it('setView 触发 onViewChange', () => {
    const host = new SelfBuiltAdapter(document.createElement('canvas'), {
      getCardInfo: () => null,
    })
    const views: { zoom: number }[] = []
    ;(host as unknown as { onViewChange: (cb: (v: { zoom: number }) => void) => () => void }).onViewChange((v) => views.push(v))
    host.setView({ panX: 0, panY: 0, zoom: 2, gridMode: 'free' })
    expect(views.some((v) => v.zoom === 2)).toBe(true)
  })

  it('onViewChange 取消订阅后不再触发', () => {
    const host = new SelfBuiltAdapter(document.createElement('canvas'), { getCardInfo: () => null })
    let fired = 0
    const unsub = (host as unknown as { onViewChange: (cb: () => void) => () => void }).onViewChange(() => fired++)
    unsub()
    host.setView({ panX: 1, panY: 0, zoom: 1, gridMode: 'free' })
    expect(fired).toBe(0)
  })

  it('getCardInfo 构造选项不抛(从 service 读 type/body/pinned 的能力验证)', () => {
    const host = new SelfBuiltAdapter(document.createElement('canvas'), {
      getCardInfo: (id) => (id === 'c1' ? { title: 'T', body: 'B', type: 'note', pinned: false } : null),
    })
    // getCardInfo 不直接暴露;这里只验构造不抛 + 实例可用。
    expect(host).toBeDefined()
    expect(host.getView().zoom).toBe(1)
  })
})

describe('SelfBuiltAdapter interaction-state reset (R1.4 / R1.5)', () => {
  function dispatch(canvas: HTMLCanvasElement, type: string, x: number, y: number) {
    canvas.dispatchEvent(
      new PointerEvent(type, { pointerId: 1, pointerType: 'mouse', bubbles: true, clientX: x, clientY: y }),
    )
  }

  // R1.5:connect 进行中切工具必须清掉 connecting,否则切回 select 后一个无谓的
  // pointermove + pointerup 会用陈旧的 fromId commit 出一条幽灵 arrow。
  it('setTool clears in-progress connect state (no ghost arrow after switching tool)', () => {
    const host = new SelfBuiltAdapter(document.createElement('canvas'))
    const canvas = (host as unknown as { canvas: HTMLCanvasElement }).canvas
    host.upsert({ id: 'a', kind: 'card', x: 0, y: 0, w: 100, h: 100, rotation: 0 })
    host.upsert({ id: 'b', kind: 'card', x: 300, y: 0, w: 100, h: 100, rotation: 0 })
    const h = host as unknown as { setTool: (t: string) => void }
    h.setTool('connect')
    dispatch(canvas, 'pointerdown', 50, 50) // 命中 a → 开 connecting
    dispatch(canvas, 'pointermove', 350, 50) // 拖到 b 上(connecting 指针跟随)
    // 此时切回 select(用户改主意)——应清掉 connecting
    h.setTool('select')
    // 之后无 pointerdown 的 move + up 不该用陈旧 connecting 造箭头
    dispatch(canvas, 'pointermove', 350, 50)
    dispatch(canvas, 'pointerup', 350, 50)
    expect(host.getElements().filter((e) => e.kind === 'arrow')).toHaveLength(0)
  })

  // R1.4:drag 进行中 undo 必须清掉 dragGroup,否则下一次 pointermove 会用陈旧 offset
  // 移动已恢复的元素(数据错乱)。测可观察后果:undo 后 pointermove 不动任何元素。
  it('undo mid-drag clears drag state (subsequent pointermove does not move elements)', () => {
    const host = new SelfBuiltAdapter(document.createElement('canvas'))
    const canvas = (host as unknown as { canvas: HTMLCanvasElement }).canvas
    host.upsert({ id: 'c1', kind: 'card', x: 0, y: 0, w: 100, h: 100, rotation: 0 })
    dispatch(canvas, 'pointerdown', 50, 50) // 命中 → drag 开始(dragGroup 设 + coalescing)
    const h = host as unknown as { undo: () => void }
    h.undo() // 中途 undo:restore 替换 elements,但若不清 dragGroup → 下次 move 误移
    // undo 后 c1 恢复到 drag 前的位置(0,0)
    const afterUndo = host.getElement('c1')
    expect(afterUndo).toMatchObject({ x: 0, y: 0 })
    // undo 后若 dragGroup 仍残留,这条 move 会按陈旧 offset 把 c1 挪到错坐标
    dispatch(canvas, 'pointermove', 80, 80)
    expect(host.getElement('c1')).toMatchObject({ x: 0, y: 0 }) // 没动 = dragGroup 已清
  })
})

describe('SelfBuiltAdapter onWheel — pan vs zoom', () => {
  it('pans (no ctrlKey): wheel delta moves pan, zoom unchanged', () => {
    const host = new SelfBuiltAdapter(document.createElement('canvas'))
    const before = host.getView()
    ;(host as unknown as {
      onWheel: (sx: number, sy: number, deltaX: number, deltaY: number, ctrlKey: boolean) => void
    }).onWheel(400, 300, 0, 100, false)
    const after = host.getView()
    expect(after.zoom).toBe(before.zoom)
    expect(after.panY).not.toBe(before.panY)
  })

  it('zooms on ctrlKey (pinch / ctrl+wheel): zoom-to-cursor', () => {
    const host = new SelfBuiltAdapter(document.createElement('canvas'))
    const before = host.getView()
    ;(host as unknown as {
      onWheel: (sx: number, sy: number, deltaX: number, deltaY: number, ctrlKey: boolean) => void
    }).onWheel(400, 300, 0, -100, true)
    const after = host.getView()
    expect(after.zoom).toBeGreaterThan(before.zoom)
  })

  it('pans horizontally with deltaX (no ctrlKey)', () => {
    const host = new SelfBuiltAdapter(document.createElement('canvas'))
    const before = host.getView()
    ;(host as unknown as {
      onWheel: (sx: number, sy: number, deltaX: number, deltaY: number, ctrlKey: boolean) => void
    }).onWheel(400, 300, 50, 0, false)
    const after = host.getView()
    expect(after.panX).not.toBe(before.panX)
    expect(after.panY).toBe(before.panY)
    expect(after.zoom).toBe(before.zoom)
  })
})
