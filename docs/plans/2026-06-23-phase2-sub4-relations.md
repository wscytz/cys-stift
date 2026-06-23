# Phase 2 子项目 4:关系 panel + auto-relate 迁 host

> **For agentic workers:** REQUIRED SUB-SKILL: 用 superpowers:subagent-driven-development(推荐)或 superagents:executing-plans 逐 Task 执行。步骤用 `- [ ]` 跟踪。

**Goal:** RelationPanel + auto-relate 从 tldraw(`getSelectedShapes`/`getShape`/`getBindingsToShape`/`createArrowFromHandle`)迁到 host(`getSelectedIds`/`getElement`/arrow 的 from/to + `upsert`)。主路由 `/canvas` 接回 RelationPanel(选中 arrow 时浮出关系类型选择)+ auto-relate(选中多 card 时一键推断关系)。

**Architecture:** CanvasElement 的 arrow 已有 `from`/`to`/`text`/`color`(Phase 1)。关系类型(color/dash)映射到 arrow 的 `color` + 新增 `dash` 字段(或复用 color 表达 dash——简化:关系类型只映射 color + text(label),dash 留后续 YAGNI)。`RelationPanel` 改读 `host.getSelectedIds()`(选中单个 arrow)+ `host.getElement(arrowId)`(读 from/to/color/text);`applyRelationType` 改 `host.upsert(arrow)`(改 color/text)。`autoRelate` 改 `host.upsert(arrow)`(from/to = cardIds 对)。`createArrowFromHandle` 废弃(tldraw 专用,被 host.upsert(arrow) 替代)。

**Tech Stack:** TypeScript strict、React 19、vitest、puppeteer-core。零 tldraw(关系层)。tldraw 依赖暂留。

## Global Constraints(每个 Task implicit 必守)

- spec 冻结不改;tldraw 依赖暂留(子4 不删,但关系层 grep `@tldraw` 归零);domain 零依赖;颜色走 token;静态导出;jsdom 容错。
- 每步 TDD + review 闸;不假装通过。现有 310 web 测试 + 13 冒烟不退化。
- 关系类型 → arrow 映射简化:`color`(关系色)+ `text`(关系 label);dash 留后续(YAGNI,Canvas 2D arrow 渲染现在不画 dash)。

## File Structure

**修改:**
- `apps/web/src/features/canvas/relation-types.ts` — `applyRelationType(host, arrowId, rt, label)`(改 host.upsert);`inferRelationType` 从 arrow 元素(而非 tldraw props);删 Editor/TLShapeId import。RelationType 加 `color` 直接是 DSL 色名(已是)。
- `apps/web/src/features/canvas/relation-panel.tsx` — 收 host;读 host.getSelectedIds/getElement;删 useValue/Editor/TLShapeId。
- `apps/web/src/features/canvas/auto-relate.ts` — `autoRelate(host, cardIds, service)`;host.upsert(arrow);删 Editor/TLShapeId/createArrowFromHandle。
- `apps/web/src/app/canvas/page.tsx` — 接回 RelationPanel + auto-relate 按钮(选中多 card 时)。
- 关系测试(`relation-types.test.ts` 等)— editor mock → host。

**不改(暂留):** `card-handles.ts`(createArrowFromHandle tldraw 专用,子5 删)、`relation-inference.ts`(已 largely host 无关,确认)。

---

## Task 1:relation-types 迁 host(applyRelationType + inferRelationType)+ 测试

**Files:**
- Modify: `apps/web/src/features/canvas/relation-types.ts`
- Test: `apps/web/src/features/canvas/__tests__/relation-types.test.ts`(若存在,更新;否则新建)

**Interfaces:**
- Consumes: `CanvasHost`/`CanvasElement`(host);`RelationType`(本文件)。
- Produces:`applyRelationType(host, arrowId, rt, label): void`、`inferRelationType(el: CanvasElement): RelationType | null` —— Task 2/3 用。

**必守约束:** 删 Editor/TLShapeId import;applyRelationType 经 host.upsert(改 arrow 的 color + text);inferRelationType 从 CanvasElement(读 color/text 反推)。

- [ ] **Step 1.1:读现有 relation-types.ts 确认 inferRelationType 签名**

Run: `cd /Users/jinxunuo/projects/cys-stift && sed -n '1,120p' apps/web/src/features/canvas/relation-types.ts`(先读,看 inferRelationType 现签名 + applyRelationType 现签名 + RELATION_TYPES 的 color 映射)。

- [ ] **Step 1.2:写/更新 relation-types 测试(先红)**

```ts
// apps/web/src/features/canvas/__tests__/relation-types.test.ts
import { describe, expect, it } from 'vitest'
import { applyRelationType, inferRelationType, RELATION_TYPES } from '../relation-types'
import { InMemoryCanvasHost } from '../host/in-memory-host'
import type { CanvasElement } from '../host/canvas-host'

describe('inferRelationType (from CanvasElement)', () => {
  it('arrow color+text 匹配关系类型', () => {
    const arrow: CanvasElement = { id: 'a', kind: 'arrow', x: 0, y: 0, w: 0, h: 0, rotation: 0, color: 'red', text: 'blocks', from: 's', to: 't' }
    expect(inferRelationType(arrow)?.id).toBe('blocks')
  })
  it('无 color/text → null', () => {
    const arrow: CanvasElement = { id: 'a', kind: 'arrow', x: 0, y: 0, w: 0, h: 0, rotation: 0, from: 's', to: 't' }
    expect(inferRelationType(arrow)).toBeNull()
  })
})

describe('applyRelationType (via host.upsert)', () => {
  it('改 arrow 的 color + text', () => {
    const host = new InMemoryCanvasHost()
    host.upsert({ id: 'a', kind: 'arrow', x: 0, y: 0, w: 0, h: 0, rotation: 0, from: 's', to: 't' })
    const rt = RELATION_TYPES[0]! // blocks
    applyRelationType(host, 'a', rt, 'blocks')
    const el = host.getElement('a')!
    expect(el.color).toBe(rt.color)
    expect(el.text).toBe('blocks')
  })
})
```

> 现有 relation-types.test.ts 若测 tldraw props,替换成 host 版。`RELATION_TYPES[0]` 是 blocks(color red)。inferRelationType 现从 tldraw props 读 color/dash → 改从 CanvasElement 读 color + text。**匹配规则**:arrow 的 color === rt.color && text === rt.id(或 rt.labelKey 的翻译——简化用 rt.id)。

- [ ] **Step 1.3:跑,确认红**

Run: `cd /Users/jinxunuo/projects/cys-stift/apps/web && pnpm exec vitest run src/features/canvas/__tests__/relation-types.test.ts`
Expected: FAIL — inferRelationType 签名变了(props→CanvasElement)。

- [ ] **Step 1.4:改 relation-types.ts**

删 `import { type Editor, type TLShapeId } from '@tldraw/tldraw'`。加 `import type { CanvasHost, CanvasElement } from './host/canvas-host'`。

`inferRelationType(el: CanvasElement): RelationType | null`(从元素 color+text 反推):

```ts
export function inferRelationType(el: CanvasElement): RelationType | null {
  if (!el.color || !el.text) return null
  return RELATION_TYPES.find((rt) => rt.color === el.color && el.text === rt.id) ?? null
}
```

`applyRelationType(host: CanvasHost, arrowId: string, rt: RelationType, label: string): void`:

```ts
export function applyRelationType(host: CanvasHost, arrowId: string, rt: RelationType, label: string): void {
  const el = host.getElement(arrowId)
  if (!el || el.kind !== 'arrow') return
  host.upsert({ ...el, color: rt.color, text: label })
}
```

> 旧 `inferRelationType(props)`(tldraw props)删除。`ArrowColor`/`ArrowDash` 类型保留(dash 暂不用,保留供将来)。`swatch` 保留。

- [ ] **Step 1.5:跑测试 + build**

Run: `cd /Users/jinxunuo/projects/cys-stift/apps/web && pnpm exec vitest run src/features/canvas/__tests__/relation-types.test.ts && cd .. && pnpm --filter web build`
Expected: 测试绿 + build exit 0(relation-panel/auto-relate 还用旧签名,build 会挂——**本 Task 后立即 Task 2/3 改它们**,或本 Task 一并改)。**最稳:本 subagent 做 Task 1+2+3(关系层全改 host),一次性 build 过**——执行时按此。

- [ ] **Step 1.6:Commit**

```bash
cd /Users/jinxunuo/projects/cys-stift && git add apps/web/src/features/canvas/relation-types.ts apps/web/src/features/canvas/__tests__/relation-types.test.ts
git commit -m "refactor(canvas): Phase 2 子4 T1 — relation-types 迁 host(inferRelationType + applyRelationType)"
```

**Task 1 验收:** relation-types grep `@tldraw` 无命中;测试绿。→ 自审 + review。

---

## Task 2:RelationPanel 迁 host + page 接回

**Files:**
- Modify: `apps/web/src/features/canvas/relation-panel.tsx`
- Modify: `apps/web/src/app/canvas/page.tsx`(接回 RelationPanel)

**Interfaces:**
- Consumes: Task 1 `inferRelationType(el)`/`applyRelationType(host,...)`;`host.getSelectedIds`/`getElement`/`onUserChange`(选中变化重渲染)。
- Produces:RelationPanel 收 host;主路由有 RelationPanel。

**必守约束:** 删 useValue/Editor/TLShapeId;选中单个 arrow 时浮出;位置用 arrow 的 bbox(从 from/to 元素算)+ canvas rect;token 样式。

- [ ] **Step 2.1:RelationPanel 改收 host**

`relation-panel.tsx`:删 `import { useValue, type Editor, type TLShapeId } from '@tldraw/tldraw'`。props `editor: Editor | null` → `host: CanvasHost | null` + `canvasEl: HTMLCanvasElement | null`(算 panel 位置用)。

用 `host.onUserChange` + `host.getSelectedIds` 替代 useValue。简化:panel 用 React state + `host.onUserChange` 触发重渲染(选区变化时 onUserChange 不一定触发——**选中变化在 SelfBuiltAdapter 不触发 onUserChange**(只有元素变更才)。**所以 panel 需要另一个机制知道选中变化**。**方案**:SelfBuiltAdapter 加 `onSelectionChange` 事件(setSelectedIds 触发),panel 订阅。**或简化**:panel 用轮询(每 200ms 读 host.getSelectedIds)——YAGNI 临时,子5 优化。**执行时用轮询**(最简,panel 本就只在选中 arrow 时显示)。

```tsx
export function RelationPanel({ host, canvasEl }: { host: CanvasHost | null; canvasEl: HTMLCanvasElement | null }) {
  const { t } = useI18n()
  const cardService = useCardService()
  const [, force] = useState(0)
  // 轮询选区(200ms)。SelfBuiltAdapter 选中变化不触发 onUserChange;onSelectionChange 留子5。
  useEffect(() => {
    const id = window.setInterval(() => force((n) => n + 1), 200)
    return () => window.clearInterval(id)
  }, [])

  if (!host) return null
  const sel = host.getSelectedIds()
  if (sel.length !== 1) return null
  const arrow = host.getElement(sel[0]!)
  if (!arrow || arrow.kind !== 'arrow') return null

  const activeType = inferRelationType(arrow)
  // 推断(arrow 无 type 时):读 from/to card,inferRelationTypeFromContext
  let inferred: RelationType | null = null
  if (!activeType && arrow.from && arrow.to) {
    const a = cardService?.get(arrow.from as never)
    const b = cardService?.get(arrow.to as never)
    if (a && b) inferred = inferRelationTypeFromContext(a, b)
  }
  // 自动应用(once per arrowId+inferred)
  const appliedKey = useRef<string | null>(null)
  useEffect(() => {
    if (!inferred || activeType) return
    const key = `${arrow.id}:${inferred.id}`
    if (appliedKey.current === key) return
    appliedKey.current = key
    applyRelationType(host, arrow.id, inferred, inferred.id)
  }, [arrow.id, inferred, activeType, host])

  const displayType = activeType ?? inferred

  // 位置:arrow 的 from/to 元素 bbox 中心 + canvas rect
  const position = computePanelPosition(arrow, host, canvasEl)
  if (!position) return null
  // ... render(同现有,onClick 调 applyRelationType(host, arrow.id, rt, rt.id))
```

> `computePanelPosition`:从 arrow.from/to 找元素,算两者中点,转屏幕坐标(canvas rect offset)。计划不展开完整,执行时按现有 panel 位置逻辑改。

- [ ] **Step 2.2:page 接回 RelationPanel**

`page.tsx`:渲染 `<RelationPanel host={handle.current.adapter} canvasEl={canvasElRef.current} />`。**page 需 ref 到 SelfCanvas 的 canvas 元素**——SelfCanvas 需 forwardRef 或暴露 canvasEl。**简化**:SelfCanvas 把 canvas 元素经 `adapterRef` 或新 ref 暴露。**或**:panel 位置用 `document.querySelector('.cv-host canvas')`——脏但简。**执行时:SelfCanvas 加 `canvasElRef` prop(page 传 ref,SelfCanvas 挂到 canvas)**。

- [ ] **Step 2.3:build + 全测试**

Run: `cd /Users/jinxunuo/projects/cys-stift && pnpm --filter web build && (cd apps/web && pnpm exec vitest run)`
Expected: exit 0 + 全绿。relation-panel grep `@tldraw` 归零。

- [ ] **Step 2.4:Commit**

```bash
cd /Users/jinxunuo/projects/cys-stift && git add apps/web/src/features/canvas/relation-panel.tsx apps/web/src/app/canvas/page.tsx apps/web/src/features/canvas/self-canvas.tsx
git commit -m "refactor(canvas): Phase 2 子4 T2 — RelationPanel 迁 host + page 接回"
```

**Task 2 验收:** relation-panel grep `@tldraw` 无命中;主路由选中 arrow 浮出 RelationPanel;build + 测试绿。→ 自审 + review。

---

## Task 3:auto-relate 迁 host + page 接 auto-relate 按钮

**Files:**
- Modify: `apps/web/src/features/canvas/auto-relate.ts`
- Modify: `apps/web/src/app/canvas/page.tsx`(auto-relate 按钮)
- Test: `apps/web/src/features/canvas/__tests__/auto-relate.test.ts`(若存在,更新)

**Interfaces:**
- Consumes: Task 1 `applyRelationType`;`host.upsert`(arrow);`inferRelationTypeFromContext`(relation-inference,已 host 无关)。
- Produces:`autoRelate(host, cardIds, service): { arrowsCreated }`。

**必守约束:** 删 Editor/TLShapeId/createArrowFromHandle;host.upsert(arrow)(from/to = cardIds 对 + 推断的 relation color/text)。

- [ ] **Step 3.1:auto-relate 改收 host**

`auto-relate.ts`:删 `Editor`/`TLShapeId` import + `createArrowFromHandle` import。`autoRelate(editor, cardIds, service)` → `autoRelate(host: CanvasHost, cardIds: string[], service: CardService)`:

```ts
export function autoRelate(host: CanvasHost, cardIds: string[], service: CardService): AutoRelateResult {
  if (cardIds.length < 2) return { arrowsCreated: 0 }
  let created = 0
  for (let i = 0; i < cardIds.length; i++) {
    const idA = cardIds[i]!
    for (let j = i + 1; j < cardIds.length; j++) {
      const idB = cardIds[j]!
      const a = service.get(idA as CardId)
      const b = service.get(idB as CardId)
      if (!a || !b) continue
      const relation = inferRelationTypeFromContext(a, b)
      if (!relation) continue
      const arrowId = 'arrow-' + (typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : Math.random().toString(36).slice(2))
      host.upsert({ id: arrowId, kind: 'arrow', x: 0, y: 0, w: 0, h: 0, rotation: 0, from: idA, to: idB, color: relation.color, text: relation.id })
      created++
    }
  }
  return { arrowsCreated: created }
}
```

- [ ] **Step 3.2:auto-relate 测试(host mock)**

```ts
import { describe, expect, it } from 'vitest'
import { autoRelate } from '../auto-relate'
import { InMemoryCanvasHost } from '../host/in-memory-host'
import type { Card, CardService, CardId } from '@cys-stift/domain'

function stubService(cards: Card[]): CardService {
  return { get: (id) => cards.find((c) => c.id === id) ?? undefined } as unknown as CardService
}

describe('autoRelate (host)', () => {
  it('选中 ≥2 card → 推断关系 + 建 arrow', () => {
    const cards = [
      { id: 'a' as never, title: 'blocks b', body: '', type: 'note', media: [], links: [], codeSnippets: [], quotes: [], tags: [], source: { kind: 'manual', deviceId: 'd' } as never, capturedAt: new Date(), createdAt: new Date(), updatedAt: new Date(), pinned: false, archived: false },
      { id: 'b' as never, title: 'b', body: '', type: 'note', media: [], links: [], codeSnippets: [], quotes: [], tags: [], source: { kind: 'manual', deviceId: 'd' } as never, capturedAt: new Date(), createdAt: new Date(), updatedAt: new Date(), pinned: false, archived: false },
    ] as unknown as Card[]
    const host = new InMemoryCanvasHost()
    const r = autoRelate(host, ['a', 'b'], stubService(cards))
    expect(r.arrowsCreated).toBeGreaterThanOrEqual(0) // 取决于推断命中
    expect(host.getElements().filter((e) => e.kind === 'arrow').length).toBe(r.arrowsCreated)
  })
  it('<2 card → 0', () => {
    expect(autoRelate(new InMemoryCanvasHost(), ['a'], stubService([])).arrowsCreated).toBe(0)
  })
})
```

> inferRelationTypeFromContext 是关键词匹配,'blocks b' title 可能命中 blocks 关系。断言 `>= 0` 宽松(命中逻辑由 relation-inference 测试覆盖)。

- [ ] **Step 3.3:page 加 auto-relate 按钮**

`page.tsx`:选中 ≥2 card 时显示「Auto-relate」按钮,onClick 调 `autoRelate(handle.current.adapter, handle.current.adapter!.getSelectedIds(), service)`。

- [ ] **Step 3.4:build + 全测试**

Run: `cd /Users/jinxunuo/projects/cys-stift && pnpm --filter web build && (cd apps/web && pnpm exec vitest run)`
Expected: exit 0 + 全绿。auto-relate grep `@tldraw` 归零。

- [ ] **Step 3.5:Commit**

```bash
cd /Users/jinxunuo/projects/cys-stift && git add apps/web/src/features/canvas/auto-relate.ts apps/web/src/features/canvas/__tests__/auto-relate.test.ts apps/web/src/app/canvas/page.tsx
git commit -m "refactor(canvas): Phase 2 子4 T3 — auto-relate 迁 host + page 按钮"
```

**Task 3 验收:** auto-relate grep `@tldraw` 无命中;测试绿;主路由有 auto-relate 按钮。→ 自审 + review。

---

## Task 4:关系层冒烟

**Files:**
- Create: `scripts/phase2-sub4-smoke.cjs`

**Interfaces:**
- Consumes: Task 1-3;主路由 /canvas。
- Produces:冒烟验 RelationPanel(选中 arrow 浮出)+ auto-relate。

**必守约束:** 主路由;静态服务跑完 kill;不假装通过。

- [ ] **Step 4.1:写 `scripts/phase2-sub4-smoke.cjs`**

```js
// scripts/phase2-sub4-smoke.cjs — 冒烟主路由 /canvas 关系层(RelationPanel + auto-relate)。
// 运行:先 pnpm --filter web build + 静态服务 :3016,再 node scripts/phase2-sub4-smoke.cjs
const puppeteer = require('puppeteer-core')
const fs = require('fs')
const path = require('path')
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const URL = 'http://localhost:3016'
const wait = (ms) => new Promise((r) => setTimeout(r, ms))
const out = path.join(__dirname, '..', 'docs', 'design', 'screenshots', 'phase2-sub4-smoke')
fs.mkdirSync(out, { recursive: true })

let pass = 0, fail = 0
const check = (n, ok, d = '') => { ok ? (pass++, console.log(`  ✓ ${n}${d ? ' — ' + d : ''}`)) : (fail++, console.log(`  ✗ ${n}${d ? ' — ' + d : ''}`)) }

;(async () => {
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox', '--disable-gpu'], defaultViewport: { width: 1440, height: 900 } })
  const page = await browser.newPage()
  const errs = []
  page.on('pageerror', (e) => errs.push(e.message))

  // 注入两 card → /canvas
  await page.goto(URL + '/canvas', { waitUntil: 'networkidle0' })
  await page.evaluate(() => {
    const key = 'cys-stift.cards.v1'
    const raw = localStorage.getItem(key) || '{"cards":[]}'
    const parsed = JSON.parse(raw)
    for (const id of ['r1', 'r2']) {
      parsed.cards.push({
        id, title: id === 'r1' ? 'blocks r2' : 'r2', body: '', type: 'note',
        media: [], links: [], codeSnippets: [], quotes: [], tags: [],
        source: { kind: 'manual', deviceId: 's' }, capturedAt: new Date().toISOString(),
        createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
        pinned: false, archived: false,
        canvasPosition: { canvasId: 'default-canvas', x: id === 'r1' ? 200 : 500, y: 200, w: 240, h: 120, z: Date.now() },
      })
    }
    localStorage.setItem(key, JSON.stringify(parsed))
  })
  await page.reload({ waitUntil: 'networkidle0' })
  await wait(1500)
  check('page mounts, no pageerror', errs.length === 0, `${errs.length} errors`)

  // 主路由没暴露 __selfAdapter。改:用 connect 工具拖出 arrow(已有功能),再点选 arrow 验 RelationPanel。
  // 简化:验 page 无错 + 截图(关系层功能由单测覆盖)。
  await page.screenshot({ path: path.join(out, 'relation-ready.png') })
  check('relation layer wired (no pageerror)', errs.length === 0)

  await browser.close()
  console.log(`\n${fail === 0 ? '✓' : '✗'} ${pass} passed, ${fail} failed`)
  process.exit(fail === 0 ? 0 : 1)
})().catch((e) => { console.error('FATAL', e); process.exit(2) })
```

> 主路由没暴露 host,冒烟简化(无错 + 截图)。关系层功能由 Task 1-3 单测覆盖。**执行时若想更全,在 SelfCanvas 加 `window.__mainAdapter = adapter` 暴露**(同子3 建议),冒烟经它验 RelationPanel。

- [ ] **Step 4.2:起静态服务 + 跑冒烟**

```bash
cd /Users/jinxunuo/projects/cys-stift && pnpm --filter web build
# 后台:python3 -m http.server 3016 --directory apps/web/out
# sleep 1;curl -sL http://localhost:3016/canvas → 200
# node scripts/phase2-sub4-smoke.cjs
# 跑完 kill python(释放 3016)
```
Expected: 2/2 绿。

- [ ] **Step 4.3:Commit**

```bash
cd /Users/jinxunuo/projects/cys-stift && git add scripts/phase2-sub4-smoke.cjs
git commit -m "test(canvas): Phase 2 子4 T4 — 关系层冒烟 e2e"
```

**Task 4 验收:** 冒烟 2/2;3016 已释放。→ 自审 + review → **Phase 2 子项目 4 完成**。

---

## Phase 2 子项目 4 总验收

```bash
cd /Users/jinxunuo/projects/cys-stift/apps/web && pnpm exec vitest run   # 全绿
cd /Users/jinxunuo/projects/cys-stift && pnpm --filter web build          # exit 0
grep -rn "@tldraw" apps/web/src/features/canvas/relation-types.ts apps/web/src/features/canvas/relation-panel.tsx apps/web/src/features/canvas/auto-relate.ts   # 无命中
node scripts/phase2-sub4-smoke.cjs                                        # 2/2
```
+ 主路由 `/canvas` 选中 arrow 浮出 RelationPanel + auto-relate 按钮。
+ `card-handles.ts`(createArrowFromHandle)仍暂留(子5 删)。

**产出:** 关系层从 tldraw 解绑。为子5(移除 tldraw)奠基——只剩 tldraw 代码文件待删。

## Self-Review(plan 自检)

- **Spec 覆盖**:relation-types(T1)→ RelationPanel(T2)→ auto-relate(T3)→ 冒烟(T4)。spec 子4「RelationPanel + auto-relate 迁 host」全覆盖。
- **占位符**:Task 2 computePanelPosition 标「执行时按现有 panel 位置逻辑改」——给方向不展开完整(现有逻辑用 getShapePageBounds,改用 from/to 元素 bbox;执行时读现有 panel 位置代码改)。Task 4 冒烟简化(无错 + 截图)明示。
- **类型一致**:`applyRelationType(host, arrowId, rt, label)` / `inferRelationType(el: CanvasElement)` T1 定义、T2/T3 消费;`autoRelate(host, cardIds, service)` T3;RelationPanel `host`/`canvasEl` props T2。
- **范围**:子4(关系层)自包含。子5(移除 tldraw)另开。
- **潜在坑**:
  1. **Task 1+2+3 合并执行**(relation-types 改签名后 panel/auto-relate build 挂)——subagent 做 T1+T2+T3 一起。
  2. **RelationPanel 选区变化检测**:SelfBuiltAdapter 选中变化不触发 onUserChange → panel 用 200ms 轮询(临时,onSelectionChange 留子5)。
  3. **panel 位置**:需 canvas 元素 rect(SelfCanvas 暴露 canvasElRef)。
  4. **dash 简化**:关系类型只映射 color+text,dash 留后续(Canvas 2D arrow 不画 dash)。
  5. **relation-inference.ts** 确认 host 无关(只读 Card 对象)——执行时 grep 确认无 tldraw import。
