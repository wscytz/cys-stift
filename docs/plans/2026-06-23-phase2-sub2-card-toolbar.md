# Phase 2 子项目 2:卡片完整渲染 + toolbar 接 self 工具

> **For agentic workers:** REQUIRED SUB-SKILL: 用 superpowers:subagent-driven-development(推荐)或 superagents:executing-plans 逐 Task 执行。步骤用 `- [ ]` 跟踪。

**Goal:** SelfBuiltAdapter 的 card 渲染对齐 tldraw 版视觉(类型标 + title + 3 行 body 预览 + pinned 星 + token 色);主路由 `/canvas` 接回 toolbar(Select/Draw/Text/Connect + SnapToggle/ZoomGroup 已在子1)+ 视图持久化改事件(去 500ms 轮询)。

**Architecture:** card 渲染需要卡的 type/body/pinned,但 `drawElement` 现只收 `getCardLabel(id)→string`。扩成 `getCardInfo(id)→{title,body,type,pinned}|null`(SelfBuiltAdapter 构造选项,从 CardService 读)。`self-built-render.ts` 的 card 分支画全(类型标 mono 灰 + title display + body 3 行截断 + pinned ★)。toolbar:SelfCanvas 暴露 `setTool`,page 加工具按钮(复用 /dev/canvas-self 的 btn 模式)。视图持久化:SelfBuiltAdapter 加 `onViewChange` 事件替代轮询。

**Tech Stack:** Canvas 2D、React 19、vitest、puppeteer-core。零 tldraw。tldraw 依赖暂留。

## Global Constraints(每个 Task implicit 必守)

- spec 冻结不改;tldraw 依赖暂留(不删,不触发 ADR);domain 零依赖;颜色走 token(不裸 hex);静态导出;jsdom `ctx===null` 容错。
- 每步 TDD + review 闸;不假装通过。现有 300 web 测试 + 11 冒烟不退化。
- card 渲染视觉对齐 `card-shape-util.tsx`(token,不是新设计)。

## File Structure

**修改:**
- `apps/web/src/features/canvas/host/self-built-render.ts` — `drawElement` card 分支画全;`renderElements` 的 `getCardLabel` 形参 → `getCardInfo`。
- `apps/web/src/features/canvas/host/__tests__/self-built-render.test.ts` — card 渲染断言扩(类型标/title/body/pinned)。
- `apps/web/src/features/canvas/host/self-built-adapter.ts` — 构造选项 `getCardInfo` 替 `getCardLabel`;加 `onViewChange` 事件(setView 时触发);`renderNow` 传 getCardInfo。
- `apps/web/src/features/canvas/host/__tests__/canvas-host.contract.test.ts` + adapter 测试 — 构造选项名变,更新。
- `apps/web/src/features/canvas/self-canvas.tsx` — 用 getCardInfo(从 service 读 type/body/pinned);视图持久化改 onViewChange(去轮询);暴露 setTool 给 page。
- `apps/web/src/app/canvas/page.tsx` — 加 toolbar 工具按钮(Select/Draw/Text/Connect)。
- `apps/web/src/app/dev/canvas-self/page.tsx` — getCardLabel → getCardInfo(保持 dev 页工作)。
- `scripts/phase2-sub2-smoke.cjs`(新)— 卡片完整渲染 + toolbar 冒烟。

---

## Task 1:getCardInfo + card 完整渲染 + 测试

**Files:**
- Modify: `apps/web/src/features/canvas/host/self-built-render.ts`
- Test: `apps/web/src/features/canvas/host/__tests__/self-built-render.test.ts`

**Interfaces:**
- Consumes: `readToken`(已 export)。
- Produces:`renderElements` 形参 `getCardInfo: (id) => {title:string; body:string; type:string; pinned:boolean} | null`;card 分支画全。

**必守约束:** 颜色/字体走 token;type 标 mono 灰大写;title display;body 3 行截断(Canvas 2D 无 line-clamp,手动画 3 行 + 省略);pinned ★ 黄色右上角;卡丢失 → placeholder。

- [ ] **Step 1.1:扩 render 测试(先红)**

`self-built-render.test.ts` 的 mockCtx 加 `set measureText`(返回 char×7 宽,可预测截断)+ 现有 fillText 断言更新。在 describe 末尾加:

```ts
  it('card 渲染:类型标 + title + body + pinned(对齐 card-shape-util)', () => {
    const ctx = mockCtx()
    // mockCtx 加 measureText:set measureText 返回 { width: text.length * 7 }
    ;(ctx as unknown as { measureText: (s: string) => { width: number } }).measureText = (s: string) => ({ width: s.length * 7 })
    const els = [
      { id: 'c1', kind: 'card', x: 0, y: 0, w: 240, h: 120, rotation: 0 },
    ] as unknown as CanvasElement[]
    const info = (id: string) =>
      id === 'c1'
        ? { title: 'My Card', body: 'body line', type: 'note', pinned: true }
        : null
    renderElements(ctx, els, { panX: 0, panY: 0, zoom: 1, gridMode: 'free' }, 800, 600, info as never, '#ffffff')
    // 类型标 @ (10, 14-ish);title @ (10, ~34);body @ (10, ~54);pinned ★ @ 右上
    expect(ctx._calls.some((c) => c.startsWith('fillText(NOTE@'))).toBe(true)
    expect(ctx._calls.some((c) => c.startsWith('fillText(My Card@'))).toBe(true)
    expect(ctx._calls.some((c) => c.startsWith('fillText(body line@'))).toBe(true)
    expect(ctx._calls.some((c) => c.startsWith('fillText(★@'))).toBe(true)
  })
```

> mockCtx 需加 `measureText` setter 或方法。执行时把 mockCtx 的 `measureText` 加成 `(s) => ({ width: s.length * 7 })`。type 标大写:`typeKeyOf` 映射 note→'card.note' 之类,但渲染时我们直接大写 type(card.type 是 'note'/'image' 等)→ 'NOTE'。**简化:渲染时 type 标 = card.type.toUpperCase()**(不走 i18n,Canvas 2D 无 i18n hook;对齐视觉即可,i18n 留给将来)。

- [ ] **Step 1.2:跑,确认红**

Run: `cd /Users/jinxunuo/projects/cys-stift/apps/web && pnpm exec vitest run src/features/canvas/host/__tests__/self-built-render.test.ts`
Expected: FAIL — 现有 card 只画 title,无类型标/body/pinned。

- [ ] **Step 1.3:改 `self-built-render.ts` —— getCardInfo + card 画全**

`renderElements` 签名第 6 参 `getCardLabel: (id: string) => string` 改成 `getCardInfo: (id: string) => { title: string; body: string; type: string; pinned: boolean } | null`。`drawElement` 同步改签名。card 分支替换为:

```ts
    case 'card': {
      const info = getCardInfo(el.id)
      // 卡片背景 + 边框
      ctx.beginPath()
      ctx.roundRect(el.x, el.y, el.w, el.h, 4)
      ctx.fillStyle = readToken('--color-white', '#ffffff')
      ctx.fill()
      ctx.strokeStyle = readToken('--color-gray', '#e2e8f0')
      ctx.lineWidth = 1
      ctx.stroke()
      // 内容(对齐 card-shape-util:类型标 mono 灰 + title display + body 3 行)
      const pad = 10
      ctx.textBaseline = 'top'
      if (!info) {
        ctx.fillStyle = readToken('--color-gray', '#94a3b8')
        ctx.font = `12px ${readToken('--font-mono', 'monospace')}`
        ctx.fillText('(untitled)', el.x + pad, el.y + pad)
        break
      }
      // pinned ★ 右上
      if (info.pinned) {
        ctx.fillStyle = readToken('--color-yellow', '#eab308')
        ctx.font = `14px ${readToken('--font-mono', 'monospace')}`
        ctx.fillText('★', el.x + el.w - 18, el.y + 6)
      }
      // 类型标(mono 灰 大写)
      ctx.fillStyle = readToken('--color-gray', '#64748b')
      ctx.font = `10px ${readToken('--font-mono', 'monospace')}`
      ctx.fillText(info.type.toUpperCase(), el.x + pad, el.y + pad)
      // title(display,500)
      ctx.fillStyle = readToken('--color-black', '#0f172a')
      ctx.font = `500 15px ${readToken('--font-display', 'Inter, sans-serif')}`
      ctx.fillText(info.title || '(untitled)', el.x + pad, el.y + pad + 16)
      // body(3 行截断)
      if (info.body) {
        ctx.fillStyle = readToken('--color-black-soft', '#475569')
        ctx.font = `12px ${readToken('--font-body', 'Inter, sans-serif')}`
        const lines = wrapLines(info.body, el.w - pad * 2, ctx)
        for (let i = 0; i < Math.min(3, lines.length); i++) {
          ctx.fillText(lines[i]!, el.x + pad, el.y + pad + 38 + i * 16)
        }
      }
      break
    }
```

文件末尾加 `wrapLines` 辅助(纯函数,按字宽截断):

```ts
/** 按可用宽度把文本拆成行(Canvas 2D 无自动换行)。纯函数。 */
function wrapLines(text: string, maxWidth: number, ctx: CanvasRenderingContext2D): string[] {
  const out: string[] = []
  for (const para of text.split('\n')) {
    if (para === '') { out.push(''); continue }
    let line = ''
    for (const ch of para) {
      const test = line + ch
      if (ctx.measureText(test).width > maxWidth && line) {
        out.push(line); line = ch
      } else { line = test }
    }
    if (line) out.push(line)
  }
  return out
}
```

> `renderElements` 末尾的 `drawSelectionOutlines`/`drawMarquee` 不用 getCardInfo(它们只画框),不变。`getCardLabel` 形参全改名 `getCardInfo`。

- [ ] **Step 1.4:跑渲染测试,确认绿(含新 card 用例 + 现有用例更新)**

现有渲染测试用 `() => ''` 当 getCardLabel——改名 getCardInfo 后返回 string 不匹配新签名。**更新现有测试**:`() => ''` → `() => null`(空 info → placeholder)。Run: `cd /Users/jinxunuo/projects/cys-stift/apps/web && pnpm exec vitest run src/features/canvas/host/__tests__/self-built-render.test.ts`
Expected: PASS(现有用例改 null + 新 card 用例)。

- [ ] **Step 1.5:全部 host 测试 + build**

Run: `cd /Users/jinxunuo/projects/cys-stift/apps/web && pnpm exec vitest run src/features/canvas/host/ && cd /Users/jinxunuo/projects/cys-stift && pnpm --filter web build`
Expected: 全绿 + exit 0。

- [ ] **Step 1.6:Commit**

```bash
cd /Users/jinxunuo/projects/cys-stift && git add apps/web/src/features/canvas/host/self-built-render.ts apps/web/src/features/canvas/host/__tests__/self-built-render.test.ts
git commit -m "feat(canvas): Phase 2 子2 T1 — card 完整渲染(类型标+title+body 3行+pinned,getCardInfo)"
```

**Task 1 验收:** 渲染测试绿(含 card 完整);host 全绿;build exit 0;颜色走 token。→ 自审 + review。

---

## Task 2:adapter getCardInfo + onViewChange 事件 + 测试

**Files:**
- Modify: `apps/web/src/features/canvas/host/self-built-adapter.ts`
- Test: `apps/web/src/features/canvas/host/__tests__/self-built-adapter.test.ts` + contract test

**Interfaces:**
- Consumes: Task 1 `getCardInfo` 形参。
- Produces:adapter 构造选项 `getCardInfo`;`onViewChange(cb)` 事件(setView 触发);renderNow 传 getCardInfo。

**必守约束:** `getCardInfo` 替 `getCardLabel`(构造选项名变,契约测试更新);`onViewChange` 返回取消订阅(同 onUserChange 模式);setView 触发 onViewChange。

- [ ] **Step 2.1:加 onViewChange + getCardInfo 测试(先红)**

`self-built-adapter.test.ts` 末尾加:

```ts
describe('SelfBuiltAdapter onViewChange + getCardInfo', () => {
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

  it('getCardInfo 构造选项(从 service 读)', () => {
    const host = new SelfBuiltAdapter(document.createElement('canvas'), {
      getCardInfo: (id) => (id === 'c1' ? { title: 'T', body: 'B', type: 'note', pinned: false } : null),
    })
    // getCardInfo 不直接暴露;验 renderNow 不抛(间接)。这里只验构造不抛。
    expect(host).toBeDefined()
  })
})
```

- [ ] **Step 2.2:跑,确认红**

Run: `cd /Users/jinxunuo/projects/cys-stift/apps/web && pnpm exec vitest run src/features/canvas/host/__tests__/self-built-adapter.test.ts`
Expected: FAIL — `onViewChange is not a function` / `getCardInfo` 构造选项不存在。

- [ ] **Step 2.3:adapter 加 getCardInfo + onViewChange**

字段区加:

```ts
  private viewListeners = new Set<(v: CanvasView) => void>()
```

构造选项改(`getCardLabel` → `getCardInfo`):

```ts
  constructor(
    private canvas: HTMLCanvasElement,
    opts?: { getCardInfo?: (id: string) => { title: string; body: string; type: string; pinned: boolean } | null },
  ) {
    this.ctx = canvas.getContext('2d')
    this.getCardInfo = opts?.getCardInfo ?? (() => null)
    this.attachPointer()
    this.attachKeyboard()
  }

  private getCardInfo: (id: string) => { title: string; body: string; type: string; pinned: boolean } | null
```

> 删掉旧 `getCardLabel` 字段 + 构造赋值。

`setView` 改(触发 onViewChange):

```ts
  setView(v: CanvasView): void {
    this.view = { ...v }
    this.scheduleRender()
    for (const l of this.viewListeners) l(this.view)
  }
```

加方法:

```ts
  /** 订阅视图(pan/zoom/grid)变更。返回取消订阅。 */
  onViewChange(cb: (v: CanvasView) => void): () => void {
    this.viewListeners.add(cb)
    return () => { this.viewListeners.delete(cb) }
  }
```

`renderNow` 改:`renderElements(...)` 第 6 参 `this.getCardLabel` → `this.getCardInfo`。

- [ ] **Step 2.4:更新契约测试 + adapter 测试的构造**

契约测试 `runContract('SelfBuiltAdapter', ...)` 现在用 `new SelfBuiltAdapter(document.createElement('canvas'))`——无 opts,getCardInfo 默认 `() => null`,不抛。**契约测试不用改**(默认 opts 兼容)。但 adapter 测试里凡 `new SelfBuiltAdapter(document.createElement('canvas'))` 的地方仍 OK(默认)。只有用 `getCardLabel` 的旧测试需改——grep 确认没有(grep `getCardLabel` in adapter test)。

Run: `cd /Users/jinxunuo/projects/cys-stift/apps/web && pnpm exec vitest run src/features/canvas/host/`
Expected: PASS(原 30 + onViewChange/getCardInfo 3 = 33;契约 12 不变)。

- [ ] **Step 2.5:build**

Run: `cd /Users/jinxunuo/projects/cys-stift && pnpm --filter web build`
Expected: exit 0(self-canvas.tsx + dev page 还用旧 getCardLabel——build 会报错!**先在 Task 2 把它们改了**,或本 Step 后立即修)。

> ⚠️ self-canvas.tsx + dev/canvas-self/page.tsx 现在传 `getCardLabel` 给 SelfBuiltAdapter——构造选项改名后 build 会 tsc 报错。**在 Step 2.3 改完后,立即改这两个文件**:`getCardLabel: (id) => service.get(...)?.title ?? ''` → `getCardInfo: (id) => { const c = service.get(id as never); return c ? { title: c.title, body: c.body ?? '', type: c.type, pinned: c.pinned } : null }`。self-canvas.tsx 的 getCardInfo 从 service 读;dev page 同理。

- [ ] **Step 2.6:Commit**

```bash
cd /Users/jinxunuo/projects/cys-stift && git add apps/web/src/features/canvas/host/self-built-adapter.ts apps/web/src/features/canvas/host/__tests__/self-built-adapter.test.ts apps/web/src/features/canvas/self-canvas.tsx apps/web/src/app/dev/canvas-self/page.tsx
git commit -m "feat(canvas): Phase 2 子2 T2 — adapter getCardInfo + onViewChange 事件(self-canvas/dev 同步)"
```

**Task 2 验收:** adapter 测试 33 项绿;build exit 0;契约测试不退化;self-canvas/dev page 用 getCardInfo。→ 自审 + review。

---

## Task 3:SelfCanvas 视图持久化改 onViewChange(去轮询)+ page toolbar

**Files:**
- Modify: `apps/web/src/features/canvas/self-canvas.tsx`(去 500ms 轮询,改 onViewChange)
- Modify: `apps/web/src/app/canvas/page.tsx`(加 Select/Draw/Text/Connect 工具按钮)

**Interfaces:**
- Consumes: Task 2 `onViewChange`;SelfBuiltAdapter `setTool`/`getTool`。
- Produces:SelfCanvas 视图持久化事件化;page toolbar 工具切换。

**必守约束:** 去轮询;onViewChange debounce 500ms 写 canvasViewStore;toolbar 工具切换调 adapter.setTool;token 样式。

- [ ] **Step 3.1:SelfCanvas 改 onViewChange**

`self-canvas.tsx` 的 useEffect 里,把 `setInterval(writeView, 500)` 替换成 onViewChange + debounce:

```ts
    // 视图持久化:onViewChange + 500ms debounce 写 canvasViewStore(替代轮询)。
    let viewTimer: ReturnType<typeof setTimeout> | null = null
    const unbindView = adapter.onViewChange(() => {
      if (viewTimer) clearTimeout(viewTimer)
      viewTimer = setTimeout(() => {
        const v = adapter.getView()
        canvasViewStore.update(canvasId, { zoom: v.zoom, panX: v.panX, panY: v.panY, gridMode: v.gridMode })
      }, 500)
    })
```

cleanup 改:

```ts
    return () => {
      if (viewTimer) { clearTimeout(viewTimer); const v = adapter.getView(); canvasViewStore.update(canvasId, { zoom: v.zoom, panX: v.panX, panY: v.panY, gridMode: v.gridMode }) }
      unbindView()
      unbind()
      adapter.detach()
      adapterInner.current = null
      adapterRef.current = { adapter: null }
    }
```

> 删掉 `interval`/`writeView`/`setInterval`/`clearInterval`。

- [ ] **Step 3.2:page 加 toolbar 工具按钮**

`/canvas` page.tsx:加 `tool` state + 工具按钮区(在 Toolbar 里 SnapToggle 之前)。adapter ready 后 setTool。加 state + handler:

```tsx
  const [tool, setTool] = useState<'select' | 'freedraw' | 'text' | 'connect'>('select')
  // adapter ready 时同步工具
  useEffect(() => {
    handle.current.adapter?.setTool(tool)
  }, [tool, handle.current.adapter])
```

Toolbar 里加(在 SnapToggle 前):

```tsx
        <span className="tb-divider" aria-hidden="true" />
        {(['select', 'freedraw', 'text', 'connect'] as const).map((tk) => (
          <button
            key={tk}
            type="button"
            className={`tb-snap${tool === tk ? ' tb-snap--snap' : ''}`}
            onClick={() => setTool(tk)}
            disabled={!adapterReady}
            aria-pressed={tool === tk}
            style={{ textTransform: 'none', letterSpacing: 0 }}
          >
            {tk === 'select' ? 'Select' : tk === 'freedraw' ? 'Draw' : tk === 'text' ? 'Text' : 'Connect'}
          </button>
        ))}
```

> text 工具的 textarea 编辑:子项目 1 的 SelfCanvas 还没接 text 编辑的浮动 textarea(那是 /dev/canvas-self 的逻辑)。**本 Task 不接 text 编辑到主路由**(留后续——text 工具按钮先在,但点 canvas 无反应)。**或者**:把 /dev/canvas-self 的 edit session 逻辑提到 SelfCanvas。**判断**:scope 蔓延。**本 Task 只加工具按钮 + setTool;text 编辑的 textarea 接到主路由留子项目 2 后续小步**(或单独 plan)。**执行时:工具按钮加,setTool 通,text 模式点 canvas 暂无反应(可接受,子1 已声明 toolbar 缺口逐步补)**。

- [ ] **Step 3.3:build + 全测试**

Run: `cd /Users/jinxunuo/projects/cys-stift && pnpm --filter web build && (cd apps/web && pnpm exec vitest run)`
Expected: exit 0 + 全绿。

- [ ] **Step 3.4:Commit**

```bash
cd /Users/jinxunuo/projects/cys-stift && git add apps/web/src/features/canvas/self-canvas.tsx apps/web/src/app/canvas/page.tsx
git commit -m "feat(canvas): Phase 2 子2 T3 — SelfCanvas 视图持久化事件化 + page toolbar 工具按钮"
```

**Task 3 验收:** build + 测试全绿;SelfCanvas 无 setInterval;page 有 4 工具按钮。→ 自审 + review。

---

## Task 4:卡片完整渲染 + toolbar 冒烟

**Files:**
- Create: `scripts/phase2-sub2-smoke.cjs`

**Interfaces:**
- Consumes: Task 1-3;主路由 /canvas。
- Produces:冒烟验卡片完整渲染(类型标/title/body/pinned)+ 工具切换。

**必守约束:** 主路由;静态服务跑完 kill;不假装通过。

- [ ] **Step 4.1:写 `scripts/phase2-sub2-smoke.cjs`**

```js
// scripts/phase2-sub2-smoke.cjs — 冒烟主路由 /canvas 卡片完整渲染 + toolbar。
// 运行:先 pnpm --filter web build + 静态服务 :3016,再 node scripts/phase2-sub2-smoke.cjs
const puppeteer = require('puppeteer-core')
const fs = require('fs')
const path = require('path')
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const URL = 'http://localhost:3016'
const wait = (ms) => new Promise((r) => setTimeout(r, ms))
const out = path.join(__dirname, '..', 'docs', 'design', 'screenshots', 'phase2-sub2-smoke')
fs.mkdirSync(out, { recursive: true })

let pass = 0, fail = 0
const check = (n, ok, d = '') => { ok ? (pass++, console.log(`  ✓ ${n}${d ? ' — ' + d : ''}`)) : (fail++, console.log(`  ✗ ${n}${d ? ' — ' + d : ''}`)) }

;(async () => {
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox', '--disable-gpu'], defaultViewport: { width: 1440, height: 900 } })
  const page = await browser.newPage()
  const errs = []
  page.on('pageerror', (e) => errs.push(e.message))

  // 注入一张带 body + pinned 的卡
  await page.goto(URL + '/canvas', { waitUntil: 'networkidle0' })
  await page.evaluate(() => {
    const key = 'cys-stift.cards.v1'
    const raw = localStorage.getItem(key) || '{"cards":[]}'
    const parsed = JSON.parse(raw)
    parsed.cards.push({
      id: 'c1', title: 'Full Card', body: 'This is the body preview text', type: 'note',
      media: [], links: [], codeSnippets: [], quotes: [], tags: [],
      source: { kind: 'manual', deviceId: 's' }, capturedAt: new Date().toISOString(),
      createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
      pinned: true, archived: false,
      canvasPosition: { canvasId: 'default-canvas', x: 200, y: 200, w: 240, h: 120, z: Date.now() },
    })
    localStorage.setItem(key, JSON.stringify(parsed))
  })
  await page.reload({ waitUntil: 'networkidle0' })
  await wait(1500)
  check('page mounts, no pageerror', errs.length === 0, `${errs.length} errors`)

  // 卡片渲染:截图(视觉验类型标/title/body/pinned)。无 OCR,只验 canvas 像素非空 + 卡区域有内容。
  await page.screenshot({ path: path.join(out, 'full-card.png') })
  const hasContent = await page.evaluate(() => {
    const c = document.querySelector('.cv-host canvas')
    if (!c) return false
    // 卡 at (200,200) 240×120;读该区域像素,非全白 = 有渲染
    const ctx = c.getContext('2d')
    if (!ctx) return false
    const data = ctx.getImageData(250, 250, 100, 60).data
    let nonWhite = 0
    for (let i = 0; i < data.length; i += 4) {
      if (data[i] < 250 || data[i + 1] < 250 || data[i + 2] < 250) nonWhite++
    }
    return nonWhite > 50
  })
  check('card rendered with content (non-white pixels in card area)', hasContent)

  // toolbar 工具按钮存在
  const tools = await page.evaluate(() => {
    const btns = Array.from(document.querySelectorAll('button.tb-snap'))
    return btns.map((b) => b.textContent?.trim()).filter(Boolean)
  })
  check('toolbar has 4 tool buttons', tools.length >= 4, JSON.stringify(tools))

  await browser.close()
  console.log(`\n${fail === 0 ? '✓' : '✗'} ${pass} passed, ${fail} failed`)
  process.exit(fail === 0 ? 0 : 1)
})().catch((e) => { console.error('FATAL', e); process.exit(2) })
```

- [ ] **Step 4.2:起静态服务 + 跑冒烟**

```bash
cd /Users/jinxunuo/projects/cys-stift && pnpm --filter web build
# 后台:python3 -m http.server 3016 --directory apps/web/out
# sleep 1;curl -sL http://localhost:3016/canvas → 200
# node scripts/phase2-sub2-smoke.cjs
# 跑完 kill python(释放 3016)
```
Expected: 3/3 绿(挂载、卡片有内容、4 工具按钮)。

- [ ] **Step 4.3:Commit**

```bash
cd /Users/jinxunuo/projects/cys-stift && git add scripts/phase2-sub2-smoke.cjs
git commit -m "test(canvas): Phase 2 子2 T4 — 卡片完整渲染 + toolbar 冒烟 e2e"
```

**Task 4 验收:** 冒烟 3/3;3016 已释放。→ 自审 + review → **Phase 2 子项目 2 完成**。

---

## Phase 2 子项目 2 总验收

```bash
cd /Users/jinxunuo/projects/cys-stift/apps/web && pnpm exec vitest run   # 全绿(300 + T1 card 测试 + T2 onViewChange)
cd /Users/jinxunuo/projects/cys-stift && pnpm --filter web build          # exit 0
node scripts/phase2-sub2-smoke.cjs                                        # 3/3
```
+ 主路由卡片视觉对齐 tldraw 版;toolbar 4 工具;SelfCanvas 视图持久化事件化(无轮询)。

**产出:** 主路由卡片完整渲染 + 工具栏。为子3(导出)/子4(关系)奠基。

## Self-Review(plan 自检)

- **Spec 覆盖**:card 完整渲染(T1)→ adapter getCardInfo+onViewChange(T2)→ SelfCanvas 事件化+toolbar(T3)→ 冒烟(T4)。spec 子2「卡片完整渲染 + toolbar 迁 self 工具」全覆盖。
- **占位符**:无 TBD。Task 3 text 编辑 textarea 接主路由明确**不在本计划**(留后续),工具按钮先在。
- **类型一致**:`getCardInfo(id)→{title,body,type,pinned}|null` 在 T1 定义、T2 adapter 构造选项 + self-canvas/dev 消费,签名一致;`onViewChange(cb)→unsub` 在 T2 定义、T3 self-canvas 消费。
- **范围**:子2(卡片渲染+toolbar)自包含。text 编辑 textarea 接主路由 / 导出 / 关系 留后续。
- **潜在坑**:
  1. **T1 现有渲染测试 `() => ''` 改 `() => null`**——getCardLabel→getCardInfo 改名后,所有 renderElements 调用的第 6 参都要更新。grep 确认所有调用点(self-built-render.test.ts + adapter renderNow + self-canvas 无直接调)。
  2. **T2 构造选项改名**——self-canvas.tsx + dev/canvas-self/page.tsx 都传 getCardLabel,Step 2.5 必须同改,否则 build 挂。
  3. **T3 text 工具按钮在但点 canvas 无反应**——可接受(子1 已声明 toolbar 缺口);若要接,scope 蔓延到 text edit session 迁主路由,另开。
  4. **T4 卡片像素验**——Canvas 2D 在 headless Chrome 渲染,getImageData 可读;卡 at (200,200) 读 (250,250,100,60) 区域。若坐标偏(AppMenu),用 getBoundingClientRect 算——但 getImageData 用 canvas 内坐标(非 client),AppMenu 不影响 canvas 内坐标。确认卡在 canvas 内 (200,200) 即可。
