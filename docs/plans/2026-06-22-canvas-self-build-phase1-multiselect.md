# 画布自研 · Phase 1 交互打磨(3):多选 + 组移动

> **For agentic workers:** REQUIRED SUB-SKILL: 用 superpowers:subagent-driven-development(推荐)或 superagents:executing-plans 逐 Task 执行。步骤用 `- [ ]` 跟踪。

**Goal:** select 模式下 **shift-click 累加选择**(切换单个元素)、**空白拖拽框选**(矩形相交的多元素)、**组移动**(拖任一选中元素,所有选中元素一起移)。建在 selection/resize 上。

**Architecture:** 多选改 `onDown` 命中分支:无 shift → 单选替换(现有);有 shift → 切换该 id(在/不在 selectedIds)。框选:空白 mousedown + shift → 进 marquee(记起点+预览),move 更新预览矩形并实时相交命中,up commit 成 selectedIds。组移动:`dragId` 扩成 `dragGroup`(ids[])+ 每个元素的 dragOffset;move 时全组 upsert。纯函数 `rectsIntersect` / `marqueeSelect` 可单测。

**Tech Stack:** TypeScript strict、Canvas 2D、vitest、puppeteer-core。零 tldraw。

## Global Constraints(每个 Task implicit 必守)

- spec 冻结;feature-flag 只在 `/dev/*`,不碰主路由 `/canvas`。
- `packages/domain` 零依赖;颜色走 token;**零 tldraw**。
- 静态导出;jsdom `ctx===null` 容错。
- 多选仅 **select 模式**;freedraw/text 模式不触发;shift+框选不与 pan 冲突(shift-空白 = 框选,无 shift 空白 = pan,现有)。
- 每步 TDD + review 闸;不假装通过。

## File Structure

**新增:**
- `apps/web/src/features/canvas/host/self-built-marquee.ts` — 纯函数 `rectsIntersect` + `marqueeSelect`。
- `apps/web/src/features/canvas/host/__tests__/self-built-marquee.test.ts`。
- `scripts/phase1-multiselect-smoke.cjs`。

**修改:**
- `apps/web/src/features/canvas/host/self-built-adapter.ts` — `dragGroup` + `marquee` 状态;onDown shift-toggle + 框选;onMove 组移动 + 框选预览;onUp 框选 commit。
- `apps/web/src/features/canvas/host/__tests__/self-built-adapter.test.ts` — shift-toggle / 组移动 / 框选 单测。
- `apps/web/src/features/canvas/host/self-built-render.ts` — `drawMarquee` 纯函数 + renderNow 调它。
- `apps/web/src/features/canvas/host/__tests__/self-built-render.test.ts` — drawMarquee 断言。

---

## Task 1:marquee 纯函数(rectsIntersect + marqueeSelect)+ 测试

**Files:**
- Create: `apps/web/src/features/canvas/host/self-built-marquee.ts`
- Test: `apps/web/src/features/canvas/host/__tests__/self-built-marquee.test.ts`

**Interfaces:**
- Consumes: 无(纯几何)。
- Produces:`rectsIntersect(a,b): boolean`、`marqueeSelect(rect, elements): string[]`(命中元素 id)—— Task 3 用。

**必守约束:** 纯函数;含边接触算相交;空框(0 尺寸)→ 空结果。

- [ ] **Step 1.1:写失败测试**

```ts
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
    expect(marqueeSelect({ x: -5, y: -5, w: 25, h: 25 }, els)).toEqual(['a']) // 只 a 相交
  })
  it('大框全选', () => {
    expect(marqueeSelect({ x: -10, y: -10, w: 100, h: 100 }, els).sort()).toEqual(['a', 'b', 'c'])
  })
  it('空框(0 尺寸)→ 空', () => {
    expect(marqueeSelect({ x: 5, y: 5, w: 0, h: 0 }, els)).toEqual([])
  })
})
```

- [ ] **Step 1.2:跑,确认红**

Run: `cd /Users/jinxunuo/projects/cys-stift/apps/web && pnpm exec vitest run src/features/canvas/host/__tests__/self-built-marquee.test.ts`
Expected: FAIL — `rectsIntersect/marqueeSelect is not exported`。

- [ ] **Step 1.3:写 `self-built-marquee.ts`**

```ts
// apps/web/src/features/canvas/host/self-built-marquee.ts
'use client'

import type { CanvasElement } from './canvas-host'

interface Rect {
  x: number
  y: number
  w: number
  h: number
}

/** 两矩形是否相交(含边接触)。 */
export function rectsIntersect(a: Rect, b: Rect): boolean {
  return (
    a.x <= b.x + b.w &&
    a.x + a.w >= b.x &&
    a.y <= b.y + b.h &&
    a.y + a.h >= b.y
  )
}

/** 框选:返回与 rect 相交的元素 id。空框(0 尺寸)→ 空。 */
export function marqueeSelect(rect: Rect, elements: CanvasElement[]): string[] {
  if (rect.w === 0 || rect.h === 0) return []
  return elements.filter((el) => rectsIntersect(rect, { x: el.x, y: el.y, w: el.w, h: el.h })).map((el) => el.id)
}
```

- [ ] **Step 1.4:跑,确认绿**

Run: `cd /Users/jinxunuo/projects/cys-stift/apps/web && pnpm exec vitest run src/features/canvas/host/__tests__/self-built-marquee.test.ts`
Expected: PASS —— rectsIntersect 3 + marqueeSelect 3 = 6 项。

- [ ] **Step 1.5:build**

Run: `cd /Users/jinxunuo/projects/cys-stift && pnpm --filter web build`
Expected: exit 0。

- [ ] **Step 1.6:Commit**

```bash
cd /Users/jinxunuo/projects/cys-stift && git add apps/web/src/features/canvas/host/self-built-marquee.ts apps/web/src/features/canvas/host/__tests__/self-built-marquee.test.ts
git commit -m "feat(canvas): Phase 1 multiselect T1 — rectsIntersect + marqueeSelect 纯函数 + 单测"
```

**Task 1 验收:** 6 项单测绿;build exit 0;零 tldraw。→ 自审 + review。

---

## Task 2:drawMarquee 渲染(框选预览矩形)+ 测试

**Files:**
- Modify: `apps/web/src/features/canvas/host/self-built-render.ts`(加 `drawMarquee` export)
- Test: `apps/web/src/features/canvas/host/__tests__/self-built-render.test.ts`

**Interfaces:**
- Consumes: `readToken`(已 export)。
- Produces:`drawMarquee(ctx, rect, view)` —— Task 3 renderNow 调它。

**必守约束:** 颜色走 token;dashed 半透明;zoom 抵消;空 rect 不画。

- [ ] **Step 2.1:加 drawMarquee 测试(先红)**

`self-built-render.test.ts` 的 mockCtx 已有 fillRect/strokeRect/setLineDash。describe 末尾加:

```ts
  it('drawMarquee draws a dashed semi-transparent rect', () => {
    const ctx = mockCtx()
    drawMarquee(ctx, { x: 10, y: 20, w: 100, h: 60 }, { panX: 0, panY: 0, zoom: 1, gridMode: 'free' })
    expect(ctx._calls.some((c) => c.startsWith('fillRect(10,20,100,60)'))).toBe(true)
    expect(ctx._calls.some((c) => c.startsWith('strokeRect(10,20,100,60)'))).toBe(true)
    expect(ctx._calls.some((c) => c.startsWith('setLineDash'))).toBe(true)
  })
```

> 顶部 import 加 `drawMarquee`(从 `'../self-built-render'`,与 renderElements/drawSelectionOutlines 一起)。

- [ ] **Step 2.2:跑,确认红**

Run: `cd /Users/jinxunuo/projects/cys-stift/apps/web && pnpm exec vitest run src/features/canvas/host/__tests__/self-built-render.test.ts`
Expected: FAIL — `drawMarquee is not exported`。

- [ ] **Step 2.3:写 `drawMarquee`(self-built-render.ts 末尾)**

```ts
/** 画框选预览矩形(dashed + 半透明填充,在相机变换内)。空 rect 不画。 */
export function drawMarquee(
  ctx: CanvasRenderingContext2D,
  rect: { x: number; y: number; w: number; h: number },
  view: CanvasView,
): void {
  if (rect.w === 0 || rect.h === 0) return
  ctx.save()
  ctx.translate(view.panX, view.panY)
  ctx.scale(view.zoom, view.zoom)
  ctx.fillStyle = readToken('--color-blue', '#1d4ed8')
  ctx.globalAlpha = 0.1
  ctx.fillRect(rect.x, rect.y, rect.w, rect.h)
  ctx.globalAlpha = 1
  ctx.strokeStyle = readToken('--color-blue', '#1d4ed8')
  ctx.lineWidth = 1 / view.zoom
  ctx.setLineDash([4 / view.zoom, 4 / view.zoom])
  ctx.strokeRect(rect.x, rect.y, rect.w, rect.h)
  ctx.restore()
}
```

- [ ] **Step 2.4:跑渲染测试,确认绿**

Run: `cd /Users/jinxunuo/projects/cys-stift/apps/web && pnpm exec vitest run src/features/canvas/host/__tests__/self-built-render.test.ts`
Expected: PASS —— 原 12 + marquee 1 = 13 项。

- [ ] **Step 2.5:全部 host 测试 + build**

Run: `cd /Users/jinxunuo/projects/cys-stift/apps/web && pnpm exec vitest run src/features/canvas/host/ && cd /Users/jinxunuo/projects/cys-stift && pnpm --filter web build`
Expected: 全绿 + exit 0。

- [ ] **Step 2.6:Commit**

```bash
cd /Users/jinxunuo/projects/cys-stift && git add apps/web/src/features/canvas/host/self-built-render.ts apps/web/src/features/canvas/host/__tests__/self-built-render.test.ts
git commit -m "feat(canvas): Phase 1 multiselect T2 — drawMarquee(框选预览矩形)+ 渲染测试"
```

**Task 2 验收:** 渲染测试 13 项绿;host 全绿;build exit 0;颜色走 token。→ 自审 + review。

---

## Task 3:adapter 多选交互(shift-toggle + 组移动 + 框选)+ 测试

**Files:**
- Modify: `apps/web/src/features/canvas/host/self-built-adapter.ts`
- Test: `apps/web/src/features/canvas/host/__tests__/self-built-adapter.test.ts`

**Interfaces:**
- Consumes: Task 1 `marqueeSelect`;Task 1 selection;Task 2 `drawMarquee`(renderNow 调)。
- Produces:shift-click toggle、组移动、框选。

**必守约束:** 多选仅 select 模式;shift+空白=框选(无 shift 空白=pan);组移动全组 upsert;框选 up 时 commit selectedIds(无 shift 则替换,有 shift 则累加);freedraw/text/resize/drag 零退化。

- [ ] **Step 3.1:加多选测试(先红)**

`self-built-adapter.test.ts` 末尾加(复用 dispatch):

```ts
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
```

- [ ] **Step 3.2:跑,确认红**

Run: `cd /Users/jinxunuo/projects/cys-stift/apps/web && pnpm exec vitest run src/features/canvas/host/__tests__/self-built-adapter.test.ts`
Expected: FAIL —— shift-click 不累加 / 组移动 b 不动 / 框选不触发。

- [ ] **Step 3.3:adapter 加多选交互**

顶部 import 加:

```ts
import { marqueeSelect } from './self-built-marquee'
import { drawMarquee } from './self-built-render'
```

字段区(在 `resizing` 之后)加:

```ts
  private dragGroup: { ids: string[]; offsets: Map<string, { x: number; y: number }> } | null = null
  private marquee: { startX: number; startY: number; curX: number; curY: number } | null = null
```

`onDown` 改 —— **shift+空白优先**(框选,在 resize-hit 之前),然后 hit 分支支持 shift-toggle + 组移动:

```ts
    const onDown = (e: PointerEvent) => {
      if (this.activeTool === 'text') return
      const rect = this.canvas.getBoundingClientRect()
      const sx = e.clientX - rect.left
      const sy = e.clientY - rect.top
      const p = screenToPage(this.view, sx, sy)
      if (this.activeTool === 'freedraw') {
        // ……(原 freedraw 分支不动)
        return
      }
      // shift + 空白 → 框选(优先)
      if (this.activeTool === 'select' && e.shiftKey) {
        const hitId = hitTest(this.getElements(), p.x, p.y)
        if (!hitId) {
          this.marquee = { startX: p.x, startY: p.y, curX: p.x, curY: p.y }
          try { this.canvas.setPointerCapture(e.pointerId) } catch { /* jsdom */ }
          this.scheduleRender()
          return
        }
      }
      // resize handle 优先(仅 select 模式 + 有选中)
      if (this.activeTool === 'select' && this.selectedIds.size > 0) {
        const selId = [...this.selectedIds][0]!
        const sel = this.getElement(selId)
        if (sel) {
          const handle = handleAtPoint(sel, p, this.view.zoom)
          if (handle) {
            this.resizing = { id: selId, handle, start: { x: sel.x, y: sel.y, w: sel.w, h: sel.h } }
            try { this.canvas.setPointerCapture(e.pointerId) } catch { /* jsdom */ }
            return
          }
        }
      }
      const id = hitTest(this.getElements(), p.x, p.y)
      if (id) {
        const el = this.getElement(id)!
        if (e.shiftKey) {
          // shift-toggle
          const next = new Set(this.selectedIds)
          if (next.has(id)) next.delete(id)
          else next.add(id)
          this.setSelectedIds([...next])
        } else {
          // 普通点:若该元素已选中 → 保留组(准备组移动);否则单选替换
          if (!this.selectedIds.has(id)) this.setSelectedIds([id])
        }
        // 组移动:拖动所有选中元素
        const offsets = new Map<string, { x: number; y: number }>()
        for (const sid of this.selectedIds) {
          const sel = this.getElement(sid)
          if (sel) offsets.set(sid, { x: p.x - sel.x, y: p.y - sel.y })
        }
        this.dragGroup = { ids: [...this.selectedIds], offsets }
        this.dragId = id // 兼容现有 onMove 的 dragId 检查会触发;但我们改用 dragGroup
      } else if (!e.shiftKey) {
        // 空白 + 无 shift → pan + 清选择(现有)
        this.setSelectedIds([])
        this.panning = { startSx: sx, startSy: sy, fromPanX: this.view.panX, fromPanY: this.view.panY }
      }
      try { this.canvas.setPointerCapture(e.pointerId) } catch { /* jsdom */ }
    }
```

`onMove` 改 —— **marquee 优先**,然后 **dragGroup**(组移动)替代单 dragId:

```ts
    const onMove = (e: PointerEvent) => {
      const rect = this.canvas.getBoundingClientRect()
      const sx = e.clientX - rect.left
      const sy = e.clientY - rect.top
      if (this.marquee) {
        const p = screenToPage(this.view, sx, sy)
        this.marquee.curX = p.x
        this.marquee.curY = p.y
        this.scheduleRender()
        return
      }
      if (this.currentStroke) {
        // ……(原 freedraw 分支不动)
        return
      }
      if (this.resizing) {
        // ……(原 resize 分支不动)
        return
      }
      if (this.dragGroup) {
        const p = screenToPage(this.view, sx, sy)
        for (const sid of this.dragGroup.ids) {
          const el = this.getElement(sid)
          const off = this.dragGroup.offsets.get(sid)
          if (el && off) this.upsert({ ...el, x: Math.round(p.x - off.x), y: Math.round(p.y - off.y) })
        }
        return
      }
      if (this.dragId) {
        // ……(原单元素 drag 分支保留作 fallback,但 dragGroup 已覆盖;此处实际不会到,因为 dragGroup 已设)
      } else if (this.panning) {
        // ……(原 pan 分支不动)
      }
    }
```

`onUp` 改 —— **开头插 marquee commit**(在 resizing 之前):

```ts
    const onUp = (e: PointerEvent) => {
      if (this.marquee) {
        const r = {
          x: Math.min(this.marquee.startX, this.marquee.curX),
          y: Math.min(this.marquee.startY, this.marquee.curY),
          w: Math.abs(this.marquee.curX - this.marquee.startX),
          h: Math.abs(this.marquee.curY - this.marquee.startY),
        }
        const hit = marqueeSelect(r, this.getElements())
        if (e.shiftKey) {
          const next = new Set(this.selectedIds)
          for (const id of hit) next.add(id)
          this.setSelectedIds([...next])
        } else {
          this.setSelectedIds(hit)
        }
        this.marquee = null
        try { this.canvas.releasePointerCapture(e.pointerId) } catch { /* 已释放 */ }
        return
      }
      if (this.resizing) {
        // ……(原 resize 结束不动)
      }
      // ……(原 currentStroke / dragGroup 清理 / panning 清理)
      // 新增:清 dragGroup
      this.dragGroup = null
      this.dragId = null
      this.panning = null
    }
```

`renderNow` 末尾(在 drawSelectionOutlines 之后)加 marquee 预览:

```ts
    drawSelectionOutlines(ctx, this.getSelectedIds(), this.getElements(), this.view)
    if (this.marquee) {
      drawMarquee(ctx, {
        x: Math.min(this.marquee.startX, this.marquee.curX),
        y: Math.min(this.marquee.startY, this.marquee.curY),
        w: Math.abs(this.marquee.curX - this.marquee.startX),
        h: Math.abs(this.marquee.curY - this.marquee.startY),
      }, this.view)
    }
  }
```

- [ ] **Step 3.4:跑 adapter 测试,确认绿**

Run: `cd /Users/jinxunuo/projects/cys-stift/apps/web && pnpm exec vitest run src/features/canvas/host/__tests__/self-built-adapter.test.ts`
Expected: PASS —— 原 17 + multiselect 3 = 20 项。

- [ ] **Step 3.5:全部 host 测试 + build**

Run: `cd /Users/jinxunuo/projects/cys-stift/apps/web && pnpm exec vitest run src/features/canvas/host/ && cd /Users/jinxunuo/projects/cys-stift && pnpm --filter web build`
Expected: 全绿 + exit 0。

- [ ] **Step 3.6:Commit**

```bash
cd /Users/jinxunuo/projects/cys-stift && git add apps/web/src/features/canvas/host/self-built-adapter.ts apps/web/src/features/canvas/host/__tests__/self-built-adapter.test.ts
git commit -m "feat(canvas): Phase 1 multiselect T3 — shift-toggle + 组移动 + shift 框选"
```

**Task 3 验收:** adapter 测试 20 项绿;select/drag/pan/freedraw/text/resize/delete 零退化;build exit 0。→ 自审 + review。

---

## Task 4:`/dev/canvas-self` 多选冒烟

**Files:**
- Create: `scripts/phase1-multiselect-smoke.cjs`

**Interfaces:**
- Consumes: Task 1-3;`window.__selfAdapter`。
- Produces:冒烟验 shift-click + 组移动真实 Chrome。

**必守约束:** 主路由零改动;静态服务跑完 kill;不假装通过。

- [ ] **Step 4.1:写 `scripts/phase1-multiselect-smoke.cjs`**

```js
// scripts/phase1-multiselect-smoke.cjs — 真实冒烟 /dev/canvas-self 的多选 + 组移动。
// 运行:先 pnpm --filter web build + 静态服务 :3016,再 node scripts/phase1-multiselect-smoke.cjs
const puppeteer = require('puppeteer-core')
const fs = require('fs')
const path = require('path')
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const URL = 'http://localhost:3016'
const wait = (ms) => new Promise((r) => setTimeout(r, ms))
const out = path.join(__dirname, '..', 'docs', 'design', 'screenshots', 'phase1-multiselect-smoke')
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

  const rect = await page.evaluate(() => {
    window.__selfAdapter.upsert({ id: 'a', kind: 'card', x: 200, y: 200, w: 100, h: 60, rotation: 0 })
    window.__selfAdapter.upsert({ id: 'b', kind: 'card', x: 400, y: 200, w: 100, h: 60, rotation: 0 })
    window.__selfAdapter.setTool('select')
    const r = document.querySelector('canvas').getBoundingClientRect()
    return { left: r.left, top: r.top }
  })

  // shift+click a,再 shift+click b → 选两个
  await page.keyboard.down('Shift')
  await page.mouse.click(rect.left + 250, rect.top + 230) // a 中心
  await wait(100)
  await page.mouse.click(rect.left + 450, rect.top + 230) // b 中心
  await page.keyboard.up('Shift')
  await wait(200)
  const sel = await page.evaluate(() => window.__selfAdapter.getSelectedIds().sort())
  check('shift-click selects both cards', JSON.stringify(sel) === '["a","b"]', JSON.stringify(sel))

  // 拖 a(已选中)→ 全组 +30,+20
  await page.mouse.move(rect.left + 250, rect.top + 230)
  await page.mouse.down()
  await wait(50)
  await page.mouse.move(rect.left + 280, rect.top + 250)
  await page.mouse.up()
  await wait(200)
  const after = await page.evaluate(() => {
    const a = window.__selfAdapter.getElement('a')
    const b = window.__selfAdapter.getElement('b')
    return { ax: a.x, ay: a.y, bx: b.x, by: b.y }
  })
  check('group move: both moved +30,+20', after.ax === 230 && after.ay === 220 && after.bx === 430 && after.by === 220, JSON.stringify(after))
  await page.screenshot({ path: path.join(out, 'multiselect.png') })

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
# node scripts/phase1-multiselect-smoke.cjs
# 跑完 kill python(释放 3016)
```
Expected: 3/3 绿(挂载、shift-click 选两个、组移动 +30,+20)。

- [ ] **Step 4.3:Commit**

```bash
cd /Users/jinxunuo/projects/cys-stift && git add scripts/phase1-multiselect-smoke.cjs
git commit -m "test(canvas): Phase 1 multiselect T4 — /dev/canvas-self 多选 + 组移动 冒烟 e2e"
```

**Task 4 验收:** 冒烟 3/3;主路由零改动;3016 已释放。→ 自审 + review → **Phase 1 打磨(3)多选 + 组移动 完成**。

---

## Phase 1 multiselect 总验收

```bash
cd /Users/jinxunuo/projects/cys-stift/apps/web && pnpm exec vitest run src/features/canvas/host/   # 全绿(契约 12 + 渲染 13 + 命中 3 + adapter 20 + tldraw-adapter 7 + freedraw 5 + arrow 8 + text 8 + resize 10 + marquee 6 = 92)
cd /Users/jinxunuo/projects/cys-stift && pnpm --filter web build                                    # exit 0
node scripts/phase1-multiselect-smoke.cjs                                                           # 3/3(需静态服务 :3016)
```
+ 主路由 `/canvas`(tldraw)零改动;零 tldraw 新增;颜色走 token。

**产出:** shift-click 累加选择、shift+空白框选、组移动。为 arrow 交互创建/更多键盘奠基。

## Self-Review(plan 自检)

- **Spec 覆盖**:纯函数(T1)→ marquee 渲染(T2)→ adapter 多选交互(T3)→ 冒烟(T4)。shift-toggle / 组移动 / 框选各由 T3 单测覆盖。
- **占位符**:Task 3 onMove/onUp 用「// ……(原 … 不动)」指代保留现有分支 —— 执行时只在指定位置插新分支,不重写其它。每步代码完整。
- **类型一致**:`rectsIntersect`/`marqueeSelect` 在 T1 定义、T3 onUp 消费;`drawMarquee` 在 T2 定义、T3 renderNow 消费;`dragGroup`/`marquee` 状态在 T3 定义/用一致。
- **范围**:多选(累选/框选/组移动)自包含。arrow 交互创建/更多键盘/Phase 2 各自后续 plan。
- **潜在坑(T3 onMove dragId)**:onMove 现有 `if (this.dragId)` 分支在组移动后实际不会到(dragGroup 已 return),但保留作 fallback 不删。若担心 dragGroup + dragId 都设导致重复 upsert,确认 dragGroup 分支 return 在 dragId 之前即可(计划已如此排)。执行时若测试红,先查这个顺序。
