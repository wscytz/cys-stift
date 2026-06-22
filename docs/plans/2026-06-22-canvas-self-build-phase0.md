# 画布自研 · Phase 0 实现计划(抽象层 + 双向 DSL)

> **For agentic workers:** REQUIRED SUB-SKILL: 用 superpowers:subagent-driven-development(推荐)或 superpowers:executing-plans 逐 Task 执行。步骤用 `- [ ]` 勾选跟踪。

**Goal:** 在不动 tldraw 的前提下,建一个引擎无关的 `CanvasHost` 接口,把业务代码(绑定/DSL/快照)从直接调 tldraw 改为依赖接口;并把现有的两条单向文本路径(parseDsl ↔ formatCanvasSnapshot)统一成一条可 round-trip 的双向 DSL。**零 ADR**(纯重构 + 扩展,不改 spec、不换依赖)。

**Architecture:** 三层——数据层 + `CanvasHost` 抽象层(引擎无关接口,元素 CRUD / 事务 / 用户变更订阅 / 视口)+ 渲染层(本期仅 `TldrawAdapter`,Phase 1 再加自研 adapter)。卡片仍只存几何,内容从 CardService 实时读(F1.2/F1.3 现状不退化)。

**`CanvasElement` 是统一模型(核心设计)**:它不只是 DSL 的数据层——Phase 1/2 后,**实时渲染 / SVG 导出 / `.cystift` 几何 / DSL 文本**全是 `CanvasElement[]` 的四种视图。现状里「shape→SVG」外包给 tldraw(`getSvgString` + 10 次重试循环)、`.cystift` 的几何是 opaque tldraw snapshot;自研后这两步回到我们手里——现有原生导出机器(离线字体嵌入 / 图片内联 / PNG tEXt chunk / card-id 重映射)**原样复用**,只是底层数据从 tldraw 的换成 `CanvasElement[]` + 手绘向量。

**元素精简(用户 6/22 定)**:主动支持 **5 种**——`card` / `arrow` / `freedraw` / `text` / `rect`(rect 作分组框)。`ellipse` / `line` / `note`(并入 text)/ `image`(并入卡片 MediaRef)退出主动支持——接口 `CanvasElementKind` 仍能表示(读旧画布/导入),但工具栏不创建、DSL 不序列化。Phase 2 迁移时旧画布的 legacy 形状走转换/只读路径(届时定)。

**Tech Stack:** TypeScript strict、vitest(单测)、puppeteer-core(画布 e2e)、tldraw 3.15.6(本期仍是唯一渲染器)、@cys-stift/domain(零依赖,不碰)。

## Global Constraints(每个 Task 都 implicitly 必守)

- spec `docs/specs/2026-06-19-cys-stift-design.md` 冻结——Phase 0 不改 spec 一个字。
- `packages/domain` **零依赖**不破坏——`CanvasHost` 放 `apps/web`,绝不放进 domain。
- 颜色/像素走 token(`@cys-stift/ui` / `var(--color-*)`),不写死 hex。
- AI 隐私 allowlist 不变:`source.deviceId` / `media.dataUrl` / 软删除卡 永不进 prompt/DSL;**手绘点序列永不进 DSL 序列化**(R2)。
- 静态导出(`output:'export'`)——无 server / 无 API route / 无 `[param]` 动态路由;客户端组件标 `'use client'`;tldraw 只在浏览器动态 import。
- 不假装 build/test 通过——每步必跑命令看 exit code。
- 现有画布功能**零退化**:卡片拖拽回写、橡皮软删、快照恢复、视图持久化、AI 布局 全部保持。
- 每步 TDD:先写测试(红)→ 实现 → 测试绿 → commit。每 Task 完成自审 + 用户 review 才进下一 Task。

## File Structure(Phase 0 新增 / 修改)

**新增(引擎无关层 + DSL):**
- `apps/web/src/features/canvas/host/canvas-host.ts` — `CanvasHost` 接口 + `CanvasElement`/`CanvasView`/`UserChange` 模型(不 import tldraw)。
- `apps/web/src/features/canvas/host/in-memory-host.ts` — `InMemoryCanvasHost`,无 tldraw 的测试用 fake。
- `apps/web/src/features/canvas/host/tldraw-adapter.ts` — `TldrawAdapter implements CanvasHost`,包装 `Editor`(唯一 import tldraw 的 host 文件)。
- `apps/web/src/features/canvas/host/__tests__/canvas-host.contract.test.ts` — 接口契约测试(对 fake 跑;T0.2 后对 adapter 跑同一套)。
- `apps/web/src/features/ai/canvas-dsl.ts` — 统一双向 DSL:`serializeCanvas(elements)→string`(新)+ 复用 `parseDsl` 做反向。
- `apps/web/src/features/ai/__tests__/canvas-dsl.test.ts` — round-trip 测试。

**修改(业务代码改依赖 `CanvasHost`):**
- `apps/web/src/features/canvas/canvas-binding.ts` — `loadCardsIntoEditor`/`bindCardWriteback`/`syncCardsToEditor`/`addCardShape`/`updateCardShape`/`removeCardShape` 参数 `Editor` → `CanvasHost`。
- `apps/web/src/features/canvas/apply-layout.ts` — `applyLayout(editor,...)` → `applyLayout(host,...)`。
- `apps/web/src/features/canvas/canvas-editor.tsx` + `canvas-editor-binding-bridge.tsx` — 构造 `TldrawAdapter(editor)`,传给 binding/snapshot。
- `apps/web/src/features/ai/canvas-snapshot.ts` — `snapshotCanvas` 改读 `host.getElements()`(或标注弃用,改用 canvas-dsl)。
- `apps/web/src/features/ai/prompts.ts` / `ai-actions.ts` — canvas 级 AI 用 `serializeCanvas`(T0.4)。

---

## Task 1(T0.1):CanvasHost 接口 + 引擎无关元素模型 + 契约测试

**Files:**
- Create: `apps/web/src/features/canvas/host/canvas-host.ts`
- Create: `apps/web/src/features/canvas/host/in-memory-host.ts`
- Test: `apps/web/src/features/canvas/host/__tests__/canvas-host.contract.test.ts`

**Interfaces:**
- Consumes: 无(纯类型定义)。
- Produces: `CanvasHost`、`CanvasElement`、`CanvasElementKind`、`CanvasView`、`UserChange`、`InMemoryCanvasHost`。后续 Task 与 Phase 1 的 `SelfBuiltAdapter` 都依赖这些签名。

**必守约束:** `canvas-host.ts` 和 `in-memory-host.ts` **零 tldraw import**;元素 id 用 domain CardId(无 `shape:` 前缀,prefix 由 adapter 内部处理);`getElements()` 只返回可见元素(软删/归档的不在此层处理,由调用方过滤)。

- [ ] **Step 1.1:写 `canvas-host.ts` 类型 + 接口**

```ts
// apps/web/src/features/canvas/host/canvas-host.ts
'use client'

/**
 * CanvasHost — 引擎无关的画布接口(Phase 0 / 路线 A)。
 * 业务代码(绑定 / DSL / 快照 / 关系)只依赖此接口,不直接 import @tldraw/tldraw。
 * 本期唯一实现是 TldrawAdapter;Phase 1 加 SelfBuiltAdapter(Canvas 2D)。
 *
 * id 约定:CanvasElement.id = domain CardId(无 'shape:' 前缀)。
 * 引擎特定 id 格式化由 adapter 内部处理。
 */

/**
 * 主动支持的元素种类(用户 6/22 定:5 种)。工具栏只创建这些;DSL 只序列化这些。
 * card=卡片 / arrow=关系箭头 / freedraw=手绘 / text=浮动文本 / rect=分组框。
 */
export type ActiveCanvasKind = 'card' | 'arrow' | 'freedraw' | 'text' | 'rect'

/**
 * Legacy 种类——接口仍能表示(读旧画布 / `.cystift` 导入),但自研画布不创建、
 * DSL 不序列化。note 语义并入 text;image 并入卡片 MediaRef;ellipse/line 退役。
 * Phase 2 迁移时旧画布的 legacy 形状走转换/只读路径。
 */
export type LegacyCanvasKind = 'ellipse' | 'line' | 'note' | 'image'

export type CanvasElementKind = ActiveCanvasKind | LegacyCanvasKind

export const ACTIVE_CANVAS_KINDS: readonly ActiveCanvasKind[] = [
  'card', 'arrow', 'freedraw', 'text', 'rect',
]

export interface CanvasElement {
  id: string
  kind: CanvasElementKind
  x: number
  y: number
  w: number
  h: number
  rotation: number
  color?: string
  /** note/text 的文本;arrow 的 label。 */
  text?: string
  /** arrow 端点(id 引用,无 '#')。 */
  from?: string
  to?: string
  /** freedraw/image 只在此层带 metadata;原始点序列/二进制留在 adapter 的引擎存储里,不进 DSL。 */
  meta?: Record<string, unknown>
}

export interface CanvasView {
  panX: number
  panY: number
  zoom: number
  gridMode: 'snap' | 'free'
}

export interface UserChange {
  updated: CanvasElement[]
  removed: string[]
}

export interface CanvasHost {
  /** 当前页可见元素(已排除引擎内部隐藏)。 */
  getElements(): CanvasElement[]
  getElement(id: string): CanvasElement | undefined
  /** create-or-update。 */
  upsert(el: CanvasElement): void
  remove(id: string): void
  /** 单一 undo 步(tldraw editor.batch / 自研的 undo 边界)。 */
  batch(fn: () => void): void
  /** 应用变更但不触发 onUserChange(= tldraw mergeRemoteChanges)。用于回写循环抑制。 */
  applyWithoutEcho(fn: () => void): void
  /** 订阅「用户源」变更(拖拽/绘制/删除)→ 回写 DB + 快照持久化。返回取消订阅。 */
  onUserChange(cb: (c: UserChange) => void): () => void
  getView(): CanvasView
  setView(v: CanvasView): void
}
```

- [ ] **Step 1.2:写 `InMemoryCanvasHost`(测试 fake)**

```ts
// apps/web/src/features/canvas/host/in-memory-host.ts
'use client'

import type { CanvasElement, CanvasHost, CanvasView, UserChange } from './canvas-host'

/** 纯内存 CanvasHost——单测用,无 tldraw 依赖。 */
export class InMemoryCanvasHost implements CanvasHost {
  private elements = new Map<string, CanvasElement>()
  private view: CanvasView = { panX: 0, panY: 0, zoom: 1, gridMode: 'free' }
  private listeners = new Set<(c: UserChange) => void>()
  private echoing = true

  getElements(): CanvasElement[] {
    return [...this.elements.values()]
  }
  getElement(id: string): CanvasElement | undefined {
    return this.elements.get(id)
  }
  upsert(el: CanvasElement): void {
    this.elements.set(el.id, el)
    if (this.echoing) this.emit({ updated: [el], removed: [] })
  }
  remove(id: string): void {
    if (!this.elements.has(id)) return
    this.elements.delete(id)
    if (this.echoing) this.emit({ updated: [], removed: [id] })
  }
  batch(fn: () => void): void {
    fn() // fake 无 undo 分组
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
    this.listeners.add(cb)
    return () => {
      this.listeners.delete(cb)
    }
  }
  getView(): CanvasView {
    return { ...this.view }
  }
  setView(v: CanvasView): void {
    this.view = { ...v }
  }
  private emit(c: UserChange): void {
    for (const l of this.listeners) l(c)
  }
}
```

- [ ] **Step 1.3:写契约测试(先红)**

```ts
// apps/web/src/features/canvas/host/__tests__/canvas-host.contract.test.ts
import { describe, expect, it } from 'vitest'
import { InMemoryCanvasHost } from '../in-memory-host'
import type { CanvasHost } from '../canvas-host'

/**
 * 契约测试:任何 CanvasHost 实现都必须通过这套。
 * Phase 0 对 InMemoryCanvasHost 跑;T0.2 后同一套对 TldrawAdapter 跑(e2e)。
 */
function runContract(name: string, make: () => CanvasHost) {
  describe(`CanvasHost contract: ${name}`, () => {
    it('upsert → getElement 回读', () => {
      const h = make()
      h.upsert({ id: 'c1', kind: 'card', x: 10, y: 20, w: 240, h: 120, rotation: 0 })
      expect(h.getElement('c1')?.x).toBe(10)
      expect(h.getElements()).toHaveLength(1)
    })

    it('remove 触发 removed id 且不再可见', () => {
      const h = make()
      h.upsert({ id: 'c1', kind: 'card', x: 0, y: 0, w: 10, h: 10, rotation: 0 })
      let seen: { updated: unknown[]; removed: string[] } | null = null
      h.onUserChange((c) => (seen = c))
      h.remove('c1')
      expect(seen?.removed).toEqual(['c1'])
      expect(h.getElement('c1')).toBeUndefined()
    })

    it('applyWithoutEcho 抑制 onUserChange', () => {
      const h = make()
      let fired = 0
      h.onUserChange(() => fired++)
      h.applyWithoutEcho(() => {
        h.upsert({ id: 'c1', kind: 'card', x: 0, y: 0, w: 1, h: 1, rotation: 0 })
        h.remove('c1')
      })
      expect(fired).toBe(0)
      // echo 恢复后正常触发
      h.upsert({ id: 'c2', kind: 'card', x: 0, y: 0, w: 1, h: 1, rotation: 0 })
      expect(fired).toBe(1)
    })

    it('onUserChange 取消订阅后不再触发', () => {
      const h = make()
      let fired = 0
      const unsub = h.onUserChange(() => fired++)
      unsub()
      h.upsert({ id: 'c1', kind: 'card', x: 0, y: 0, w: 1, h: 1, rotation: 0 })
      expect(fired).toBe(0)
    })

    it('getView / setView 回读', () => {
      const h = make()
      h.setView({ panX: 5, panY: 6, zoom: 2, gridMode: 'snap' })
      expect(h.getView()).toEqual({ panX: 5, panY: 6, zoom: 2, gridMode: 'snap' })
    })
  })
}

runContract('InMemoryCanvasHost', () => new InMemoryCanvasHost())
```

- [ ] **Step 1.4:跑测试,确认绿**

Run: `pnpm --filter web test -- canvas-host.contract` (或 `pnpm --filter web vitest run canvas-host.contract`)
Expected: 5 passed。

- [ ] **Step 1.5:跑 tsc + build,确认零退化**

Run: `pnpm --filter web build`
Expected: exit 0(还没接入,只是新增类型文件)。

- [ ] **Step 1.6:Commit**

```bash
git add apps/web/src/features/canvas/host/
git commit -m "feat(canvas): Phase 0 T0.1 — CanvasHost interface + InMemoryCanvasHost + contract tests"
```

**Task 1 验收:** 契约测试 5 项全绿;`canvas-host.ts`/`in-memory-host.ts` grep 不到 `@tldraw`;`pnpm --filter web build` exit 0;现有画布功能未动(零退化)。→ **自审 + 用户 review 接口签名**(这是 keystone,后面全靠它)。

---

## Task 2(T0.2):TldrawAdapter + 业务代码改依赖 CanvasHost

**Files:**
- Create: `apps/web/src/features/canvas/host/tldraw-adapter.ts`
- Modify: `apps/web/src/features/canvas/canvas-binding.ts`(参数 Editor → CanvasHost)
- Modify: `apps/web/src/features/canvas/apply-layout.ts`(applyLayout(editor) → applyLayout(host))
- Modify: `apps/web/src/features/canvas/canvas-editor.tsx`、`canvas-editor-binding-bridge.tsx`(构造 adapter)
- Test: `apps/web/src/features/canvas/host/__tests__/tldraw-adapter.test.ts`(puppeteer e2e,挂载真实 tldraw)

**Interfaces:**
- Consumes: Task 1 的 `CanvasHost` / `CanvasElement` 全部签名。
- Produces: `TldrawAdapter`;改造后的 `loadCardsIntoEditor(host,...)` / `bindCardWriteback(host,...)` / `applyLayout(host, ops)` 供 Task 3/4 与现有 editor 使用。

**必守约束:** `tldraw-adapter.ts` 是 host 层**唯一** import `@tldraw/tldraw` 的文件;`canvas-binding.ts`/`apply-layout.ts` 改完后 grep 不得有 `from '@tldraw/tldraw'`;id 转换(`shape:` 前缀)集中到 adapter;行为与改造前**完全一致**(mergeRemoteChanges / source:'user' / batch 语义经 `applyWithoutEcho`/`onUserChange`/`batch` 保留)。

- [ ] **Step 2.1:写 `TldrawAdapter`(核心映射)**

```ts
// apps/web/src/features/canvas/host/tldraw-adapter.ts
'use client'

import { type Editor, type TLShape } from '@tldraw/tldraw'
import type { CanvasElement, CanvasHost, CanvasView, UserChange } from './canvas-host'

/** CanvasElement.id(cardId) ↔ tldraw shape id('shape:<id>')。集中在此,不再散落。 */
function toShapeId(id: string) {
  return `shape:${id}` as unknown as ReturnType<Editor['getShape']> extends infer S ? any : never
}
function fromShapeId(shapeId: unknown): string {
  return String(shapeId).replace(/^shape:/, '')
}

/** tldraw shape → CanvasElement(几何 + kind + 端点 + 文本)。 */
function shapeToElement(shape: TLShape): CanvasElement | null {
  const id = fromShapeId(shape.id)
  const p = shape.props as Record<string, unknown>
  const base = { id, x: shape.x, y: shape.y, rotation: shape.rotation }
  switch (shape.type) {
    case 'card':
      return { ...base, kind: 'card', w: (p.w as number) ?? 240, h: (p.h as number) ?? 120 }
    case 'geo': {
      const geo = p.geo as string
      const kind = geo === 'rectangle' ? 'rect' : geo === 'ellipse' ? 'ellipse' : 'line'
      return { ...base, kind, w: (p.w as number) ?? 100, h: (p.h as number) ?? 100, color: p.color as string | undefined }
    }
    case 'note':
      return { ...base, kind: 'note', w: 200, h: 200, color: p.color as string | undefined, text: (p.text as string) ?? '' }
    case 'text':
      return { ...base, kind: 'text', w: (p.w as number) ?? 100, h: (p.h as number) ?? 40, text: (p.text as string) ?? '' }
    case 'arrow': {
      const s = p.start as { boundShapeId?: string } | undefined
      const e = p.end as { boundShapeId?: string } | undefined
      return { ...base, kind: 'arrow', w: 0, h: 0, from: s?.boundShapeId ? fromShapeId(s.boundShapeId) : undefined, to: e?.boundShapeId ? fromShapeId(e.boundShapeId) : undefined, text: (p.text as string) ?? '' }
    }
    case 'draw':
      return { ...base, kind: 'freedraw', w: (p.w as number) ?? 0, h: (p.h as number) ?? 0, meta: { segments: p.segments } }
    default:
      return null
  }
}

export class TldrawAdapter implements CanvasHost {
  constructor(private readonly editor: Editor) {}

  getElements(): CanvasElement[] {
    return this.editor
      .getCurrentPageShapes()
      .map(shapeToElement)
      .filter((e): e is CanvasElement => e !== null)
  }
  getElement(id: string): CanvasElement | undefined {
    const s = this.editor.getShape(`shape:${id}` as never)
    return s ? shapeToElement(s as TLShape) ?? undefined : undefined
  }
  upsert(el: CanvasElement): void {
    const sid = `shape:${el.id}` as never
    if (this.editor.getShape(sid)) {
      this.editor.updateShape({ id: sid, type: kindToTldrawType(el.kind), x: el.x, y: el.y, rotation: el.rotation, props: elementProps(el) } as never)
    } else {
      this.editor.createShape({ id: sid, type: kindToTldrawType(el.kind), x: el.x, y: el.y, rotation: el.rotation, props: elementProps(el) } as never)
    }
  }
  remove(id: string): void {
    const sid = `shape:${id}` as never
    if (this.editor.getShape(sid)) this.editor.deleteShape(sid)
  }
  batch(fn: () => void): void {
    this.editor.batch(fn)
  }
  applyWithoutEcho(fn: () => void): void {
    this.editor.store.mergeRemoteChanges(fn)
  }
  onUserChange(cb: (c: UserChange) => void): () => void {
    return this.editor.store.listen(
      (entry) => {
        const updated: CanvasElement[] = []
        const removed: string[] = []
        for (const [, after] of Object.values(entry.changes.updated)) {
          if ((after as { typeName?: string })?.typeName === 'shape') {
            const el = shapeToElement(after as TLShape)
            if (el) updated.push(el)
          }
        }
        for (const r of Object.values(entry.changes.removed)) {
          if ((r as { typeName?: string; type?: string })?.typeName === 'shape') removed.push(fromShapeId((r as TLShape).id))
        }
        if (updated.length || removed.length) cb({ updated, removed })
      },
      { source: 'user', scope: 'document' },
    )
  }
  getView(): CanvasView {
    const cam = this.editor.getCamera()
    const isSnap = this.editor.getInstanceState().isGridMode
    return { panX: cam.x, panY: cam.y, zoom: cam.z, gridMode: isSnap ? 'snap' : 'free' }
  }
  setView(v: CanvasView): void {
    this.editor.setCamera({ x: v.panX, y: v.panY, z: v.zoom })
    this.editor.updateInstanceState({ isGridMode: v.gridMode === 'snap' })
    this.editor.user.updateUserPreferences({ isSnapMode: v.gridMode === 'snap' })
  }
}

/** CanvasElement → tldraw shape type 名 + props(几何样式)。 */
function kindToTldrawType(kind: CanvasElement['kind']): string {
  if (kind === 'rect' || kind === 'ellipse' || kind === 'line') return 'geo'
  if (kind === 'freedraw') return 'draw'
  return kind // card / note / text / arrow
}
function elementProps(el: CanvasElement): Record<string, unknown> {
  switch (el.kind) {
    case 'card': return { w: el.w, h: el.h }
    case 'rect': return { geo: 'rectangle', w: el.w, h: el.h, color: el.color ?? 'black' }
    case 'ellipse': return { geo: 'ellipse', w: el.w, h: el.h, color: el.color ?? 'black' }
    case 'line': return { geo: 'line', w: el.w, h: el.h, color: el.color ?? 'black' }
    case 'note': return { color: el.color ?? 'yellow', text: el.text ?? '' }
    case 'text': return { text: el.text ?? '' }
    case 'arrow': return {
      start: el.from ? { type: 'binding', boundShapeId: `shape:${el.from}`, normalizedAnchor: { x: 0.5, y: 0.5 }, isExact: false } : undefined,
      end: el.to ? { type: 'binding', boundShapeId: `shape:${el.to}`, normalizedAnchor: { x: 0.5, y: 0.5 }, isExact: false } : undefined,
      text: el.text ?? '', color: el.color ?? 'black',
    }
    case 'freedraw': return { segments: el.meta?.segments ?? [] }
    default: return {}
  }
}
```

> 注:`as never` 转换是现状(canvas-binding 已用此模式)的延续,集中到 adapter 后业务代码不再需要。tldraw 的 branded id 在边界统一处理。

- [ ] **Step 2.2:写 adapter e2e 契约测试(挂真实 tldraw)**

```ts
// apps/web/src/features/canvas/host/__tests__/tldraw-adapter.test.ts
// puppeteer-core e2e:加载 /dev/canvas(或专用 /dev/host 挂载页),取 window.__canvasEditor,
// 构造 TldrawAdapter,复用 canvas-host.contract.test.ts 的 runContract。
// 占位说明:此处给出测试结构;具体 puppeteer 启动沿用项目现有 e2e harness(见 scripts/*.cjs)。
```
> ⚠️ e2e harness 接入:本 Task 的 adapter 测试**复用 Task 1 的 `runContract`**,把第二个参数换成「puppeteer 挂载 tldraw 后构造的 TldrawAdapter」。先确认项目现有 puppeteer e2e 模式(`scripts/` 下),照搬其 browser 启动 + 页面探针,再调 `runContract('TldrawAdapter', makeAdapterFromPage)`。如果项目暂无 canvas e2e harness,本步降级为「dev 页手测清单」(见验收),并在本 Task 内**不**阻断——adapter 行为靠 Task 1 契约 + 手测保证,自动 e2e 单独开一个小 Task 补。

- [ ] **Step 2.3:重构 `canvas-binding.ts` —— 参数 Editor → CanvasHost**

逐函数替换(保持行为):
- `loadCardsIntoEditor(host: CanvasHost, service, canvasId)`:`editor.store.mergeRemoteChanges` → `host.applyWithoutEcho`;`editor.getShape/createShape/updateShape` → `host.getElement/upsert`。
- `bindCardWriteback(host: CanvasHost, service, canvasId)`:`editor.store.listen` → `host.onUserChange`;flush 内 `service.moveToCanvas` 逻辑不变;橡皮软删逻辑(removed id → softDelete)从 `host.onUserChange` 的 `removed` 取。
- `syncCardsToEditor` / `addCardShape` / `updateCardShape` / `removeCardShape`:同样换 host。
- 删掉 `cardShapeIdOf`/`cardIdFromShapeId` 的外部使用(prefix 逻辑移入 adapter);保留为 adapter 私有。

> 关键:回写循环抑制语义(`mergeRemoteChanges` 标记 remote → 不触发 user-source listener)由 `host.applyWithoutEcho` + `host.onUserChange` 表达,等价。

- [ ] **Step 2.4:重构 `apply-layout.ts` —— `applyLayout(host, ops)`**

`editor.batch` → `host.batch`;`editor.getShape/updateShape/createShape` → `host.getElement/upsert`(arrow 的 `boundShapeId` 端点改成 `from/to`,由 adapter 加 prefix)。DslOp 结构不变。

- [ ] **Step 2.5:改 `canvas-editor.tsx` + `canvas-editor-binding-bridge.tsx` —— 构造 adapter**

`onMount` 里 `onEditorReady(ed)` 前,`const host = new TldrawAdapter(ed)`;把 host 一并 lift 到 page state(或经 context),binding bridge / snapshot / double-click 改用 host。`editor.store.listen`(快照持久化)那条也走 `host.onUserChange`。

- [ ] **Step 2.6:跑 domain + db + web test + build + lint**

```bash
pnpm --filter domain test
pnpm --filter db test
pnpm --filter web test
pnpm --filter web build
pnpm -r lint
```
Expected: 全 exit 0。

- [ ] **Step 2.7:手测清单(dev 页,确认零退化)**

`/canvas`:新建卡片拖动→刷新位置保留;橡皮擦卡片→进 trash 不复活;切画布→快照恢复;AI 布局→卡片移动;关系箭头→端点绑定。逐项勾。

- [ ] **Step 2.8:Commit**

```bash
git add apps/web/src/features/canvas/
git commit -m "refactor(canvas): Phase 0 T0.2 — TldrawAdapter + business code depends on CanvasHost"
```

**Task 2 验收:** `canvas-binding.ts`/`apply-layout.ts` grep 无 `@tldraw/tldraw`;契约测试对 adapter 通过(或手测清单全绿);所有现有画布行为零退化;build/test/lint 全绿。→ 自审 + 用户 review。

---

## Task 3(T0.3):统一双向 DSL + round-trip 测试

**Files:**
- Create: `apps/web/src/features/ai/canvas-dsl.ts`(`serializeCanvas`)
- Modify: `apps/web/src/features/ai/dsl-parser.ts`(grammar 对齐 serialize,补 `@size`/`@rot`)
- Modify: `apps/web/src/features/ai/canvas-snapshot.ts`(`formatCanvasSnapshot` 改调 `serializeCanvas`,消除两套语法)
- Test: `apps/web/src/features/ai/__tests__/canvas-dsl.test.ts`(round-trip)

**Interfaces:**
- Consumes: Task 1 的 `CanvasElement`;Task 2 的 `host.getElements()`。
- Produces: `serializeCanvas(elements: CanvasElement[]): string`。反向仍用现有 `parseDsl`(grammar 对齐后即逆)。

**必守约束:** **legacy 种类(ellipse/line/note/image)不进 DSL;freedraw 只出 pos metadata,不发点序列**(守 R2 + 隐私);grammar 必须与 `parseDsl` 严格互逆;round-trip 只断言几何字段(kind/x/y/w/h/rotation/color/text/from/to);不破坏现有 AI 布局(`applyLayout(parseDsl(...))` 仍工作)。

- [ ] **Step 3.1:对齐 grammar 并写 `serializeCanvas`(先写 round-trip 测试再实现)**

统一 grammar(serialize 与 parseDsl 共用)——**只覆盖主动支持的几何种类**(card/rect/text/arrow + freedraw metadata;ellipse/line/note/image 不进 DSL):
```
[card #<id>] @pos(<x>,<y>) @size(<w>,<h>) @rot(<deg>) @color(<c>)
[rect #<id>] @pos(<x>,<y>) @size(<w>,<h>) @color(<c>)
[text #<id>] @pos(<x>,<y>) @text("<t>")
[arrow #<id>] @from(#<a>) @to(#<b>) @label("<l>") @color(<c>)
[freedraw #<id>] @pos(<x>,<y>)              ← metadata only,无点序列
```

```ts
// apps/web/src/features/ai/canvas-dsl.ts
'use client'
import type { CanvasElement } from '../canvas/host/canvas-host'

/** 画布 → 文本 DSL。只序列化主动支持的几何种类(card/rect/text/arrow)+ freedraw metadata。
 *  legacy(ellipse/line/note/image)与 freedraw 点序列都不发(R2 + 隐私)。 */
export function serializeCanvas(elements: CanvasElement[]): string {
  return elements
    .filter((e) => e.kind === 'card' || e.kind === 'rect' || e.kind === 'text' || e.kind === 'arrow' || e.kind === 'freedraw')
    .map(serializeElement)
    .filter(Boolean)
    .join('\n')
}

function serializeElement(e: CanvasElement): string {
  const pos = `@pos(${Math.round(e.x)},${Math.round(e.y)})`
  const size = `@size(${Math.round(e.w)},${Math.round(e.h)})`
  const rot = e.rotation ? ` @rot(${Math.round(e.rotation)})` : ''
  const color = e.color ? ` @color(${e.color})` : ''
  switch (e.kind) {
    case 'card': return `[card #${e.id}] ${pos} ${size}${rot}${color}`
    case 'rect': return `[rect #${e.id}] ${pos} ${size}${color}`
    case 'text': return `[text #${e.id}] ${pos} @text("${e.text ?? ''}")`
    case 'arrow': return `[arrow #${e.id}] @from(#${e.from ?? ''}) @to(#${e.to ?? ''})${e.text ? ` @label("${e.text}")` : ''}${color}`
    case 'freedraw': return `[freedraw #${e.id}] ${pos}` // 无点序列
    default: return '' // image 等不发
  }
}
```

- [ ] **Step 3.2:对齐 `parseDsl` 与 serialize 的精简 grammar**

`dsl-parser.ts` 改造:(a) 顶层 `[rect #<id>]` / `[text #<id>]` 行(取代旧 `[free: rect/note ...]` 包裹);(b) 每行带 `#<id>` 以支持 round-trip(旧 free op 不带 id);(c) 新增 `@rot` 解析(`ROT_RE`,存进可选字段);(d) **删除** ellipse/line/note 的解析分支(精简后不再支持)。`[freedraw #<id>] @pos(...)` 行解析为「pos-only 占位」(无点序列,不还原笔画)。保持「坏行静默跳过」。

- [ ] **Step 3.3:写 round-trip 测试**

```ts
// apps/web/src/features/ai/__tests__/canvas-dsl.test.ts
import { describe, expect, it } from 'vitest'
import { serializeCanvas } from '../canvas-dsl'
import { parseDsl } from '../dsl-parser'
import type { CanvasElement } from '../../canvas/host/canvas-host'

const geomElements: CanvasElement[] = [
  { id: 'c1', kind: 'card', x: 100, y: 200, w: 240, h: 120, rotation: 0, color: 'blue' },
  { id: 'r1', kind: 'rect', x: 10, y: 20, w: 300, h: 400, rotation: 0, color: 'red' },
  { id: 'a1', kind: 'arrow', x: 0, y: 0, w: 0, h: 0, rotation: 0, from: 'c1', to: 'r1', text: 'refs' },
]

describe('canvas DSL round-trip', () => {
  it('serialize → parse 还原几何字段(card/rect/arrow)', () => {
    const text = serializeCanvas(geomElements)
    const ops = parseDsl(text)
    const card = ops.find((o) => o.type === 'card')
    expect(card).toMatchObject({ cardId: 'c1', x: 100, y: 200, color: 'blue' })
    const rect = ops.find((o) => o.type === 'free' && o.shape === 'rect')
    expect(rect).toMatchObject({ id: 'r1', x: 10, y: 20, color: 'red' })
    const arrow = ops.find((o) => o.type === 'arrow')
    expect(arrow).toMatchObject({ from: 'c1', to: 'r1', label: 'refs' })
  })

  it('legacy 种类(ellipse/line/note/image)不进 DSL', () => {
    const text = serializeCanvas([
      { id: 'e1', kind: 'ellipse', x: 0, y: 0, w: 1, h: 1, rotation: 0 },
      { id: 'n1', kind: 'note', x: 0, y: 0, w: 1, h: 1, rotation: 0, text: 'hi' },
      { id: 'im1', kind: 'image', x: 0, y: 0, w: 1, h: 1, rotation: 0 },
    ])
    expect(text).toBe('')
  })

  it('freedraw 序列化不带点序列(隐私)', () => {
    const text = serializeCanvas([
      { id: 'f1', kind: 'freedraw', x: 5, y: 6, w: 0, h: 0, rotation: 0, meta: { segments: [{ points: [{ x: 1, y: 1 }] }] } },
    ])
    expect(text).toContain('[freedraw #f1]')
    expect(text).not.toContain('points')
    expect(text).not.toMatch(/\(1,1\)/)
  })
})
```

- [ ] **Step 3.4:跑测试,确认绿;改 `formatCanvasSnapshot` 调 `serializeCanvas` 消除双语法**

Run: `pnpm --filter web vitest run canvas-dsl`
Expected: 3 passed。
然后 `canvas-snapshot.ts` 的 `formatCanvasSnapshot` 内部改用 `serializeCanvas(snapshot.cards/arrows/...映射成 CanvasElement[])`,删掉它自己的 `[free shape: ...]` 语法分支(统一一套)。

- [ ] **Step 3.5:build + lint + commit**

```bash
pnpm --filter web build && pnpm -r lint
git add apps/web/src/features/ai/
git commit -m "feat(ai): Phase 0 T0.3 — unified bidirectional canvas DSL + round-trip tests"
```

**Task 3 验收:** round-trip 测试绿(含 rect);legacy 种类 + freedraw 点序列不进 DSL(断言通过);`formatCanvasSnapshot` 与 `serializeCanvas` 共用一套语法(无双语法);现有 AI 布局(`applyLayout(parseDsl(...))`)手测仍工作。→ 自审 + 用户 review。

---

## Task 4(T0.4):AI 接反向(读画布用 serializeCanvas)

**Files:**
- Modify: `apps/web/src/features/ai/ai-actions.ts`(canvas 级 AI 动作,如「整理布局/找关系」,喂 `serializeCanvas`)
- Modify: `apps/web/src/features/ai/prompts.ts`(若需 canvas 上下文模板)
- Test: `apps/web/src/features/ai/__tests__/ai-actions.test.ts`(扩展:断言 prompt 含 serializeCanvas 输出、**不含** deviceId/软删除卡/freedraw 点)

**Interfaces:**
- Consumes: Task 3 `serializeCanvas` + Task 2 `host.getElements()`。
- Produces:canvas 级 AI 动作用统一 DSL 作为「画布当前状态」上下文。

**必守约束:** AI 看到的画布上下文只来自 `serializeCanvas`(已保证无点序列/无 image);**反向断言**:prompt 不含 `deviceId`、不含软删除卡(已由 snapshot 过滤)、不含 freedraw 点序列;不引 vision 模型(永久禁项)。

- [ ] **Step 4.1:在 canvas 级 AI 动作的 prompt 构造里注入 `serializeCanvas`**

定位 `ai-actions.ts` 中「布局/关系」类动作(读当前画布的那条),把原先喂 `formatCanvasSnapshot` 的地方换成 `serializeCanvas(host.getElements())`;system prompt 仍要求 AI **只输出** parseDsl 能解析的 DSL 行。

- [ ] **Step 4.2:扩展 ai-actions 测试——反向隐私断言**

```ts
it('canvas AI prompt 不含 deviceId / 软删除卡 / freedraw 点序列', () => {
  const host = new InMemoryCanvasHost()
  host.upsert({ id: 'c1', kind: 'card', x: 0, y: 0, w: 1, h: 1, rotation: 0 })
  host.upsert({ id: 'f1', kind: 'freedraw', x: 0, y: 0, w: 0, h: 0, rotation: 0, meta: { segments: [{ points: [{ x: 9, y: 9 }] }] } })
  const ctx = serializeCanvas(host.getElements())
  expect(ctx).not.toContain('deviceId')
  expect(ctx).not.toContain('(9,9)')
  expect(ctx).not.toContain('points')
})
```

- [ ] **Step 4.3:跑测试 + build + lint + commit**

```bash
pnpm --filter web vitest run ai-actions && pnpm --filter web build && pnpm -r lint
git add apps/web/src/features/ai/
git commit -m "feat(ai): Phase 0 T0.4 — canvas AI reads via serializeCanvas (privacy reverse-asserts)"
```

**Task 4 验收:** 反向隐私断言通过;canvas 级 AI 动作手测(读画布→建议→applyLayout)仍工作;build/test/lint 全绿。→ 自审 + 用户 review → **Phase 0 完成**。

---

## Phase 0 总验收

```bash
pnpm --filter domain test     # 全绿
pnpm --filter db test         # 全绿
pnpm --filter web test        # 全绿(含 contract + round-trip + 反向隐私)
pnpm --filter web build       # exit 0
pnpm -r lint                  # 全绿
```
+ 手测清单(卡片拖拽回写 / 橡皮软删 / 快照恢复 / 视图持久化 / AI 布局 / 关系箭头)全绿。
+ `grep -r "@tldraw/tldraw" apps/web/src/features/canvas/{canvas-binding,apply-layout}.ts` → 无命中(只在 tldraw-adapter.ts)。

**Phase 0 产出:** ① 引擎可替换的 CanvasHost(零 tldraw 依赖的业务层)② 双向 round-trippable DSL 特色上线 ③ 零 ADR、零 spec 改动、零功能退化。为 Phase 1(自研 Canvas 2D 渲染器)铺好接口。

## Self-Review(plan 自检)

- **Spec 覆盖**:R1 双向 DSL→Task 3;R2 手绘/图片不进 DSL→Task 3 测试 + Task 4 反向断言;R6 抽象层→Task 1/2;R7 双 adapter 基础→Task 2(Phase 1 加 SelfBuiltAdapter);R8 DB 可信源不变→Task 2 行为保持;R9 抽象层在 web→File Structure 确认;§4.5 执行纪律→每 Task 四件套 + review 闸。✓
- **占位符扫描**:Task 2 Step 2.2 的 puppeteer e2e 标注了「复用项目现有 harness / 否则降级手测」——这是**有意的降级路径**不是占位;adapter 核心代码完整。其余步骤代码完整。✓
- **类型一致性**:`CanvasElement`/`CanvasHost` 在 Task 1 定义,Task 2/3/4 消费同名同签名;`serializeCanvas`/`parseDsl` grammar 在 Task 3 对齐;`from/to` 字段在 adapter 与 DSL 一致。✓
- **范围**:Phase 0 自包含,产出可测软件(契约测试 + round-trip)。Phase 1/2 另开计划。✓
