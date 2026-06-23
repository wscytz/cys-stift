# 画布自研 · Phase 1 交互打磨(4):arrow 交互创建(connect 工具)

> **For agentic workers:** REQUIRED SUB-SKILL: 用 superpowers:subagent-driven-development(推荐)或 superagents:executing-plans 逐 Task 执行。步骤用 `- [ ]` 跟踪。

**Goal:** 加 **connect 工具**:select/connect 模式下从选中元素拖出一条 arrow,松手时连到目标元素(端点用现有 arrow 渲染的边框交点)。建在 arrow 渲染 + selection 上。

**Architecture:** activeTool 加 'connect'。connect 模式 onDown 命中元素 → 开 `connecting`(记 fromId + 当前指针);move 更新预览 arrow(from→指针);up 时若指针命中另一元素 → commit 一个 arrow 元素(from/to/text),否则取消。预览 arrow 用 `arrowEndpoints`-like 几何(指针当临时 to 端点)复用渲染。纯函数 `arrowPreviewEndpoints(from, pointer, elements)` 可单测。

**Tech Stack:** TypeScript strict、Canvas 2D、vitest、puppeteer-core。零 tldraw。

## Global Constraints(每个 Task implicit 必守)

- spec 冻结;feature-flag 只在 `/dev/*`,不碰主路由 `/canvas`。
- `packages/domain` 零依赖;颜色走 token;**零 tldraw**。
- 静态导出;jsdom `ctx===null` 容错。
- connect 仅 connect 模式;空 hit(from 没命中元素)不开连接;松手指针没命中元素 → 取消(不 commit 半截)。
- 每步 TDD + review 闸;不假装通过。

## File Structure

**新增:**
- `apps/web/src/features/canvas/host/__tests__/self-built-connect.test.ts` — connect 纯函数单测。
- `scripts/phase1-connect-smoke.cjs`。

**修改:**
- `apps/web/src/features/canvas/host/self-built-arrow.ts` — 加 `arrowPreviewEndpoints`(纯函数)。
- `apps/web/src/features/canvas/host/self-built-adapter.ts` — activeTool 加 'connect';`connecting` 状态 + onDown/onMove/onUp + renderNow 预览。
- `apps/web/src/features/canvas/host/__tests__/self-built-adapter.test.ts` — connect 交互单测。
- `apps/web/src/app/dev/canvas-self/page.tsx` — 加 Connect 按钮。

---

## Task 1:arrowPreviewEndpoints 纯函数 + 测试

**Files:**
- Modify: `apps/web/src/features/canvas/host/self-built-arrow.ts`(加 `arrowPreviewEndpoints`)
- Test: `apps/web/src/features/canvas/host/__tests__/self-built-connect.test.ts`

**Interfaces:**
- Consumes: 现有 `borderPoint`/`elementCenter`(self-built-arrow)。
- Produces:`arrowPreviewEndpoints(fromEl, pointer): {from, to}` —— Task 3 预览用。

**必守约束:** 纯函数;from 端 = fromEl 朝 pointer 的边框交点;to 端 = pointer 本身(预览)。

- [ ] **Step 1.1:写失败测试**

```ts
// apps/web/src/features/canvas/host/__tests__/self-built-connect.test.ts
import { describe, expect, it } from 'vitest'
import { arrowPreviewEndpoints } from '../self-built-arrow'
import type { CanvasElement } from '../canvas-host'

describe('arrowPreviewEndpoints', () => {
  const fromEl = { id: 'a', kind: 'card', x: 0, y: 0, w: 100, h: 100, rotation: 0 } as CanvasElement
  it('from = fromEl 朝 pointer 的边框交点;to = pointer', () => {
    // fromEl 中心 (50,50),朝 pointer (200,50):dx=150 → tX=50/150=0.333 → from=(100,50)
    const { from, to } = arrowPreviewEndpoints(fromEl, { x: 200, y: 50 })
    expect(from).toEqual({ x: 100, y: 50 })
    expect(to).toEqual({ x: 200, y: 50 })
  })
  it('pointer 在 fromEl 内部 → from = 中心(退化)', () => {
    const { from } = arrowPreviewEndpoints(fromEl, { x: 50, y: 50 })
    expect(from).toEqual({ x: 50, y: 50 })
  })
})
```

- [ ] **Step 1.2:跑,确认红**

Run: `cd /Users/jinxunuo/projects/cys-stift/apps/web && pnpm exec vitest run src/features/canvas/host/__tests__/self-built-connect.test.ts`
Expected: FAIL — `arrowPreviewEndpoints is not exported`。

- [ ] **Step 1.3:加 `arrowPreviewEndpoints`(self-built-arrow.ts 末尾)**

```ts
/**
 * 连接预览端点:from = fromEl 朝 pointer 的边框交点;to = pointer(预览时指针当临时 to)。
 * 纯函数。pointer 在元素内 → from = 中心(退化)。
 */
export function arrowPreviewEndpoints(
  fromEl: CanvasElement,
  pointer: { x: number; y: number },
): { from: Point; to: Point } {
  const fc = elementCenter(fromEl)
  return {
    from: borderPoint(fc, fromEl.w / 2, fromEl.h / 2, pointer),
    to: { x: pointer.x, y: pointer.y },
  }
}
```

> `Point` type 已在本文件(Task 1 arrow 定义过)。`elementCenter`/`borderPoint` 已 export。

- [ ] **Step 1.4:跑,确认绿**

Run: `cd /Users/jinxunuo/projects/cys-stift/apps/web && pnpm exec vitest run src/features/canvas/host/__tests__/self-built-connect.test.ts`
Expected: PASS —— 2 项。

- [ ] **Step 1.5:build**

Run: `cd /Users/jinxunuo/projects/cys-stift && pnpm --filter web build`
Expected: exit 0。

- [ ] **Step 1.6:Commit**

```bash
cd /Users/jinxunuo/projects/cys-stift && git add apps/web/src/features/canvas/host/self-built-arrow.ts apps/web/src/features/canvas/host/__tests__/self-built-connect.test.ts
git commit -m "feat(canvas): Phase 1 connect T1 — arrowPreviewEndpoints 纯函数 + 单测"
```

**Task 1 验收:** 2 项单测绿;build exit 0;零 tldraw。→ 自审 + review。

---

## Task 2:adapter connect 工具(connecting 状态 + onDown/Move/Up + 预览)+ 测试

**Files:**
- Modify: `apps/web/src/features/canvas/host/self-built-adapter.ts`
- Test: `apps/web/src/features/canvas/host/__tests__/self-built-adapter.test.ts`

**Interfaces:**
- Consumes: Task 1 `arrowPreviewEndpoints`;现有 `arrowEndpoints`(renderNow 预览用 arrow 渲染)。
- Produces:activeTool 加 'connect';connect 模式拖出 arrow。

**必守约束:** connect 仅 connect 模式;from 没命中元素不开连接;up 指针没命中元素→取消(不 commit 半截);commit 经 upsert(echo→onUserChange);预览 arrow 用 `__preview-arrow` id 不进正式元素。

- [ ] **Step 2.1:加 connect 测试(先红)**

`self-built-adapter.test.ts` 末尾加(复用 dispatch):

```ts
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
```

- [ ] **Step 2.2:跑,确认红**

Run: `cd /Users/jinxunuo/projects/cys-stift/apps/web && pnpm exec vitest run src/features/canvas/host/__tests__/self-built-adapter.test.ts`
Expected: FAIL —— `setTool('connect')` 不接受 / connect 不产 arrow。

- [ ] **Step 2.3:adapter 加 connect 工具**

import 加 `arrowPreviewEndpoints`(若 Task 1 未在本文件 import 则加):

```ts
import { arrowEndpoints, arrowPreviewEndpoints } from './self-built-arrow'
```

字段区(在 `marquee` 之后)加:

```ts
  private connecting: { fromId: string; pointer: { x: number; y: number } } | null = null
```

`activeTool` / `setTool` / `getTool` 类型加 `'connect'`:

```ts
  private activeTool: 'select' | 'freedraw' | 'text' | 'connect' = 'select'
  // …
  setTool(t: 'select' | 'freedraw' | 'text' | 'connect'): void {
    this.activeTool = t
    if (t !== 'freedraw' && this.currentStroke) {
      this.currentStroke = null
      this.scheduleRender()
    }
  }
  getTool(): 'select' | 'freedraw' | 'text' | 'connect' {
    return this.activeTool
  }
```

`onDown` —— 在 freedraw 早退**之后**、shift-marquee **之前**插 connect 分支:

```ts
      if (this.activeTool === 'connect') {
        const id = hitTest(this.getElements(), p.x, p.y)
        if (id) {
          this.connecting = { fromId: id, pointer: { x: p.x, y: p.y } }
          try { this.canvas.setPointerCapture(e.pointerId) } catch { /* jsdom */ }
          this.scheduleRender()
        }
        return // connect 模式:命中则开连接,空白则不开;都不进 drag/pan
      }
```

`onMove` —— 在 marquee 之前(或任意早位置,只要 currentStroke 之后)插 connect 预览:

```ts
      if (this.connecting) {
        const p2 = screenToPage(this.view, sx, sy)
        this.connecting.pointer = { x: p2.x, y: p2.y }
        this.scheduleRender()
        return
      }
```

`onUp` —— 开头插 connect commit(在 marquee 之前):

```ts
      if (this.connecting) {
        const p2 = screenToPage(this.view, sx, sy)
        const toId = hitTest(this.getElements(), p2.x, p2.y)
        if (toId && toId !== this.connecting.fromId) {
          const id = 'arrow-' + (typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : Math.random().toString(36).slice(2))
          this.upsert({ id, kind: 'arrow', x: 0, y: 0, w: 0, h: 0, rotation: 0, from: this.connecting.fromId, to: toId, color: 'black' })
        }
        this.connecting = null
        try { this.canvas.releasePointerCapture(e.pointerId) } catch { /* 已释放 */ }
        return
      }
```

> onUp 里 `sx/sy` 来自 `const rect = this.canvas.getBoundingClientRect()` + `e.clientX - rect.left`(onUp 开头已有,确认变量名;若 onUp 现有没算 sx/sy,在 connect 分支内补 `const rect = this.canvas.getBoundingClientRect(); const sx = e.clientX - rect.left; const sy = e.clientY - rect.top;`)。

`renderNow` —— 在 drawMarquee 之后加 connect 预览 arrow(用 arrowPreviewEndpoints 造临时元素复用 arrow 渲染):

```ts
    if (this.connecting) {
      const fromEl = this.getElement(this.connecting.fromId)
      if (fromEl) {
        const { from, to } = arrowPreviewEndpoints(fromEl, this.connecting.pointer)
        // 临时 arrow 元素复用 drawElement 的 arrow 分支(无 from/to id,用预览端点)
        // 直接画线 + 箭头(不复用 arrowEndpoints,因为 to 是指针不是元素)
        ctx.save()
        ctx.translate(this.view.panX, this.view.panY)
        ctx.scale(this.view.zoom, this.view.zoom)
        ctx.strokeStyle = readToken('--color-blue', '#1d4ed8')
        ctx.lineWidth = 2 / this.view.zoom
        ctx.beginPath()
        ctx.moveTo(from.x, from.y)
        ctx.lineTo(to.x, to.y)
        ctx.stroke()
        ctx.restore()
      }
    }
  }
```

> 预览只画线(不带 V 箭头头,简化;真 arrow commit 后有箭头头)。颜色走 token。

- [ ] **Step 2.4:跑 adapter 测试,确认绿**

Run: `cd /Users/jinxunuo/projects/cys-stift/apps/web && pnpm exec vitest run src/features/canvas/host/__tests__/self-built-adapter.test.ts`
Expected: PASS —— 原 20 + connect 3 = 23 项。

- [ ] **Step 2.5:全部 host 测试 + build**

Run: `cd /Users/jinxunuo/projects/cys-stift/apps/web && pnpm exec vitest run src/features/canvas/host/ && cd /Users/jinxunuo/projects/cys-stift && pnpm --filter web build`
Expected: 全绿 + exit 0。

- [ ] **Step 2.6:Commit**

```bash
cd /Users/jinxunuo/projects/cys-stift && git add apps/web/src/features/canvas/host/self-built-adapter.ts apps/web/src/features/canvas/host/__tests__/self-built-adapter.test.ts
git commit -m "feat(canvas): Phase 1 connect T2 — adapter connect 工具(拖出 arrow 连到目标元素)"
```

**Task 2 验收:** adapter 测试 23 项绿;select/drag/pan/freedraw/text/resize/delete/multiselect 零退化;build exit 0。→ 自审 + review。

---

## Task 3:`/dev/canvas-self` Connect 按钮 + 冒烟

**Files:**
- Modify: `apps/web/src/app/dev/canvas-self/page.tsx`(Tool 加 'connect';Connect 按钮)
- Create: `scripts/phase1-connect-smoke.cjs`

**Interfaces:**
- Consumes: Task 2 connect;`window.__selfAdapter`。
- Produces:Connect 按钮;冒烟验 connect 拖出 arrow 真实 Chrome。

**必守约束:** 主路由零改动;静态服务跑完 kill;不假装通过。

- [ ] **Step 3.1:page.tsx 加 Connect 按钮**

`Tool` type 加 `'connect'`;按钮区加 `{btn('connect', 'Connect')}`(与 Select/Draw/Text 并列)。改 `Tool` type:

```ts
type Tool = 'select' | 'freedraw' | 'text' | 'connect'
```

按钮区(`{btn('text', 'Text')}` 之后):

```tsx
        {btn('connect', 'Connect')}
```

> 其余不动(switchTool 已传 t 给 setTool;setTool 签名 Task 2 已扩 'connect')。

- [ ] **Step 3.2:写 `scripts/phase1-connect-smoke.cjs`**

```js
// scripts/phase1-connect-smoke.cjs — 真实冒烟 /dev/canvas-self 的 connect 工具(拖出 arrow)。
// 运行:先 pnpm --filter web build + 静态服务 :3016,再 node scripts/phase1-connect-smoke.cjs
const puppeteer = require('puppeteer-core')
const fs = require('fs')
const path = require('path')
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const URL = 'http://localhost:3016'
const wait = (ms) => new Promise((r) => setTimeout(r, ms))
const out = path.join(__dirname, '..', 'docs', 'design', 'screenshots', 'phase1-connect-smoke')
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
    window.__selfAdapter.upsert({ id: 'a', kind: 'card', x: 200, y: 200, w: 160, h: 100, rotation: 0 })
    window.__selfAdapter.upsert({ id: 'b', kind: 'card', x: 600, y: 200, w: 160, h: 100, rotation: 0 })
    window.__selfAdapter.setTool('connect')
    const r = document.querySelector('canvas').getBoundingClientRect()
    return { left: r.left, top: r.top }
  })

  // 从 a 中心(280,250)拖到 b 中心(680,250)
  await page.mouse.move(rect.left + 280, rect.top + 250)
  await page.mouse.down()
  await wait(50)
  await page.mouse.move(rect.left + 680, rect.top + 250)
  await page.mouse.up()
  await wait(200)

  const result = await page.evaluate(() => {
    const a = window.__selfAdapter.getElements().filter((e) => e.kind === 'arrow')
    if (a.length !== 1) return { error: 'arrow count', count: a.length }
    return { from: a[0].from, to: a[0].to }
  })
  check('connect committed 1 arrow a→b', !result.error && result.from === 'a' && result.to === 'b', JSON.stringify(result))
  await page.screenshot({ path: path.join(out, 'connected.png') })

  await browser.close()
  console.log(`\n${fail === 0 ? '✓' : '✗'} ${pass} passed, ${fail} failed`)
  process.exit(fail === 0 ? 0 : 1)
})().catch((e) => { console.error('FATAL', e); process.exit(2) })
```

- [ ] **Step 3.3:起静态服务 + 跑冒烟**

```bash
cd /Users/jinxunuo/projects/cys-stift && pnpm --filter web build
# 后台:python3 -m http.server 3016 --directory apps/web/out
# sleep 1;curl -sL http://localhost:3016/dev/canvas-self → 200
# node scripts/phase1-connect-smoke.cjs
# 跑完 kill python(释放 3016)
```
Expected: 2/2 绿(挂载、connect 拖出 arrow a→b)。

- [ ] **Step 3.4:Commit**

```bash
cd /Users/jinxunuo/projects/cys-stift && git add apps/web/src/app/dev/canvas-self/page.tsx scripts/phase1-connect-smoke.cjs
git commit -m "feat(canvas): Phase 1 connect T3 — /dev/canvas-self Connect 按钮 + 拖出 arrow 冒烟 e2e"
```

**Task 3 验收:** 冒烟 2/2;主路由零改动;3016 已释放。→ 自审 + review → **Phase 1 打磨(4)connect 完成**。

---

## Phase 1 connect 总验收

```bash
cd /Users/jinxunuo/projects/cys-stift/apps/web && pnpm exec vitest run src/features/canvas/host/   # 全绿(契约 12 + 渲染 13 + 命中 3 + adapter 23 + tldraw-adapter 7 + freedraw 5 + arrow 8 + text 8 + resize 10 + marquee 6 + connect 2 = 97)
cd /Users/jinxunuo/projects/cys-stift && pnpm --filter web build                                    # exit 0
node scripts/phase1-connect-smoke.cjs                                                               # 2/2(需静态服务 :3016)
```
+ 主路由 `/canvas`(tldraw)零改动;零 tldraw 新增;颜色走 token。

**产出:** connect 工具拖出 arrow 连到目标元素。为更多键盘/Phase 2 奠基。

## Self-Review(plan 自检)

- **Spec 覆盖**:预览端点纯函数(T1)→ adapter connect 交互(T2)→ 按钮 + 冒烟(T3)。空 from/空 to 取消由 T2 三项单测覆盖。
- **占位符**:Task 2 onDown/onMove/onUp 用「// ……(不动)」指代保留现有分支 —— 执行时只在指定位置插 connect 分支。每步代码完整。
- **类型一致**:`arrowPreviewEndpoints(fromEl, pointer)→{from,to}` 在 T1 定义、T2 renderNow 消费;`connecting: {fromId, pointer}` 在 T2 定义/用一致;`activeTool` union 加 'connect' 在 T2/T3 一致。
- **范围**:connect(拖出 arrow)自包含。arrow 选择/删除/label 编辑/更多键盘/Phase 2 各自后续 plan。
- **潜在坑(T2 onUp sx/sy)**:onUp 现有代码是否已算 `sx/sy`(从 rect + clientX)?执行时先读 onUp 确认;若没有,connect 分支内补局部 `const rect/sx/sy`(跟 onMove 一样的取法)。这是 Task 2 最可能踩的点。
