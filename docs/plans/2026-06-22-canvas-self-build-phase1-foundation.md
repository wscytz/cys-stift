# 画布自研 · Phase 1 实现计划(基础骨架 — SelfBuiltAdapter Canvas 2D 渲染器)

> **For agentic workers:** REQUIRED SUB-SKILL: 用 superpowers:subagent-driven-development(推荐)或 superpowers:executing-plans 逐 Task 执行。步骤用 `- [ ]` 跟踪。

**Goal:** 建一个 Canvas 2D 的 `SelfBuiltAdapter`(实现 Phase 0 已上线的 `CanvasHost` 接口),能在 `/dev/canvas-self` 上渲染卡片、拖拽、pan/zoom,与 tldraw 主画布**并存**(feature-flag,不碰主路由),证明自研渲染器架构端到端可行。

**Architecture:** `SelfBuiltAdapter implements CanvasHost` —— 和 `TldrawAdapter` 是同一接口的两个实现。Phase 0 的 `canvas-binding.ts`(loadCardsIntoEditor / bindCardWriteback / syncCardsToEditor)**完全复用**,因为它只依赖 `CanvasHost`:卡片从 CardService 加载进 adapter、用户拖拽经 `onUserChange` 回写。渲染层是 Canvas 2D(参考 Excalidraw/BlockSuite),自己管元素存储 + 渲染循环 + 相机 + 命中测试 + 指针交互。**不 import tldraw**。

**Tech Stack:** TypeScript strict、Canvas 2D API、requestAnimationFrame、vitest(单测)、puppeteer-core(/dev 冒烟)、@cys-stift/domain(零依赖,不碰)、@cys-stift/ui token(包豪斯,不写死 hex)。

## Global Constraints(每个 Task implicitly 必守)

- spec `docs/specs/2026-06-19-cys-stift-design.md` 冻结——Phase 1 不改 spec 一字;feature-flag 只在 `/dev/*`,**不碰主路由 `/canvas`**。
- `packages/domain` 零依赖不破坏——`SelfBuiltAdapter` 放 `apps/web`。
- 颜色/字体走 token(`var(--color-*)` / `var(--font-*)`),不写死 hex。Canvas 2D 用 `getComputedStyle(document.documentElement).getPropertyValue('--color-...')` 取 token。
- `SelfBuiltAdapter` **零 tldraw import**(它是 tldraw 的替代,不是包装)。
- 静态导出(`output:'export'`)——`/dev/canvas-self` 是静态路由(无 query param,避免 `useSearchParams` 在静态导出下的坑);客户端组件标 `'use client'`。
- 不假装 build/test 通过——每步跑命令看 exit code。
- 每步 TDD:先写测试(红)→ 实现 → 测试绿 → commit。每 Task 完成自审 + 用户 review 才进下一 Task。
- jsdom(vitest)不实现 Canvas 2D(`getContext('2d')` 返回 null)——adapter 必须对 `ctx === null` 容错(渲染跳过,host 语义照常),这样契约测试能在 jsdom 跑。

## File Structure(Phase 1 基础骨架)

**新增:**
- `apps/web/src/features/canvas/host/self-built-adapter.ts` — `SelfBuiltAdapter implements CanvasHost`(元素存储 + 事件 + 相机 + 指针 + 渲染调度)。**零 tldraw**。
- `apps/web/src/features/canvas/host/self-built-render.ts` — 纯渲染函数 `renderElements(ctx, elements, view, getCardLabel)`(可单测渲染逻辑,不挂 DOM)。
- `apps/web/src/features/canvas/host/__tests__/self-built-adapter.test.ts` — host 语义 + 命中测试 + 拖拽单测。
- `apps/web/src/features/canvas/host/__tests__/self-built-render.test.ts` — 渲染调用序列单测(用 mock ctx 断言绘制调用)。
- `apps/web/src/app/dev/canvas-self/page.tsx` — feature-flag 挂载页(构造 SelfBuiltAdapter + 复用 canvas-binding)。
- `scripts/phase1-smoke.cjs` — /dev/canvas-self 真实冒烟 e2e(渲染/拖拽回写/pan-zoom)。

**修改:**
- `apps/web/src/features/canvas/host/__tests__/canvas-host.contract.test.ts` — 加 `runContract('SelfBuiltAdapter', ...)`,同一套契约。

---

## Task 1:SelfBuiltAdapter 骨架(host 接口 + 元素存储 + 事件)

**目标:** 实现 `CanvasHost` 的数据/事件语义(不含渲染),过同一套契约测试。语义与 `InMemoryCanvasHost` 一致(它是参考实现)。

**Files:**
- Create: `apps/web/src/features/canvas/host/self-built-adapter.ts`
- Modify: `apps/web/src/features/canvas/host/__tests__/canvas-host.contract.test.ts`

**Interfaces:**
- Consumes: `CanvasHost` / `CanvasElement` / `CanvasView` / `UserChange`(Phase 0 已定义,签名见 `canvas-host.ts`)。
- Produces: `SelfBuiltAdapter` 类(`new SelfBuiltAdapter(canvasEl, opts?)`),供 Task 2-5 用。

**必守约束:** 零 tldraw import;`ctx===null` 容错;`upsert/remove` 在 `applyWithoutEcho` 下不触发 `onUserChange`(回写循环抑制)。

- [ ] **Step 1.1:在契约测试里注册 SelfBuiltAdapter(先红)**

修改 `canvas-host.contract.test.ts`,在文件顶部 import 后、底部 `runContract('InMemoryCanvasHost', ...)` 旁加一行:

```ts
import { SelfBuiltAdapter } from '../self-built-adapter'
// …
// 文件末尾:
runContract('SelfBuiltAdapter', () => new SelfBuiltAdapter(document.createElement('canvas')))
```

- [ ] **Step 1.2:跑契约测试,确认 SelfBuiltAdapter 那 6 项全红**

Run: `cd apps/web && pnpm exec vitest run src/features/canvas/host/__tests__/canvas-host.contract.test.ts`
Expected: FAIL — `SelfBuiltAdapter is not exported`(模块还没建)。

- [ ] **Step 1.3:写 `self-built-adapter.ts`(host 语义,无渲染)**

```ts
// apps/web/src/features/canvas/host/self-built-adapter.ts
'use client'

import type {
  CanvasElement,
  CanvasHost,
  CanvasView,
  UserChange,
} from './canvas-host'

/**
 * SelfBuiltAdapter — CanvasHost 的自研 Canvas 2D 实现(Phase 1)。
 *
 * 和 TldrawAdapter 是同一接口的两个实现;canvas-binding 只依赖 CanvasHost,
 * 所以卡片加载/回写/同步逻辑完全复用。本 Task 只实现数据 + 事件语义
 * (与 InMemoryCanvasHost 一致);渲染/交互在 Task 2-4 加。
 *
 * 零 tldraw import。jsdom 下 ctx===null,渲染相关调用静默跳过(host 语义照常)。
 */
export class SelfBuiltAdapter implements CanvasHost {
  private elements = new Map<string, CanvasElement>()
  private view: CanvasView = { panX: 0, panY: 0, zoom: 1, gridMode: 'free' }
  private userListeners = new Set<(c: UserChange) => void>()
  protected echoing = true
  protected ctx: CanvasRenderingContext2D | null

  constructor(canvas: HTMLCanvasElement) {
    this.ctx = canvas.getContext('2d')
  }

  getElements(): CanvasElement[] {
    return [...this.elements.values()]
  }

  getElement(id: string): CanvasElement | undefined {
    return this.elements.get(id)
  }

  upsert(el: CanvasElement): void {
    this.elements.set(el.id, el)
    if (this.echoing) this.emitUser({ updated: [el], removed: [] })
  }

  remove(id: string): void {
    if (!this.elements.has(id)) return
    this.elements.delete(id)
    if (this.echoing) this.emitUser({ updated: [], removed: [id] })
  }

  batch(fn: () => void): void {
    fn // TODO(Phase 1 后续):undo 分组
  }

  applyWithoutEcho(fn: () => void): void {
    const prev = this.echoing
    this.echoing = false
    try {
      fn()
    } finally {
      this.echoing = prev
    }
  }

  onUserChange(cb: (c: UserChange) => void): () => void {
    this.userListeners.add(cb)
    return () => {
      this.userListeners.delete(cb)
    }
  }

  getView(): CanvasView {
    return { ...this.view }
  }

  setView(v: CanvasView): void {
    this.view = { ...v }
  }

  protected emitUser(c: UserChange): void {
    for (const l of this.userListeners) l(c)
  }

  /** 供子类/Task 2-4 读取相机。 */
  protected getViewInternal(): CanvasView {
    return this.view
  }
}
```

- [ ] **Step 1.4:跑契约测试,确认 SelfBuiltAdapter 6 项全绿**

Run: `cd apps/web && pnpm exec vitest run src/features/canvas/host/__tests__/canvas-host.contract.test.ts`
Expected: PASS — 12 项(InMemoryCanvasHost 6 + SelfBuiltAdapter 6)。

- [ ] **Step 1.5:tsc + build,确认零退化**

Run: `pnpm --filter web build`
Expected: exit 0。

- [ ] **Step 1.6:Commit**

```bash
git add apps/web/src/features/canvas/host/
git commit -m "feat(canvas): Phase 1 T1.1 — SelfBuiltAdapter 骨架(实现 CanvasHost,过契约测试)"
```

**Task 1 验收:** 契约测试 12 项全绿;`self-built-adapter.ts` grep 不到 `@tldraw`;build exit 0。→ 自审 + 用户 review。

---

## Task 2:渲染函数 + 渲染循环(卡片 + 矩形,相机变换)

**目标:** 把元素画到 Canvas 2D 上,带 pan/zoom 相机变换。渲染逻辑拆成纯函数 `renderElements`(可单测)。

**Files:**
- Create: `apps/web/src/features/canvas/host/self-built-render.ts`
- Create: `apps/web/src/features/canvas/host/__tests__/self-built-render.test.ts`
- Modify: `apps/web/src/features/canvas/host/self-built-adapter.ts`(加渲染调度)

**Interfaces:**
- Consumes: Task 1 的 `SelfBuiltAdapter`、`CanvasElement`、`CanvasView`。
- Produces: `renderElements(ctx, elements, view, getCardLabel)`;`SelfBuiltAdapter` 新增 `protected scheduleRender()` 与 `protected renderNow()`;`new SelfBuiltAdapter(canvas, { getCardLabel })`。

**必守约束:** 颜色/字体走 token(`readToken('--color-white')` 等 helper);`ctx===null` 时 `renderNow` 直接 return;DPI(devicePixelRatio)处理清晰。

- [ ] **Step 2.1:写渲染函数的失败测试(mock ctx,断言绘制序列)**

```ts
// apps/web/src/features/canvas/host/__tests__/self-built-render.test.ts
import { describe, expect, it, vi } from 'vitest'
import { renderElements } from '../self-built-render'
import type { CanvasElement, CanvasView } from '../canvas-host'

/** mock CanvasRenderingContext2D:记录所有方法调用。 */
function mockCtx() {
  const calls: string[] = []
  const ctx = {
    _calls: calls,
    save: () => calls.push('save'),
    restore: () => calls.push('restore'),
    translate: (x: number, y: number) => calls.push(`translate(${x},${y})`),
    scale: (x: number, y: number) => calls.push(`scale(${x})`),
    beginPath: () => calls.push('beginPath'),
    rect: (x: number, y: number, w: number, h: number) => calls.push(`rect(${x},${y},${w},${h})`),
    roundRect: (x: number, y: number, w: number, h: number, r?: number) => calls.push(`roundRect(${x},${y},${w},${h})`),
    fill: () => calls.push('fill'),
    fillRect: (x: number, y: number, w: number, h: number) => calls.push(`fillRect(${x},${y},${w},${h})`),
    stroke: () => calls.push('stroke'),
    fillText: (t: string, x: number, y: number) => calls.push(`fillText(${t}@${x},${y})`),
    set fillStyle(v: unknown) { calls.push(`fillStyle=${v}`) },
    set strokeStyle(v: unknown) { calls.push(`strokeStyle=${v}`) },
    set font(v: string) { calls.push(`font=${v}`) },
    clearRect: (x: number, y: number, w: number, h: number) => calls.push(`clearRect(${x},${y},${w},${h})`),
  }
  return ctx as unknown as CanvasRenderingContext2D & { _calls: string[] }
}

describe('renderElements', () => {
  const view: CanvasView = { panX: 10, panY: 20, zoom: 2, gridMode: 'free' }

  it('applies the camera transform (translate + scale) around the draw', () => {
    const ctx = mockCtx()
    renderElements(ctx, [], view, 800, 600, () => '', '#0f172a')
    expect(ctx._calls).toContain('clearRect(0,0,800,600)')
    expect(ctx._calls).toContain('save')
    expect(ctx._calls).toContain('translate(10,20)')
    expect(ctx._calls).toContain('scale(2)')
    expect(ctx._calls).toContain('restore')
  })

  it('draws a card (rounded rect + label) and a rect', () => {
    const ctx = mockCtx()
    const els: CanvasElement[] = [
      { id: 'c1', kind: 'card', x: 100, y: 50, w: 240, h: 120, rotation: 0 },
      { id: 'r1', kind: 'rect', x: 0, y: 0, w: 50, h: 30, rotation: 0, color: 'blue' },
    ]
    renderElements(ctx, els, view, 800, 600, (id) => (id === 'c1' ? 'Title' : ''), '#0f172a')
    expect(ctx._calls.some((c) => c.startsWith('roundRect(100,50,240,120)'))).toBe(true)
    expect(ctx._calls).toContain('fillText(Title@110,70)')
    expect(ctx._calls.some((c) => c.startsWith('rect(0,0,50,30)'))).toBe(true)
  })

  it('skips unknown kinds without throwing', () => {
    const ctx = mockCtx()
    const els = [{ id: 'x', kind: 'freedraw', x: 0, y: 0, w: 0, h: 0, rotation: 0 }] as CanvasElement[]
    expect(() => renderElements(ctx, els, view, 800, 600, () => '', '#0f172a')).not.toThrow()
  })
})
```

- [ ] **Step 2.2:跑测试,确认红**

Run: `cd apps/web && pnpm exec vitest run src/features/canvas/host/__tests__/self-built-render.test.ts`
Expected: FAIL — `renderElements is not exported`。

- [ ] **Step 2.3:写 `self-built-render.ts`**

```ts
// apps/web/src/features/canvas/host/self-built-render.ts
'use client'

import type { CanvasElement, CanvasView } from './canvas-host'

/**
 * 纯渲染函数:把元素画到 ctx 上,带相机(pan/zoom)变换。
 * - 先 clearRect 整个画布(背景色)。
 * - save → translate(panX,panY) → scale(zoom) → 画元素 → restore。
 * - card = 圆角矩形 + 标签(从 getCardLabel);rect = 矩形。其它 kind 本期不画。
 *
 * 纯函数(无 DOM 副作用)以便单测(mock ctx)。
 */
export function renderElements(
  ctx: CanvasRenderingContext2D,
  elements: CanvasElement[],
  view: CanvasView,
  cssWidth: number,
  cssHeight: number,
  getCardLabel: (id: string) => string,
  background: string,
): void {
  ctx.clearRect(0, 0, cssWidth, cssHeight)
  ctx.fillStyle = background
  ctx.fillRect(0, 0, cssWidth, cssHeight)

  ctx.save()
  ctx.translate(view.panX, view.panY)
  ctx.scale(view.zoom, view.zoom)
  for (const el of elements) {
    drawElement(ctx, el, getCardLabel)
  }
  ctx.restore()
}

function drawElement(
  ctx: CanvasRenderingContext2D,
  el: CanvasElement,
  getCardLabel: (id: string) => string,
): void {
  switch (el.kind) {
    case 'card': {
      ctx.beginPath()
      ctx.roundRect(el.x, el.y, el.w, el.h, 4)
      ctx.fillStyle = '#ffffff' // 注:Task 2.6 换成 token
      ctx.fill()
      ctx.strokeStyle = '#e2e8f0'
      ctx.stroke()
      ctx.fillStyle = '#0f172a'
      ctx.font = '14px Inter, sans-serif'
      ctx.fillText(getCardLabel(el.id) || '(untitled)', el.x + 10, el.y + 20)
      break
    }
    case 'rect': {
      ctx.beginPath()
      ctx.rect(el.x, el.y, el.w, el.h)
      ctx.strokeStyle = colorOf(el.color)
      ctx.stroke()
      break
    }
    default:
      // freedraw/text/arrow/legacy — 后续 Task。
      break
  }
}

/** 把 DSL color 名(blue/red/...)映射成可读色;Task 2.6 换 token。 */
function colorOf(c: string | undefined): string {
  switch (c) {
    case 'blue': return '#1d4ed8'
    case 'red': return '#b91c1c'
    case 'green': return '#15803d'
    case 'black': return '#0f172a'
    default: return '#0f172a'
  }
}
```

- [ ] **Step 2.4:跑渲染测试,确认绿**

Run: `cd apps/web && pnpm exec vitest run src/features/canvas/host/__tests__/self-built-render.test.ts`
Expected: PASS — 3 项。

- [ ] **Step 2.5:把渲染调度接进 SelfBuiltAdapter(rAF + DPR)**

修改 `self-built-adapter.ts`。**把 Task 1 的字段声明 + `constructor` 整体替换成下面这版**(加 `canvas`/`getCardLabel`/`rafId`),并新增 `scheduleRender`/`renderNow`;然后 `upsert`/`remove`/`setView` 末尾各加一行 `this.scheduleRender()`。文件顶部 `import { renderElements } from './self-built-render'`。

```ts
// self-built-adapter.ts —— 替换 Task 1 的字段 + constructor:
  private elements = new Map<string, CanvasElement>()
  private view: CanvasView = { panX: 0, panY: 0, zoom: 1, gridMode: 'free' }
  private userListeners = new Set<(c: UserChange) => void>()
  protected echoing = true
  protected ctx: CanvasRenderingContext2D | null
  private getCardLabel: (id: string) => string
  private rafId: number | null = null

  constructor(
    private canvas: HTMLCanvasElement,
    opts?: { getCardLabel?: (id: string) => string },
  ) {
    this.ctx = canvas.getContext('2d')
    this.getCardLabel = opts?.getCardLabel ?? (() => '')
  }

  protected scheduleRender(): void {
    if (!this.ctx) return // jsdom / 无 ctx — 跳过(host 语义照常)
    if (this.rafId !== null) return
    this.rafId = requestAnimationFrame(() => {
      this.rafId = null
      this.renderNow()
    })
  }

  protected renderNow(): void {
    const ctx = this.ctx
    if (!ctx) return
    const w = this.canvas.clientWidth || 800
    const h = this.canvas.clientHeight || 600
    const dpr = window.devicePixelRatio || 1
    if (this.canvas.width !== w * dpr || this.canvas.height !== h * dpr) {
      this.canvas.width = w * dpr
      this.canvas.height = h * dpr
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0) // 抵消 DPR,renderElements 用 CSS px
    renderElements(ctx, this.getElements(), this.view, w, h, this.getCardLabel, readToken('--color-canvas', '#f8fafc'))
  }
```

> `readToken` 由 Task 2.6 在 `self-built-render.ts` 定义并 export;本步先在 `renderNow` 里引用它——若 2.6 还没做,可临时把背景参数写成内联 `getComputedStyle(...)` 调用或 `'#f8fafc'` fallback,2.6 抽成 `readToken` 后替换。务必在 2.6 完成前不留裸 hex 在最终代码里。

```ts
// upsert/remove/setView 末尾各加 scheduleRender(以 upsert 为例):
  upsert(el: CanvasElement): void {
    this.elements.set(el.id, el)
    if (this.echoing) this.emitUser({ updated: [el], removed: [] })
    this.scheduleRender()
  }
```

- [ ] **Step 2.6:颜色换 token(`getComputedStyle` 读 CSS 变量)**

在 `self-built-render.ts` 把所有裸 hex 换成读 token 的 helper,并 **export**(Step 2.5 的 `renderNow` 要 import 它):

```ts
export function readToken(name: string, fallback: string): string {
  if (typeof window === 'undefined') return fallback
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim()
  return v || fallback
}
```

`drawElement` 里 card 填充/边框/字 + rect 描边全走 token:

```ts
// card 分支:
ctx.fillStyle = readToken('--color-white', '#ffffff')
ctx.strokeStyle = readToken('--color-gray', '#e2e8f0') // 边框
ctx.fillStyle = readToken('--color-black', '#0f172a') // 标签字
ctx.font = `500 14px ${readToken('--font-body', 'Inter, sans-serif')}`

// rect 描边:colorOf 改成 DSL 色名 → 设计 token 的映射(不是裸 hex):
function colorOf(c: string | undefined): string {
  const tokenFor: Record<string, string> = {
    blue: '--color-blue',
    red: '--color-red',
    green: '--color-green',
    black: '--color-black',
  }
  return readToken(tokenFor[c ?? 'black'] ?? '--color-black', '#0f172a')
}
```

> `--color-blue/red/green/black` 由 tag 调色板提供(domain `TAG_COLORS` 已用这些 `var(--color-*)`),确认存在;`--color-white/gray/black` 由 `card-shape-util.tsx` 已在用。背景色已在 Step 2.5 的 `renderNow` 经 `readToken('--color-canvas', '#f8fafc')` 传入,`renderElements` 的 `background` 形参无裸 hex。`self-built-adapter.ts` 顶部:`import { renderElements, readToken } from './self-built-render'`。
> **验收:`grep -nE '#[0-9a-fA-F]{3,6}' apps/web/src/features/canvas/host/self-built-render.ts` 只在 `readToken(..., '<hex>')` 的 fallback 位置命中,不在实际绘制路径。**

- [ ] **Step 2.7:跑全部 host 测试 + build**

Run: `cd apps/web && pnpm exec vitest run src/features/canvas/host/ && cd ../.. && pnpm --filter web build`
Expected: 全绿 + exit 0。

- [ ] **Step 2.8:Commit**

```bash
git add apps/web/src/features/canvas/host/
git commit -m "feat(canvas): Phase 1 T1.2 — SelfBuiltAdapter 渲染(renderElements + rAF + DPR + token)"
```

**Task 2 验收:** 渲染单测绿;契约测试仍绿;build exit 0;`self-built-render.ts` 颜色走 token(grep 无裸 hex 在绘制路径,仅 fallback 里有)。→ 自审 + 用户 review。

---

## Task 3:命中测试 + 选择 + 拖拽(指针交互)

**目标:** 鼠标点卡片能选中、拖动;拖动经 `onUserChange` 回写(由 canvas-binding 写回 CardService)。命中测试是纯函数(可单测)。

**Files:**
- Create: `apps/web/src/features/canvas/host/self-built-hittest.ts`(纯函数 `hitTest` + `screenToPage`)
- Create: `apps/web/src/features/canvas/host/__tests__/self-built-hittest.test.ts`
- Modify: `apps/web/src/features/canvas/host/self-built-adapter.ts`(指针监听 + 拖拽)

**Interfaces:**
- Consumes: Task 1/2 的 adapter + `CanvasElement`/`CanvasView`。
- Produces: `hitTest(elements, pageX, pageY): string | null`、`screenToPage(view, sx, sy): {x, y}`;adapter 指针交互(拖拽触发 `onUserChange`)。

**必守约束:** 命中测试用页坐标(已扣相机);拖拽用 `upsert`(在 echo 下)触发 `onUserChange`(让 canvas-binding 回写,不在 adapter 里直接碰 CardService);teardown 解绑指针监听。

- [ ] **Step 3.1:写命中测试/坐标转换的失败测试**

```ts
// apps/web/src/features/canvas/host/__tests__/self-built-hittest.test.ts
import { describe, expect, it } from 'vitest'
import { hitTest, screenToPage } from '../self-built-hittest'
import type { CanvasElement, CanvasView } from '../canvas-host'

const els: CanvasElement[] = [
  { id: 'a', kind: 'card', x: 0, y: 0, w: 100, h: 50, rotation: 0 },
  { id: 'b', kind: 'card', x: 200, y: 0, w: 100, h: 50, rotation: 0 },
]

describe('screenToPage', () => {
  it('subtracts pan and divides by zoom', () => {
    const v: CanvasView = { panX: 10, panY: 20, zoom: 2, gridMode: 'free' }
    expect(screenToPage(v, 110, 120)).toEqual({ x: 50, y: 50 })
  })
})

describe('hitTest', () => {
  it('hits the element containing the page point', () => {
    expect(hitTest(els, 50, 25)).toBe('a')
    expect(hitTest(els, 250, 25)).toBe('b')
    expect(hitTest(els, 150, 25)).toBeNull()
  })
  it('prefers the later-drawn (top) element on overlap', () => {
    const overlap: CanvasElement[] = [
      { id: 'bottom', kind: 'card', x: 0, y: 0, w: 100, h: 100, rotation: 0 },
      { id: 'top', kind: 'card', x: 0, y: 0, w: 100, h: 100, rotation: 0 },
    ]
    expect(hitTest(overlap, 50, 50)).toBe('top') // 数组末尾 = 最上层
  })
})
```

- [ ] **Step 3.2:跑,确认红**

Run: `cd apps/web && pnpm exec vitest run src/features/canvas/host/__tests__/self-built-hittest.test.ts`
Expected: FAIL — `hitTest/screenToPage not exported`。

- [ ] **Step 3.3:写 `self-built-hittest.ts`**

```ts
// apps/web/src/features/canvas/host/self-built-hittest.ts
'use client'

import type { CanvasElement, CanvasView } from './canvas-host'

/** 屏幕坐标(CSS px)→ 页坐标(扣 pan、除 zoom)。 */
export function screenToPage(
  view: CanvasView,
  sx: number,
  sy: number,
): { x: number; y: number } {
  return { x: (sx - view.panX) / view.zoom, y: (sy - view.panY) / view.zoom }
}

/**
 * 命中测试:返回包含页坐标 (pageX,pageY) 的最上层元素 id,无则 null。
 * 「最上层」= 数组末尾(后画的盖先画的)。
 */
export function hitTest(
  elements: CanvasElement[],
  pageX: number,
  pageY: number,
): string | null {
  for (let i = elements.length - 1; i >= 0; i--) {
    const el = elements[i]!
    if (pageX >= el.x && pageX <= el.x + el.w && pageY >= el.y && pageY <= el.y + el.h) {
      return el.id
    }
  }
  return null
}
```

- [ ] **Step 3.4:跑命中测试,确认绿**

Run: `cd apps/web && pnpm exec vitest run src/features/canvas/host/__tests__/self-built-hittest.test.ts`
Expected: PASS — 3 项。

- [ ] **Step 3.5:给 adapter 加指针交互(mousedown/move/up + 拖拽)**

修改 `self-built-adapter.ts`:constructor 里 `canvas.addEventListener` 绑 `pointerdown/move/up`;记录拖拽态(`dragId` + `dragOffset`);拖拽 move 时 `this.upsert({...existing, x, y})`(echo 下 → 触发 `onUserChange` → canvas-binding 回写);空白处 mousedown 进 Task 4 的 pan。teardown(`detach()` 方法)解绑。

```ts
// self-built-adapter.ts 追加
import { hitTest, screenToPage } from './self-built-hittest'

private dragId: string | null = null
private dragOffset = { x: 0, y: 0 }
private pointerHandlers: { down: (e: PointerEvent) => void; move: (e: PointerEvent) => void; up: (e: PointerEvent) => void } | null = null

private attachPointer(): void {
  if (this.pointerHandlers) return
  const onDown = (e: PointerEvent) => {
    const rect = this.canvas.getBoundingClientRect()
    const sx = e.clientX - rect.left
    const sy = e.clientY - rect.top
    const p = screenToPage(this.view, sx, sy)
    const id = hitTest(this.getElements(), p.x, p.y)
    if (id) {
      const el = this.getElement(id)!
      this.dragId = id
      this.dragOffset = { x: p.x - el.x, y: p.y - el.y }
      this.canvas.setPointerCapture(e.pointerId)
    }
  }
  const onMove = (e: PointerEvent) => {
    if (!this.dragId) return
    const rect = this.canvas.getBoundingClientRect()
    const p = screenToPage(this.view, e.clientX - rect.left, e.clientY - rect.top)
    const el = this.getElement(this.dragId)
    if (!el) return
    this.upsert({ ...el, x: Math.round(p.x - this.dragOffset.x), y: Math.round(p.y - this.dragOffset.y) })
  }
  const onUp = (e: PointerEvent) => {
    if (this.dragId) {
      this.canvas.releasePointerCapture(e.pointerId)
      this.dragId = null
    }
  }
  this.pointerHandlers = { down: onDown, move: onMove, up: onUp }
  this.canvas.addEventListener('pointerdown', onDown)
  this.canvas.addEventListener('pointermove', onMove)
  this.canvas.addEventListener('pointerup', onUp)
}

/** 解绑(页面卸载调)。 */
detach(): void {
  if (this.pointerHandlers) {
    this.canvas.removeEventListener('pointerdown', this.pointerHandlers.down)
    this.canvas.removeEventListener('pointermove', this.pointerHandlers.move)
    this.canvas.removeEventListener('pointerup', this.pointerHandlers.up)
    this.pointerHandlers = null
  }
}
```

constructor 末尾调 `this.attachPointer()`。

- [ ] **Step 3.6:加 adapter 拖拽单测(jsdom:构造 adapter,模拟 upsert→onUserChange)**

```ts
// self-built-adapter.test.ts(新建)
import { describe, expect, it } from 'vitest'
import { SelfBuiltAdapter } from '../self-built-adapter'

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
```

- [ ] **Step 3.7:跑全部 host 测试 + build**

Run: `cd apps/web && pnpm exec vitest run src/features/canvas/host/ && cd ../.. && pnpm --filter web build`
Expected: 全绿 + exit 0。

- [ ] **Step 3.8:Commit**

```bash
git add apps/web/src/features/canvas/host/
git commit -m "feat(canvas): Phase 1 T1.3 — SelfBuiltAdapter 命中测试 + 选择 + 拖拽(指针交互)"
```

**Task 3 验收:** 命中测试单测 + 拖拽→onUserChange 单测绿;契约测试仍绿;build exit 0。→ 自审 + 用户 review。

---

## Task 4:pan / zoom(空白拖拽 + 滚轮)

**目标:** 空白处拖拽 = pan;滚轮 = zoom(zoom-to-cursor)。相机变化触发渲染。

**Files:**
- Modify: `apps/web/src/features/canvas/host/self-built-adapter.ts`(pan/zoom 逻辑)
- Modify: `apps/web/src/features/canvas/host/__tests__/self-built-adapter.test.ts`(pan/zoom 单测)

**Interfaces:**
- Consumes: Task 3 的指针交互 + `screenToPage`。
- Produces: adapter pan/zoom;`setView` 已在 Task 1(pan/zoom 走它)。

**必守约束:** zoom-to-cursor(以鼠标为锚点,pan 补偿);`zoom` 钳制(0.1–8);pan/zoom 触发 `scheduleRender`。

- [ ] **Step 4.1:写 pan/zoom 单测(红)**

追加到 `self-built-adapter.test.ts`:

```ts
describe('SelfBuiltAdapter pan/zoom', () => {
  it('wheel zoom adjusts zoom + pan (zoom-to-cursor at 0,0)', () => {
    const host = new SelfBuiltAdapter(document.createElement('canvas'))
    host.setView({ panX: 0, panY: 0, zoom: 1, gridMode: 'free' })
    // 模拟在屏幕 (100,100) 滚轮放大到 zoom 2;cursor 应保持在页 (100,100)。
    ;(host as unknown as { onWheel: (sx: number, sy: number, delta: number) => void }).onWheel(100, 100, -1)
    const v = host.getView()
    expect(v.zoom).toBeCloseTo(2, 5)
    // zoom-to-cursor: page coord under cursor 不变 → panX 补偿
    expect((100 - v.panX) / v.zoom).toBeCloseTo(100, 5)
  })

  it('zoom clamps to [0.1, 8]', () => {
    const host = new SelfBuiltAdapter(document.createElement('canvas'))
    host.setView({ panX: 0, panY: 0, zoom: 1, gridMode: 'free' })
    const h = host as unknown as { onWheel: (sx: number, sy: number, delta: number) => void }
    h.onWheel(0, 0, 100) // 大幅缩小
    expect(host.getView().zoom).toBeGreaterThanOrEqual(0.1)
    host.setView({ panX: 0, panY: 0, zoom: 7.9, gridMode: 'free' })
    h.onWheel(0, 0, -100) // 大幅放大
    expect(host.getView().zoom).toBeLessThanOrEqual(8)
  })
})
```

- [ ] **Step 4.2:跑,确认红**

Run: `cd apps/web && pnpm exec vitest run src/features/canvas/host/__tests__/self-built-adapter.test.ts`
Expected: FAIL — `onWheel is not a method`。

- [ ] **Step 4.3:实现 pan/zoom(空白拖拽 + 滚轮 + zoom-to-cursor)**

修改 `self-built-adapter.ts`:

```ts
// 在 attachPointer 的 onDown 里:没命中元素时进入 pan 模式
// onDown 改:
const onDown = (e: PointerEvent) => {
  const rect = this.canvas.getBoundingClientRect()
  const sx = e.clientX - rect.left
  const sy = e.clientY - rect.top
  const p = screenToPage(this.view, sx, sy)
  const id = hitTest(this.getElements(), p.x, p.y)
  if (id) {
    const el = this.getElement(id)!
    this.dragId = id
    this.dragOffset = { x: p.x - el.x, y: p.y - el.y }
  } else {
    // pan
    this.panning = { startSx: sx, startSy: sy, fromPanX: this.view.panX, fromPanY: this.view.panY }
  }
  this.canvas.setPointerCapture(e.pointerId)
}
// onMove 改:拖拽优先,否则 pan
const onMove = (e: PointerEvent) => {
  const rect = this.canvas.getBoundingClientRect()
  const sx = e.clientX - rect.left
  const sy = e.clientY - rect.top
  if (this.dragId) {
    const p = screenToPage(this.view, sx, sy)
    const el = this.getElement(this.dragId)
    if (el) this.upsert({ ...el, x: Math.round(p.x - this.dragOffset.x), y: Math.round(p.y - this.dragOffset.y) })
  } else if (this.panning) {
    this.setView({ ...this.view, panX: this.panning.fromPanX + (sx - this.panning.startSx), panY: this.panning.fromPanY + (sy - this.panning.startSy) })
  }
}
// onUp 改(释放 capture + 清 dragId + 清 panning):
const onUp = (e: PointerEvent) => {
  if (this.dragId || this.panning) {
    try { this.canvas.releasePointerCapture(e.pointerId) } catch { /* 已释放 */ }
  }
  this.dragId = null
  this.panning = null
}

private panning: { startSx: number; startSy: number; fromPanX: number; fromPanY: number } | null = null

// 滚轮(zoom-to-cursor):
onWheel(sx: number, sy: number, delta: number): void {
  const factor = delta < 0 ? 1.1 : 1 / 1.1
  const nextZoom = Math.min(8, Math.max(0.1, this.view.zoom * factor))
  // zoom-to-cursor:cursor 下的页坐标在缩放前后保持不变。
  //   pageBefore = (sx - panX) / zoom;  pageAfter = (sx - panX') / nextZoom
  //   → panX' = sx - pageBefore * nextZoom
  const pageX = (sx - this.view.panX) / this.view.zoom
  const pageY = (sy - this.view.panY) / this.view.zoom
  const panX = sx - pageX * nextZoom
  const panY = sy - pageY * nextZoom
  this.setView({ ...this.view, zoom: nextZoom, panX, panY })
}
```

加 `wheelHandler` 字段,在 `attachPointer` 末尾绑定,并在 `detach()` 里解绑(Task 3.5 写的 `detach` 只移除了 pointerdown/move/up,**本步必须给它补 wheel 这一条**,否则 wheel 监听泄漏):

```ts
// 字段(类上):
private wheelHandler: ((e: WheelEvent) => void) | null = null

// attachPointer() 末尾追加:
this.wheelHandler = (e: WheelEvent) => {
  e.preventDefault()
  const rect = this.canvas.getBoundingClientRect()
  this.onWheel(e.clientX - rect.left, e.clientY - rect.top, e.deltaY)
}
this.canvas.addEventListener('wheel', this.wheelHandler, { passive: false })

// detach() 追加(在移除 pointerdown/move/up 之后):
if (this.wheelHandler) {
  this.canvas.removeEventListener('wheel', this.wheelHandler)
  this.wheelHandler = null
}
```

- [ ] **Step 4.4:跑 pan/zoom 单测 + 全部 host 测试 + build**

Run: `cd apps/web && pnpm exec vitest run src/features/canvas/host/ && cd ../.. && pnpm --filter web build`
Expected: 全绿 + exit 0。

- [ ] **Step 4.5:Commit**

```bash
git add apps/web/src/features/canvas/host/
git commit -m "feat(canvas): Phase 1 T1.4 — SelfBuiltAdapter pan/zoom(zoom-to-cursor + 钳制)"
```

**Task 4 验收:** pan/zoom 单测绿;契约 + 渲染 + 命中测试仍绿;build exit 0。→ 自审 + 用户 review。

---

## Task 5:feature-flag 挂载页 `/dev/canvas-self` + 冒烟 e2e

**目标:** 一个 `/dev/canvas-self` 静态页,构造 `SelfBuiltAdapter`,复用 `canvas-binding`(loadCardsIntoEditor + bindCardWriteback),渲染卡片 + 可拖拽 + pan/zoom。再用 puppeteer 冒烟。

**Files:**
- Create: `apps/web/src/app/dev/canvas-self/page.tsx`
- Create: `scripts/phase1-smoke.cjs`

**Interfaces:**
- Consumes: Task 1-4 的 `SelfBuiltAdapter`;Phase 0 的 `canvas-binding`(`loadCardsIntoEditor` / `bindCardWriteback`);`useDb`(service);`DEFAULT_CANVAS_ID`。
- Produces:`/dev/canvas-self` 可访问;`scripts/phase1-smoke.cjs` 冒烟通过。

**必守约束:** 静态路由(无 query param);`'use client'`;canvas 占满视口;卸载调 `adapter.detach()` + 取消 writeback 订阅。

- [ ] **Step 5.1:写 `/dev/canvas-self/page.tsx`**

```tsx
// apps/web/src/app/dev/canvas-self/page.tsx
'use client'

/**
 * Phase 1 dev 挂载页 — SelfBuiltAdapter(Canvas 2D)与主画布(tldraw)并存验证。
 * 复用 Phase 0 的 canvas-binding(host 无关):卡片从 CardService 加载、拖拽回写。
 * 不碰主路由 /canvas;Phase 2 真正替换 tldraw 才动 /canvas。
 */
import { useEffect, useRef } from 'react'
import { useDb } from '@/lib/db-client'
import { DEFAULT_CANVAS_ID } from '@/features/canvas/default-canvas'
import { loadCardsIntoEditor, bindCardWriteback } from '@/features/canvas/canvas-binding'
import { SelfBuiltAdapter } from '@/features/canvas/host/self-built-adapter'

export default function CanvasSelfPage() {
  const { service } = useDb()
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const adapter = new SelfBuiltAdapter(canvas, {
      getCardLabel: (id) => service.get(id as never)?.title ?? '',
    })
    loadCardsIntoEditor(adapter, service, DEFAULT_CANVAS_ID)
    const unbind = bindCardWriteback(adapter, service, DEFAULT_CANVAS_ID)
    return () => {
      unbind()
      adapter.detach()
    }
  }, [service])

  return (
    <div style={{ width: '100vw', height: '100vh' }}>
      <canvas ref={canvasRef} style={{ width: '100%', height: '100%', display: 'block', touchAction: 'none' }} />
    </div>
  )
}
```

- [ ] **Step 5.2:build,确认 /dev/canvas-self 静态产物生成**

Run: `pnpm --filter web build`
Expected: exit 0;输出含 `/dev/canvas-self`。

- [ ] **Step 5.3:写 `scripts/phase1-smoke.cjs`(puppeteer 冒烟)**

```js
// scripts/phase1-smoke.cjs — 真实冒烟 SelfBuiltAdapter 渲染 + 拖拽回写。
// 运行:先 pnpm --filter web build + 静态服务 :3016,再 node scripts/phase1-smoke.cjs
const puppeteer = require('puppeteer-core')
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const URL = 'http://localhost:3016'
const wait = (ms) => new Promise((r) => setTimeout(r, ms))

let pass = 0, fail = 0
const check = (n, ok, d = '') => { ok ? (pass++, console.log(`  ✓ ${n}${d ? ' — ' + d : ''}`)) : (fail++, console.log(`  ✗ ${n}${d ? ' — ' + d : ''}`)) }

;(async () => {
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox', '--disable-gpu'], defaultViewport: { width: 1440, height: 900 } })
  const page = await browser.newPage()
  const errs = []
  page.on('pageerror', (e) => errs.push(e.message))

  // 1. 页面挂载、canvas 出现、无 pageerror
  await page.goto(URL + '/dev/canvas-self', { waitUntil: 'networkidle0', timeout: 30000 })
  await wait(1500)
  const hasCanvas = await page.evaluate(() => !!document.querySelector('canvas'))
  check('canvas mounted', hasCanvas)
  check('no pageerror', errs.length === 0, `${errs.length} errors`)

  // 2. 在另一 tab 注入一张卡片到默认画布,回到本页看它渲染出 label
  //    (本页用同一 localStorage origin,storage 事件触发 rehydrate → service 通知 →
  //     但本页没接 syncCardsToEditor,所以用主动创建 + 等待 load 时机。
  //     简化:直接经 __cardService 创建,再 navigation 触发 loadCardsIntoEditor。)
  const cardId = await page.evaluate(() => {
    // /dev/canvas-self 没暴露 __cardService;经 localStorage 注入更稳。
    const key = 'cys-stift.cards.v1'
    const raw = localStorage.getItem(key) || '{"cards":[]}'
    const parsed = JSON.parse(raw)
    const id = 'smoke-' + Math.random().toString(36).slice(2)
    parsed.cards.push({
      id, title: 'Phase1Smoke', body: '', type: 'note',
      media: [], links: [], codeSnippets: [], quotes: [], tags: [],
      source: { kind: 'manual', deviceId: 'smoke' },
      capturedAt: new Date().toISOString(), createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
      pinned: false, archived: false,
      canvasPosition: { canvasId: 'default-canvas', x: 200, y: 200, w: 240, h: 120, z: Date.now() },
    })
    localStorage.setItem(key, JSON.stringify(parsed))
    return id
  })
  await page.reload({ waitUntil: 'networkidle0' })
  await wait(1500)

  // 3. 拿 canvas 像素证据:截图(视觉)+ 检查 cardId 经回写后位置可在 service 里查到。
  //    模拟拖拽:pointer down/move/up 经 puppeteer dispatchPointer。
  const drag = await page.evaluate(async (id) => {
    const canvas = document.querySelector('canvas')
    if (!canvas) return { error: 'no canvas' }
    // SelfBuiltAdapter 拖拽经 onUserChange → bindCardWriteback → service.moveToCanvas。
    // 取卡片屏幕中心(相机默认 pan0/zoom1,页(200+120,200+60)=(320,260)≈屏幕)。
    const cx = 320, cy = 260
    const opts = { pointerId: 1, bubbles: true, clientX: cx, clientY: cy }
    canvas.dispatchEvent(new PointerEvent('pointerdown', { ...opts, pointerType: 'mouse' }))
    await new Promise((r) => setTimeout(r, 50))
    canvas.dispatchEvent(new PointerEvent('pointermove', { ...opts, clientX: cx + 100, clientY: cy + 50, pointerType: 'mouse' }))
    canvas.dispatchEvent(new PointerEvent('pointerup', { ...opts, clientX: cx + 100, clientY: cy + 50, pointerType: 'mouse' }))
    await new Promise((r) => setTimeout(r, 500)) // >300ms writeback debounce
    // 从 localStorage 读回卡片位置
    const raw = localStorage.getItem('cys-stift.cards.v1')
    const p = JSON.parse(raw)
    const c = p.cards.find((x) => x.id === id)
    return c?.canvasPosition ? { x: c.canvasPosition.x, y: c.canvasPosition.y } : { error: 'card not found' }
  }, cardId)
  check('drag wrote new position back to CardService', drag.x !== undefined && (drag.x === 300 || drag.x > 250), JSON.stringify(drag))

  await page.screenshot({ path: path.join(__dirname, '..', 'docs', 'design', 'screenshots', 'phase1-smoke', 'self-canvas.png') })
  await browser.close()
  const fs = require('fs'), path = require('path')
  fs.mkdirSync(path.join(__dirname, '..', 'docs', 'design', 'screenshots', 'phase1-smoke'), { recursive: true })
  console.log(`\n${fail === 0 ? '✓' : '✗'} ${pass} passed, ${fail} failed`)
  process.exit(fail === 0 ? 0 : 1)
})().catch((e) => { console.error('FATAL', e); process.exit(2) })
```

> 注:`require('fs'/'path')` 移到文件顶部(此处为紧凑展示放底);运行前确保静态服务在 :3016(同 phase0-smoke.cjs 约定)。

- [ ] **Step 5.4:启动静态服务 + 跑冒烟**

```bash
pnpm --filter web build
python3 -m http.server 3016 --directory apps/web/out &   # 后台
sleep 1
node scripts/phase1-smoke.cjs
# 跑完 kill 掉 http.server
```
Expected: 3 项全绿(canvas 挂载 / 无 pageerror / 拖拽回写)。

- [ ] **Step 5.5:Commit**

```bash
git add apps/web/src/app/dev/canvas-self/ scripts/phase1-smoke.cjs
git commit -m "feat(canvas): Phase 1 T1.5 — /dev/canvas-self feature-flag 挂载 + SelfBuiltAdapter 冒烟 e2e"
```

**Task 5 验收:** `/dev/canvas-self` 静态产物生成;冒烟 3/3 绿(canvas 挂载、无 pageerror、拖拽回写 CardService);build exit 0。→ 自审 + 用户 review → **Phase 1 基础骨架完成**。

---

## Phase 1 基础骨架总验收

```bash
pnpm --filter domain test          # 全绿(未动)
pnpm --filter db test              # 全绿(未动)
pnpm --filter web test             # 全绿(含 SelfBuiltAdapter 契约 + 渲染 + 命中 + 拖拽 + pan/zoom)
pnpm --filter web build            # exit 0,/dev/canvas-self 产物在
node scripts/phase1-smoke.cjs      # 3/3(需静态服务 :3016)
```
+ `grep -r "@tldraw" apps/web/src/features/canvas/host/self-built-adapter.ts` → 无命中(零 tldraw)。
+ 主路由 `/canvas`(tldraw)未动、功能零退化。

**产出:** 自研 Canvas 2D 渲染器骨架,实现 `CanvasHost`,feature-flag 与 tldraw 并存,拖拽回写打通。为后续(freedraw 输入 / 文本编辑 IME / arrow 关系渲染 / 交互打磨 / Phase 2 移除 tldraw)奠基。

## Self-Review(plan 自检)

- **Spec 覆盖**:Route A Phase 1 的 T1.1-T1.5(骨架→渲染→交互→pan/zoom→挂载)各对应 Task 1-5。freedraw/文本/arrow 明确不在本计划(后续 plan),已在范围段声明。
- **占位符扫描**:Task 1 `batch` 有 `// TODO(Phase 1 后续):undo 分组` —— undo 不在本计划范围(YAGNI),是有意标注非占位。其余步骤代码完整。Task 5 冒烟的 fs/path require 位置已注明移顶。
- **类型一致性**:`SelfBuiltAdapter implements CanvasHost` 全 Task 用 Phase 0 的同名签名;`renderElements`/`hitTest`/`screenToPage` 在定义 Task 与消费 Task 名字一致;`getCardLabel` 构造选项贯穿 Task 2/5。
- **范围**:本计划自包含,产出可测软件(契约 + 渲染 + 冒烟)。freedraw/文本/arrow/打磨/Phase 2 各自另开 plan。
