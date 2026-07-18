/**
 * 箭头交互回归审计 — 复现用户反馈「弯曲箭头没办法用、折线用不了、连接逻辑不对、各种 bug」。
 *
 * 范围:集成层(adapter pointer 事件分发 + RelationPanel setRoute 等价逻辑 +
 * 渲染数据联动)。canvas-engine 纯函数 390 单测全过,故聚焦集成层。
 *
 * 约束:jsdom 下 adapter.ctx === null → renderNow 静默跳过,**不测像素**。
 *      只测数据层(arrow 的 route/curve/elbow 字段是否正确更新)+
 *      逻辑层(arrowRoute / arrowEndpoints 返回)+ pointer 事件是否正确驱动状态机。
 *
 * 用法:每个 describe 对应一个症状,标注 [症状 N] + 该环节的判定。
 *      PASS = 数据/逻辑层 OK(若用户仍反馈坏 → bug 在渲染层或 web React 层)。
 *      FAIL = 找到回归点(给定位 + 根因假设)。
 */
import { describe, expect, it } from 'vitest'
import { SelfBuiltAdapter } from '../self-built-adapter'
import { arrowRoute, arrowEndpoints } from '../self-built-arrow'
import type { CanvasElement } from '../canvas-host'

// ── 通用 fixture / helper ───────────────────────────────────────────────────

/** 两张水平并排的卡:from 中心 (50,50),to 中心 (350,50),边框交点 (100,50)→(300,50)。 */
function makeHost(opts: { arrow?: Partial<CanvasElement>; selectArrow?: boolean } = {}): {
  host: SelfBuiltAdapter
  canvas: HTMLCanvasElement
  arrowId: string
} {
  const host = new SelfBuiltAdapter(document.createElement('canvas'))
  host.upsert({ id: 'a', kind: 'card', x: 0, y: 0, w: 100, h: 100, rotation: 0 })
  host.upsert({ id: 'b', kind: 'card', x: 300, y: 0, w: 100, h: 100, rotation: 0 })
  const arrow: CanvasElement = {
    id: 'ar',
    kind: 'arrow',
    x: 0,
    y: 0,
    w: 0,
    h: 0,
    rotation: 0,
    from: 'a',
    to: 'b',
    color: 'black',
    ...opts.arrow,
  }
  host.upsert(arrow)
  if (opts.selectArrow) {
    ;(host as unknown as { setSelectedIds: (i: string[]) => void }).setSelectedIds(['ar'])
  }
  const canvas = (host as unknown as { canvas: HTMLCanvasElement }).canvas
  return { host, canvas, arrowId: 'ar' }
}

/** dispatch 一个 PointerEvent(clientX/clientY = 屏幕坐标;默认 view pan0 zoom1 = 页坐标)。 */
function dispatch(canvas: HTMLCanvasElement, type: string, x: number, y: number, extra: Record<string, unknown> = {}): void {
  canvas.dispatchEvent(
    new PointerEvent(type, {
      pointerId: 1,
      pointerType: 'mouse',
      bubbles: true,
      clientX: x,
      clientY: y,
      ...extra,
    }),
  )
}

/**
 * 模拟 RelationPanel.setRoute 的等价逻辑(web 层是 React,单测 adapter 时直接复刻
 * relation-panel.tsx line 119-133 的 batch+upsert:切 route + 默认 curve/elbow 数据)。
 * 这是症状 1/2/4 的「用户点 RelationPanel 按钮」在数据层的精确等价。
 */
function setRouteViaPanel(host: SelfBuiltAdapter, arrowId: string, route: 'straight' | 'curve' | 'elbow'): void {
  const arrow = host.getElement(arrowId)!
  const current = arrowRoute(arrow)
  if (route === current) return
  host.batch(() => {
    const { from, to } = arrowEndpoints(arrow, host.getElements())
    const patch: Partial<CanvasElement> = { route }
    if (from && to) {
      const midX = Math.round((from.x + to.x) / 2)
      const midY = Math.round((from.y + to.y) / 2)
      if (route === 'curve' && !arrow.curve) patch.curve = { cx: midX, cy: midY }
      else if (route === 'elbow' && (!arrow.elbow || arrow.elbow.length === 0))
        patch.elbow = [{ x: midX, y: midY }]
    }
    host.upsert({ ...arrow, ...patch })
  })
}

// ─────────────────────────────────────────────────────────────────────────────
// [症状 1] 弯曲箭头没办法用 — 选中 arrow → 切 curve → 拖中点手柄 → curve 应更新
// ─────────────────────────────────────────────────────────────────────────────
describe('[症状1] 弯曲箭头 — curve 手柄拖动', () => {
  it('显式 straight 箭头首次实际拖动后切为 curve,且只增加一步 undo', () => {
    const { host, canvas } = makeHost({
      selectArrow: true,
      arrow: { route: 'straight', curve: { cx: 200, cy: 10 } },
    })
    const before = (host as unknown as { undoStack: unknown[] }).undoStack.length
    dispatch(canvas, 'pointerdown', 200, 50)
    dispatch(canvas, 'pointermove', 200, 90)
    dispatch(canvas, 'pointerup', 200, 90)

    expect(host.getElement('ar')).toMatchObject({
      route: 'curve',
      curve: { cx: 200, cy: 130 },
    })
    expect((host as unknown as { undoStack: unknown[] }).undoStack.length - before).toBe(1)
  })

  it('curve/elbow handle 按下后原位松开不增加 undo', () => {
    for (const arrow of [
      { route: 'curve' as const, curve: { cx: 200, cy: 50 } },
      { route: 'elbow' as const, elbow: [{ x: 200, y: 50 }] },
    ]) {
      const { host, canvas } = makeHost({ selectArrow: true, arrow })
      const before = (host as unknown as { undoStack: unknown[] }).undoStack.length
      dispatch(canvas, 'pointerdown', 200, 50)
      dispatch(canvas, 'pointerup', 200, 50)
      expect((host as unknown as { undoStack: unknown[] }).undoStack.length).toBe(before)
    }
  })

  it('RelationPanel setRoute(curve) → arrow.route=curve + curve 默认中点数据', () => {
    const { host } = makeHost({ selectArrow: true })
    setRouteViaPanel(host, 'ar', 'curve')
    const el = host.getElement('ar')!
    expect(arrowRoute(el)).toBe('curve')
    // from=(100,50), to=(300,50) → 默认 curve 控制点在直线中点 (200,50)
    expect(el.curve).toEqual({ cx: 200, cy: 50 })
  })

  it('选中 curve arrow,pointerdown 命中贝塞尔中点手柄 → 进 curveDragging', () => {
    const { host, canvas } = makeHost({ arrow: { route: 'curve', curve: { cx: 200, cy: 50 } }, selectArrow: true })
    // 贝塞尔中点 = 0.25*100 + 0.5*200 + 0.25*300 = 200, y=50。手柄圆心在 (200,50)。
    dispatch(canvas, 'pointerdown', 200, 50)
    // 进 curveDragging 后,onUp 关闭 coalescing;只要没误进 dragGroup/panning 即可。
    // 间接验证:随后 pointermove 应改 curve(若进了别的分支,curve 不变)。
    dispatch(canvas, 'pointermove', 200, 90)
    dispatch(canvas, 'pointerup', 200, 90)
    const el = host.getElement('ar')!
    expect(arrowRoute(el)).toBe('curve')
    // 指针拖到 (200,90) = 想要的曲线中点 → 反算控制点 cx=2*200-(100+300)/2=200, cy=2*90-(50+50)/2=130
    expect(el.curve).toEqual({ cx: 200, cy: 130 })
  })

  it('拖 curve 手柄偏离(向上弯)→ curve.cy 正确(负方向)', () => {
    const { host, canvas } = makeHost({ arrow: { route: 'curve', curve: { cx: 200, cy: 50 } }, selectArrow: true })
    dispatch(canvas, 'pointerdown', 200, 50) // 命中手柄
    dispatch(canvas, 'pointermove', 200, 0) // 拖到 y=0(上弯)
    dispatch(canvas, 'pointerup', 200, 0)
    const el = host.getElement('ar')!
    // cy = 2*0 - (50+50)/2 = -50
    expect(el.curve!.cy).toBe(-50)
  })

  // ── 闹鬼 bug(2026-07-11 修):curve/elbow 手柄松手后必须清拖拽态。
  // 旧实现 onUp 不清 curveDragging/elbowDragging → 松手后任何无按键 hover 都让箭头跟
  // 光标弯/折 + 每次进 undo 栈(闹鬼 + 污染)。onCancel 对这俩走 onUp,一并覆盖。
  it('curve 手柄松手后 hover(无按键)不再 mutate arrow', () => {
    const { host, canvas } = makeHost({ arrow: { route: 'curve', curve: { cx: 200, cy: 50 } }, selectArrow: true })
    dispatch(canvas, 'pointerdown', 200, 50)
    dispatch(canvas, 'pointermove', 200, 90) // 拖 → 反算 cy=130
    dispatch(canvas, 'pointerup', 200, 90)
    expect(host.getElement('ar')!.curve).toEqual({ cx: 200, cy: 130 })
    // 松手后 hover 到 (200,40):旧实现 curve 跟到 cy=30(闹鬼);修后应纹丝不动。
    dispatch(canvas, 'pointermove', 200, 40, { buttons: 0 })
    expect(host.getElement('ar')!.curve).toEqual({ cx: 200, cy: 130 })
  })

  it('elbow 手柄松手后 hover(无按键)不再 mutate arrow', () => {
    const { host, canvas } = makeHost({ arrow: { route: 'elbow', elbow: [{ x: 200, y: 50 }] }, selectArrow: true })
    dispatch(canvas, 'pointerdown', 200, 50) // 命中折点手柄
    dispatch(canvas, 'pointermove', 220, 70) // 拖折点
    dispatch(canvas, 'pointerup', 220, 70)
    expect(host.getElement('ar')!.elbow!).toEqual([{ x: 220, y: 70 }])
    // 松手后 hover 到 (999,999):旧实现折点跟过去(闹鬼);修后应不动。
    dispatch(canvas, 'pointermove', 999, 999, { buttons: 0 })
    expect(host.getElement('ar')!.elbow!).toEqual([{ x: 220, y: 70 }])
  })

  it('从 straight arrow 拖中点手柄 → 自动转 curve(straight→curve 转换)', () => {
    // connect 创建的 arrow 无 route/curve → arrowRoute='straight'。拖中点应转 curve。
    const { host, canvas } = makeHost({ selectArrow: true })
    expect(arrowRoute(host.getElement('ar')!)).toBe('straight')
    // straight 中点手柄 = 直线中点 (200,50)
    dispatch(canvas, 'pointerdown', 200, 50)
    dispatch(canvas, 'pointermove', 200, 100)
    dispatch(canvas, 'pointerup', 200, 100)
    const el = host.getElement('ar')!
    expect(arrowRoute(el)).toBe('curve')
    expect(el.curve).toBeDefined()
  })

  it('curve 手柄命中容差:偏离手柄 5px(页)仍命中(<8px),偏离 12px 不命中', () => {
    // 偏 5px:进 curveDragging,move 后 curve 更新
    {
      const { host, canvas } = makeHost({ arrow: { route: 'curve', curve: { cx: 200, cy: 50 } }, selectArrow: true })
      dispatch(canvas, 'pointerdown', 200, 45) // 偏 5px
      dispatch(canvas, 'pointermove', 200, 90)
      dispatch(canvas, 'pointerup', 200, 90)
      expect(host.getElement('ar')!.curve!.cy).toBe(130) // 命中了 → 更新
    }
    // 偏 12px:不命中手柄 → 落到 hitTest 线段(直线中点 (200,50),y=45 距线 5px<6px tol 命中线)
    // → 进 dragGroup(arrow 已选中)→ pointermove 拖 arrow(无 curve 更新)。
    // 注意:8/zoom=8 > 6/zoom=6,手柄容差比线段容差大,故偏 12px 既不中手柄也可能不中线段。
    {
      const { host, canvas } = makeHost({ arrow: { route: 'curve', curve: { cx: 200, cy: 50 } }, selectArrow: true })
      dispatch(canvas, 'pointerdown', 200, 62) // 偏手柄 12px;距直线 12px>6px 也不中线段
      dispatch(canvas, 'pointermove', 200, 90)
      dispatch(canvas, 'pointerup', 200, 90)
      // 未命中手柄 → curve 不应被这次拖动改变(仍是初始 50)
      expect(host.getElement('ar')!.curve!.cy).toBe(50)
    }
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// [症状 2] 折线用不了 — 选中 arrow → 切 elbow → 拖折点手柄 / 双击加折点
// ─────────────────────────────────────────────────────────────────────────────
describe('[症状2] 折线箭头 — elbow 折点手柄拖动 + 双击加折点', () => {
  it('RelationPanel setRoute(elbow) → arrow.route=elbow + elbow 默认 1 折点(中点)', () => {
    const { host } = makeHost({ selectArrow: true })
    setRouteViaPanel(host, 'ar', 'elbow')
    const el = host.getElement('ar')!
    expect(arrowRoute(el)).toBe('elbow')
    expect(el.elbow).toEqual([{ x: 200, y: 50 }])
  })

  it('选中 elbow arrow,pointerdown 命中折点方块 → 进 elbowDragging → move 改折点', () => {
    const { host, canvas } = makeHost({ arrow: { route: 'elbow', elbow: [{ x: 200, y: 50 }] }, selectArrow: true })
    dispatch(canvas, 'pointerdown', 200, 50) // 命中折点(8px 容差)
    dispatch(canvas, 'pointermove', 250, 120) // 拖折点到 (250,120)
    dispatch(canvas, 'pointerup', 250, 120)
    const el = host.getElement('ar')!
    expect(arrowRoute(el)).toBe('elbow')
    expect(el.elbow).toEqual([{ x: 250, y: 120 }])
  })

  it('双击 elbow(1 折点)线段 → 加第 2 折点(doubleClickArrowAt)', () => {
    const { host } = makeHost({ arrow: { route: 'elbow', elbow: [{ x: 200, y: 50 }] }, selectArrow: true })
    // from=(100,50)→elbow(200,50)→to=(300,50);点 (250,52) 在第二段
    expect(host.doubleClickArrowAt({ x: 250, y: 52 })).toBe(true)
    const el = host.getElement('ar')!
    expect(el.route).toBe('elbow')
    expect(el.elbow).toHaveLength(2)
  })

  it('双击 elbow(2 折点已满)→ 重置 straight(不再加)', () => {
    const { host } = makeHost({ arrow: { route: 'elbow', elbow: [{ x: 200, y: 50 }] }, selectArrow: true })
    host.doubleClickArrowAt({ x: 250, y: 52 }) // 加到 2 折点
    expect(host.getElement('ar')!.elbow).toHaveLength(2)
    expect(host.doubleClickArrowAt({ x: 250, y: 52 })).toBe(true)
    expect(host.getElement('ar')!.route).toBe('straight')
  })

  it('选中 elbow arrow 拖折点:命中容差 8px(偏 5px 中,偏 12px 不中)', () => {
    {
      const { host, canvas } = makeHost({ arrow: { route: 'elbow', elbow: [{ x: 200, y: 50 }] }, selectArrow: true })
      dispatch(canvas, 'pointerdown', 205, 50) // 偏 5px
      dispatch(canvas, 'pointermove', 250, 120)
      dispatch(canvas, 'pointerup', 250, 120)
      expect(host.getElement('ar')!.elbow).toEqual([{ x: 250, y: 120 }]) // 命中 → 更新
    }
    {
      const { host, canvas } = makeHost({ arrow: { route: 'elbow', elbow: [{ x: 200, y: 50 }] }, selectArrow: true })
      dispatch(canvas, 'pointerdown', 212, 50) // 偏 12px(>8 不中手柄);但折点在线段上,12px>6px 线段容差也不中线
      dispatch(canvas, 'pointermove', 250, 120)
      dispatch(canvas, 'pointerup', 250, 120)
      expect(host.getElement('ar')!.elbow).toEqual([{ x: 200, y: 50 }]) // 未命中折点 → 不变
    }
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// [症状 3] 连接逻辑不对 — connect 工具 卡A → move → up 卡B → arrow from/to
// ─────────────────────────────────────────────────────────────────────────────
describe('[症状3] connect 工具 — 卡A→卡B 建箭头 + 端点解析', () => {
  it('connect: pointerdown 卡A → move → pointerup 卡B → arrow(from=a to=b)', () => {
    // makeHost 预置了一条 fixture ar(a→b);connect 应「再建一条」a→b。
    const { host, canvas } = makeHost()
    const before = host.getElements().filter((e) => e.kind === 'arrow').length
    ;(host as unknown as { setTool: (t: string) => void }).setTool('connect')
    dispatch(canvas, 'pointerdown', 50, 50) // 卡A 中心
    dispatch(canvas, 'pointermove', 350, 50) // 拖到卡B
    dispatch(canvas, 'pointerup', 350, 50) // 松在卡B
    const arrows = host.getElements().filter((e) => e.kind === 'arrow')
    expect(arrows.length).toBe(before + 1) // 新建了 1 条
    // 新建的(from a→b);排除 fixture ar
    const created = arrows.find((e) => e.id !== 'ar')!
    expect(created).toMatchObject({ from: 'a', to: 'b' })
  })

  it('connect 建的 arrow,arrowEndpoints 解析端点对(渲染/手柄都用它)', () => {
    const { host } = makeHost()
    const arrow = host.getElement('ar')!
    const { from, to } = arrowEndpoints(arrow, host.getElements())
    // 卡A(0,0,100,100)中心(50,50)→朝卡B(350,50):出口 (100,50)
    // 卡B(300,0,100,100)中心(350,50)→朝卡A(50,50):出口 (300,50)
    expect(from).toEqual({ x: 100, y: 50 })
    expect(to).toEqual({ x: 300, y: 50 })
  })

  it('connect 松手在空白 → 不建箭头(取消)', () => {
    const { host, canvas } = makeHost()
    ;(host as unknown as { setTool: (t: string) => void }).setTool('connect')
    dispatch(canvas, 'pointerdown', 50, 50)
    dispatch(canvas, 'pointermove', 500, 500)
    dispatch(canvas, 'pointerup', 500, 500)
    expect(host.getElements().filter((e) => e.kind === 'arrow')).toHaveLength(1) // fixture 里已有的 ar
  })

  it('connect from === to(松在同一卡)→ 不建箭头', () => {
    const { host, canvas } = makeHost()
    ;(host as unknown as { setTool: (t: string) => void }).setTool('connect')
    dispatch(canvas, 'pointerdown', 50, 50) // 卡A
    dispatch(canvas, 'pointermove', 60, 60) // 仍在卡A
    dispatch(canvas, 'pointerup', 60, 60) // 松在卡A(toId === fromId → 不建)
    expect(host.getElements().filter((e) => e.kind === 'arrow')).toHaveLength(1) // 仅 fixture 的 ar
  })

  it('connect down 在空白 → 不开连接(无 from)', () => {
    const { host, canvas } = makeHost()
    ;(host as unknown as { setTool: (t: string) => void }).setTool('connect')
    dispatch(canvas, 'pointerdown', 500, 500)
    dispatch(canvas, 'pointermove', 50, 50)
    dispatch(canvas, 'pointerup', 50, 50)
    expect(host.getElements().filter((e) => e.kind === 'arrow')).toHaveLength(1) // 仅 fixture 的 ar,没新建
  })

  it('connect 建箭头后:选中所建箭头,arrowEndpoints 仍正确(端点随卡移动)', () => {
    const { host, canvas } = makeHost()
    // 先删 fixture 的 ar,从干净状态 connect
    host.remove('ar')
    ;(host as unknown as { setTool: (t: string) => void }).setTool('connect')
    dispatch(canvas, 'pointerdown', 50, 50)
    dispatch(canvas, 'pointerup', 350, 50)
    const arrow = host.getElements().find((e) => e.kind === 'arrow')!
    expect(arrow).toMatchObject({ from: 'a', to: 'b' })
    // 移动卡B 到远处,端点应跟着变(端点是实时解析,非存储)
    host.upsert({ id: 'b', kind: 'card', x: 1000, y: 0, w: 100, h: 100, rotation: 0 })
    const { to } = arrowEndpoints(arrow, host.getElements())
    expect(to).toEqual({ x: 1000, y: 50 })
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// [症状 4] route 切换不生效 — setRoute 后 arrowRoute() 返回 + 渲染分支数据
// ─────────────────────────────────────────────────────────────────────────────
describe('[症状4] route 切换 — arrowRoute 返回 + 字段联动', () => {
  it('straight → curve:setRoute 后 arrowRoute=curve + curve 数据设', () => {
    const { host } = makeHost({ selectArrow: true })
    setRouteViaPanel(host, 'ar', 'curve')
    const el = host.getElement('ar')!
    expect(arrowRoute(el)).toBe('curve')
    expect(el.curve).toBeDefined()
  })

  it('straight → elbow:setRoute 后 arrowRoute=elbow + elbow 数据设', () => {
    const { host } = makeHost({ selectArrow: true })
    setRouteViaPanel(host, 'ar', 'elbow')
    const el = host.getElement('ar')!
    expect(arrowRoute(el)).toBe('elbow')
    expect(el.elbow).toBeDefined()
    expect(el.elbow!.length).toBeGreaterThan(0)
  })

  it('curve → elbow:切换后 route=elbow,旧 curve 数据保留(便于切回)', () => {
    const { host } = makeHost({ arrow: { route: 'curve', curve: { cx: 200, cy: -50 } }, selectArrow: true })
    setRouteViaPanel(host, 'ar', 'elbow')
    const el = host.getElement('ar')!
    expect(arrowRoute(el)).toBe('elbow')
    expect(el.elbow).toBeDefined()
    // curve 数据保留(relation-panel setRoute 只 patch route + elbow,不清 curve)
    expect(el.curve).toEqual({ cx: 200, cy: -50 })
  })

  it('elbow → curve:切换后 route=curve,旧 elbow 数据保留', () => {
    const { host } = makeHost({ arrow: { route: 'elbow', elbow: [{ x: 200, y: 50 }] }, selectArrow: true })
    setRouteViaPanel(host, 'ar', 'curve')
    const el = host.getElement('ar')!
    expect(arrowRoute(el)).toBe('curve')
    expect(el.curve).toBeDefined()
    expect(el.elbow).toEqual([{ x: 200, y: 50 }]) // 保留
  })

  it('setRoute 同 route 不重复 upsert(幂等,防多余 undo 步)', () => {
    // 幂等判定:setRoute(curve) 在已是 curve 时不 upsert → undo 一次应回到「切 curve 之前」
    // (若误 upsert,undo 会撤销这个 no-op,route 仍 curve;若幂等,undo 撤的是 fixture upsert)。
    const { host } = makeHost({ arrow: { route: 'straight' }, selectArrow: true })
    // 先正式切一次 curve(产生 1 undo 步)
    setRouteViaPanel(host, 'ar', 'curve')
    expect(arrowRoute(host.getElement('ar')!)).toBe('curve')
    // 再切 curve(同 route → 幂等,不应产生新 undo 步)
    setRouteViaPanel(host, 'ar', 'curve')
    // undo 一次:应回到 straight(撤的是「正式切 curve」那步);若幂等失败多推了一步,则仍是 curve
    ;(host as unknown as { undo: () => void }).undo()
    expect(arrowRoute(host.getElement('ar')!)).toBe('straight')
  })

  it('route 字段缺省(旧 arrow)→ arrowRoute 看 curve/elbow 反推兼容', () => {
    // 旧 arrow 无 route 但有 curve → arrowRoute 应返 curve(向后兼容)
    const { host } = makeHost({ arrow: { curve: { cx: 200, cy: -50 } } }) // 无 route
    expect(arrowRoute(host.getElement('ar')!)).toBe('curve')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// [集成边界] 怀疑点定向验证 — 这些是「全部坏掉」的系统性回归候选
// ─────────────────────────────────────────────────────────────────────────────
describe('[边界] 系统性回归候选 — 多箭头/选区/工具切换/z序', () => {
  it('多箭头共存:hitTest 选中最上层(z 序末尾),不串扰 from/to', () => {
    const host = new SelfBuiltAdapter(document.createElement('canvas'))
    host.upsert({ id: 'a', kind: 'card', x: 0, y: 0, w: 100, h: 100, rotation: 0 })
    host.upsert({ id: 'b', kind: 'card', x: 300, y: 0, w: 100, h: 100, rotation: 0 })
    host.upsert({ id: 'c', kind: 'card', x: 600, y: 0, w: 100, h: 100, rotation: 0 })
    // ar1: a→b curve,控制点 (200,-50)。贝塞尔 t=0.5 点 = (200, 0)(曲线向上弯)。
    host.upsert({ id: 'ar1', kind: 'arrow', x: 0, y: 0, w: 0, h: 0, rotation: 0, from: 'a', to: 'b', route: 'curve', curve: { cx: 200, cy: -50 } })
    host.upsert({ id: 'ar2', kind: 'arrow', x: 0, y: 0, w: 0, h: 0, rotation: 0, from: 'b', to: 'c', route: 'elbow', elbow: [{ x: 500, y: 50 }] })
    // 点 ar1 曲线上的真实点 (200, 0)
    const canvas = (host as unknown as { canvas: HTMLCanvasElement }).canvas
    dispatch(canvas, 'pointerdown', 200, 0)
    expect((host as unknown as { getSelectedIds: () => string[] }).getSelectedIds()).toEqual(['ar1'])
    // 验证 ar1 的端点解析仍指向 a/b(不被 ar2 串扰)
    const { from, to } = arrowEndpoints(host.getElement('ar1')!, host.getElements())
    expect(from).toEqual({ x: 100, y: 50 })
    expect(to).toEqual({ x: 300, y: 50 })
  })

  it('工具切换清交互态:connect 中途切 select 不留幽灵 connecting(R1.5)', () => {
    const { host, canvas } = makeHost()
    ;(host as unknown as { setTool: (t: string) => void }).setTool('connect')
    dispatch(canvas, 'pointerdown', 50, 50) // 卡A 开 connecting
    dispatch(canvas, 'pointermove', 350, 50) // 拖到卡B
    ;(host as unknown as { setTool: (t: string) => void }).setTool('select') // 切回 select
    dispatch(canvas, 'pointermove', 350, 50) // 陈旧 move
    dispatch(canvas, 'pointerup', 350, 50) // 陈旧 up
    expect(host.getElements().filter((e) => e.kind === 'arrow')).toHaveLength(1) // 仅 fixture ar,无幽灵
  })

  it('选中箭头后切 connect 工具:不影响已选箭头的 route 数据', () => {
    const { host } = makeHost({ arrow: { route: 'curve', curve: { cx: 200, cy: -50 } }, selectArrow: true })
    ;(host as unknown as { setTool: (t: string) => void }).setTool('connect')
    // setTool 清交互态但不清元素数据
    const el = host.getElement('ar')!
    expect(arrowRoute(el)).toBe('curve')
    expect(el.curve).toEqual({ cx: 200, cy: -50 })
  })

  it('undo 回滚 setRoute:切到 curve 再 undo → route 回 straight', () => {
    const { host } = makeHost({ selectArrow: true })
    setRouteViaPanel(host, 'ar', 'curve')
    expect(arrowRoute(host.getElement('ar')!)).toBe('curve')
    ;(host as unknown as { undo: () => void }).undo()
    expect(arrowRoute(host.getElement('ar')!)).toBe('straight')
  })

  it('elbow 自动绕障(空 elbow):arrowRoute=elbow 但无手设折点 → 渲染走 autoElbowPath(数据层无 crash)', () => {
    // 直接 upsert 一个 route=elbow 但 elbow 空的 arrow(模拟 DSL/AI 导入或异常态)
    const { host } = makeHost({ arrow: { route: 'elbow' } }) // elbow undefined
    const el = host.getElement('ar')!
    expect(arrowRoute(el)).toBe('elbow')
    // 端点解析 + 自动绕障不应 crash(渲染层走 autoElbowPath,这里只验数据可读)
    const { from, to } = arrowEndpoints(el, host.getElements())
    expect(from).toEqual({ x: 100, y: 50 })
    expect(to).toEqual({ x: 300, y: 50 })
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// [手柄命中 vs 线段命中] 关键交互边界 — 决定「拖手柄」vs「拖整条线」
// ─────────────────────────────────────────────────────────────────────────────
describe('[边界] 手柄命中 vs 线段命中 — 拖手柄不误触为拖线', () => {
  it('curve 手柄(中点)同时在线段上:pointerdown 中点应优先 curveDragging 而非 dragGroup', () => {
    // curve 中点手柄 = 贝塞尔 t=0.5;若 curve.cx 在 from-to 中线(y=50)上,手柄恰在线段。
    // onDown 应先匹配手柄(8px)再 fallback 到 hitTest 线段(6px)。验:拖动后 curve 更新而非 arrow 平移。
    const { host, canvas } = makeHost({ arrow: { route: 'curve', curve: { cx: 200, cy: 50 } }, selectArrow: true })
    dispatch(canvas, 'pointerdown', 200, 50) // 手柄圆心,也在曲线上
    dispatch(canvas, 'pointermove', 200, 100) // 拖
    dispatch(canvas, 'pointerup', 200, 100)
    const el = host.getElement('ar')!
    // cy = 2*p.y - (from.y+to.y)/2 = 2*100 - (50+50)/2 = 200-50 = 150
    expect(el.curve!.cy).toBe(150) // 命中手柄 → 更新;若误进 dragGroup → curve 不变(仍 50)
  })

  it('elbow 折点恰在线段上:pointerdown 折点应优先 elbowDragging 而非 dragGroup', () => {
    const { host, canvas } = makeHost({ arrow: { route: 'elbow', elbow: [{ x: 200, y: 50 }] }, selectArrow: true })
    dispatch(canvas, 'pointerdown', 200, 50) // 折点,也在折线上
    dispatch(canvas, 'pointermove', 250, 120)
    dispatch(canvas, 'pointerup', 250, 120)
    expect(host.getElement('ar')!.elbow).toEqual([{ x: 250, y: 120 }]) // 命中折点 → 更新
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// [渲染路径] 用 mock ctx 验证 arrow 渲染分支选对路径 + 手柄画对
// adapter.ctx 在 jsdom 为 null(renderNow 跳过),但 renderElements/drawSelectionOutlines
// 是纯函数,可直接喂 mock ctx 验「渲染层是否按 route 选对 quadraticCurveTo / lineTo× / 直线」+
// 「选中手柄画在中点(圆点)还是折点(方块)」。这桥接「数据对」与「画出来对」。
// ─────────────────────────────────────────────────────────────────────────────
import { renderElements, drawSelectionOutlines } from '../self-built-render'
import type { CanvasView } from '../canvas-host'

function mockCtx(): CanvasRenderingContext2D & { _calls: string[] } {
  const calls: string[] = []
  const ctx = {
    _calls: calls,
    save: () => calls.push('save'),
    restore: () => calls.push('restore'),
    translate: (x: number, y: number) => calls.push(`translate(${x},${y})`),
    scale: (x: number) => calls.push(`scale(${x})`),
    beginPath: () => calls.push('beginPath'),
    closePath: () => calls.push('closePath'),
    quadraticCurveTo: (cx: number, cy: number, x: number, y: number) =>
      calls.push(`quadraticCurveTo(${cx},${cy},${x},${y})`),
    rect: (x: number, y: number, w: number, h: number) => calls.push(`rect(${x},${y},${w},${h})`),
    moveTo: (x: number, y: number) => calls.push(`moveTo(${x},${y})`),
    lineTo: (x: number, y: number) => calls.push(`lineTo(${x},${y})`),
    arc: (x: number, y: number, r: number) => calls.push(`arc(${x},${y})`),
    setLineDash: () => calls.push('setLineDash'),
    strokeRect: (x: number, y: number, w: number, h: number) => calls.push(`strokeRect(${x},${y},${w},${h})`),
    roundRect: () => calls.push('roundRect'),
    fill: () => calls.push('fill'),
    fillRect: (x: number, y: number, w: number, h: number) => calls.push(`fillRect(${x},${y},${w},${h})`),
    stroke: () => calls.push('stroke'),
    fillText: () => calls.push('fillText'),
    set fillStyle(v: unknown) { calls.push(`fillStyle=${v}`) },
    set strokeStyle(v: unknown) { calls.push(`strokeStyle=${v}`) },
    set font(v: string) { calls.push('font') },
    set lineWidth(v: unknown) { calls.push(`lineWidth=${v}`) },
    set globalAlpha(v: unknown) { calls.push(`globalAlpha=${v}`) },
    clearRect: () => calls.push('clearRect'),
    measureText: (s: string) => ({ width: s.length * 7 }),
  }
  return ctx as unknown as CanvasRenderingContext2D & { _calls: string[] }
}

describe('[渲染路径] arrow 渲染分支 — straight/curve/elbow 选对路径命令', () => {
  const view: CanvasView = { panX: 0, panY: 0, zoom: 1, gridMode: 'free' }
  const cards: CanvasElement[] = [
    { id: 'a', kind: 'card', x: 0, y: 0, w: 100, h: 100, rotation: 0 },
    { id: 'b', kind: 'card', x: 300, y: 0, w: 100, h: 100, rotation: 0 },
  ]

  it('straight arrow → moveTo + 单个 lineTo(直线,无 quadraticCurveTo)', () => {
    const ctx = mockCtx()
    const els: CanvasElement[] = [...cards, { id: 'ar', kind: 'arrow', x: 0, y: 0, w: 0, h: 0, rotation: 0, from: 'a', to: 'b', color: 'black' }]
    renderElements(ctx, els, view, 800, 600, () => null, '#fff')
    const lineTos = ctx._calls.filter((c) => c.startsWith('lineTo'))
    const quads = ctx._calls.filter((c) => c.startsWith('quadraticCurveTo'))
    expect(ctx._calls).toContain('moveTo(100,50)')
    expect(lineTos).toContain('lineTo(300,50)') // 直接到终点
    expect(quads).toHaveLength(0) // straight 不走贝塞尔
  })

  it('curve arrow → quadraticCurveTo(用 curve 控制点)', () => {
    const ctx = mockCtx()
    const els: CanvasElement[] = [...cards, { id: 'ar', kind: 'arrow', x: 0, y: 0, w: 0, h: 0, rotation: 0, from: 'a', to: 'b', route: 'curve', curve: { cx: 200, cy: -50 }, color: 'black' }]
    renderElements(ctx, els, view, 800, 600, () => null, '#fff')
    const quads = ctx._calls.filter((c) => c.startsWith('quadraticCurveTo'))
    expect(ctx._calls).toContain('moveTo(100,50)')
    expect(quads).toEqual(['quadraticCurveTo(200,-50,300,50)']) // 控制点 (200,-50) → 终点 (300,50)
  })

  it('curve arrow 但 route=straight(curve 数据保留但 route 指直线)→ 仍走直线', () => {
    const ctx = mockCtx()
    const els: CanvasElement[] = [...cards, { id: 'ar', kind: 'arrow', x: 0, y: 0, w: 0, h: 0, rotation: 0, from: 'a', to: 'b', route: 'straight', curve: { cx: 200, cy: -50 }, color: 'black' }]
    renderElements(ctx, els, view, 800, 600, () => null, '#fff')
    const quads = ctx._calls.filter((c) => c.startsWith('quadraticCurveTo'))
    expect(quads).toHaveLength(0) // route=straight 优先,忽略 curve 数据
    expect(ctx._calls).toContain('lineTo(300,50)')
  })

  it('elbow arrow(手设 1 折点)→ moveTo + 折点 lineTo + 终点 lineTo', () => {
    const ctx = mockCtx()
    const els: CanvasElement[] = [...cards, { id: 'ar', kind: 'arrow', x: 0, y: 0, w: 0, h: 0, rotation: 0, from: 'a', to: 'b', route: 'elbow', elbow: [{ x: 200, y: 120 }], color: 'black' }]
    renderElements(ctx, els, view, 800, 600, () => null, '#fff')
    const lineTos = ctx._calls.filter((c) => c.startsWith('lineTo'))
    expect(ctx._calls).toContain('moveTo(100,50)')
    expect(lineTos).toContain('lineTo(200,120)') // 折点
    expect(lineTos).toContain('lineTo(300,50)') // 终点
  })

  it('elbow arrow(空折点)→ autoElbowPath 自动 L 形绕障', () => {
    const ctx = mockCtx()
    const els: CanvasElement[] = [...cards, { id: 'ar', kind: 'arrow', x: 0, y: 0, w: 0, h: 0, rotation: 0, from: 'a', to: 'b', route: 'elbow', color: 'black' }]
    renderElements(ctx, els, view, 800, 600, () => null, '#fff')
    // autoElbowPath H-first: from(100,50)→(to.x=300, from.y=50)→to(300,50)。折点 (300,50)=to,
    // 故 lineTo 至少含 (300,50);moveTo(100,50)。
    expect(ctx._calls).toContain('moveTo(100,50)')
    const lineTos = ctx._calls.filter((c) => c.startsWith('lineTo'))
    expect(lineTos.length).toBeGreaterThanOrEqual(1)
  })
})

describe('[渲染路径] 选中手柄 — drawSelectionOutlines 画对 handle', () => {
  const view: CanvasView = { panX: 0, panY: 0, zoom: 1, gridMode: 'free' }
  const cards: CanvasElement[] = [
    { id: 'a', kind: 'card', x: 0, y: 0, w: 100, h: 100, rotation: 0 },
    { id: 'b', kind: 'card', x: 300, y: 0, w: 100, h: 100, rotation: 0 },
  ]

  it('curve arrow 选中 → 画 1 个圆点手柄(arc)在贝塞尔中点,无方块 strokeRect handle', () => {
    const ctx = mockCtx()
    const els: CanvasElement[] = [...cards, { id: 'ar', kind: 'arrow', x: 0, y: 0, w: 0, h: 0, rotation: 0, from: 'a', to: 'b', route: 'curve', curve: { cx: 200, cy: -50 }, color: 'black' }]
    drawSelectionOutlines(ctx, ['ar'], els, view)
    const arcs = ctx._calls.filter((c) => c.startsWith('arc'))
    // 贝塞尔中点 = 0.25*100+0.5*200+0.25*300=200, y=0.25*50+0.5*(-50)+0.25*50=0
    expect(arcs).toContain('arc(200,0)')
    // 不该有 strokeRect handle(那是 bbox 角 handle,箭头不画)
    const strokeRects = ctx._calls.filter((c) => c.startsWith('strokeRect'))
    expect(strokeRects).toHaveLength(0)
  })

  it('straight arrow 选中 → 画中点圆点手柄(提示可拖出 curve)', () => {
    const ctx = mockCtx()
    const els: CanvasElement[] = [...cards, { id: 'ar', kind: 'arrow', x: 0, y: 0, w: 0, h: 0, rotation: 0, from: 'a', to: 'b', color: 'black' }]
    drawSelectionOutlines(ctx, ['ar'], els, view)
    const arcs = ctx._calls.filter((c) => c.startsWith('arc'))
    // 直线中点 = (200,50)
    expect(arcs).toContain('arc(200,50)')
  })

  it('elbow arrow 选中(2 折点)→ 画 2 个方块 handle(fillRect 在折点),无 arc', () => {
    const ctx = mockCtx()
    const els: CanvasElement[] = [...cards, { id: 'ar', kind: 'arrow', x: 0, y: 0, w: 0, h: 0, rotation: 0, from: 'a', to: 'b', route: 'elbow', elbow: [{ x: 200, y: 120 }, { x: 250, y: 80 }], color: 'black' }]
    drawSelectionOutlines(ctx, ['ar'], els, view)
    const arcs = ctx._calls.filter((c) => c.startsWith('arc'))
    const fillRects = ctx._calls.filter((c) => c.startsWith('fillRect'))
    expect(arcs).toHaveLength(0) // elbow 不画圆点
    // 2 个折点方块(每折点 1 个 fillRect,handle 半边 3px → 从 (x-3,y-3) 起 6x6)
    expect(fillRects.some((c) => c.startsWith('fillRect(197,117,6,6)'))).toBe(true) // (200,120)
    expect(fillRects.some((c) => c.startsWith('fillRect(247,77,6,6)'))).toBe(true) // (250,80)
  })

  it('elbow arrow 空折点(自动绕障)选中 → 不画任何折点 handle(无可拖折点)', () => {
    const ctx = mockCtx()
    const els: CanvasElement[] = [...cards, { id: 'ar', kind: 'arrow', x: 0, y: 0, w: 0, h: 0, rotation: 0, from: 'a', to: 'b', route: 'elbow', color: 'black' }]
    drawSelectionOutlines(ctx, ['ar'], els, view)
    const fillRects = ctx._calls.filter((c) => c.startsWith('fillRect'))
    const arcs = ctx._calls.filter((c) => c.startsWith('arc'))
    // 空 elbow:drawSelectionOutlines 的 elbow 分支 for(elbow??[]) 无迭代 → 无 handle
    expect(fillRects).toHaveLength(0)
    expect(arcs).toHaveLength(0)
  })
})
