# 画布自研 · Phase 1 交互打磨(1):选择 + 选中高亮 + Delete 键

> **For agentic workers:** REQUIRED SUB-SKILL: 用 superpowers:subagent-driven-development(推荐)或 superagents:executing-plans 逐 Task 执行。步骤用 `- [ ]` 跟踪。

**Goal:** SelfBuiltAdapter 加**选择** keystone:select 模式点元素→选中(单选替换)、点空白→取消;选中元素画 dashed 高亮框;Delete/Backspace 键删除选中(严守文本编辑时不触发)。为后续 resize/多选/键盘交互奠基。

**Architecture:** 选择是**渲染器自身状态**(`selectedIds`,不上 CanvasHost 接口)。select 模式 `onDown` 命中元素时既设 `dragId`(现有拖拽)又 `setSelectedIds([id])`;点空白 `setSelectedIds([])`。`renderNow` 画完元素后调纯函数 `drawSelectionOutlines` 画 dashed 框。Delete 经 `window` keydown 监听,守 `activeTool!=='text'` + target 非 input/textarea + 选择非空。`detach` 解绑。

**Tech Stack:** TypeScript strict、Canvas 2D、vitest、puppeteer-core。零 tldraw。

## Global Constraints(每个 Task implicitly 必守)

- spec 冻结;feature-flag 只在 `/dev/*`,**不碰主路由 `/canvas`**。
- `packages/domain` 零依赖不破坏。
- 颜色走 token(`readToken`),绘制路径不裸 hex。
- **零 tldraw import**。
- 静态导出;客户端组件 `'use client'`;jsdom `ctx===null` 容错。
- **Delete 守卫要严**:文本编辑中(activeTool==='text' 或焦点在 input/textarea)不触发,防误删。
- 每步 TDD:先红 → 绿 → commit。每 Task 自审 + review 闸。
- 不假装通过 —— 每步跑命令看 exit code。

## File Structure

**新增:**
- `scripts/phase1-selection-smoke.cjs` — /dev/canvas-self 选择 + Delete 冒烟。

**修改:**
- `apps/web/src/features/canvas/host/self-built-adapter.ts` — `selectedIds` 字段 + `getSelectedIds`/`setSelectedIds` + onDown select/deselect + Delete keydown 监听 + `detach` 解绑 keydown。
- `apps/web/src/features/canvas/host/__tests__/self-built-adapter.test.ts` — 选择 + Delete 单测。
- `apps/web/src/features/canvas/host/self-built-render.ts` — 纯函数 `drawSelectionOutlines`(+ `renderNow` 调它,但 renderNow 在 adapter 文件)。
- `apps/web/src/features/canvas/host/__tests__/self-built-render.test.ts` — `drawSelectionOutlines` 单测(mock ctx 加 setLineDash/strokeRect)。

---

## Task 1:选择状态(selectedIds)+ 点选/取消选 + 测试

**Files:**
- Modify: `apps/web/src/features/canvas/host/self-built-adapter.ts`(字段 + getSelectedIds/setSelectedIds + onDown)
- Test: `apps/web/src/features/canvas/host/__tests__/self-built-adapter.test.ts`

**Interfaces:**
- Consumes: 现有 onDown 的 hit/empty 分支 + `hitTest`。
- Produces:`getSelectedIds(): string[]`、`setSelectedIds(ids: string[]): void`(Task 2 渲染 + Task 3 Delete 用)。

**必守约束:** selectedIds 是渲染器内部状态(不上 CanvasHost);单选替换(非累加);setSelectedIds 触发 scheduleRender;select-on-down(命中即选,与 drag 共存)。

- [ ] **Step 1.1:加选择测试(先红)**

在 `self-built-adapter.test.ts` 末尾加(复用文件里已有的 `dispatch` 模式 —— 本 describe 内自定义一份):

```ts
describe('SelfBuiltAdapter selection', () => {
  function dispatch(canvas: HTMLCanvasElement, type: string, x: number, y: number) {
    canvas.dispatchEvent(
      new PointerEvent(type, { pointerId: 1, pointerType: 'mouse', bubbles: true, clientX: x, clientY: y }),
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
})
```

- [ ] **Step 1.2:跑,确认红**

Run: `cd /Users/jinxunuo/projects/cys-stift/apps/web && pnpm exec vitest run src/features/canvas/host/__tests__/self-built-adapter.test.ts`
Expected: FAIL —— `setSelectedIds is not a function` / 选择不更新。

- [ ] **Step 1.3:改 adapter —— selectedIds + get/set + onDown**

字段区(在 `currentStroke` 那行之后)加:

```ts
  private selectedIds = new Set<string>()
```

方法区(在 `getTool` 之后或任意公开方法区)加:

```ts
  /** 当前选中元素 id(渲染器自身状态,不上 CanvasHost)。 */
  getSelectedIds(): string[] {
    return [...this.selectedIds]
  }

  setSelectedIds(ids: string[]): void {
    this.selectedIds = new Set(ids)
    this.scheduleRender()
  }
```

`attachPointer` 的 `onDown` 改 —— **hit 分支**(设 dragId 处)加 `this.setSelectedIds([id])`;**empty 分支**(设 panning 处)加 `this.setSelectedIds([])`:

```ts
      const id = hitTest(this.getElements(), p.x, p.y)
      if (id) {
        const el = this.getElement(id)!
        this.dragId = id
        this.dragOffset = { x: p.x - el.x, y: p.y - el.y }
        this.setSelectedIds([id]) // ← 加:命中即选中(单选替换)
      } else {
        // 空白处 mousedown → pan 模式 + 清选择
        this.setSelectedIds([]) // ← 加
        this.panning = {
          startSx: sx,
          startSy: sy,
          fromPanX: this.view.panX,
          fromPanY: this.view.panY,
        }
      }
```

> onMove/onUp 不动;freedraw/text 早退分支不动。

- [ ] **Step 1.4:跑 adapter 测试,确认绿**

Run: `cd /Users/jinxunuo/projects/cys-stift/apps/web && pnpm exec vitest run src/features/canvas/host/__tests__/self-built-adapter.test.ts`
Expected: PASS —— 原 8 + selection 3 = 11 项。

- [ ] **Step 1.5:全部 host 测试 + build**

Run: `cd /Users/jinxunuo/projects/cys-stift/apps/web && pnpm exec vitest run src/features/canvas/host/ && cd /Users/jinxunuo/projects/cys-stift && pnpm --filter web build`
Expected: 全绿 + exit 0。

- [ ] **Step 1.6:Commit**

```bash
cd /Users/jinxunuo/projects/cys-stift && git add apps/web/src/features/canvas/host/self-built-adapter.ts apps/web/src/features/canvas/host/__tests__/self-built-adapter.test.ts
git commit -m "feat(canvas): Phase 1 selection T1 — selectedIds 状态 + 点选/取消选(select-on-down)"
```

**Task 1 验收:** adapter 测试 11 项绿(含 selection 3);host 全绿;drag/pan/freedraw/text 行为零变化。→ 自审 + review。

---

## Task 2:选中高亮渲染(drawSelectionOutlines)+ renderNow 调用 + 测试

**Files:**
- Modify: `apps/web/src/features/canvas/host/self-built-render.ts`(加 `drawSelectionOutlines` export)
- Modify: `apps/web/src/features/canvas/host/self-built-adapter.ts`(`renderNow` 末尾调 `drawSelectionOutlines`)
- Test: `apps/web/src/features/canvas/host/__tests__/self-built-render.test.ts`(mock ctx 加 setLineDash/strokeRect;加选择框断言)

**Interfaces:**
- Consumes: Task 1 的 `getSelectedIds`;`readToken`(已 export)。
- Produces:`drawSelectionOutlines(ctx, selectedIds, elements, view)`。

**必守约束:** 颜色走 token;dashed;lineWidth/dash 除以 zoom 抵消缩放(视觉宽度恒定);只画 selectedIds 里的元素;空选择不画。

- [ ] **Step 2.1:加 drawSelectionOutlines 测试(先红)**

`self-built-render.test.ts` 的 `mockCtx()` 紧挨 `lineTo:` 后加两行:

```ts
    lineTo: (x: number, y: number) => calls.push(`lineTo(${x},${y})`),
    setLineDash: (arr: number[]) => calls.push(`setLineDash(${arr.join(',')})`),
    strokeRect: (x: number, y: number, w: number, h: number) => calls.push(`strokeRect(${x},${y},${w},${h})`),
```

describe 末尾加:

```ts
  it('drawSelectionOutlines draws a dashed rect only around selected elements', () => {
    const ctx = mockCtx()
    const els = [
      { id: 'c1', kind: 'card', x: 10, y: 20, w: 100, h: 60, rotation: 0 },
      { id: 'c2', kind: 'card', x: 200, y: 0, w: 100, h: 60, rotation: 0 },
    ] as unknown as CanvasElement[]
    drawSelectionOutlines(ctx, ['c1'], els, { panX: 0, panY: 0, zoom: 1, gridMode: 'free' })
    // 只画 c1 的框(c1 外扩 2px:strokeRect(8,18,104,64));c2 不画
    expect(ctx._calls).toContain('strokeRect(8,18,104,64)')
    expect(ctx._calls.some((c) => c.startsWith('strokeRect(198'))).toBe(false)
    expect(ctx._calls.some((c) => c.startsWith('setLineDash'))).toBe(true)
  })

  it('drawSelectionOutlines with empty selection draws nothing', () => {
    const ctx = mockCtx()
    drawSelectionOutlines(ctx, [], [], { panX: 0, panY: 0, zoom: 1, gridMode: 'free' })
    expect(ctx._calls.some((c) => c.startsWith('strokeRect'))).toBe(false)
  })
```

> 顶部 import 加 `drawSelectionOutlines`:`import type { CanvasElement, CanvasView } from '../canvas-host'`(已有)+ 从 `'../self-built-render'` import `drawSelectionOutlines` 与 `renderElements`(看测试文件顶部现有 import,把 `drawSelectionOutlines` 加进去)。

- [ ] **Step 2.2:跑,确认红**

Run: `cd /Users/jinxunuo/projects/cys-stift/apps/web && pnpm exec vitest run src/features/canvas/host/__tests__/self-built-render.test.ts`
Expected: FAIL —— `drawSelectionOutlines is not exported`。

- [ ] **Step 2.3:写 `drawSelectionOutlines`(self-built-render.ts 末尾)**

```ts
/**
 * 画选中高亮:对 selectedIds 命中的元素画 dashed 框(在相机变换内)。
 * lineWidth/dash 除以 zoom 抵消缩放,视觉宽度恒定。空选择不画。
 * 纯函数(自己 save/translate/scale/restore),便于单测。
 */
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
  for (const el of elements) {
    if (!sel.has(el.id)) continue
    ctx.strokeRect(el.x - 2, el.y - 2, el.w + 4, el.h + 4) // 外扩 2px
  }
  ctx.restore()
}
```

- [ ] **Step 2.4:`renderNow` 末尾调 `drawSelectionOutlines`(adapter)**

adapter 顶部 import 加 `drawSelectionOutlines`:

```ts
import { renderElements, readToken, drawSelectionOutlines } from './self-built-render'
```

`renderNow` 在 `renderElements(...)` 调用**之后**加一行:

```ts
    renderElements(
      ctx,
      [...this.getElements(), ...preview],
      this.view,
      w,
      h,
      this.getCardLabel,
      readToken('--color-canvas', '#f8fafc'),
    )
    drawSelectionOutlines(ctx, this.getSelectedIds(), this.getElements(), this.view) // ← 加
  }
```

- [ ] **Step 2.5:跑渲染测试,确认绿**

Run: `cd /Users/jinxunuo/projects/cys-stift/apps/web && pnpm exec vitest run src/features/canvas/host/__tests__/self-built-render.test.ts`
Expected: PASS —— 原 9 + selection 2 = 11 项。

- [ ] **Step 2.6:全部 host 测试 + build**

Run: `cd /Users/jinxunuo/projects/cys-stift/apps/web && pnpm exec vitest run src/features/canvas/host/ && cd /Users/jinxunuo/projects/cys-stift && pnpm --filter web build`
Expected: 全绿 + exit 0。

- [ ] **Step 2.7:Commit**

```bash
cd /Users/jinxunuo/projects/cys-stift && git add apps/web/src/features/canvas/host/self-built-render.ts apps/web/src/features/canvas/host/__tests__/self-built-render.test.ts apps/web/src/features/canvas/host/self-built-adapter.ts
git commit -m "feat(canvas): Phase 1 selection T2 — drawSelectionOutlines(dashed 高亮)+ renderNow 调用"
```

**Task 2 验收:** 渲染测试 11 项绿(含 selection 2);host 全绿;build exit 0;颜色走 token。→ 自审 + review。

---

## Task 3:Delete 键删选中(+ keydown 监听 + detach)+ 测试

**Files:**
- Modify: `apps/web/src/features/canvas/host/self-built-adapter.ts`(keyHandler 字段 + attachKeyboard + detach)
- Test: `apps/web/src/features/canvas/host/__tests__/self-built-adapter.test.ts`

**Interfaces:**
- Consumes: Task 1 `getSelectedIds`/`setSelectedIds` + `remove`。
- Produces:Delete 键删选中;`detach` 解绑 keydown。

**必守约束:** Delete 守卫严:`activeTool==='text'` 不触发;`e.target` 是 input/textarea 不触发;选择空不触发;preventDefault。`detach` 解绑 window keydown。

- [ ] **Step 3.1:加 Delete 测试(先红)**

在 `self-built-adapter.test.ts` 的 selection describe 末尾(或新 describe)加:

```ts
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
```

- [ ] **Step 3.2:跑,确认红**

Run: `cd /Users/jinxunuo/projects/cys-stift/apps/web && pnpm exec vitest run src/features/canvas/host/__tests__/self-built-adapter.test.ts`
Expected: FAIL —— Delete 不删(还没接 keydown)。

- [ ] **Step 3.3:adapter 加 Delete keydown 监听**

字段区(在 `selectedIds` 之后)加:

```ts
  private keyHandler: ((e: KeyboardEvent) => void) | null = null
```

constructor 末尾(在 `this.attachPointer()` 之后)加:

```ts
    this.attachKeyboard()
```

新增私有方法 `attachKeyboard`(放在 `attachPointer` 之后):

```ts
  private attachKeyboard(): void {
    if (this.keyHandler) return
    this.keyHandler = (e: KeyboardEvent) => {
      if (e.key !== 'Delete' && e.key !== 'Backspace') return
      if (this.activeTool === 'text') return // 文本编辑中不删
      const t = e.target as HTMLElement | null
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA')) return // 焦点在输入框不删
      if (this.selectedIds.size === 0) return
      e.preventDefault()
      const ids = [...this.selectedIds]
      this.setSelectedIds([])
      for (const id of ids) this.remove(id) // echo → onUserChange
    }
    window.addEventListener('keydown', this.keyHandler)
  }
```

`detach()` 末尾加解绑:

```ts
    if (this.keyHandler) {
      window.removeEventListener('keydown', this.keyHandler)
      this.keyHandler = null
    }
```

- [ ] **Step 3.4:跑 adapter 测试,确认绿**

Run: `cd /Users/jinxunuo/projects/cys-stift/apps/web && pnpm exec vitest run src/features/canvas/host/__tests__/self-built-adapter.test.ts`
Expected: PASS —— 原 11 + Delete 3 = 14 项。

- [ ] **Step 3.5:全部 host 测试 + build**

Run: `cd /Users/jinxunuo/projects/cys-stift/apps/web && pnpm exec vitest run src/features/canvas/host/ && cd /Users/jinxunuo/projects/cys-stift && pnpm --filter web build`
Expected: 全绿 + exit 0。

- [ ] **Step 3.6:Commit**

```bash
cd /Users/jinxunuo/projects/cys-stift && git add apps/web/src/features/canvas/host/self-built-adapter.ts apps/web/src/features/canvas/host/__tests__/self-built-adapter.test.ts
git commit -m "feat(canvas): Phase 1 selection T3 — Delete 键删选中(window keydown + 严守卫 + detach)"
```

**Task 3 验收:** adapter 测试 14 项绿(含 Delete 3);host 全绿;build exit 0;text 模式 + 输入框焦点不误删。→ 自审 + review。

---

## Task 4:`/dev/canvas-self` 选择 + Delete 冒烟

**Files:**
- Create: `scripts/phase1-selection-smoke.cjs`

**Interfaces:**
- Consumes: Task 1-3 的选择 + 高亮 + Delete;`window.__selfAdapter`。
- Produces: 冒烟验证 select 模式点选 → 高亮 → Delete → 消失,真实 Chrome。

**必守约束:** 主路由零改动;静态服务跑完 kill;不假装通过。

- [ ] **Step 4.1:写 `scripts/phase1-selection-smoke.cjs`**

```js
// scripts/phase1-selection-smoke.cjs — 真实冒烟 /dev/canvas-self 的选择 + Delete。
// 运行:先 pnpm --filter web build + 静态服务 :3016,再 node scripts/phase1-selection-smoke.cjs
const puppeteer = require('puppeteer-core')
const fs = require('fs')
const path = require('path')
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const URL = 'http://localhost:3016'
const wait = (ms) => new Promise((r) => setTimeout(r, ms))
const out = path.join(__dirname, '..', 'docs', 'design', 'screenshots', 'phase1-selection-smoke')
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

  // 经 __selfAdapter upsert 两 card(避 AppMenu 偏移用 rect 算点击)
  const rect = await page.evaluate(() => {
    window.__selfAdapter.upsert({ id: 'ca', kind: 'card', x: 200, y: 200, w: 160, h: 100, rotation: 0 })
    window.__selfAdapter.upsert({ id: 'cb', kind: 'card', x: 500, y: 200, w: 160, h: 100, rotation: 0 })
    window.__selfAdapter.setTool('select')
    const r = document.querySelector('canvas').getBoundingClientRect()
    return { left: r.left, top: r.top }
  })

  // 点 ca(中心 200+80=280, 200+50=250)→ 选中 ca
  await page.mouse.click(rect.left + 280, rect.top + 250)
  await wait(200)
  const sel1 = await page.evaluate(() => window.__selfAdapter.getSelectedIds())
  check('click selects the card', sel1.includes('ca'), JSON.stringify(sel1))
  await page.screenshot({ path: path.join(out, 'selected.png') })

  // Delete → ca 消失,cb 还在
  await page.keyboard.press('Delete')
  await wait(200)
  const after = await page.evaluate(() => ({
    ca: !!window.__selfAdapter.getElement('ca'),
    cb: !!window.__selfAdapter.getElement('cb'),
    sel: window.__selfAdapter.getSelectedIds(),
  }))
  check('Delete removes selected card', after.ca === false, JSON.stringify(after))
  check('Delete leaves non-selected card', after.cb === true, JSON.stringify(after))
  check('Delete clears selection', after.sel.length === 0, JSON.stringify(after.sel))

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
# node scripts/phase1-selection-smoke.cjs
# 跑完 kill python(释放 3016)
```
Expected: 5/5 绿(挂载、点选、选中、Delete 删除选中、留未选、清选择)。

- [ ] **Step 4.3:Commit**

```bash
cd /Users/jinxunuo/projects/cys-stift && git add scripts/phase1-selection-smoke.cjs
git commit -m "test(canvas): Phase 1 selection T4 — /dev/canvas-self 选择 + Delete 冒烟 e2e"
```

**Task 4 验收:** 冒烟 5/5;主路由零改动;3016 已释放。→ 自审 + review → **Phase 1 打磨(1):选择 + Delete 完成**。

---

## Phase 1 selection 总验收

```bash
cd /Users/jinxunuo/projects/cys-stift/apps/web && pnpm exec vitest run src/features/canvas/host/   # 全绿(契约 12 + 渲染 11 + 命中 3 + adapter 14 + tldraw-adapter 7 + freedraw 5 + arrow 8 + text 8 = 68)
cd /Users/jinxunuo/projects/cys-stift && pnpm --filter web build                                    # exit 0
node scripts/phase1-selection-smoke.cjs                                                             # 5/5(需静态服务 :3016)
```
+ 主路由 `/canvas`(tldraw)零改动;零 tldraw 新增;颜色走 token。

**产出:** 自研渲染器支持选择(单选 + 取消)+ 选中高亮(dashed)+ Delete 键删(严守卫)。为 resize/多选/更多键盘/arrow 交互创建奠基。

## Self-Review(plan 自检)

- **Spec 覆盖**:选择状态(Task 1)→ 高亮渲染(Task 2)→ Delete 键(Task 3)→ 冒烟(Task 4)。Delete 守卫(text 模式 + input/textarea 焦点)由 Task 3 三项单测覆盖。
- **占位符扫描**:无 TBD/TODO 占位。Task 1 onMove/onUp/freedraw/text 分支用「不动」指代 —— 执行时只加 setSelectedIds 两行(hit + empty),不重写其它分支。每步代码完整。
- **类型一致性**:`getSelectedIds(): string[]`、`setSelectedIds(ids: string[])` 在 T1 定义、T2/T3 消费,签名一致;`drawSelectionOutlines(ctx, selectedIds, elements, view)` 在 T2 定义、renderNow 调用一致;`keyHandler` 字段 + attachKeyboard/detach 一致。
- **范围**:本计划自包含,产出可测软件(选择 + 高亮 + Delete + 冒烟)。resize/多选/更多键盘/arrow 交互创建/Phase 2 各自另开 plan。
- **潜在坑(Task 3 测试 target)**:`keydown` 测试用 `Object.defineProperty(ev, 'target', {...})` 设 target(KeyboardEvent 构造时不接 target)。target=window 时 `t.tagName` undefined → 守卫放行;target=fakeTextarea{tagName:'TEXTAREA'} → 守卫拦截。jsdom 的 `window.dispatchEvent` 触发监听器,target 取得到。若 jsdom 不允许 defineProperty target,改用 `Object.defineProperty(ev, 'target', { value, configurable: true })`(已用 writable:false,可改 configurable)。
