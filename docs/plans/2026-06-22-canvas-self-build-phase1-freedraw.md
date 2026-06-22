# 画布自研 · Phase 1 freedraw(手绘)实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: 用 superpowers:subagent-driven-development(推荐)或 superpowers:executing-plans 逐 Task 执行。步骤用 `- [ ]` 跟踪。

**Goal:** 给 SelfBuiltAdapter 加 freedraw(手绘)输入 + 渲染:鼠标在「Draw」模式下画笔画出向量点序列,commit 成 `CanvasElement` kind=freedraw,Canvas 2D 画 polyline。点序列是向量(R2),**永不进 DSL**(serializeCanvas 已对 freedraw 只出 pos)。

**Architecture:** freedraw 点序列存 `CanvasElement.meta.points`(页坐标绝对值 `[x,y][]`),`x/y/w/h` 为 bbox(commit 时由纯函数算)。输入:adapter 加 `activeTool`('select' | 'freedraw'),freedraw 模式下 pointerdown→累积点、move→追加(实时预览渲染)、up→commit(upsert 触发 onUserChange)。渲染:`renderElements` 的 `drawElement` 加 freedraw 分支画 polyline。工具切换是 **SelfBuiltAdapter 自身的方法**(不上 CanvasHost 接口——工具是渲染器自己的事)。

**Tech Stack:** TypeScript strict、Canvas 2D、requestAnimationFrame、vitest、puppeteer-core。零 tldraw。

## Global Constraints(每个 Task implicitly 必守)

- spec 冻结;feature-flag 只在 `/dev/*`,**不碰主路由 `/canvas`**。
- `packages/domain` 零依赖不破坏。
- 颜色走 token(`readToken`),绘制路径不裸 hex。
- **零 tldraw import**(freedraw 全在自研渲染器里)。
- **freedraw 点序列永不进 DSL / AI 视野**(R2 + 隐私):serializeCanvas 对 freedraw 只出 `[freedraw #id] @pos(x,y)`(已在 Phase 0 T0.3 落实,本计划不改 DSL)。
- 静态导出(`output:'export'`);客户端组件标 `'use client'`。
- jsdom 下 `ctx===null`,`scheduleRender`/`renderNow` 静默跳过(host 语义照常)。
- 每步 TDD:先写测试(红)→ 实现 → 绿 → commit。每 Task 自审 + review 闸。
- 不假装通过 —— 每步跑命令看 exit code。

## File Structure

**新增:**
- `apps/web/src/features/canvas/host/self-built-freedraw.ts` — 纯函数 `bboxOf(points)` + `commitFreedraw(id, points, color?)`(可单测,不挂 DOM)。
- `apps/web/src/features/canvas/host/__tests__/self-built-freedraw.test.ts` — 纯函数单测。
- `scripts/phase1-freedraw-smoke.cjs` — /dev/canvas-self 手绘冒烟 e2e。

**修改:**
- `apps/web/src/features/canvas/host/self-built-render.ts` — `drawElement` 加 freedraw 分支(polyline)。
- `apps/web/src/features/canvas/host/__tests__/self-built-render.test.ts` — mock ctx 加 `moveTo`/`lineTo`/`lineWidth`;加 freedraw 渲染断言。
- `apps/web/src/features/canvas/host/self-built-adapter.ts` — 加 `activeTool`/`currentStroke` 字段 + `setTool`/`getTool`;改 `onDown`/`onMove`/`onUp` 支持 freedraw;`renderNow` 画进行中的笔画预览。
- `apps/web/src/app/dev/canvas-self/page.tsx` — 加 Select/Draw 工具按钮;lift adapter 到 ref;暴露 `window.__selfAdapter` 供冒烟。

---

## Task 1:freedraw 纯函数(bboxOf + commitFreedraw)+ 测试

**Files:**
- Create: `apps/web/src/features/canvas/host/self-built-freedraw.ts`
- Test: `apps/web/src/features/canvas/host/__tests__/self-built-freedraw.test.ts`

**Interfaces:**
- Consumes: `CanvasElement`(Phase 0 已定义,`./canvas-host`)。
- Produces: `bboxOf(points): {x,y,w,h}`、`commitFreedraw(id, points, color?): CanvasElement` —— Task 3 的 adapter commit 用。

**必守约束:** 纯函数,零 DOM/引擎副作用;空点集返回 0 bbox 不抛。

- [ ] **Step 1.1:写失败测试**

```ts
// apps/web/src/features/canvas/host/__tests__/self-built-freedraw.test.ts
import { describe, expect, it } from 'vitest'
import { bboxOf, commitFreedraw } from '../self-built-freedraw'

describe('bboxOf', () => {
  it('空点集 → 0 bbox', () => {
    expect(bboxOf([])).toEqual({ x: 0, y: 0, w: 0, h: 0 })
  })
  it('算最小角 + 尺寸', () => {
    expect(bboxOf([[10, 20], [30, 5], [20, 50]])).toEqual({ x: 10, y: 5, w: 20, h: 45 })
  })
  it('单点 → 0 尺寸', () => {
    expect(bboxOf([[7, 8]])).toEqual({ x: 7, y: 8, w: 0, h: 0 })
  })
})

describe('commitFreedraw', () => {
  it('建 freedraw 元素:bbox + 点序列进 meta.points', () => {
    const el = commitFreedraw('f1', [[10, 10], [40, 50]], 'black')
    expect(el).toMatchObject({
      id: 'f1', kind: 'freedraw', x: 10, y: 10, w: 30, h: 40, rotation: 0, color: 'black',
    })
    expect(el.meta?.points).toEqual([[10, 10], [40, 50]])
  })
  it('无 color 时 color 字段缺省(undefined)', () => {
    const el = commitFreedraw('f2', [[0, 0]])
    expect(el.color).toBeUndefined()
  })
})
```

- [ ] **Step 1.2:跑,确认红**

Run: `cd /Users/jinxunuo/projects/cys-stift/apps/web && pnpm exec vitest run src/features/canvas/host/__tests__/self-built-freedraw.test.ts`
Expected: FAIL — `bboxOf/commitFreedraw is not exported`。

- [ ] **Step 1.3:写 `self-built-freedraw.ts`**

```ts
// apps/web/src/features/canvas/host/self-built-freedraw.ts
'use client'

import type { CanvasElement } from './canvas-host'

/**
 * freedraw(手绘)纯函数:点序列 → bbox + CanvasElement。
 * 点序列是页坐标绝对值 [x,y][](向量,R2);x/y/w/h 为 bbox(commit 时算)。
 * 这些函数不挂 DOM、无引擎副作用,可独立单测。
 */

/** 点序列的最小包围盒(最小角 + 尺寸)。空集 → 0 bbox。 */
export function bboxOf(points: [number, number][]): {
  x: number
  y: number
  w: number
  h: number
} {
  if (points.length === 0) return { x: 0, y: 0, w: 0, h: 0 }
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const [x, y] of points) {
    if (x < minX) minX = x
    if (y < minY) minY = y
    if (x > maxX) maxX = x
    if (y > maxY) maxY = y
  }
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY }
}

/** 把一条笔画 commit 成 freedraw CanvasElement(bbox 由点序列算,点进 meta.points)。 */
export function commitFreedraw(
  id: string,
  points: [number, number][],
  color?: string,
): CanvasElement {
  const { x, y, w, h } = bboxOf(points)
  const el: CanvasElement = {
    id,
    kind: 'freedraw',
    x,
    y,
    w,
    h,
    rotation: 0,
    meta: { points },
  }
  if (color !== undefined) el.color = color
  return el
}
```

- [ ] **Step 1.4:跑,确认绿**

Run: `cd /Users/jinxunuo/projects/cys-stift/apps/web && pnpm exec vitest run src/features/canvas/host/__tests__/self-built-freedraw.test.ts`
Expected: PASS — 5 项。

- [ ] **Step 1.5:tsc + build**

Run: `cd /Users/jinxunuo/projects/cys-stift && pnpm --filter web build`
Expected: exit 0。

- [ ] **Step 1.6:Commit**

```bash
git add apps/web/src/features/canvas/host/self-built-freedraw.ts apps/web/src/features/canvas/host/__tests__/self-built-freedraw.test.ts
git commit -m "feat(canvas): Phase 1 freedraw T1 — bboxOf + commitFreedraw 纯函数 + 单测"
```

**Task 1 验收:** 5 项单测绿;build exit 0;零 tldraw(新文件无 import)。→ 自审 + review。

---

## Task 2:freedraw 渲染分支(polyline)+ 渲染测试

**Files:**
- Modify: `apps/web/src/features/canvas/host/self-built-render.ts`(`drawElement` 加 freedraw case)
- Test: `apps/web/src/features/canvas/host/__tests__/self-built-render.test.ts`(mock ctx 加 moveTo/lineTo/lineWidth;加 freedraw 断言)

**Interfaces:**
- Consumes: `CanvasElement.meta.points`(Task 1 的 commitFreedraw 产出此形);`colorOf`/`readToken`(已在本文件)。
- Produces: `drawElement` 能画 freedraw —— Task 3 的预览 + commit 都靠它。

**必守约束:** 颜色走 token(`colorOf`);空点集不画(不抛)。

- [ ] **Step 2.1:扩 render 测试的 mock ctx(加 moveTo/lineTo/lineWidth)+ 加 freedraw 断言(先红)**

在 `self-built-render.test.ts` 的 `mockCtx()` 对象里,紧挨 `rect:` 后面加三行:

```ts
    rect: (x: number, y: number, w: number, h: number) => calls.push(`rect(${x},${y},${w},${h})`),
    moveTo: (x: number, y: number) => calls.push(`moveTo(${x},${y})`),
    lineTo: (x: number, y: number) => calls.push(`lineTo(${x},${y})`),
    roundRect: (x: number, y: number, w: number, h: number, r?: number) => calls.push(`roundRect(${x},${y},${w},${h})`),
```

并在 setter 区(`set fillStyle` 附近)加 `lineWidth` setter:

```ts
    set lineWidth(v: unknown) { calls.push(`lineWidth=${v}`) },
```

然后在 `describe('renderElements', ...)` 末尾加一个 freedraw 用例:

```ts
  it('draws a freedraw stroke as a polyline', () => {
    const ctx = mockCtx()
    const els = [
      {
        id: 'f1', kind: 'freedraw', x: 10, y: 10, w: 30, h: 40, rotation: 0,
        meta: { points: [[10, 10], [40, 50], [10, 50]] },
      },
    ] as unknown as CanvasElement[]
    renderElements(ctx, els, { panX: 0, panY: 0, zoom: 1, gridMode: 'free' }, 800, 600, () => '', '#ffffff')
    expect(ctx._calls).toContain('moveTo(10,10)')
    expect(ctx._calls).toContain('lineTo(40,50)')
    expect(ctx._calls).toContain('lineTo(10,50)')
  })

  it('freedraw with no points draws nothing (no throw)', () => {
    const ctx = mockCtx()
    const els = [{ id: 'f2', kind: 'freedraw', x: 0, y: 0, w: 0, h: 0, rotation: 0, meta: {} }] as unknown as CanvasElement[]
    expect(() => renderElements(ctx, els, { panX: 0, panY: 0, zoom: 1, gridMode: 'free' }, 800, 600, () => '', '#ffffff')).not.toThrow()
    expect(ctx._calls.some((c) => c.startsWith('moveTo'))).toBe(false)
  })
```

> 注:`self-built-render.test.ts` 顶部若没 import `CanvasElement` 类型,加 `import type { CanvasElement, CanvasView } from '../canvas-host'`(`CanvasView` 已在用)。

- [ ] **Step 2.2:跑,确认红(freedraw 现在走 default 不画 → moveTo 断言失败)**

Run: `cd /Users/jinxunuo/projects/cys-stift/apps/web && pnpm exec vitest run src/features/canvas/host/__tests__/self-built-render.test.ts`
Expected: FAIL — `expected [...] to contain 'moveTo(10,10)'`。

- [ ] **Step 2.3:`drawElement` 加 freedraw 分支**

在 `self-built-render.ts` 的 `drawElement` switch 里,`case 'rect'` 之后、`default` 之前加:

```ts
    case 'freedraw': {
      const pts = (el.meta?.points as [number, number][] | undefined) ?? []
      if (pts.length === 0) break
      ctx.beginPath()
      ctx.moveTo(pts[0]![0], pts[0]![1])
      for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i]![0], pts[i]![1])
      ctx.strokeStyle = colorOf(el.color)
      ctx.lineWidth = 2
      ctx.stroke()
      break
    }
```

- [ ] **Step 2.4:跑渲染测试,确认绿**

Run: `cd /Users/jinxunuo/projects/cys-stift/apps/web && pnpm exec vitest run src/features/canvas/host/__tests__/self-built-render.test.ts`
Expected: PASS —— 原有 3 + freedraw 2 = 5 项。

- [ ] **Step 2.5:全部 host 测试 + build**

Run: `cd /Users/jinxunuo/projects/cys-stift/apps/web && pnpm exec vitest run src/features/canvas/host/ && cd /Users/jinxunuo/projects/cys-stift && pnpm --filter web build`
Expected: 全绿 + exit 0。

- [ ] **Step 2.6:Commit**

```bash
git add apps/web/src/features/canvas/host/self-built-render.ts apps/web/src/features/canvas/host/__tests__/self-built-render.test.ts
git commit -m "feat(canvas): Phase 1 freedraw T2 — drawElement 加 freedraw polyline 渲染分支"
```

**Task 2 验收:** 渲染测试 5 项绿(含 freedraw 2);host 全绿;build exit 0;颜色走 token。→ 自审 + review。

---

## Task 3:adapter freedraw 输入(activeTool + currentStroke + onDown/Move/Up + 预览)

**Files:**
- Modify: `apps/web/src/features/canvas/host/self-built-adapter.ts`
- Test: `apps/web/src/features/canvas/host/__tests__/self-built-adapter.test.ts`(加 freedraw 输入测试)

**Interfaces:**
- Consumes: Task 1 `commitFreedraw`;Task 2 freedraw 渲染;`screenToPage`(已有)。
- Produces: `SelfBuiltAdapter.setTool('select'|'freedraw')` / `getTool()`;freedraw 模式下 pointerdown/move/up 产出 freedraw 元素。

**必守约束:** freedraw commit 经 `upsert`(echo 下触发 `onUserChange` 一次);select 模式行为**零变化**(现有 drag/pan 不动);工具方法是 SelfBuiltAdapter 自己的(不上 CanvasHost 接口);`renderNow` 画进行中笔画预览(用 `__preview` id,不 commit)。

- [ ] **Step 3.1:加 freedraw 输入测试(先红)**

在 `self-built-adapter.test.ts` 末尾加:

```ts
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
```

> 顶部若没 import `CanvasElement`,加 `import type { CanvasElement } from '../canvas-host'`。

- [ ] **Step 3.2:跑,确认红**

Run: `cd /Users/jinxunuo/projects/cys-stift/apps/web && pnpm exec vitest run src/features/canvas/host/__tests__/self-built-adapter.test.ts`
Expected: FAIL — `setTool is not a function`(或 freedraw 不产)。

- [ ] **Step 3.3:改 `self-built-adapter.ts` —— 加字段 + 工具方法 + freedraw 输入 + 预览**

文件顶部 import 加 `commitFreedraw`:

```ts
import { commitFreedraw } from './self-built-freedraw'
```

类的字段区(在 `wheelHandler` 那行之后)加:

```ts
  private activeTool: 'select' | 'freedraw' = 'select'
  private currentStroke: { points: [number, number][] } | null = null
```

类的方法区(在 `detach()` 之前或之后,任意)加公开工具方法:

```ts
  /** 切换工具(渲染器自身方法,不上 CanvasHost 接口)。 */
  setTool(t: 'select' | 'freedraw'): void {
    this.activeTool = t
    // 切工具时放弃进行中的笔画
    if (t !== 'freedraw' && this.currentStroke) {
      this.currentStroke = null
      this.scheduleRender()
    }
  }

  getTool(): 'select' | 'freedraw' {
    return this.activeTool
  }
```

改 `attachPointer` 的 `onDown`(在算完 `p` 之后、`if (id)` 之前,加 freedraw 分支):

```ts
    const onDown = (e: PointerEvent) => {
      const rect = this.canvas.getBoundingClientRect()
      const sx = e.clientX - rect.left
      const sy = e.clientY - rect.top
      const p = screenToPage(this.view, sx, sy)
      if (this.activeTool === 'freedraw') {
        this.currentStroke = { points: [[Math.round(p.x), Math.round(p.y)]] }
        this.canvas.setPointerCapture(e.pointerId)
        this.scheduleRender()
        return
      }
      const id = hitTest(this.getElements(), p.x, p.y)
      if (id) {
        const el = this.getElement(id)!
        this.dragId = id
        this.dragOffset = { x: p.x - el.x, y: p.y - el.y }
      } else {
        // 空白处 mousedown → pan 模式
        this.panning = {
          startSx: sx,
          startSy: sy,
          fromPanX: this.view.panX,
          fromPanY: this.view.panY,
        }
      }
      this.canvas.setPointerCapture(e.pointerId)
    }
```

改 `onMove`(开头加 currentStroke 分支):

```ts
    const onMove = (e: PointerEvent) => {
      const rect = this.canvas.getBoundingClientRect()
      const sx = e.clientX - rect.left
      const sy = e.clientY - rect.top
      if (this.currentStroke) {
        const p = screenToPage(this.view, sx, sy)
        this.currentStroke.points.push([Math.round(p.x), Math.round(p.y)])
        this.scheduleRender()
        return
      }
      if (this.dragId) {
        const p = screenToPage(this.view, sx, sy)
        const el = this.getElement(this.dragId)
        if (el) {
          this.upsert({
            ...el,
            x: Math.round(p.x - this.dragOffset.x),
            y: Math.round(p.y - this.dragOffset.y),
          })
        }
      } else if (this.panning) {
        this.setView({
          ...this.view,
          panX: this.panning.fromPanX + (sx - this.panning.startSx),
          panY: this.panning.fromPanY + (sy - this.panning.startSy),
        })
      }
    }
```

改 `onUp`(开头加 currentStroke commit 分支):

```ts
    const onUp = (e: PointerEvent) => {
      if (this.currentStroke) {
        const id =
          'freedraw-' +
          (typeof crypto !== 'undefined' && 'randomUUID' in crypto
            ? crypto.randomUUID()
            : Math.random().toString(36).slice(2))
        this.upsert(commitFreedraw(id, this.currentStroke.points))
        this.currentStroke = null
        try {
          this.canvas.releasePointerCapture(e.pointerId)
        } catch {
          /* 已释放 */
        }
        return
      }
      if (this.dragId || this.panning) {
        try {
          this.canvas.releasePointerCapture(e.pointerId)
        } catch {
          /* 已释放 */
        }
      }
      this.dragId = null
      this.panning = null
    }
```

改 `renderNow`(画进行中笔画预览)—— 把 `renderElements(...)` 那行的元素列表改成含预览:

```ts
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
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    const preview =
      this.currentStroke && this.currentStroke.points.length > 0
        ? [commitFreedraw('__preview', this.currentStroke.points)]
        : []
    renderElements(
      ctx,
      [...this.getElements(), ...preview],
      this.view,
      w,
      h,
      this.getCardLabel,
      readToken('--color-canvas', '#f8fafc'),
    )
  }
```

- [ ] **Step 3.4:跑 adapter 测试,确认绿**

Run: `cd /Users/jinxunuo/projects/cys-stift/apps/web && pnpm exec vitest run src/features/canvas/host/__tests__/self-built-adapter.test.ts`
Expected: PASS —— 原 4(拖拽 2 + pan/zoom 2)+ freedraw 3 = 7 项。

- [ ] **Step 3.5:全部 host 测试 + build**

Run: `cd /Users/jinxunuo/projects/cys-stift/apps/web && pnpm exec vitest run src/features/canvas/host/ && cd /Users/jinxunuo/projects/cys-stift && pnpm --filter web build`
Expected: 全绿 + exit 0。

- [ ] **Step 3.6:Commit**

```bash
git add apps/web/src/features/canvas/host/self-built-adapter.ts apps/web/src/features/canvas/host/__tests__/self-built-adapter.test.ts
git commit -m "feat(canvas): Phase 1 freedraw T3 — SelfBuiltAdapter freedraw 输入(activeTool + 笔画累积 + commit + 预览)"
```

**Task 3 验收:** adapter 测试 7 项绿(含 freedraw 3);host 全绿;build exit 0;select 模式行为零变化。→ 自审 + review。

---

## Task 4:`/dev/canvas-self` 工具切换 UI + `__selfAdapter` + 冒烟 e2e

**Files:**
- Modify: `apps/web/src/app/dev/canvas-self/page.tsx`(lift adapter 到 ref;加 Select/Draw 按钮;暴露 `window.__selfAdapter`)
- Create: `scripts/phase1-freedraw-smoke.cjs`

**Interfaces:**
- Consumes: Task 3 的 `setTool`/`getTool`;`window.__selfAdapter`(本 Task 暴露)。
- Produces: `/dev/canvas-self` 有 Select/Draw 按钮;`window.__selfAdapter` 供冒烟 + devtools。

**必守约束:** 主路由零改动;按钮样式走 token(不裸 hex);卸载时 `delete window.__selfAdapter` + detach。

- [ ] **Step 4.1:改 `/dev/canvas-self/page.tsx`**

替换整个文件为:

```tsx
// apps/web/src/app/dev/canvas-self/page.tsx
'use client'

/**
 * Phase 1 dev 挂载页 — SelfBuiltAdapter(Canvas 2D)与主画布(tldraw)并存验证。
 * 复用 Phase 0 的 canvas-binding(host 无关):卡片从 CardService 加载、拖拽回写。
 * freedraw(本计划):Select/Draw 工具切换;Draw 模式手绘 → 向量点序列。
 * 不碰主路由 /canvas;Phase 2 真正替换 tldraw 才动 /canvas。
 */
import { useEffect, useRef, useState } from 'react'
import { useDb } from '@/lib/db-client'
import { DEFAULT_CANVAS_ID } from '@/features/canvas/default-canvas'
import { loadCardsIntoEditor, bindCardWriteback } from '@/features/canvas/canvas-binding'
import { SelfBuiltAdapter } from '@/features/canvas/host/self-built-adapter'

type Tool = 'select' | 'freedraw'

export default function CanvasSelfPage() {
  const { service } = useDb()
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const adapterRef = useRef<SelfBuiltAdapter | null>(null)
  const [tool, setTool] = useState<Tool>('select')

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const adapter = new SelfBuiltAdapter(canvas, {
      getCardLabel: (id) => service.get(id as never)?.title ?? '',
    })
    adapterRef.current = adapter
    if (typeof window !== 'undefined') {
      ;(window as unknown as { __selfAdapter?: SelfBuiltAdapter }).__selfAdapter = adapter
    }
    loadCardsIntoEditor(adapter, service, DEFAULT_CANVAS_ID)
    const unbind = bindCardWriteback(adapter, service, DEFAULT_CANVAS_ID)
    return () => {
      unbind()
      adapter.detach()
      adapterRef.current = null
      if (typeof window !== 'undefined') {
        delete (window as unknown as { __selfAdapter?: SelfBuiltAdapter }).__selfAdapter
      }
    }
  }, [service])

  const switchTool = (t: Tool) => {
    setTool(t)
    adapterRef.current?.setTool(t)
  }

  const btn = (t: Tool, label: string) => (
    <button
      onClick={() => switchTool(t)}
      style={{
        padding: 'var(--space-1) var(--space-2)',
        border: 'var(--border-hairline)',
        background: tool === t ? 'var(--color-black)' : 'var(--color-white)',
        color: tool === t ? 'var(--color-white)' : 'var(--color-black)',
        fontFamily: 'var(--font-mono)',
        fontSize: 'var(--font-size-xs)',
        cursor: 'pointer',
      }}
    >
      {label}
    </button>
  )

  return (
    <div style={{ width: '100vw', height: '100vh', position: 'relative' }}>
      <div style={{ position: 'absolute', top: 'var(--space-2)', left: 'var(--space-2)', display: 'flex', gap: 'var(--space-1)', zIndex: 10 }}>
        {btn('select', 'Select')}
        {btn('freedraw', 'Draw')}
      </div>
      <canvas ref={canvasRef} style={{ width: '100%', height: '100%', display: 'block', touchAction: 'none' }} />
    </div>
  )
}
```

- [ ] **Step 4.2:build,确认 /dev/canvas-self 产物 + 无 tldraw**

Run: `cd /Users/jinxunuo/projects/cys-stift && pnpm --filter web build`
Expected: exit 0;`/dev/canvas-self` 列出。

- [ ] **Step 4.3:写 `scripts/phase1-freedraw-smoke.cjs`**

```js
// scripts/phase1-freedraw-smoke.cjs — 真实冒烟 /dev/canvas-self 的 freedraw 输入。
// 运行:先 pnpm --filter web build + 静态服务 :3016,再 node scripts/phase1-freedraw-smoke.cjs
const puppeteer = require('puppeteer-core')
const fs = require('fs')
const path = require('path')
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const URL = 'http://localhost:3016'
const wait = (ms) => new Promise((r) => setTimeout(r, ms))
const out = path.join(__dirname, '..', 'docs', 'design', 'screenshots', 'phase1-freedraw-smoke')
fs.mkdirSync(out, { recursive: true })

let pass = 0, fail = 0
const check = (n, ok, d = '') => { ok ? (pass++, console.log(`  ✓ ${n}${d ? ' — ' + d : ''}`)) : (fail++, console.log(`  ✗ ${n}${d ? ' — ' + d : ''}`)) }

;(async () => {
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox', '--disable-gpu'], defaultViewport: { width: 1440, height: 900 } })
  const page = await browser.newPage()
  const errs = []
  page.on('pageerror', (e) => errs.push(e.message))

  await page.goto(URL + '/dev/canvas-self', { waitUntil: 'networkidle0', timeout: 30000 })
  await wait(1500)
  check('page mounts, no pageerror', errs.length === 0, `${errs.length} errors`)

  // 切到 Draw 工具(经暴露的 __selfAdapter,避开 AppMenu 偏移的点按钮命中问题)
  const switched = await page.evaluate(() => {
    const a = window.__selfAdapter
    if (!a) return false
    a.setTool('freedraw')
    return a.getTool() === 'freedraw'
  })
  check('setTool(freedraw) via __selfAdapter', switched)

  // 画一笔:pointerdown/move×3/up。坐标按 canvas getBoundingClientRect 算(避 AppMenu 偏移)。
  const drew = await page.evaluate(() => {
    const canvas = document.querySelector('canvas')
    const a = window.__selfAdapter
    if (!canvas || !a) return { error: 'no canvas/adapter' }
    const rect = canvas.getBoundingClientRect()
    const ev = (type, px, py) => new PointerEvent(type, { pointerId: 1, pointerType: 'mouse', bubbles: true, clientX: rect.left + px, clientY: rect.top + py })
    canvas.dispatchEvent(ev('pointerdown', 100, 100))
    canvas.dispatchEvent(ev('pointermove', 150, 120))
    canvas.dispatchEvent(ev('pointermove', 200, 100))
    canvas.dispatchEvent(ev('pointerup', 200, 100))
    const f = a.getElements().filter((e) => e.kind === 'freedraw')
    return f.length === 1
      ? { ok: true, points: f[0].meta?.points?.length, bbox: { x: f[0].x, y: f[0].y, w: f[0].w, h: f[0].h } }
      : { ok: false, count: f.length }
  })
  check('drew 1 freedraw element with 3 points + bbox', drew.ok && drew.points === 3, JSON.stringify(drew))

  await page.screenshot({ path: path.join(out, 'freedraw-drawn.png') })
  await browser.close()
  console.log(`\n${fail === 0 ? '✓' : '✗'} ${pass} passed, ${fail} failed`)
  process.exit(fail === 0 ? 0 : 1)
})().catch((e) => { console.error('FATAL', e); process.exit(2) })
```

- [ ] **Step 4.4:起静态服务 + 跑冒烟**

```bash
cd /Users/jinxunuo/projects/cys-stift && pnpm --filter web build
# 后台:python3 -m http.server 3016 --directory apps/web/out
# sleep 1;curl -sL http://localhost:3016/dev/canvas-self → 200
# node scripts/phase1-freedraw-smoke.cjs
# 跑完 kill python
```
Expected: 3/3 绿(挂载无错、setTool 成功、画一笔产 1 freedraw + 3 点 + bbox)。

- [ ] **Step 4.5:Commit**

```bash
git add apps/web/src/app/dev/canvas-self/page.tsx scripts/phase1-freedraw-smoke.cjs
git commit -m "feat(canvas): Phase 1 freedraw T4 — /dev/canvas-self 工具切换 UI + __selfAdapter + 手绘冒烟 e2e"
```

**Task 4 验收:** build exit 0;冒烟 3/3;主路由零改动;`window.__selfAdapter` 卸载时 delete。→ 自审 + review → **Phase 1 freedraw 完成**。

---

## Phase 1 freedraw 总验收

```bash
cd /Users/jinxunuo/projects/cys-stift/apps/web && pnpm exec vitest run src/features/canvas/host/   # 全绿(契约 12 + 渲染 5 + 命中 3 + adapter 7 + tldraw-adapter 7 + freedraw 5 = 39)
cd /Users/jinxunuo/projects/cys-stift && pnpm --filter web build                                    # exit 0
node scripts/phase1-freedraw-smoke.cjs                                                              # 3/3(需静态服务 :3016)
```
+ `grep -r "@tldraw" apps/web/src/features/canvas/host/self-built-freedraw.ts` → 无命中。
+ 主路由 `/canvas`(tldraw)零改动。
+ freedraw 点序列不进 DSL(serializeCanvas 对 freedraw 只出 pos —— Phase 0 T0.3 已落实,本计划不改 DSL,review 时确认 `serializeCanvas` 对 freedraw 仍只出 `[freedraw #id] @pos`)。

**产出:** 自研渲染器支持手绘输入(向量点序列),实时预览 + commit,工具切换 UI。为 Phase 1 后续(文本编辑 IME / arrow 关系 / 交互打磨)奠基。

## Self-Review(plan 自检)

- **Spec 覆盖**:freedraw 数据(Task 1)→ 渲染(Task 2)→ 输入(Task 3)→ UI+冒烟(Task 4),四块全覆盖。R2(点序列不进 DSL)由 Phase 0 T0.3 已落实,本计划不改 DSL——review 时核对 `serializeCanvas` 的 freedraw 分支仍只出 pos。
- **占位符扫描**:无 TBD/TODO 占位(Task 3 的 `batch` 里的 TODO 是 Phase 0 遗留的 undo 标注,非本计划范围)。每步代码完整。
- **类型一致性**:`commitFreedraw(id, points, color?)` 在 Task 1 定义、Task 3 onUp + renderNow 消费,签名一致;`meta.points` 类型 `[number, number][]` 贯穿;`setTool('select'|'freedraw')` 在 Task 3 定义、Task 4 调用,一致;`bboxOf` 返回 `{x,y,w,h}` 在 Task 1 测试 + commitFreedraw 一致。
- **范围**:本计划自包含,产出可测软件(纯函数 + 渲染 + 输入 + 冒烟)。文本/arrow/打磨/Phase 2 各自另开 plan。
