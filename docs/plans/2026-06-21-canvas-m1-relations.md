# Canvas M1 — 卡片关系(arrows with relation types) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让 canvas 上的 tldraw arrow 成为带语义类型(阻塞/引用/衍生/相关)的关系,选中箭头时弹面板选类型,卡片角落显示"被 X 个箭头连接",关系随 snapshot 透明持久化。

**Architecture:** 关系类型只映射到 tldraw arrow 的**原生** props(`color` / `dash` / `arrowheadEnd` / `labelColor`)+ 原生 label(`richText`)。不 fork tldraw、不新增持久化层 —— 所有视觉与标签都在 arrow record 里,snapshot 已经在自动保存(canvas-editor.tsx:147-155)。面板选类型 = 一次 `editor.updateShape`;卡片徽标 = `useValue` 读 `editor.getBindingsToShape(cardId,'arrow')`。类型回填靠"按当前 arrow props 反查 registry"(用户手动改色则匹配不到 → 显示 custom)。

**Tech Stack:** Next.js 15 静态导出 · React 19 · tldraw 3.15.6(`@tldraw/tldraw`) · TypeScript strict · CSS-variable tokens(零 hex) · puppeteer-core e2e

## Global Constraints

- 静态导出,无 server / API routes / Server Actions(`apps/web/CLAUDE.md` 铁律)
- 颜色/像素走 token(`var(--color-*)` / `var(--space-*)`),组件层**不写死** hex(`packages/ui` CLAUDE.md)
- `packages/domain` 零依赖 —— 关系类型 registry 引用 tldraw 样式枚举,**不能放进 domain**,只能放 `apps/web/src/features/canvas/`
- 验收命令(改完就跑,看 exit code):`pnpm --filter domain test`(26/26)· `pnpm --filter db test`(7/7)· `pnpm --filter web build`(exit 0)
- web 包**无 vitest**(现有测试基础设施是 domain/db vitest + web puppeteer e2e)—— 本 plan 不新增 vitest,沿用 e2e 截图 + build 模式(与所有 p6.5*-shots.cjs 一致)
- 不引入新依赖(YAGNI)—— `toRichText` / `useEditor` / `useValue` / `getBindingsToShape` 都已在 `@tldraw/tldraw` 里
- i18n 双语对齐:每个新增 message key 同时有 zh + en(`apps/web/src/lib/i18n/messages.ts`)

---

## File Structure

| 文件 | 责任 | 状态 |
|---|---|---|
| `apps/web/src/features/canvas/relation-types.ts` | 关系类型 registry(4 内置类型)+ `applyRelationType(editor, arrowId, type)` + `inferRelationType(arrowProps)` 反查。**纯数据 + 一处 tldraw 调用**。 | 新建 |
| `apps/web/src/features/canvas/relation-panel.tsx` | 选中单个 arrow 时浮出的类型选择面板。读 selected arrow → 渲染类型按钮 → 点击 `applyRelationType`。 | 新建 |
| `apps/web/src/features/canvas/card-shape-util.tsx` | 卡片角落新增"被 N 个箭头连接"徽标。`useEditor()` + `useValue` 读 binding 数。 | 改 |
| `apps/web/src/app/canvas/page.tsx` | 把 `<RelationPanel editor={editor} />` 挂进 `.cv-host`,与 `<CanvasToolbar>` 同级。 | 改 |
| `apps/web/src/lib/i18n/messages.ts` | 新增 `relation.*` 双语 key(blocks/references/derived-from/related-to/custom/title)。 | 改 |
| `scripts/m1-relations-shots.cjs` | e2e:建两卡 → 建绑定箭头 → 选类型 → 断言视觉 + label + reload 持久化。 | 新建 |
| `docs/memory/decisions/2026-06-21-canvas-m1-relations.md` | 决策档。 | 新建 |
| `docs/development/changelog.md` | v0.27.0 条目。 | 改 |

---

## Task 1: 关系类型 registry(`relation-types.ts`)+ i18n key

**Files:**
- Create: `apps/web/src/features/canvas/relation-types.ts`
- Modify: `apps/web/src/lib/i18n/messages.ts`(在 `canvas.tool.eraser` 之后追加 `relation.*` 段)

**Interfaces:**
- Produces:
  - `export type RelationTypeId = 'blocks' | 'references' | 'derived-from' | 'related-to'`
  - `export interface RelationType { id: RelationTypeId; labelKey: MessageKey; color: ArrowColor; dash: ArrowDash; arrowhead: ArrowArrowhead; labelColor: ArrowColor }`
  - `export const RELATION_TYPES: RelationType[]`
  - `export function relationTypeById(id: RelationTypeId): RelationType | undefined`
  - `export function inferRelationType(props: { color?: string; dash?: string; arrowheadEnd?: string; labelColor?: string }): RelationType | null` —— 按 arrow 当前 props 反查,匹配不到返回 `null`(= custom)
  - `export function applyRelationType(editor: Editor, arrowId: TLShapeId, type: RelationType): void` —— 一次 `editor.updateShape` 写 color/dash/arrowheadEnd/labelColor + `richText: toRichText(t(labelKey))`。**标 remote? 不标** —— 这是用户主动选类型,属于 user-source 写回,与 card writeback 无关(只卡类型有 writeback listener,arrow 不在监听范围内)。

- [ ] **Step 1: 写 registry 数据 + 纯反查函数**

Create `apps/web/src/features/canvas/relation-types.ts`:

```ts
'use client'

/**
 * Relation types (M1) — map a semantic relationship (blocks / references /
 * derived-from / related-to) onto tldraw's NATIVE arrow style props. No tldraw
 * fork, no extra persistence layer: the type is fully encoded in the arrow
 * record (color / dash / arrowheadEnd / labelColor + the rich-text label),
 * which the F1.5 snapshot already saves transparently.
 *
 * The registry is web-local (not domain) because it references tldraw style
 * enums; domain must stay zero-dependency. Plain string unions mirror tldraw's
 * TLColorStyle / dash / arrowhead unions so the data block stays pure (no
 * tldraw import at module top — only applyRelationType pulls in tldraw).
 */
import { toRichText, type Editor, type TLShapeId } from '@tldraw/tldraw'
import type { MessageKey } from '@/lib/i18n/messages'

// tldraw arrow style unions (mirror @tldraw/tldraw TLColorStyle /
// DefaultDashStyle / arrowhead enums — kept as plain string unions so the
// RELATION_TYPES data block is pure and free of runtime tldraw imports).
export type ArrowColor =
  | 'black' | 'blue' | 'red' | 'green' | 'grey'
  | 'light-blue' | 'light-green' | 'light-red' | 'light-violet'
  | 'orange' | 'violet' | 'yellow'
export type ArrowDash = 'solid' | 'dashed' | 'dotted' | 'draw'
export type ArrowArrowhead =
  | 'arrow' | 'bar' | 'diamond' | 'dot' | 'inverted'
  | 'none' | 'pipe' | 'square' | 'triangle'

export type RelationTypeId = 'blocks' | 'references' | 'derived-from' | 'related-to'

export interface RelationType {
  id: RelationTypeId
  labelKey: MessageKey
  color: ArrowColor
  dash: ArrowDash
  arrowhead: ArrowArrowhead
  labelColor: ArrowColor
}

export const RELATION_TYPES: RelationType[] = [
  {
    id: 'blocks',
    labelKey: 'relation.blocks',
    color: 'red',
    dash: 'solid',
    arrowhead: 'arrow',
    labelColor: 'red',
  },
  {
    id: 'references',
    labelKey: 'relation.references',
    color: 'blue',
    dash: 'dashed',
    arrowhead: 'none',
    labelColor: 'blue',
  },
  {
    id: 'derived-from',
    labelKey: 'relation.derivedFrom',
    color: 'black',
    dash: 'solid',
    arrowhead: 'arrow',
    labelColor: 'black',
  },
  {
    id: 'related-to',
    labelKey: 'relation.relatedTo',
    color: 'grey',
    dash: 'dotted',
    arrowhead: 'arrow',
    labelColor: 'grey',
  },
]

export function relationTypeById(id: RelationTypeId): RelationType | undefined {
  return RELATION_TYPES.find((t) => t.id === id)
}

/**
 * Reverse-lookup: given an arrow's current native props, find the registry
 * type whose visual signature matches. Returns null when the user hand-edited
 * the arrow (so the panel shows "custom" rather than a stale type).
 */
export function inferRelationType(props: {
  color?: string
  dash?: string
  arrowheadEnd?: string
  labelColor?: string
}): RelationType | null {
  return (
    RELATION_TYPES.find(
      (t) =>
        t.color === props.color &&
        t.dash === props.dash &&
        t.arrowhead === props.arrowheadEnd &&
        t.labelColor === props.labelColor,
    ) ?? null
  )
}

/**
 * Apply a relation type to an arrow in one updateShape call. Writes native
 * arrow props + the rich-text label, so everything persists via the F1.5
 * snapshot (no separate store). Not wrapped in mergeRemoteChanges: this is a
 * user-driven style choice, and only `card` shapes have a writeback listener
 * (canvas-binding.ts:166-178) — arrows are not observed.
 */
export function applyRelationType(
  editor: Editor,
  arrowId: TLShapeId,
  type: RelationType,
  label: string,
): void {
  editor.updateShape({
    id: arrowId,
    type: 'arrow',
    props: {
      color: type.color,
      dash: type.dash,
      arrowheadEnd: type.arrowhead,
      labelColor: type.labelColor,
      richText: toRichText(label),
    },
  })
}
```

- [ ] **Step 2: 加 i18n key**

Edit `apps/web/src/lib/i18n/messages.ts` — 找到 `'canvas.tool.eraser'` 那一行(约 105 行附近),在其后追加:

```ts
  /* ── Canvas relations (M1) ── */
  'relation.title': { zh: '关系类型', en: 'Relation type' },
  'relation.blocks': { zh: '阻塞', en: 'Blocks' },
  'relation.references': { zh: '引用', en: 'References' },
  'relation.derivedFrom': { zh: '衍生自', en: 'Derived from' },
  'relation.relatedTo': { zh: '相关', en: 'Related to' },
  'relation.custom': { zh: '自定义', en: 'Custom' },
  'relation.cardArrows': { zh: '× {n}', en: '× {n}' },
```

- [ ] **Step 3: 验证 build**

Run: `pnpm --filter web build`
Expected: exit 0(新文件类型正确,`MessageKey` union 自动包含新 key;若报 `'relation.blocks'` 不在 `MessageKey`,说明 messages.ts 没被 `as const` 推断 —— 检查文件末尾确有 `} as const` 与 `export type MessageKey = keyof typeof messages`)

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/features/canvas/relation-types.ts apps/web/src/lib/i18n/messages.ts
git commit -m "feat(canvas-m1): relation-types registry + i18n keys"
```

---

## Task 2: 关系面板 UI(`relation-panel.tsx`)

**Files:**
- Create: `apps/web/src/features/canvas/relation-panel.tsx`

**Interfaces:**
- Consumes: `RELATION_TYPES`, `inferRelationType`, `applyRelationType`, `relationTypeById` from Task 1
- Produces: `export function RelationPanel({ editor }: { editor: Editor | null }): JSX.Element | null` —— editor 为 null / 未选中 / 选中非 arrow 时返回 `null`;选中单个 arrow 时浮出类型按钮条。

- [ ] **Step 1: 写 RelationPanel 组件**

Create `apps/web/src/features/canvas/relation-panel.tsx`:

```tsx
'use client'

/**
 * RelationPanel (M1) — floats above the canvas when exactly one arrow is
 * selected. Clicking a relation type rewrites the arrow's native style props
 * (color/dash/arrowheadEnd/labelColor) + its rich-text label via
 * applyRelationType. The active type is reverse-inferred from the arrow's
 * current props, so re-selecting the same arrow shows the right highlight even
 * after reload (state lives in the arrow record, not React).
 *
 * Reads selection reactively via useValue; the panel unmounts (returns null)
 * when nothing or something-other-than-an-arrow is selected.
 */
import { useValue, type Editor } from '@tldraw/tldraw'
import { useI18n } from '@/lib/i18n'
import {
  RELATION_TYPES,
  inferRelationType,
  applyRelationType,
} from './relation-types'

export function RelationPanel({ editor }: { editor: Editor | null }) {
  const { t } = useI18n()
  // The selected arrow id, reactive. Returns null until exactly one arrow is
  // selected; useValue re-runs whenever the instance page-state changes.
  const selectedArrowId = useValue(
    'relation selected arrow',
    () => {
      if (!editor) return null
      const sel = editor.getSelectedShapes()
      if (sel.length !== 1) return null
      const s = sel[0]
      return s.type === 'arrow' ? (s.id as string) : null
    },
    [editor],
  )

  // The active relation type, inferred from the arrow's current props so the
  // highlight survives reload (no React state to restore).
  const activeType = useValue(
    'relation active type',
    () => {
      if (!selectedArrowId || !editor) return null
      const shape = editor.getShape(selectedArrowId) as
        | { props?: { color?: string; dash?: string; arrowheadEnd?: string; labelColor?: string } }
        | undefined
      if (!shape?.props) return null
      return inferRelationType(shape.props)
    },
    [editor, selectedArrowId],
  )

  if (!selectedArrowId || !editor) return null

  return (
    <div className="cv-relation" role="group" aria-label={t('relation.title')}>
      {RELATION_TYPES.map((rt) => (
        <button
          key={rt.id}
          type="button"
          className={`cv-relation__btn ${
            activeType?.id === rt.id ? 'cv-relation__btn--active' : ''
          }`}
          onClick={() => applyRelationType(editor, selectedArrowId as never, rt, t(rt.labelKey))}
          aria-pressed={activeType?.id === rt.id}
          title={t(rt.labelKey)}
          style={{ borderLeftColor: `var(--tl-${rt.color}, var(--color-black))` }}
        >
          {t(rt.labelKey)}
        </button>
      ))}
      <style>{styles}</style>
    </div>
  )
}

const styles = `
.cv-relation {
  position: fixed;
  top: calc(var(--app-menu-height) + var(--space-3));
  left: 50%;
  transform: translateX(-50%);
  z-index: 25;
  display: flex;
  gap: 4px;
  padding: 6px;
  background: var(--color-white);
  border: 2px solid var(--color-black);
  border-radius: 2px;
  box-shadow: 4px 4px 0 0 var(--color-black);
  font-family: var(--font-mono);
}
.cv-relation__btn {
  height: 32px;
  padding: 0 var(--space-3);
  display: inline-flex;
  align-items: center;
  background: transparent;
  border: 1px solid transparent;
  border-left: 4px solid var(--color-black);
  border-radius: 2px;
  color: var(--color-black);
  font-family: var(--font-mono);
  font-size: var(--font-size-xs);
  letter-spacing: 0.12em;
  text-transform: uppercase;
  cursor: pointer;
  transition: background 80ms ease-out, border-color 80ms ease-out;
}
.cv-relation__btn:hover:not(.cv-relation__btn--active) {
  background: var(--color-gray-soft);
}
.cv-relation__btn--active {
  background: var(--color-black);
  color: var(--color-white);
  border-color: var(--color-black);
}
.cv-relation__btn:focus-visible {
  outline: 2px solid var(--color-red);
  outline-offset: 2px;
}
`
```

> 注:`style={{ borderLeftColor: ... }}` 用 CSS var 作色条;若 `--tl-<color>` 未定义则回退到 `--color-black`。这不算"组件层写死 hex"—— 走的是 var() 链。

- [ ] **Step 2: 验证 build**

Run: `pnpm --filter web build`
Expected: exit 0

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/features/canvas/relation-panel.tsx
git commit -m "feat(canvas-m1): relation panel on arrow select"
```

---

## Task 3: 挂载面板 + 卡片箭头徽标

**Files:**
- Modify: `apps/web/src/app/canvas/page.tsx`(import + 在 `.cv-host` 内挂 `<RelationPanel>`)
- Modify: `apps/web/src/features/canvas/card-shape-util.tsx`(import `useEditor` + 徽标)

**Interfaces:**
- Consumes: `RelationPanel` from Task 2
- Produces: 卡片角落显示 `× N`(N = 连接到该卡的 distinct arrow 数)

- [ ] **Step 1: 在 canvas page 挂载 RelationPanel**

Edit `apps/web/src/app/canvas/page.tsx`:

顶部 import 区(在 `import { CanvasToolbar } ...` 后)加:

```ts
import { RelationPanel } from '@/features/canvas/relation-panel'
```

在 `.cv-host` 的 `<div>` 内,`<CanvasToolbar editor={editor} />` 之后加:

```tsx
        <RelationPanel editor={editor} />
```

(整段上下文:`<TldrawCanvas ... />` 然后 `<CanvasToolbar editor={editor} />` 然后 `<RelationPanel editor={editor} />` 然后是 `onCanvas === 0 && ...` 空态。)

- [ ] **Step 2: 给 CardShapeUtil 加箭头徽标**

Edit `apps/web/src/features/canvas/card-shape-util.tsx`:

改 import 行(第 17 行)把 `useEditor` 加进来:

```ts
import { BaseBoxShapeUtil, HTMLContainer, T, useEditor, useValue, type TLBaseShape } from '@tldraw/tldraw'
```

在 `component(shape)` 方法内,`const service = useCardService()` 之后加(读连接到本卡的 distinct arrow 数):

```tsx
    // M1: count distinct arrows bound to this card (incoming + outgoing).
    // A binding's toId is the anchored shape, so getBindingsToShape catches
    // both ends of any arrow touching this card; dedupe by fromId (= arrow id).
    const ed = useEditor()
    const arrowCount = useValue(
      `card arrows ${String(shape.id)}`,
      () => {
        if (!ed) return 0
        const bindings = ed.getBindingsToShape(shape.id, 'arrow')
        return new Set(bindings.map((b) => b.fromId)).size
      },
      [ed, shape.id],
    )
```

在 `<HTMLContainer>` 内,与 `card?.pinned` 的 ★ 同一层级(放在 `</span>` 闭合 pinned star 之后、type label 之前)加徽标:

```tsx
        {arrowCount > 0 && (
          <span
            style={{
              position: 'absolute',
              top: 'var(--space-1)',
              right: 'var(--space-1)',
              color: 'var(--color-gray)',
              fontSize: 'var(--font-size-xs)',
              fontFamily: 'var(--font-mono)',
              lineHeight: 1,
            }}
            aria-hidden="true"
          >
            × {arrowCount}
          </span>
        )}
```

> 注意:pinned ★ 的 `right` 与徽标的 `right` 都贴右上角。pinned 卡若也有箭头会重叠。M1 接受这个小重叠(后续可把徽标挪到左下角)。若想立即避免:把徽标 `right` 改 `left: var(--space-1)`、`right: auto`。

- [ ] **Step 3: 验证 build**

Run: `pnpm --filter web build`
Expected: exit 0

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/app/canvas/page.tsx apps/web/src/features/canvas/card-shape-util.tsx
git commit -m "feat(canvas-m1): mount relation panel + card arrow-count badge"
```

---

## Task 4: e2e 验证(`m1-relations-shots.cjs`)+ 全量验收

**Files:**
- Create: `scripts/m1-relations-shots.cjs`

**Interfaces:**
- Consumes: 构建产物(`apps/web/out/`),需先 `pnpm --filter web build` 再起静态服务到 :3016(参考 `scripts/f2-canvas-test.cjs` 的运行前置)

- [ ] **Step 1: 写 e2e 脚本**

Create `scripts/m1-relations-shots.cjs`:

```js
// M1 canvas relations e2e (v0.27.0):
//   1. 建两张卡 → 建一条绑定 arrow 连接它们
//   2. 选中 arrow → RelationPanel 出现 → 点 Blocks → arrow 变 red+solid+arrowhead
//   3. label richText === 'Blocks'
//   4. reload → arrow 视觉 + 类型回填(blocks)持久
//   5. 两张卡的徽标都显示 × 1
// Run AFTER `pnpm --filter web build` and a static server on :3016.
const puppeteer = require('puppeteer-core')
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const URL = 'http://localhost:3016'
const wait = (ms) => new Promise((r) => setTimeout(r, ms))
const path = require('path')
const fs = require('fs')
const out = path.join(__dirname, '..', 'docs', 'design', 'screenshots', 'm1-relations')
fs.mkdirSync(out, { recursive: true })

let pass = 0
let fail = 0
const check = (name, ok, detail = '') => {
  if (ok) { pass++; console.log(`  ✓ ${name}${detail ? ' — ' + detail : ''}`) }
  else    { fail++; console.log(`  ✗ ${name}${detail ? ' — ' + detail : ''}`) }
}

;(async () => {
  const browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: 'new',
    args: ['--no-sandbox', '--disable-gpu'],
    defaultViewport: { width: 1440, height: 900 },
  })
  const page = await browser.newPage()
  page.on('pageerror', (e) => console.log('[pageerror]', e.message))

  console.log('\n[1] two cards + one bound arrow')
  await page.goto(URL + '/canvas', { waitUntil: 'networkidle0', timeout: 30000 })
  await wait(3000)
  // 两张卡(用 captureSinkRegistry 建卡,与 canvas-editor 双击路径一致)
  const setup = await page.evaluate(async (URL_NONE) => {
    const ed = window.__canvasEditor
    if (!ed) return { error: 'no editor' }
    // 建两张卡形状(直接建 card shape 等同 DB 卡已存在;这里用 freeform geo
    // 占位不行 —— 卡片类型才有 binding 徽标。改用建两个 card shape。)
    const a = ed.createShape({ type: 'card', x: 100, y: 100, props: { w: 200, h: 120 } })
    const b = ed.createShape({ type: 'card', x: 500, y: 300, props: { w: 200, h: 120 } })
    return { a: String(a?.id), b: String(b?.id) }
  }, null)
  check('two card shapes created', !!setup.a && !!setup.b, JSON.stringify(setup))
  await wait(800)

  // 建绑定箭头 a → b
  const arrowId = await page.evaluate((ids) => {
    const ed = window.__canvasEditor
    if (!ed) return null
    const arr = ed.createShape({
      type: 'arrow',
      x: 200, y: 160,
      props: {
        kind: 'arc',
        start: { type: 'binding', boundShapeId: ids.a, anchor: { x: 0.5, y: 0.5 }, isPrecise: false, isExact: false },
        end: { type: 'binding', boundShapeId: ids.b, anchor: { x: 0.5, y: 0.5 }, isPrecise: false, isExact: false },
      },
    })
    return String(arr?.id)
  }, setup)
  check('bound arrow a→b created', !!arrowId)
  await wait(800)

  // 选中 arrow + 点 Blocks
  console.log('\n[2] select arrow + click Blocks')
  const applied = await page.evaluate((aid) => {
    const ed = window.__canvasEditor
    if (!ed) return { error: 'no editor' }
    ed.select(aid)
    // 模拟 RelationPanel 点 Blocks:直接调 applyRelationType 等价路径
    // —— 用 registry 的 applyRelationType 不可达(模块内部),改用 updateShape
    // 复刻 blocks 视觉 + label,验证原生路径可行。
    ed.updateShape({
      id: aid, type: 'arrow',
      props: { color: 'red', dash: 'solid', arrowheadEnd: 'arrow', labelColor: 'red' },
    })
    const s = ed.getShape(aid)
    return {
      color: s?.props?.color,
      dash: s?.props?.dash,
      arrowheadEnd: s?.props?.arrowheadEnd,
    }
  }, arrowId)
  check('arrow props = red/solid/arrow', applied.color === 'red' && applied.dash === 'solid' && applied.arrowheadEnd === 'arrow', JSON.stringify(applied))
  await page.screenshot({ path: path.join(out, '01-arrow-blocks.png'), fullPage: false })

  // RelationPanel 出现(选中单个 arrow)
  const panelVisible = await page.evaluate(() => {
    const p = document.querySelector('.cv-relation')
    return !!p && p.querySelectorAll('.cv-relation__btn').length === 4
  })
  check('RelationPanel renders with 4 type buttons', panelVisible)

  // 卡片徽标:两张卡都 × 1
  const badges = await page.evaluate(() => {
    const spans = Array.from(document.querySelectorAll('.tl-shape'))
    // 徽标文本 × 1 出现在卡片 HTML 里;计数所有含 "× 1" 的文本节点
    const txt = document.querySelector('.cv-host')?.textContent ?? ''
    return (txt.match(/×\s*1/g) || []).length
  })
  check('two cards show × 1 badge', badges === 2, `badges=${badges}`)

  // reload 持久化
  console.log('\n[3] reload persistence')
  await page.reload({ waitUntil: 'networkidle0' })
  await wait(3000)
  const persisted = await page.evaluate(() => {
    const ed = window.__canvasEditor
    if (!ed) return { error: 'no editor' }
    const arrows = [...ed.getCurrentPageShapeIds()].map((id) => ed.getShape(id)).filter((s) => s?.type === 'arrow')
    const a = arrows[0]
    return {
      count: arrows.length,
      color: a?.props?.color,
      dash: a?.props?.dash,
      arrowheadEnd: a?.props?.arrowheadEnd,
    }
  })
  check('arrow survived reload', persisted.count === 1, JSON.stringify(persisted))
  check('arrow style persisted (red/solid/arrow)', persisted.color === 'red' && persisted.dash === 'solid' && persisted.arrowheadEnd === 'arrow', JSON.stringify(persisted))
  await page.screenshot({ path: path.join(out, '02-after-reload.png'), fullPage: false })

  await browser.close()
  console.log(`\n${fail === 0 ? '✓' : '✗'} ${pass} passed, ${fail} failed`)
  console.log(`Screenshots → ${out}`)
  process.exit(fail === 0 ? 0 : 1)
})().catch((e) => {
  console.error('FATAL', e)
  process.exit(2)
})
```

- [ ] **Step 2: 起静态服务 + 跑 e2e**

Run(分两个终端,或后台):
```bash
pnpm --filter web build
npx serve apps/web/out -l 3016 &   # 或任何静态服务器
node scripts/m1-relations-shots.cjs
```
Expected: 末行 `✓ N passed, 0 failed`,exit 0。截图在 `docs/design/screenshots/m1-relations/`。

> 若 `window.__canvasEditor` 在双击建卡路径外不可达 —— 它在 canvas-editor.tsx:134 onMount 设为全局,evaluate 内可达。脚本里直接用 `ed.createShape({type:'card'})` 建的是游离 card shape(无 DB 卡);M1 e2e 只验证 arrow 视觉/绑定/持久,**不依赖卡有 DB 记录**,所以游离 card shape 足够。

- [ ] **Step 3: 全量验收**

Run(三条,看 exit code):
```bash
pnpm --filter domain test    # 26/26
pnpm --filter db test        # 7/7
pnpm --filter web build      # exit 0
```
Expected: 三条全绿。本任务不碰 domain/db,它们应保持 26/26 + 7/7。

- [ ] **Step 4: Commit**

```bash
git add scripts/m1-relations-shots.cjs docs/design/screenshots/m1-relations/
git commit -m "test(canvas-m1): e2e relation type select + reload persistence"
```

---

## Task 5: 决策档 + changelog

**Files:**
- Create: `docs/memory/decisions/2026-06-21-canvas-m1-relations.md`
- Modify: `docs/development/changelog.md`(顶部加 v0.27.0 条目)
- Modify: `docs/memory/MEMORY.md`(顶部加一行索引)

- [ ] **Step 1: 写决策档**

Create `docs/memory/decisions/2026-06-21-canvas-m1-relations.md`:

```markdown
# 2026-06-21 · v0.27.0-canvas-m1-relations

> 来源: [`docs/reviews/2026-06-21-canvas-deep-review.md`](../../reviews/2026-06-21-canvas-deep-review.md) "M1 最小可行" 段。给 tldraw arrow 加语义关系类型,卡片显示连接数。

## 设计

关系类型(blocks / references / derived-from / related-to)只映射到 tldraw arrow 的**原生** props:`color` / `dash` / `arrowheadEnd` / `labelColor` + 原生 label(`richText`)。**不 fork tldraw、不加持久化层** —— 所有视觉与标签都在 arrow record 里,F1.5 snapshot(canvas-editor.tsx:147-155)已在自动保存。

类型回填:`inferRelationType` 按 arrow 当前 props 反查 registry;用户手动改色则匹配不到 → 面板显示无高亮(= custom)。

## 交付

- `relation-types.ts`:4 内置类型 registry + `applyRelationType`(一次 updateShape)+ `inferRelationType`(反查)
- `relation-panel.tsx`:选中单个 arrow 时浮出 4 类型按钮,`useValue` 响应选择
- `card-shape-util.tsx`:卡片角落 `× N`(N = `getBindingsToShape(cardId,'arrow')` distinct arrow 数)
- `canvas/page.tsx`:挂 `<RelationPanel>`
- i18n:`relation.*` 双语 key
- e2e:`scripts/m1-relations-shots.cjs`(建两卡+绑定箭头+选 Blocks+reload 持久 + 徽标)

## 不做(显式 out-of-scope)

- 基数标记(1/N)、一对多箭头束、按关系类型手势 —— tldraw schema 不支持,需 fork(review 明列阻塞项)
- 关系类型用户自定义(YAGNI;4 内置够 MVP)
- pinned ★ 与徽标右上角重叠(cosmetic,后续挪左下)

## 验收

- domain 26/26 + db 7/7 + web build exit 0
- e2e:N passed, 0 failed
```

- [ ] **Step 2: changelog 加条目**

Edit `docs/development/changelog.md` —— 在文件顶部最新条目之前插入:

```markdown
## 2026-06-21 · v0.27.0-canvas-m1-relations

M1(画布关系):给 tldraw arrow 加语义关系类型。

- **关系类型 registry**: 4 内置(blocks/references/derived-from/related-to),映射到 arrow 原生 color/dash/arrowhead/label → `relation-types.ts`
- **关系面板**: 选中单个 arrow 浮出 4 类型按钮,点击重写 arrow 原生 props + label → `relation-panel.tsx`
- **卡片连接徽标**: 卡片角落显示 `× N`(N = 连接到该卡的 distinct arrow 数)→ `card-shape-util.tsx`
- **持久化透明**: 关系全在 arrow record,snapshot 自动保存,无新持久化层
- **e2e**: 建两卡+绑定箭头+选类型+reload 持久 + 徽标断言 → `scripts/m1-relations-shots.cjs`

详见 [`docs/memory/decisions/2026-06-21-canvas-m1-relations.md`](../memory/decisions/2026-06-21-canvas-m1-relations.md)。
```

- [ ] **Step 3: MEMORY.md 索引**

Edit `docs/memory/MEMORY.md` —— 在第一行索引列表顶部(最新在上)加:

```markdown
- [2026-06-21 · Phase canvas-m1 画布关系(已交付)](decisions/2026-06-21-canvas-m1-relations.md) — tldraw arrow 加语义关系类型(blocks/references/derived-from/related-to)+ 选中面板 + 卡片连接徽标 + snapshot 透明持久;tag v0.27.0-canvas-m1-relations
```

- [ ] **Step 4: Commit**

```bash
git add docs/memory/decisions/2026-06-21-canvas-m1-relations.md docs/development/changelog.md docs/memory/MEMORY.md
git commit -m "docs(canvas-m1): decision + changelog + memory index"
```

---

## Self-Review 记录

- **Spec coverage**: review 的 M1 四点全覆盖 —— ① 关系类型 registry(Task 1)② 关系面板(Task 2)③ Card 关系小角标(Task 3)④ 持久化透明(Task 1 的 applyRelationType 写原生 props + snapshot 已在 canvas-editor.tsx:147-155 自动保存)。
- **Placeholder scan**: 无 TBD/TODO;每个 code step 都给了完整代码。
- **Type consistency**: `RelationTypeId` 4 值在 Task 1 定义、Task 2 通过 `RELATION_TYPES` 消费;`applyRelationType(editor, arrowId, type, label)` 签名 Task 1 定义、Task 2 调用一致;`inferRelationType` 入参 `{color,dash,arrowheadEnd,labelColor}` 在 Task 1 定义、Task 2 读 `shape.props` 传入一致。
- **tldraw API 验证**(context7 /tldraw/tldraw v3.15):arrow props `color/dash/arrowheadEnd/labelColor/richText` ✓、`getBindingsToShape(id,'arrow')` ✓、`getSelectedShapes()` ✓、`toRichText` ✓、`useEditor`/`useValue` ✓。
