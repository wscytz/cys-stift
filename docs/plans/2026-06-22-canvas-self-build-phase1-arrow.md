# 画布自研 · Phase 1 arrow(关系箭头)渲染实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: 用 superpowers:subagent-driven-development(推荐)或 superagents:executing-plans 逐 Task 执行。步骤用 `- [ ]` 跟踪。

**Goal:** SelfBuiltAdapter 渲染 arrow(关系箭头):给定 arrow 元素(`from`/`to` 指向其它元素),解析两端到对应元素的**边框交点**,画线 + V 形箭头 + 可选 label。DSL/AI 创建的 arrow 经 `applyLayout`→`upsert`→渲染端到端打通。

**Architecture:** 端点解析是纯函数(`arrowEndpoints`):从 arrow.from/to 找到目标元素,用线-矩形边框交点算出线的起止点(不插进卡片中心)。渲染在 `drawElement` 加 arrow 分支(画线 + atan2 算方向的箭头 + label)。**只渲染,不做交互创建**(handle 拖拽 / connect 工具留到交互打磨)。arrow 数据复用现有 `CanvasElement`(kind='arrow',from/to/text/color),不改模型。

**Tech Stack:** TypeScript strict、Canvas 2D、vitest、puppeteer-core。零 tldraw。

## Global Constraints(每个 Task implicitly 必守)

- spec 冻结;feature-flag 只在 `/dev/*`,**不碰主路由 `/canvas`**。
- `packages/domain` 零依赖不破坏。
- 颜色/字体走 token(`readToken`),绘制路径不裸 hex。
- **零 tldraw import**。
- 静态导出;客户端组件 `'use client'`;jsdom `ctx===null` 容错。
- 每步 TDD:先红 → 绿 → commit。每 Task 自审 + review 闸。
- 不假装通过 —— 每步跑命令看 exit code。

## File Structure

**新增:**
- `apps/web/src/features/canvas/host/self-built-arrow.ts` — 纯函数 `elementCenter` + `borderPoint` + `arrowEndpoints`(端点解析,可单测)。
- `apps/web/src/features/canvas/host/__tests__/self-built-arrow.test.ts` — 端点解析单测(含边框交点数学、缺失 id)。
- `scripts/phase1-arrow-smoke.cjs` — /dev/canvas-self arrow 渲染冒烟。

**修改:**
- `apps/web/src/features/canvas/host/self-built-render.ts` — `drawElement` 签名加 `allElements` 参数(arrow 解析端点要用);加 `case 'arrow'`(线 + 箭头 + label);`renderElements` 循环把 `elements` 传进 `drawElement`。
- `apps/web/src/features/canvas/host/__tests__/self-built-render.test.ts` — 加 arrow 渲染断言(mock ctx 已有 moveTo/lineTo/stroke,freedraw T2 加过)。

---

## Task 1:arrow 端点解析纯函数(elementCenter + borderPoint + arrowEndpoints)+ 测试

**Files:**
- Create: `apps/web/src/features/canvas/host/self-built-arrow.ts`
- Test: `apps/web/src/features/canvas/host/__tests__/self-built-arrow.test.ts`

**Interfaces:**
- Consumes: `CanvasElement`(`./canvas-host`;arrow 有 `from?`/`to?`/`text?`/`color?`)。
- Produces: `elementCenter(el)→{x,y}`、`borderPoint(center,hw,hh,target)→{x,y}`、`arrowEndpoints(arrow,elements)→{from:{x,y}|null,to:{x,y}|null}` —— Task 2 渲染用。

**必守约束:** 纯函数;边框交点数学要对(右/上/角约束);缺失 id → null(null);退化(目标=中心)→ 中心。

- [ ] **Step 1.1:写失败测试**

```ts
// apps/web/src/features/canvas/host/__tests__/self-built-arrow.test.ts
import { describe, expect, it } from 'vitest'
import { elementCenter, borderPoint, arrowEndpoints } from '../self-built-arrow'
import type { CanvasElement } from '../canvas-host'

describe('elementCenter', () => {
  it('元素中心', () => {
    const el = { id: 'a', kind: 'card', x: 100, y: 50, w: 240, h: 120, rotation: 0 } as CanvasElement
    expect(elementCenter(el)).toEqual({ x: 220, y: 110 })
  })
})

describe('borderPoint', () => {
  it('目标在正右方 → 出口在右边框(中心 + hw)', () => {
    expect(borderPoint({ x: 0, y: 0 }, 50, 30, { x: 100, y: 0 })).toEqual({ x: 50, y: 0 })
  })
  it('目标在正上方 → 出口在上边框(中心 - hh)', () => {
    expect(borderPoint({ x: 0, y: 0 }, 50, 30, { x: 0, y: -100 })).toEqual({ x: 0, y: -30 })
  })
  it('目标在斜上方 → 受 hh 约束(更窄的那轴)', () => {
    // hw=50,hh=30;dx=100,dy=100 → tX=0.5,tY=0.3 → t=0.3 → {30,30}
    expect(borderPoint({ x: 0, y: 0 }, 50, 30, { x: 100, y: 100 })).toEqual({ x: 30, y: 30 })
  })
  it('退化:目标=中心 → 中心', () => {
    expect(borderPoint({ x: 5, y: 6 }, 50, 30, { x: 5, y: 6 })).toEqual({ x: 5, y: 6 })
  })
})

describe('arrowEndpoints', () => {
  const cardA = { id: 'ca', kind: 'card', x: 0, y: 0, w: 100, h: 100, rotation: 0 } as CanvasElement
  const cardB = { id: 'cb', kind: 'card', x: 200, y: 0, w: 100, h: 100, rotation: 0 } as CanvasElement
  const arrow = { id: 'ar', kind: 'arrow', x: 0, y: 0, w: 0, h: 0, rotation: 0, from: 'ca', to: 'cb' } as CanvasElement

  it('两端元素都在 → from 在 A 右边框,to 在 B 左边框', () => {
    const { from, to } = arrowEndpoints(arrow, [cardA, cardB])
    // A 中心 (50,50),hw=hh=50;朝 B 中心 (250,50):dx=200 → tX=0.25 → from=(100,50)
    expect(from).toEqual({ x: 100, y: 50 })
    // B 中心 (250,50),朝 A 中心 (50,50):dx=-200 → tX=0.25 → to=(200,50)
    expect(to).toEqual({ x: 200, y: 50 })
  })
  it('from 元素缺失 → from/to 都 null(不画半截)', () => {
    const ghost = { ...arrow, from: 'ghost' } as CanvasElement
    expect(arrowEndpoints(ghost, [cardB])).toEqual({ from: null, to: null })
  })
  it('to 元素缺失 → 都 null', () => {
    const ghost = { ...arrow, to: 'ghost' } as CanvasElement
    expect(arrowEndpoints(ghost, [cardA])).toEqual({ from: null, to: null })
  })
})
```

- [ ] **Step 1.2:跑,确认红**

Run: `cd /Users/jinxunuo/projects/cys-stift/apps/web && pnpm exec vitest run src/features/canvas/host/__tests__/self-built-arrow.test.ts`
Expected: FAIL — `elementCenter/borderPoint/arrowEndpoints is not exported`。

- [ ] **Step 1.3:写 `self-built-arrow.ts`**

```ts
// apps/web/src/features/canvas/host/self-built-arrow.ts
'use client'

import type { CanvasElement } from './canvas-host'

interface Point {
  x: number
  y: number
}

/** 元素中心点。 */
export function elementCenter(el: CanvasElement): Point {
  return { x: el.x + el.w / 2, y: el.y + el.h / 2 }
}

/**
 * 从 rect 的中心朝 target 方向,求线段交到 rect 边框的出口点。
 * rect 由 center + 半宽半高(hw,hh)描述;target 是外部点。
 * 数学:沿 (target-center) 方向,param t = min(hw/|dx|, hh/|dy|),出口 = center + t·(dx,dy)。
 * 退化(目标=中心)→ 中心。
 */
export function borderPoint(
  center: Point,
  hw: number,
  hh: number,
  target: Point,
): Point {
  const dx = target.x - center.x
  const dy = target.y - center.y
  if (dx === 0 && dy === 0) return { x: center.x, y: center.y }
  const tX = dx !== 0 ? hw / Math.abs(dx) : Infinity
  const tY = dy !== 0 ? hh / Math.abs(dy) : Infinity
  const t = Math.min(tX, tY)
  return { x: center.x + t * dx, y: center.y + t * dy }
}

/**
 * 解析 arrow 的 from/to 端点(各自指向对方元素的边框交点)。
 * 任一端元素找不到 → 都返 null(渲染时不画半截箭头)。
 */
export function arrowEndpoints(
  arrow: CanvasElement,
  elements: CanvasElement[],
): { from: Point | null; to: Point | null } {
  const fromEl = arrow.from ? elements.find((e) => e.id === arrow.from) : undefined
  const toEl = arrow.to ? elements.find((e) => e.id === arrow.to) : undefined
  if (!fromEl || !toEl) return { from: null, to: null }
  const fc = elementCenter(fromEl)
  const tc = elementCenter(toEl)
  return {
    from: borderPoint(fc, fromEl.w / 2, fromEl.h / 2, tc),
    to: borderPoint(tc, toEl.w / 2, toEl.h / 2, fc),
  }
}
```

- [ ] **Step 1.4:跑,确认绿**

Run: `cd /Users/jinxunuo/projects/cys-stift/apps/web && pnpm exec vitest run src/features/canvas/host/__tests__/self-built-arrow.test.ts`
Expected: PASS —— elementCenter 1 + borderPoint 4 + arrowEndpoints 3 = 8 项。

- [ ] **Step 1.5:build**

Run: `cd /Users/jinxunuo/projects/cys-stift && pnpm --filter web build`
Expected: exit 0。

- [ ] **Step 1.6:Commit**

```bash
cd /Users/jinxunuo/projects/cys-stift && git add apps/web/src/features/canvas/host/self-built-arrow.ts apps/web/src/features/canvas/host/__tests__/self-built-arrow.test.ts
git commit -m "feat(canvas): Phase 1 arrow T1 — 端点解析纯函数(elementCenter + borderPoint + arrowEndpoints)"
```

**Task 1 验收:** 8 项单测绿;build exit 0;零 tldraw。→ 自审 + review。

---

## Task 2:arrow 渲染分支(线 + V 形箭头 + label)+ 渲染测试

**Files:**
- Modify: `apps/web/src/features/canvas/host/self-built-render.ts`(`drawElement` 加 `allElements` 参数 + `case 'arrow'`;`renderElements` 循环传 `elements`)
- Test: `apps/web/src/features/canvas/host/__tests__/self-built-render.test.ts`(加 arrow 渲染断言)

**Interfaces:**
- Consumes: Task 1 的 `arrowEndpoints`;`colorOf`/`readToken`(已在本文件)。
- Produces: `drawElement` 能画 arrow(card/rect/freedraw 行为不变)。

**必守约束:** 端点缺失不画(不抛);颜色走 token;`drawElement` 签名加 `allElements`(card/rect/freedraw 忽略它)。

- [ ] **Step 2.1:加 arrow 渲染测试(先红)**

在 `self-built-render.test.ts` 的 describe 末尾加:

```ts
  it('renders an arrow as a line + arrowhead between two cards (border endpoints)', () => {
    const ctx = mockCtx()
    const els = [
      { id: 'ca', kind: 'card', x: 0, y: 0, w: 100, h: 100, rotation: 0 },
      { id: 'cb', kind: 'card', x: 200, y: 0, w: 100, h: 100, rotation: 0 },
      { id: 'ar', kind: 'arrow', x: 0, y: 0, w: 0, h: 0, rotation: 0, from: 'ca', to: 'cb', text: 'rel' },
    ] as unknown as CanvasElement[]
    renderElements(ctx, els, { panX: 0, panY: 0, zoom: 1, gridMode: 'free' }, 800, 600, () => '', '#ffffff')
    // from=(100,50) → to=(200,50):主线
    expect(ctx._calls).toContain('moveTo(100,50)')
    expect(ctx._calls).toContain('lineTo(200,50)')
    // label 画在中点 (150,50)
    expect(ctx._calls.some((c) => c.startsWith('fillText(rel@150,50)'))).toBe(true)
  })

  it('arrow with missing endpoint draws nothing (no throw)', () => {
    const ctx = mockCtx()
    const els = [
      { id: 'ca', kind: 'card', x: 0, y: 0, w: 10, h: 10, rotation: 0 },
      { id: 'ar', kind: 'arrow', x: 0, y: 0, w: 0, h: 0, rotation: 0, from: 'ca', to: 'ghost' },
    ] as unknown as CanvasElement[]
    expect(() => renderElements(ctx, els, { panX: 0, panY: 0, zoom: 1, gridMode: 'free' }, 800, 600, () => '', '#ffffff')).not.toThrow()
    // 不画 arrow 主线(没有 (100,50) 那种)— 只检查没有 moveTo(100,50)
    expect(ctx._calls.some((c) => c === 'moveTo(100,50)')).toBe(false)
  })
```

> 注:`mockCtx` 已有 `moveTo`/`lineTo`/`stroke`/`fillText`(freedraw T2 加的 moveTo/lineTo;stroke/fillText 本来就有)。`fillText(rel@150,50)` 的 mock 记录格式是 `fillText(${t}@${x},${y})` —— 与 card 测试用的格式一致。

- [ ] **Step 2.2:跑,确认红**

Run: `cd /Users/jinxunuo/projects/cys-stift/apps/web && pnpm exec vitest run src/features/canvas/host/__tests__/self-built-render.test.ts`
Expected: FAIL —— arrow 现走 default 不画 → `moveTo(100,50)` 断言失败。

- [ ] **Step 2.3:改 `self-built-render.ts` —— drawElement 加 allElements + arrow 分支**

文件顶部 import 加 `arrowEndpoints`:

```ts
import type { CanvasElement, CanvasView } from './canvas-host'
import { arrowEndpoints } from './self-built-arrow'
```

`renderElements` 的循环把 `elements` 传进 `drawElement`(改第 32-34 行):

```ts
  for (const el of elements) {
    drawElement(ctx, el, elements, getCardLabel)
  }
```

`drawElement` 签名加 `allElements`,在 `case 'freedraw'` 之后、`default` 之前加 `case 'arrow'`,并把 default 注释更新:

```ts
function drawElement(
  ctx: CanvasRenderingContext2D,
  el: CanvasElement,
  allElements: CanvasElement[],
  getCardLabel: (id: string) => string,
): void {
  switch (el.kind) {
    case 'card': {
      // ……(原样不动)
    }
    case 'rect': {
      // ……(原样不动)
    }
    case 'freedraw': {
      // ……(原样不动)
    }
    case 'arrow': {
      const { from, to } = arrowEndpoints(el, allElements)
      if (!from || !to) break
      ctx.beginPath()
      ctx.moveTo(from.x, from.y)
      ctx.lineTo(to.x, to.y)
      ctx.strokeStyle = colorOf(el.color)
      ctx.lineWidth = 2
      ctx.stroke()
      // V 形箭头 @ to,沿 from→to 方向
      const angle = Math.atan2(to.y - from.y, to.x - from.x)
      const head = 10
      ctx.beginPath()
      ctx.moveTo(to.x, to.y)
      ctx.lineTo(to.x - head * Math.cos(angle - Math.PI / 6), to.y - head * Math.sin(angle - Math.PI / 6))
      ctx.moveTo(to.x, to.y)
      ctx.lineTo(to.x - head * Math.cos(angle + Math.PI / 6), to.y - head * Math.sin(angle + Math.PI / 6))
      ctx.stroke()
      if (el.text) {
        const mx = (from.x + to.x) / 2
        const my = (from.y + to.y) / 2
        ctx.fillStyle = colorOf(el.color)
        ctx.font = `12px ${readToken('--font-body', 'Inter, sans-serif')}`
        ctx.fillText(el.text, mx, my)
      }
      break
    }
    default:
      // text/legacy — 后续 Task。
      break
  }
}
```

- [ ] **Step 2.4:跑渲染测试,确认绿**

Run: `cd /Users/jinxunuo/projects/cys-stift/apps/web && pnpm exec vitest run src/features/canvas/host/__tests__/self-built-render.test.ts`
Expected: PASS —— 原 5 + arrow 2 = 7 项。

- [ ] **Step 2.5:全部 host 测试 + build**

Run: `cd /Users/jinxunuo/projects/cys-stift/apps/web && pnpm exec vitest run src/features/canvas/host/ && cd /Users/jinxunuo/projects/cys-stift && pnpm --filter web build`
Expected: 全绿 + exit 0。

- [ ] **Step 2.6:Commit**

```bash
cd /Users/jinxunuo/projects/cys-stift && git add apps/web/src/features/canvas/host/self-built-render.ts apps/web/src/features/canvas/host/__tests__/self-built-render.test.ts
git commit -m "feat(canvas): Phase 1 arrow T2 — drawElement 加 arrow 渲染(线 + V 箭头 + label)"
```

**Task 2 验收:** 渲染测试 7 项绿(含 arrow 2);host 全绿;build exit 0;颜色走 token。→ 自审 + review。

---

## Task 3:`/dev/canvas-self` arrow 冒烟(upsert arrow,验渲染无错)

**Files:**
- Create: `scripts/phase1-arrow-smoke.cjs`

**Interfaces:**
- Consumes: Task 2 的 arrow 渲染;`window.__selfAdapter`(freedraw T4 暴露)。
- Produces: 冒烟验证 arrow 在真实 Chrome 渲染无错。

**必守约束:** 主路由零改动;静态服务跑完 kill;不假装通过。

- [ ] **Step 3.1:写 `scripts/phase1-arrow-smoke.cjs`**

```js
// scripts/phase1-arrow-smoke.cjs — 真实冒烟 /dev/canvas-self 的 arrow 渲染。
// 运行:先 pnpm --filter web build + 静态服务 :3016,再 node scripts/phase1-arrow-smoke.cjs
const puppeteer = require('puppeteer-core')
const fs = require('fs')
const path = require('path')
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const URL = 'http://localhost:3016'
const wait = (ms) => new Promise((r) => setTimeout(r, ms))
const out = path.join(__dirname, '..', 'docs', 'design', 'screenshots', 'phase1-arrow-smoke')
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

  // 经 __selfAdapter upsert 两 card + 一 arrow,验端到端渲染无错
  const result = await page.evaluate(() => {
    const a = window.__selfAdapter
    if (!a) return { error: 'no __selfAdapter' }
    a.upsert({ id: 'ca', kind: 'card', x: 200, y: 200, w: 160, h: 100, rotation: 0 })
    a.upsert({ id: 'cb', kind: 'card', x: 600, y: 200, w: 160, h: 100, rotation: 0 })
    a.upsert({ id: 'ar1', kind: 'arrow', x: 0, y: 0, w: 0, h: 0, rotation: 0, from: 'ca', to: 'cb', text: 'relates', color: 'black' })
    const els = a.getElements()
    return {
      cardCount: els.filter((e) => e.kind === 'card').length,
      arrowCount: els.filter((e) => e.kind === 'arrow').length,
    }
  })
  check('upserted 2 cards + 1 arrow, no throw', !result.error && result.arrowCount === 1, JSON.stringify(result))
  check('both cards present', result.cardCount >= 2, JSON.stringify(result))

  await page.screenshot({ path: path.join(out, 'arrow-rendered.png') })
  await browser.close()
  console.log(`\n${fail === 0 ? '✓' : '✗'} ${pass} passed, ${fail} failed`)
  process.exit(fail === 0 ? 0 : 1)
})().catch((e) => { console.error('FATAL', e); process.exit(2) })
```

- [ ] **Step 3.2:起静态服务 + 跑冒烟**

```bash
cd /Users/jinxunuo/projects/cys-stift && pnpm --filter web build
# 后台:python3 -m http.server 3016 --directory apps/web/out
# sleep 1;curl -sL http://localhost:3016/dev/canvas-self → 200
# node scripts/phase1-arrow-smoke.cjs
# 跑完 kill python(释放 3016)
```
Expected: 3/3 绿(挂载无错、2 card + 1 arrow 入 host 无抛、两 card 在)。截图 `arrow-rendered.png` 可视化检查箭头画在两卡片之间。

- [ ] **Step 3.3:Commit**

```bash
cd /Users/jinxunuo/projects/cys-stift && git add scripts/phase1-arrow-smoke.cjs
git commit -m "test(canvas): Phase 1 arrow T3 — /dev/canvas-self arrow 渲染冒烟 e2e"
```

**Task 3 验收:** 冒烟 3/3;主路由零改动;静态服务已 kill。→ 自审 + review → **Phase 1 arrow 渲染完成**。

---

## Phase 1 arrow 总验收

```bash
cd /Users/jinxunuo/projects/cys-stift/apps/web && pnpm exec vitest run src/features/canvas/host/   # 全绿(契约 12 + 渲染 7 + 命中 3 + adapter 7 + tldraw-adapter 7 + freedraw 5 + arrow 8 = 49)
cd /Users/jinxunuo/projects/cys-stift && pnpm --filter web build                                    # exit 0
node scripts/phase1-arrow-smoke.cjs                                                                 # 3/3(需静态服务 :3016)
```
+ `grep -r "@tldraw" apps/web/src/features/canvas/host/self-built-arrow.ts` → 无命中。
+ 主路由 `/canvas`(tldraw)零改动。
+ arrow 端点解析数学测准(border 交点)。

**产出:** 自研渲染器渲染关系箭头(边框交点端点 + V 箭头 + label),DSL/AI 创建的 arrow 端到端渲染打通。为 Phase 1 后续(文本编辑 IME / arrow 交互创建 / 交互打磨)奠基。

## Self-Review(plan 自检)

- **Spec 覆盖**:端点解析(Task 1)→ 渲染(Task 2)→ 冒烟(Task 3)。scope 第 4 点「DSL 创建的 arrow 能渲染」由 applyLayout(P0 已实现,host 无关)→ upsert → Task 2 渲染自动打通,冒烟经 `__selfAdapter.upsert` 直接验证同一 upsert 路径。
- **占位符扫描**:Task 2 的 `case 'card'/'rect'/'freedraw'` 用「// ……(原样不动)」指代——这是指保留现有代码不重复粘贴(避免文档臃肿 + 引入抄写错误),不是占位。执行者应**保留这三个 case 的现有实现不动**,只在 freedraw 之后插 arrow case、改签名加 `allElements` 参数。若担心歧义,执行时可先读 self-built-render.ts 确认这三个 case 存在再改。
- **类型一致性**:`arrowEndpoints(arrow, elements)→{from,to}` 在 Task 1 定义、Task 2 drawElement 消费,签名一致;`elementCenter`/`borderPoint` 的 `Point={x,y}` 贯穿;`drawElement(ctx, el, allElements, getCardLabel)` 签名在 Task 2 定义,renderElements 循环调用一致;render 测试用的 mock fillText 格式 `fillText(t@x,y)` 与现有 card 测试一致。
- **范围**:本计划自包含,产出可测软件(端点解析 + 渲染 + 冒烟)。arrow 交互创建 / 选择删除 / 文本编辑 / 打磨 / Phase 2 各自另开 plan。
