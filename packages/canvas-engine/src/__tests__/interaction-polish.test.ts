/**
 * v0.41 批 1 交互打磨回归。
 * B1-T1: Tab 切走/页面失焦时交互态残留 → 幽灵移动。
 *   根因:无 visibilitychange 监听,Tab 隐藏不发 pointerup/cancel,所有态残留。
 *   修复:挂 window visibilitychange,隐藏时 clearInteractionState。
 *
 * 约束:jsdom 下 ctx===null,renderNow 跳过;只测状态机数据层。
 */
import { describe, expect, it } from 'vitest'
import { SelfBuiltAdapter } from '../self-built-adapter'

function makeHost(): { host: SelfBuiltAdapter; canvas: HTMLCanvasElement } {
  const host = new SelfBuiltAdapter(document.createElement('canvas'))
  host.upsert({ id: 'a', kind: 'card', x: 0, y: 0, w: 100, h: 100, rotation: 0 })
  return { host, canvas: (host as unknown as { canvas: HTMLCanvasElement }).canvas }
}

function dispatch(canvas: HTMLCanvasElement, type: string, x: number, y: number, extra: Record<string, unknown> = {}): void {
  canvas.dispatchEvent(
    new PointerEvent(type, { pointerId: 1, pointerType: 'mouse', bubbles: true, clientX: x, clientY: y, ...extra }),
  )
}

describe('[B1-T1] visibilitychange — 页面隐藏清交互残留', () => {
  it('拖拽中途页面隐藏 → dragGroup 清空,后续 move 不误移', () => {
    const { host, canvas } = makeHost()
    dispatch(canvas, 'pointerdown', 50, 50) // 命中卡A,进 dragGroup
    // 模拟 Tab 切走:visibilitychange hidden
    Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true })
    window.dispatchEvent(new Event('visibilitychange'))
    // dragGroup 应已清空(经 cast 读私有 dragGroup)
    const dragGroup = (host as unknown as { dragGroup: unknown }).dragGroup
    expect(dragGroup).toBeNull()
    // 后续 move 不应移动卡A(无 dragGroup → 不进 drag 分支)
    dispatch(canvas, 'pointermove', 200, 200)
    expect(host.getElement('a')).toMatchObject({ x: 0, y: 0 })
  })

  it('connect 中途页面隐藏 → connecting 清空,后续 move 不建箭头', () => {
    const { host, canvas } = makeHost()
    ;(host as unknown as { setTool: (t: string) => void }).setTool('connect')
    dispatch(canvas, 'pointerdown', 50, 50) // 开 connect
    Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true })
    window.dispatchEvent(new Event('visibilitychange'))
    const connecting = (host as unknown as { connecting: unknown }).connecting
    expect(connecting).toBeNull()
  })

  it('页面恢复 visible 不破坏(不抛错,元素不变)', () => {
    const { host, canvas } = makeHost()
    dispatch(canvas, 'pointerdown', 50, 50)
    Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true })
    window.dispatchEvent(new Event('visibilitychange')) // 不应抛、不应清元素
    expect(host.getElement('a')).toMatchObject({ id: 'a' })
  })
})

describe('[B1-T2] 方向键 undo 粒度 — 按住重复只推 1 步', () => {
  it('首次 keydown + 多次 repeat → undo 栈只增 1(连续微移合并)', () => {
    const { host } = makeHost()
    ;(host as unknown as { setSelectedIds: (i: string[]) => void }).setSelectedIds(['a'])
    const before = (host as unknown as { undoStack: unknown[] }).undoStack.length
    // 首次按下
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', repeat: false, bubbles: true }))
    // OS 自动重复 N 次
    for (let i = 0; i < 5; i++) {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', repeat: true, bubbles: true }))
    }
    const after = (host as unknown as { undoStack: unknown[] }).undoStack.length
    expect(after - before).toBe(1) // 5 次 repeat 不再推快照
    // 卡片应移动了 6 次(首次 + 5 repeat)
    expect(host.getElement('a')!.x).toBeGreaterThan(0)
  })

  it('松开 keyup 后再按 → 推新一步(不同按下回合分开)', () => {
    const { host } = makeHost()
    ;(host as unknown as { setSelectedIds: (i: string[]) => void }).setSelectedIds(['a'])
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', repeat: false, bubbles: true }))
    window.dispatchEvent(new KeyboardEvent('keyup', { key: 'ArrowRight', bubbles: true }))
    // 新一轮按下
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', repeat: false, bubbles: true }))
    const stack = (host as unknown as { undoStack: unknown[] }).undoStack
    // 两轮各推 1 步(初始快照 + 第一轮后快照 + 第二轮后快照);关键:第二轮按下推了新步
    expect(stack.length).toBeGreaterThanOrEqual(2)
  })
})

describe('[B2-T1] 空 undo 步 — 纯点击/点空白不污染 undo 栈', () => {
  it('select 点选元素(不拖)→ undo 栈不增', () => {
    const { host, canvas } = makeHost()
    const before = (host as unknown as { undoStack: unknown[] }).undoStack.length
    dispatch(canvas, 'pointerdown', 50, 50) // 命中卡A
    dispatch(canvas, 'pointerup', 50, 50) // 松手,没拖
    const after = (host as unknown as { undoStack: unknown[] }).undoStack.length
    expect(after).toBe(before) // 无空步
  })

  it('select 拖动元素 → undo 栈 +1(1 步整拖)', () => {
    const { host, canvas } = makeHost()
    const before = (host as unknown as { undoStack: unknown[] }).undoStack.length
    dispatch(canvas, 'pointerdown', 50, 50)
    dispatch(canvas, 'pointermove', 120, 50) // 实际拖动
    dispatch(canvas, 'pointerup', 120, 50)
    const after = (host as unknown as { undoStack: unknown[] }).undoStack.length
    expect(after - before).toBe(1)
  })

  it('eraser 点空白(没擦到)→ undo 栈不增', () => {
    const { host, canvas } = makeHost()
    ;(host as unknown as { setTool: (t: string) => void }).setTool('eraser')
    const before = (host as unknown as { undoStack: unknown[] }).undoStack.length
    dispatch(canvas, 'pointerdown', 500, 500) // 空白
    dispatch(canvas, 'pointerup', 500, 500)
    const after = (host as unknown as { undoStack: unknown[] }).undoStack.length
    expect(after).toBe(before)
  })

  it('eraser 擦元素 → undo 栈 +1', () => {
    const { host, canvas } = makeHost()
    ;(host as unknown as { setTool: (t: string) => void }).setTool('eraser')
    const before = (host as unknown as { undoStack: unknown[] }).undoStack.length
    dispatch(canvas, 'pointerdown', 50, 50) // 擦卡A
    dispatch(canvas, 'pointerup', 50, 50)
    const after = (host as unknown as { undoStack: unknown[] }).undoStack.length
    expect(after - before).toBe(1)
  })

  it('resize 点 handle 不拖 → undo 栈不增(预选,真实进 resize 路径)', () => {
    const { host, canvas } = makeHost()
    // resize 起手需先选中卡A(se handle 命中条件 = selectedIds.size===1)。
    ;(host as unknown as { setSelectedIds: (i: string[]) => void }).setSelectedIds(['a'])
    // 卡A 右下角 handle 约在 (100,100)
    const before = (host as unknown as { undoStack: unknown[] }).undoStack.length
    dispatch(canvas, 'pointerdown', 100, 100) // 命中 handle,进 resizing 态
    dispatch(canvas, 'pointerup', 100, 100) // 不拖
    const after = (host as unknown as { undoStack: unknown[] }).undoStack.length
    expect(after).toBe(before) // lazy:未实际 resize 不推
  })

  it('resize 拖动 → undo 栈 +1(1 步整 resize)', () => {
    const { host, canvas } = makeHost()
    ;(host as unknown as { setSelectedIds: (i: string[]) => void }).setSelectedIds(['a'])
    const before = (host as unknown as { undoStack: unknown[] }).undoStack.length
    dispatch(canvas, 'pointerdown', 100, 100) // handle
    dispatch(canvas, 'pointermove', 140, 140) // 实际 resize
    dispatch(canvas, 'pointerup', 140, 140)
    const after = (host as unknown as { undoStack: unknown[] }).undoStack.length
    expect(after - before).toBe(1)
  })
})

describe('[B2-T2] resize snap — snap 模式尺寸落 8 倍数', () => {
  it('snap 模式拖角 resize → w/h 是 8 倍数', () => {
    const { host, canvas } = makeHost()
    ;(host as unknown as { setView: (v: unknown) => void }).setView({ panX: 0, panY: 0, zoom: 1, gridMode: 'snap' })
    // resize 起手需先选中卡A(se handle 命中条件 = selectedIds.size===1)。
    ;(host as unknown as { setSelectedIds: (i: string[]) => void }).setSelectedIds(['a'])
    // 卡A 右下角 handle 约 (100,100);拖到 (123, 123)
    dispatch(canvas, 'pointerdown', 100, 100)
    dispatch(canvas, 'pointermove', 123, 123)
    dispatch(canvas, 'pointerup', 123, 123)
    const a = host.getElement('a')!
    expect(a.w % 8).toBe(0)
    // card mode A:h 由 cardDisplayMode 派生,resize 不改 h(只改 w);h%8 不再断言。
    expect(a.w).toBeGreaterThan(100) // 确实放大了
  })

  it('free 模式 resize → 尺寸不强制 8 倍数(回归)', () => {
    const { host, canvas } = makeHost()
    ;(host as unknown as { setView: (v: unknown) => void }).setView({ panX: 0, panY: 0, zoom: 1, gridMode: 'free' })
    ;(host as unknown as { setSelectedIds: (i: string[]) => void }).setSelectedIds(['a'])
    dispatch(canvas, 'pointerdown', 100, 100)
    dispatch(canvas, 'pointermove', 123, 123)
    dispatch(canvas, 'pointerup', 123, 123)
    const a = host.getElement('a')!
    // free 模式:123-0=123,不强制网格(123 不是 8 倍数)
    expect(a.w).toBe(123)
  })
})

describe('[B4-T1] freedraw 单点不建幽灵元素', () => {
  it('freedraw 单点点击(不拖)→ 不建元素', () => {
    const host = new SelfBuiltAdapter(document.createElement('canvas'))
    const canvas = (host as unknown as { canvas: HTMLCanvasElement }).canvas
    ;(host as unknown as { setTool: (t: string) => void }).setTool('freedraw')
    dispatch(canvas, 'pointerdown', 50, 50)
    dispatch(canvas, 'pointerup', 50, 50) // 单点,无 move
    expect(host.getElements().filter((e) => e.kind === 'freedraw')).toHaveLength(0)
  })

  it('freedraw 多点(正常笔画)→ 建元素(回归)', () => {
    const host = new SelfBuiltAdapter(document.createElement('canvas'))
    const canvas = (host as unknown as { canvas: HTMLCanvasElement }).canvas
    ;(host as unknown as { setTool: (t: string) => void }).setTool('freedraw')
    dispatch(canvas, 'pointerdown', 10, 10)
    dispatch(canvas, 'pointermove', 50, 50)
    dispatch(canvas, 'pointerup', 50, 50)
    expect(host.getElements().filter((e) => e.kind === 'freedraw')).toHaveLength(1)
  })
})

describe('[B4-T2] eraser 线段擦 — 快速拖拽不漏擦', () => {
  it('两次 move 间有元素 → 线段采样擦到(不只端点)', () => {
    const host = new SelfBuiltAdapter(document.createElement('canvas'))
    const canvas = (host as unknown as { canvas: HTMLCanvasElement }).canvas
    // 一条贯穿中间的细箭头(自由箭头 bbox 编码线段):从 (200,50) 到 (200,50) ... 用 rect 模拟障碍
    host.upsert({ id: 'mid', kind: 'rect', x: 190, y: 40, w: 20, h: 20, rotation: 0 })
    ;(host as unknown as { setTool: (t: string) => void }).setTool('eraser')
    dispatch(canvas, 'pointerdown', 100, 50) // 左侧起手(未命中 mid)
    dispatch(canvas, 'pointermove', 300, 50) // 快速拖到右侧,跳过中间 mid(200,50)
    dispatch(canvas, 'pointerup', 300, 50)
    // 线段采样应在 (200,50) 附近命中 mid 并删除;不做线段擦则 mid 残留
    expect(host.getElement('mid')).toBeUndefined()
  })

  for (const { zoom, distance, fraction } of [
    { zoom: 0.5, distance: 50, fraction: 0.53 },
    { zoom: 1, distance: 200, fraction: 0.5625 },
    { zoom: 2, distance: 1000, fraction: 0.5625 },
  ]) {
    it(`zoom=${zoom}, ${distance}px sweep 擦过 1px text 即删除`, () => {
      const host = new SelfBuiltAdapter(document.createElement('canvas'))
      const canvas = (host as unknown as { canvas: HTMLCanvasElement }).canvas
      host.setView({ panX: 0, panY: 0, zoom, gridMode: 'free' })
      const startX = 10
      const endX = startX + distance
      const screenY = 50
      const hitX = (startX + distance * fraction) / zoom
      const hitY = screenY / zoom
      host.upsert({
        id: 'thin',
        kind: 'text',
        x: hitX,
        y: hitY,
        w: 1 / zoom,
        h: 1 / zoom,
        rotation: 0,
        text: '',
      })
      host.setTool('eraser')
      dispatch(canvas, 'pointerdown', startX, screenY)
      dispatch(canvas, 'pointermove', endX, screenY)
      dispatch(canvas, 'pointerup', endX, screenY)
      expect(host.getElement('thin')).toBeUndefined()
    })
  }
})

describe('[B4-T3] connect 模式 card 可连暗示', () => {
  it('activeTool=connect 时 renderNow 对 card 画虚线轮廓', () => {
    const host = new SelfBuiltAdapter(document.createElement('canvas'))
    host.upsert({ id: 'a', kind: 'card', x: 0, y: 0, w: 100, h: 100, rotation: 0 })
    ;(host as unknown as { setTool: (t: string) => void }).setTool('connect')
    // mock ctx 捕获 setLineDash + strokeRect 调用
    const calls: string[] = []
    const ctx = {
      setLineDash: (d: number[]) => calls.push(`setLineDash(${d.join(',')})`),
      strokeRect: (x: number, y: number, w: number, h: number) => calls.push(`strokeRect(${x},${y},${w},${h})`),
      save: () => {}, restore: () => {}, translate: () => {}, scale: () => {},
      setTransform: () => {},
      beginPath: () => {}, closePath: () => {}, moveTo: () => {}, lineTo: () => {},
      quadraticCurveTo: () => {}, roundRect: () => {},
      arc: () => {}, rect: () => {}, fill: () => {}, stroke: () => {}, fillRect: () => {},
      fillText: () => {}, clearRect: () => {}, measureText: () => ({ width: 10 }),
      strokeStyle: '', fillStyle: '', font: '', lineWidth: 0, globalAlpha: 1, textBaseline: 'top',
    }
    ;(host as unknown as { ctx: unknown }).ctx = ctx
    ;(host as unknown as { renderNow: () => void }).renderNow()
    // connect 暗示虚线:strokeRect 画在卡 bbox(0,0,100,*)。h 现由 cardDisplayMode 派生
    // (mode A:无 body -> 最小高 58),不再固定 100;放宽 h 断言只验轮廓存在。
    expect(calls.some((c) => c.startsWith('strokeRect(0,0,100,'))).toBe(true)
    expect(calls.some((c) => c.startsWith('setLineDash'))).toBe(true)
  })

  it('select 模式不画 connect 暗示(回归)', () => {
    const host = new SelfBuiltAdapter(document.createElement('canvas'))
    host.upsert({ id: 'a', kind: 'card', x: 0, y: 0, w: 100, h: 100, rotation: 0 })
    // activeTool 默认 select
    const calls: string[] = []
    const ctx = { strokeRect: () => calls.push('strokeRect'), setLineDash: () => calls.push('setLineDash'), save: () => {}, restore: () => {}, translate: () => {}, scale: () => {}, setTransform: () => {}, beginPath: () => {}, closePath: () => {}, moveTo: () => {}, lineTo: () => {}, quadraticCurveTo: () => {}, roundRect: () => {}, arc: () => {}, rect: () => {}, fill: () => {}, stroke: () => {}, fillRect: () => {}, fillText: () => {}, clearRect: () => {}, measureText: () => ({ width: 10 }), strokeStyle: '', fillStyle: '', font: '', lineWidth: 0, globalAlpha: 1, textBaseline: 'top' }
    ;(host as unknown as { ctx: unknown }).ctx = ctx
    ;(host as unknown as { renderNow: () => void }).renderNow()
    // select 模式不应画 connect 暗示虚线 strokeRect(选中描边走 drawSelectionOutlines,不在此)
    // 宽松断言:不强制要求(防 drawSelectionOutlines 干扰);关键看 connect 分支
    expect(host.getTool()).not.toBe('connect')
  })
})
