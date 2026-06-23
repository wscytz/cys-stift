# 画布自研 · Phase 1 交互打磨(2):resize handle(缩放)

> **For agentic workers:** REQUIRED SUB-SKILL: 用 superpowers:subagent-driven-development(推荐)或 superagents:executing-plans 逐 Task 执行。步骤用 `- [ ]` 跟踪。

**Goal:** 选中元素的四角出 resize handle;拖角缩放元素(对角固定,clamp 最小尺寸)。建在打磨(1)的 selection 上。

**Architecture:** handle 是纯函数:`handleAtPoint(el, point, zoom)` 命中四角之一、`resizeGeometry(handle, start, point)` 算新 bbox(对角固定 + min 10 clamp)。渲染:`drawSelectionOutlines` 除 dashed 框外再画四角 handle 方块。交互:select 模式 onDown 先查「点是否落在选中元素的 handle 上」→ 是则进 resize(move 用 resizeGeometry upsert,up 结束);否则走现有 drag/deselect/pan。handle-hit 优先于 body drag。

**Tech Stack:** TypeScript strict、Canvas 2D、vitest、puppeteer-core。零 tldraw。

## Global Constraints(每个 Task implicit 必守)

- spec 冻结;feature-flag 只在 `/dev/*`,不碰主路由 `/canvas`。
- `packages/domain` 零依赖;颜色走 token;**零 tldraw**。
- 静态导出;jsdom `ctx===null` 容错。
- resize 仅 **select 模式 + 选中元素**触发;freedraw/text 模式不 resize。
- 每步 TDD + review 闸;不假装通过。

## File Structure

**新增:**
- `apps/web/src/features/canvas/host/self-built-resize.ts` — `Handle` type + `handleAtPoint` + `resizeGeometry`(纯函数)。
- `apps/web/src/features/canvas/host/__tests__/self-built-resize.test.ts`。
- `scripts/phase1-resize-smoke.cjs`。

**修改:**
- `apps/web/src/features/canvas/host/self-built-render.ts` — `drawSelectionOutlines` 加四角 handle 方块。
- `apps/web/src/features/canvas/host/__tests__/self-built-render.test.ts` — 加 handle 渲染断言。
- `apps/web/src/features/canvas/host/self-built-adapter.ts` — `resizing` 状态 + onDown handle-hit 优先 + onMove resizeGeometry + onUp 结束。

---

## Task 1:resize 纯函数(handleAtPoint + resizeGeometry)+ 测试

**Files:**
- Create: `apps/web/src/features/canvas/host/self-built-resize.ts`
- Test: `apps/web/src/features/canvas/host/__tests__/self-built-resize.test.ts`

**Interfaces:**
- Consumes: 无(纯几何)。
- Produces:`Handle = 'nw'|'ne'|'sw'|'se'`、`handleAtPoint(el, point, zoom): Handle|null`、`resizeGeometry(handle, start, point): {x,y,w,h}` —— Task 3 adapter 用。

**必守约束:** 纯函数;handle 命中容差 6 屏幕px(/zoom 换页坐标);resizeGeometry 对角固定 + min 尺寸 10 clamp;四舍五入。

- [ ] **Step 1.1:写失败测试**

```ts
// apps/web/src/features/canvas/host/__tests__/self-built-resize.test.ts
import { describe, expect, it } from 'vitest'
import { handleAtPoint, resizeGeometry, type Handle } from '../self-built-resize'

const el = { x: 100, y: 100, w: 100, h: 100 } // 四角:nw(100,100) ne(200,100) sw(100,200) se(200,200)

describe('handleAtPoint', () => {
  it('命中四角', () => {
    expect(handleAtPoint(el, { x: 100, y: 100 }, 1)).toBe('nw')
    expect(handleAtPoint(el, { x: 200, y: 100 }, 1)).toBe('ne')
    expect(handleAtPoint(el, { x: 100, y: 200 }, 1)).toBe('sw')
    expect(handleAtPoint(el, { x: 200, y: 200 }, 1)).toBe('se')
  })
  it('中心 → null', () => {
    expect(handleAtPoint(el, { x: 150, y: 150 }, 1)).toBeNull()
  })
  it('超出容差 → null(容差 6px,zoom=1)', () => {
    expect(handleAtPoint(el, { x: 107, y: 100 }, 1)).toBe('nw') // 距角 7 → wait 7>6 应 null
  })
  it('zoom=2 时页坐标容差减半(6/2=3 页单位)', () => {
    expect(handleAtPoint(el, { x: 102, y: 100 }, 2)).toBe('nw') // 距角 2 ≤ 3 → nw
    expect(handleAtPoint(el, { x: 105, y: 100 }, 2)).toBeNull() // 距角 5 > 3 → null
  })
})

describe('resizeGeometry', () => {
  const start = { x: 100, y: 100, w: 100, h: 100 } // right=200 bottom=200
  it('se 拖小:fixed=nw', () => {
    expect(resizeGeometry('se', start, { x: 150, y: 150 })).toEqual({ x: 100, y: 100, w: 50, h: 50 })
  })
  it('nw 拖:fixed=se,x/y 随指针', () => {
    expect(resizeGeometry('nw', start, { x: 120, y: 120 })).toEqual({ x: 120, y: 120, w: 80, h: 80 })
  })
  it('ne 拖:fixed=sw', () => {
    expect(resizeGeometry('ne', start, { x: 150, y: 80 })).toEqual({ x: 100, y: 80, w: 50, h: 120 })
  })
  it('sw 拖:fixed=ne', () => {
    expect(resizeGeometry('sw', start, { x: 80, y: 150 })).toEqual({ x: 80, y: 100, w: 120, h: 50 })
  })
  it('se clamp 到 min 10', () => {
    expect(resizeGeometry('se', start, { x: 101, y: 101 })).toEqual({ x: 100, y: 100, w: 10, h: 10 })
  })
  it('nw clamp 到 min 10(对角固定)', () => {
    expect(resizeGeometry('nw', start, { x: 195, y: 195 })).toEqual({ x: 190, y: 190, w: 10, h: 10 })
  })
})
```

> 注:上面 `handleAtPoint(el, { x: 107, y: 100 }, 1)).toBe('nw')` 那条写错了——距角 7 > 容差 6 → 应是 `null`。**实现时这条断言改成 `toBeNull()`**(7>6 不命中)。

- [ ] **Step 1.2:跑,确认红**

Run: `cd /Users/jinxunuo/projects/cys-stift/apps/web && pnpm exec vitest run src/features/canvas/host/__tests__/self-built-resize.test.ts`
Expected: FAIL — `handleAtPoint/resizeGeometry is not exported`。

- [ ] **Step 1.3:写 `self-built-resize.ts`**

```ts
// apps/web/src/features/canvas/host/self-built-resize.ts
'use client'

/** resize handle:四角。 */
export type Handle = 'nw' | 'ne' | 'sw' | 'se'

const HANDLE_HIT_PX = 6 // 屏幕 px;页坐标里 /zoom
const MIN_SIZE = 10

/** 点是否落在元素某角(handle)上;容差 6 屏幕px。无则 null。 */
export function handleAtPoint(
  el: { x: number; y: number; w: number; h: number },
  point: { x: number; y: number },
  zoom: number,
): Handle | null {
  const tol = HANDLE_HIT_PX / zoom
  const corners: Record<Handle, { x: number; y: number }> = {
    nw: { x: el.x, y: el.y },
    ne: { x: el.x + el.w, y: el.y },
    sw: { x: el.x, y: el.y + el.h },
    se: { x: el.x + el.w, y: el.y + el.h },
  }
  for (const k of Object.keys(corners) as Handle[]) {
    const c = corners[k]
    if (Math.abs(point.x - c.x) <= tol && Math.abs(point.y - c.y) <= tol) return k
  }
  return null
}

/**
 * 拖 handle 到 point 的新 bbox。对角固定,MIN_SIZE=10 clamp。
 * se:fixed=nw;nw:fixed=se;ne:fixed=sw;sw:fixed=ne。
 */
export function resizeGeometry(
  handle: Handle,
  start: { x: number; y: number; w: number; h: number },
  point: { x: number; y: number },
): { x: number; y: number; w: number; h: number } {
  const right = start.x + start.w
  const bottom = start.y + start.h
  let x = start.x
  let y = start.y
  let w = start.w
  let h = start.h
  switch (handle) {
    case 'se':
      w = point.x - x
      h = point.y - y
      break
    case 'ne':
      w = point.x - x
      y = point.y
      h = bottom - point.y
      break
    case 'sw':
      x = point.x
      w = right - point.x
      h = point.y - y
      break
    case 'nw':
      x = point.x
      y = point.y
      w = right - point.x
      h = bottom - point.y
      break
  }
  if (w < MIN_SIZE) {
    if (handle === 'nw' || handle === 'sw') x = right - MIN_SIZE
    w = MIN_SIZE
  }
  if (h < MIN_SIZE) {
    if (handle === 'nw' || handle === 'ne') y = bottom - MIN_SIZE
    h = MIN_SIZE
  }
  return { x: Math.round(x), y: Math.round(y), w: Math.round(w), h: Math.round(h) }
}
```

- [ ] **Step 1.4:跑,确认绿(注意 Step 1.1 标的断言修正:107 那条改 toBeNull)**

Run: `cd /Users/jinxunuo/projects/cys-stift/apps/web && pnpm exec vitest run src/features/canvas/host/__tests__/self-built-resize.test.ts`
Expected: PASS —— handleAtPoint 4 + resizeGeometry 6 = 10 项(修正后)。

- [ ] **Step 1.5:build**

Run: `cd /Users/jinxunuo/projects/cys-stift && pnpm --filter web build`
Expected: exit 0。

- [ ] **Step 1.6:Commit**

```bash
cd /Users/jinxunuo/projects/cys-stift && git add apps/web/src/features/canvas/host/self-built-resize.ts apps/web/src/features/canvas/host/__tests__/self-built-resize.test.ts
git commit -m "feat(canvas): Phase 1 resize T1 — handleAtPoint + resizeGeometry 纯函数 + 单测"
```

**Task 1 验收:** 10 项单测绿(含 107→null 修正);build exit 0;零 tldraw。→ 自审 + review。

---

## Task 2:drawSelectionOutlines 画四角 handle + 测试

**Files:**
- Modify: `apps/web/src/features/canvas/host/self-built-render.ts`(`drawSelectionOutlines` 加 handle 方块)
- Test: `apps/web/src/features/canvas/host/__tests__/self-built-render.test.ts`

**Interfaces:**
- Consumes: `readToken`(已 export)。
- Produces:`drawSelectionOutlines` 现在画 dashed 框 + 四角 handle 方块。

**必守约束:** handle 走 token(白填 + 蓝描);handle 尺寸 3/zoom(6px 方块);颜色不裸 hex。

- [ ] **Step 2.1:加 handle 渲染断言(先红)**

`self-built-render.test.ts` 的 `drawSelectionOutlines` describe 里加一项(在现有「只画选中」用例之后):

```ts
  it('drawSelectionOutlines draws handle squares at the 4 corners of selected elements', () => {
    const ctx = mockCtx()
    const els = [{ id: 'c1', kind: 'card', x: 10, y: 20, w: 100, h: 60, rotation: 0 }] as unknown as CanvasElement[]
    drawSelectionOutlines(ctx, ['c1'], els, { panX: 0, panY: 0, zoom: 1, gridMode: 'free' })
    // handle hs=3(zoom1):nw(10,20)→ fillRect(7,17,6,6);se(110,80)→ fillRect(107,77,6,6)
    expect(ctx._calls).toContain('fillRect(7,17,6,6)')
    expect(ctx._calls).toContain('fillRect(107,77,6,6)')
    // ne(110,20)→ strokeRect(107,17,6,6);sw(10,80)→ strokeRect(7,77,6,6)
    expect(ctx._calls).toContain('strokeRect(107,17,6,6)')
    expect(ctx._calls).toContain('strokeRect(7,77,6,6)')
  })
```

- [ ] **Step 2.2:跑,确认红**

Run: `cd /Users/jinxunuo/projects/cys-stift/apps/web && pnpm exec vitest run src/features/canvas/host/__tests__/self-built-render.test.ts`
Expected: FAIL —— 现在没画 handle → fillRect(7,17,6,6) 缺。

- [ ] **Step 2.3:`drawSelectionOutlines` 加 handle 方块**

把 `drawSelectionOutlines` 里的元素循环改成(画 dashed 框 + 四角 handle):

```ts
export function drawSelectionOutlines(
  ctx: CanvasRenderingContext2D,
  selectedIds: string[],
  elements: CanvasElement[],
  view: CanvasView,
): void {
  if (selectedIds.length === 0) return
  const sel = new Set(selectedIds)
  ctx.save()
  ctx.translate(view.panX, view.panY)
  ctx.scale(view.zoom, view.zoom)
  ctx.strokeStyle = readToken('--color-blue', '#1d4ed8')
  ctx.lineWidth = 1.5 / view.zoom
  ctx.setLineDash([6 / view.zoom, 4 / view.zoom])
  const hs = 3 / view.zoom // handle 半边长 → 6px 方块
  for (const el of elements) {
    if (!sel.has(el.id)) continue
    // dashed 选中框(外扩 2px)
    ctx.strokeRect(el.x - 2, el.y - 2, el.w + 4, el.h + 4)
    // 四角 handle 方块(白填 + 蓝描)
    const corners: [number, number][] = [
      [el.x, el.y],
      [el.x + el.w, el.y],
      [el.x, el.y + el.h],
      [el.x + el.w, el.y + el.h],
    ]
    ctx.setLineDash([])
    ctx.fillStyle = readToken('--color-white', '#ffffff')
    for (const [cx, cy] of corners) {
      ctx.fillRect(cx - hs, cy - hs, hs * 2, hs * 2)
      ctx.strokeRect(cx - hs, cy - hs, hs * 2, hs * 2)
    }
    ctx.setLineDash([6 / view.zoom, 4 / view.zoom]) // 复位 dash 给下一个元素
  }
  ctx.restore()
}
```

- [ ] **Step 2.4:跑渲染测试,确认绿(含 selection-T2 原有 2 项不退化)**

Run: `cd /Users/jinxunuo/projects/cys-stift/apps/web && pnpm exec vitest run src/features/canvas/host/__tests__/self-built-render.test.ts`
Expected: PASS —— 原 11 + handle 1 = 12 项。

- [ ] **Step 2.5:全部 host 测试 + build**

Run: `cd /Users/jinxunuo/projects/cys-stift/apps/web && pnpm exec vitest run src/features/canvas/host/ && cd /Users/jinxunuo/projects/cys-stift && pnpm --filter web build`
Expected: 全绿 + exit 0。

- [ ] **Step 2.6:Commit**

```bash
cd /Users/jinxunuo/projects/cys-stift && git add apps/web/src/features/canvas/host/self-built-render.ts apps/web/src/features/canvas/host/__tests__/self-built-render.test.ts
git commit -m "feat(canvas): Phase 1 resize T2 — drawSelectionOutlines 加四角 handle 方块"
```

**Task 2 验收:** 渲染测试 12 项绿;selection-T2 原 2 项不退化;build exit 0;颜色走 token。→ 自审 + review。

---

## Task 3:adapter resize 交互(resizing 状态 + onDown handle-hit 优先 + onMove/onUp)+ 测试

**Files:**
- Modify: `apps/web/src/features/canvas/host/self-built-adapter.ts`
- Test: `apps/web/src/features/canvas/host/__tests__/self-built-adapter.test.ts`

**Interfaces:**
- Consumes: Task 1 `handleAtPoint`/`resizeGeometry`;Task 1 selection `getSelectedIds`/`getElement`/`upsert`。
- Produces:select 模式拖 handle → 缩放元素。

**必守约束:** resize 仅 select 模式 + 选中元素;handle-hit 优先于 body drag;freedraw/text 模式不 resize;move 用 resizeGeometry upsert(echo→onUserChange);min clamp 已在纯函数里。

- [ ] **Step 3.1:加 resize 测试(先红)**

`self-built-adapter.test.ts` 末尾加(复用 dispatch 模式):

```ts
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
```

- [ ] **Step 3.2:跑,确认红**

Run: `cd /Users/jinxunuo/projects/cys-stift/apps/web && pnpm exec vitest run src/features/canvas/host/__tests__/self-built-adapter.test.ts`
Expected: FAIL —— 拖 handle 不缩放(还没接 resize)。

- [ ] **Step 3.3:adapter 加 resize 交互**

顶部 import 加:

```ts
import { handleAtPoint, resizeGeometry, type Handle } from './self-built-resize'
```

字段区(在 `selectedIds` 之后,或 `currentStroke` 附近)加:

```ts
  private resizing: { id: string; handle: Handle; start: { x: number; y: number; w: number; h: number } } | null = null
```

`attachPointer` 的 `onDown` —— 在 freedraw 早退**之后**、`hitTest` **之前**插 handle-hit 检查:

```ts
      // resize handle 优先:选中元素的四角(仅 select 模式)
      if (this.activeTool === 'select' && this.selectedIds.size > 0) {
        const selId = [...this.selectedIds][0]!
        const sel = this.getElement(selId)
        if (sel) {
          const handle = handleAtPoint(sel, p, this.view.zoom)
          if (handle) {
            this.resizing = { id: selId, handle, start: { x: sel.x, y: sel.y, w: sel.w, h: sel.h } }
            try {
              this.canvas.setPointerCapture(e.pointerId)
            } catch {
              /* jsdom 无 setPointerCapture */
            }
            return
          }
        }
      }
      const id = hitTest(this.getElements(), p.x, p.y)
```

`onMove` —— 在 `currentStroke` 检查**之后**、`dragId` 检查**之前**插 resize:

```ts
      if (this.resizing) {
        const el = this.getElement(this.resizing.id)
        if (el) {
          const g = resizeGeometry(this.resizing.handle, this.resizing.start, p)
          this.upsert({ ...el, x: g.x, y: g.y, w: g.w, h: g.h })
        }
        return
      }
      if (this.dragId) {
```

`onUp` —— **最开头**插 resize 结束:

```ts
    const onUp = (e: PointerEvent) => {
      if (this.resizing) {
        this.resizing = null
        try {
          this.canvas.releasePointerCapture(e.pointerId)
        } catch {
          /* 已释放 */
        }
        return
      }
      if (this.currentStroke) {
        // ……(原 freedraw commit 不动)
```

- [ ] **Step 3.4:跑 adapter 测试,确认绿**

Run: `cd /Users/jinxunuo/projects/cys-stift/apps/web && pnpm exec vitest run src/features/canvas/host/__tests__/self-built-adapter.test.ts`
Expected: PASS —— 原 14 + resize 3 = 17 项。

- [ ] **Step 3.5:全部 host 测试 + build**

Run: `cd /Users/jinxunuo/projects/cys-stift/apps/web && pnpm exec vitest run src/features/canvas/host/ && cd /Users/jinxunuo/projects/cys-stift && pnpm --filter web build`
Expected: 全绿 + exit 0。

- [ ] **Step 3.6:Commit**

```bash
cd /Users/jinxunuo/projects/cys-stift && git add apps/web/src/features/canvas/host/self-built-adapter.ts apps/web/src/features/canvas/host/__tests__/self-built-adapter.test.ts
git commit -m "feat(canvas): Phase 1 resize T3 — SelfBuiltAdapter resize 交互(handle-hit 优先 + resizeGeometry upsert)"
```

**Task 3 验收:** adapter 测试 17 项绿;select/drag/pan/freedraw/text/delete 零退化;build exit 0。→ 自审 + review。

---

## Task 4:`/dev/canvas-self` resize 冒烟

**Files:**
- Create: `scripts/phase1-resize-smoke.cjs`

**Interfaces:**
- Consumes: Task 1-3;`window.__selfAdapter`。
- Produces:冒烟验 select 模式拖 handle 缩放真实 Chrome。

**必守约束:** 主路由零改动;静态服务跑完 kill;不假装通过。

- [ ] **Step 4.1:写 `scripts/phase1-resize-smoke.cjs`**

```js
// scripts/phase1-resize-smoke.cjs — 真实冒烟 /dev/canvas-self 的 resize handle。
// 运行:先 pnpm --filter web build + 静态服务 :3016,再 node scripts/phase1-resize-smoke.cjs
const puppeteer = require('puppeteer-core')
const fs = require('fs')
const path = require('path')
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const URL = 'http://localhost:3016'
const wait = (ms) => new Promise((r) => setTimeout(r, ms))
const out = path.join(__dirname, '..', 'docs', 'design', 'screenshots', 'phase1-resize-smoke')
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

  // 放一张 card + 选中它
  const rect = await page.evaluate(() => {
    window.__selfAdapter.upsert({ id: 'ca', kind: 'card', x: 300, y: 300, w: 200, h: 120, rotation: 0 })
    window.__selfAdapter.setTool('select')
    window.__selfAdapter.setSelectedIds(['ca'])
    const r = document.querySelector('canvas').getBoundingClientRect()
    return { left: r.left, top: r.top }
  })

  // SE 角在页 (300+200, 300+120) = (500,420);相机 pan0/zoom1 → 屏幕 +rect.left/top
  // down 在 SE → 进 resize;move 到 (550,470) → se: w=550-300=250, h=470-300=170
  await page.mouse.move(rect.left + 500, rect.top + 420)
  await page.mouse.down()
  await wait(50)
  await page.mouse.move(rect.left + 550, rect.top + 470)
  await page.mouse.up()
  await wait(200)

  const after = await page.evaluate(() => {
    const c = window.__selfAdapter.getElement('ca')
    return c ? { w: c.w, h: c.h } : null
  })
  check('drag SE handle resized the card (w 200→250, h 120→170)', after && after.w === 250 && after.h === 170, JSON.stringify(after))
  await page.screenshot({ path: path.join(out, 'resized.png') })

  await browser.close()
  console.log(`\n${fail === 0 ? '✓' : '✗'} ${pass} passed, ${fail} failed`)
  process.exit(fail === 0 ? 0 : 1)
})().catch((e) => { console.error('FATAL', e); process.exit(2) })
```

- [ ] **Step 4.2:起静态服务 + 跑冒烟**

```bash
cd /Users/jinxunuo/projects/cys-stift && pnpm --filter web build
# 后台:python3 -m http.server 3016 --directory apps/web/out
# sleep 1;curl -sL http://localhost:3016/dev/canvas-self → 200
# node scripts/phase1-resize-smoke.cjs
# 跑完 kill python(释放 3016)
```
Expected: 2/2 绿(挂载、拖 SE handle 缩放到 250×170)。

> `page.mouse.move/down/move/up` 经真实 pointer 事件触发 adapter 的 onDown(handle-hit)→ onMove(resizeGeometry)。坐标按 canvas getBoundingClientRect 算(避 AppMenu 偏移)。

- [ ] **Step 4.3:Commit**

```bash
cd /Users/jinxunuo/projects/cys-stift && git add scripts/phase1-resize-smoke.cjs
git commit -m "test(canvas): Phase 1 resize T4 — /dev/canvas-self resize handle 冒烟 e2e"
```

**Task 4 验收:** 冒烟 2/2;主路由零改动;3016 已释放。→ 自审 + review → **Phase 1 打磨(2)resize 完成**。

---

## Phase 1 resize 总验收

```bash
cd /Users/jinxunuo/projects/cys-stift/apps/web && pnpm exec vitest run src/features/canvas/host/   # 全绿(契约 12 + 渲染 12 + 命中 3 + adapter 17 + tldraw-adapter 7 + freedraw 5 + arrow 8 + text 8 + resize 10 = 82)
cd /Users/jinxunuo/projects/cys-stift && pnpm --filter web build                                    # exit 0
node scripts/phase1-resize-smoke.cjs                                                                # 2/2(需静态服务 :3016)
```
+ 主路由 `/canvas`(tldraw)零改动;零 tldraw 新增;颜色走 token。

**产出:** 选中元素四角可拖缩放(对角固定 + min clamp),handle 视觉 + 交互。为多选/arrow 交互创建/更多键盘奠基。

## Self-Review(plan 自检)

- **Spec 覆盖**:纯函数(Task 1)→ handle 渲染(Task 2)→ adapter resize 交互(Task 3)→ 冒烟(Task 4)。min clamp 由纯函数测;handle-hit 优先由 adapter 测。
- **占位符**:Task 3 onMove/onUp 用「// ……(原 … 不动)」指代保留现有分支 —— 执行时只在 onDown 插 handle-hit、onMove 插 resize、onUp 开头插 resize 结束,不重写其它。Task 1 标了一处测试断言错(107 应 toBeNull,非 toBe('nw')),实现时修正。
- **类型一致**:`Handle`、`handleAtPoint(el, point, zoom)`、`resizeGeometry(handle, start, point)` 在 T1 定义、T3 import 消费,签名一致;`resizing` 状态 `{id, handle, start}` 在 T3 定义/用一致。
- **范围**:resize(四角)自包含。边 handle(8 个)/ 等比缩放 / 多选组 resize 各自后续 plan。
- **T1 测试断言修正**:Step 1.1 里 `handleAtPoint(el, {x:107,y:100}, 1)).toBe('nw')` 写错 —— 7>6 容差应 null。**实现时改 `toBeNull()`**。
