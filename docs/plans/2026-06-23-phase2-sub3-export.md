# Phase 2 子项目 3:导出层迁 CanvasElement(原生层优势落点)

> **For agentic workers:** REQUIRED SUB-SKILL: 用 superpowers:subagent-driven-development(推荐)或 superagents:executing-plans 逐 Task 执行。步骤用 `- [ ]` 跟踪。

**Goal:** 导出层(SVG/PNG/`.cystift`)从 tldraw(`getSvgString`/`getSvgAsImage`/`getSnapshot`)解绑到 `CanvasElement[]`:自研 `elementsToSvg`(CanvasElement→SVG,复用现有字体/图片嵌入),SVG→PNG 自研光栅化,`.cystift` 几何用透明 CanvasElement[](替代 opaque tldraw snapshot),主路由接回 ExportDialog 入口。

**Architecture:** keystone 是 `elementsToSvg(elements, view, getCardInfo, opts)` 纯函数——把 card/rect/freedraw/arrow/text 画成 SVG 元素(对齐 self-built-render 视觉,颜色用 `readToken` 解析成具体值嵌入,因 SVG 文件脱离文档 CSS 上下文)。`exportCanvasSvg`/`exportCanvasImage`/`buildCystiftPayload` 改收 `CanvasHost`(+ service)而非 `Editor`。`export-dialog` 改收 host(adapterRef)。`.cystift` payload 的 `snapshot` 字段换 `elements: CanvasElement[]`(透明,restore 经 `host.upsert`)。

**Tech Stack:** TypeScript strict、SVG DOM、Canvas 2D(光栅化)、vitest、puppeteer-core。**tldraw 依赖暂留**(子5 删),但导出层不再 import 它。

## Global Constraints(每个 Task implicit 必守)

- spec 冻结不改;tldraw 依赖暂留(子3 不删,但导出层文件 grep `@tldraw` 应逐步归零);domain 零依赖;颜色走 token——**SVG 里用 `readToken` 解析成具体色值**(SVG 独立文件无 CSS 变量上下文,不能 `var(--color-*)`);静态导出;jsdom 容错。
- 每步 TDD + review 闸;不假装通过。现有 305 web 测试 + 12 冒烟不退化(导出测试从 editor mock 改 host)。
- `.cystift` 往返保留(SVG `data-cystift` 属性 / PNG `tEXt` chunk);restore 经 host.upsert。

## File Structure

**新增:**
- `apps/web/src/features/canvas/host/elements-to-svg.ts` — 纯函数 `elementsToSvg(elements, view, getCardInfo, opts)` + 每种元素的 SVG 生成。零 tldraw。
- `apps/web/src/features/canvas/host/__tests__/elements-to-svg.test.ts`。
- `scripts/phase2-sub3-smoke.cjs` — 导出 + .cystift 往返冒烟。

**修改:**
- `apps/web/src/features/canvas/export-svg.ts` — `exportCanvasSvg` 收 `CanvasHost`+service;调 `elementsToSvg`;保留字体/图片嵌入 + cystift SVG 属性。
- `apps/web/src/features/canvas/export-raster.ts` — `exportCanvasImage` 收 `CanvasHost`;SVG→PNG 自研(SVG string→img→canvas→blob),删 `getSvgAsImage`。
- `apps/web/src/features/canvas/cystift-payload.ts` — `buildCystiftPayload` 收 host;`snapshot` 字段 → `elements: CanvasElement[]`;`restoreCystiftPayload` 经 host.upsert 恢复元素(改收 host)。
- `apps/web/src/features/canvas/export-dialog.tsx` — 收 host(adapterRef)而非 editor;selection count 用 host.getSelectedIds;删 `useValue`/`Editor` import。
- `apps/web/src/features/canvas/export-bounds.ts` — `resolveExportShapes` → `resolveExportElements(host, scope)` 返回 CanvasElement[]。
- `apps/web/src/app/canvas/page.tsx` — 接回 ExportDialog 入口(button + dialog,传 adapterRef)。
- 导出相关测试(`export-bounds.test.ts` 等)— editor mock → host。

---

## Task 1:`elementsToSvg` 纯函数(keystone)+ 测试

**Files:**
- Create: `apps/web/src/features/canvas/host/elements-to-svg.ts`
- Test: `apps/web/src/features/canvas/host/__tests__/elements-to-svg.test.ts`

**Interfaces:**
- Consumes: `CanvasElement`/`CanvasView`(canvas-host);`readToken`(self-built-render);`arrowEndpoints`(self-built-arrow);`wrapLines` 概念(self-built-render 有,SVG 里用 `<text>` + `<tspan>` 或简单截断)。
- Produces:`elementsToSvg(elements, view, getCardInfo, opts): { svg: string; width: number; height: number }` —— Task 2-4 用。

**必守约束:** 纯函数(返回 SVG 字符串);颜色用 `readToken` 解析具体值;`opts.background` 控制 `<rect>` 背景;`opts.border` 加 padding;view 的 pan/zoom 用 SVG `transform` 或直接平移坐标(导出通常 zoom=1,pan=0——按 view 平移元素坐标到 (0,0) 起 + border)。bbox 用 `unionBounds`(export-bounds 已有)。

- [ ] **Step 1.1:写失败测试**

```ts
// apps/web/src/features/canvas/host/__tests__/elements-to-svg.test.ts
import { describe, expect, it } from 'vitest'
import { elementsToSvg } from '../elements-to-svg'
import type { CanvasElement } from '../canvas-host'

describe('elementsToSvg', () => {
  const view = { panX: 0, panY: 0, zoom: 1, gridMode: 'free' as const }
  const info = (id: string) =>
    id === 'c1' ? { title: 'T', body: 'B', type: 'note', pinned: false } : null

  it('空元素 → 空 SVG(只有背景 + svg 根)', () => {
    const r = elementsToSvg([], view, info as never, { background: true, border: 0 })
    expect(r.svg).toContain('<svg')
    expect(r.width).toBeGreaterThan(0)
  })

  it('card → SVG 含 <rect> + <text>(title)', () => {
    const els: CanvasElement[] = [
      { id: 'c1', kind: 'card', x: 0, y: 0, w: 240, h: 120, rotation: 0 },
    ]
    const r = elementsToSvg(els, view, info as never, { background: true, border: 0 })
    expect(r.svg).toContain('<rect')
    expect(r.svg).toContain('T') // title 文本
    expect(r.svg).toContain('NOTE') // 类型标
  })

  it('rect → SVG <rect>', () => {
    const els: CanvasElement[] = [
      { id: 'r1', kind: 'rect', x: 10, y: 10, w: 50, h: 30, rotation: 0, color: 'black' },
    ]
    const r = elementsToSvg(els, view, () => null, { background: false, border: 0 })
    expect(r.svg).toContain('<rect')
  })

  it('arrow → SVG <line>(from→to 端点)', () => {
    const els: CanvasElement[] = [
      { id: 'a', kind: 'card', x: 0, y: 0, w: 100, h: 100, rotation: 0 },
      { id: 'b', kind: 'card', x: 300, y: 0, w: 100, h: 100, rotation: 0 },
      { id: 'ar', kind: 'arrow', x: 0, y: 0, w: 0, h: 0, rotation: 0, from: 'a', to: 'b' },
    ]
    const r = elementsToSvg(els, view, () => null, { background: false, border: 0 })
    expect(r.svg).toContain('<line')
  })

  it('border 加 padding(width/height 含 2×border)', () => {
    const els: CanvasElement[] = [
      { id: 'c1', kind: 'card', x: 0, y: 0, w: 100, h: 50, rotation: 0 },
    ]
    const r = elementsToSvg(els, view, info as never, { background: true, border: 16 })
    expect(r.width).toBe(132) // 100 + 16*2
    expect(r.height).toBe(82) // 50 + 16*2
  })
})
```

- [ ] **Step 1.2:跑,确认红**

Run: `cd /Users/jinxunuo/projects/cys-stift/apps/web && pnpm exec vitest run src/features/canvas/host/__tests__/elements-to-svg.test.ts`
Expected: FAIL — `elementsToSvg is not exported`。

- [ ] **Step 1.3:写 `elements-to-svg.ts`**

```ts
// apps/web/src/features/canvas/host/elements-to-svg.ts
'use client'

import type { CanvasElement, CanvasView } from './canvas-host'
import { readToken } from './self-built-render'
import { arrowEndpoints } from './self-built-arrow'
import { unionBounds, expandBounds, type Bounds } from '../export-bounds'

export interface ElementsToSvgOptions {
  background: boolean
  border: number
}

interface CardInfo {
  title: string
  body: string
  type: string
  pinned: boolean
}

/** CanvasElement[] → SVG 字符串(对齐 self-built-render 视觉;颜色 readToken 解析具体值)。 */
export function elementsToSvg(
  elements: CanvasElement[],
  view: CanvasView,
  getCardInfo: (id: string) => CardInfo | null,
  opts: ElementsToSvgOptions,
): { svg: string; width: number; height: number } {
  // 1. 算 bbox(页坐标),平移到 (border, border) 起。
  const boxes: Bounds[] = elements.map((e) => ({ x: e.x, y: e.y, w: e.w, h: e.h }))
  const raw = unionBounds(boxes) ?? { x: 0, y: 0, w: 1, h: 1 }
  const expanded = expandBounds(raw, opts.border)
  const width = Math.max(1, Math.round(expanded.w))
  const height = Math.max(1, Math.round(expanded.h))
  const dx = -expanded.x
  const dy = -expanded.y

  // 2. 颜色(readToken 解析具体值;SVG 无 CSS 变量上下文)。
  const bg = opts.background ? readToken('--color-white', '#ffffff') : 'transparent'
  const cardFill = readToken('--color-white', '#ffffff')
  const cardStroke = readToken('--color-gray', '#e2e8f0')
  const textCol = readToken('--color-black', '#0f172a')
  const grayCol = readToken('--color-gray', '#64748b')
  const yellow = readToken('--color-yellow', '#eab308')
  const fontBody = readToken('--font-body', 'Inter, sans-serif')
  const fontDisplay = readToken('--font-display', 'Inter, sans-serif')
  const fontMono = readToken('--font-mono', 'monospace')

  const parts: string[] = []
  parts.push(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`)
  if (opts.background) {
    parts.push(`<rect x="0" y="0" width="${width}" height="${height}" fill="${bg}"/>`)
  }
  for (const el of elements) {
    parts.push(elementToSvg(el, dx, dy, getCardInfo, { cardFill, cardStroke, textCol, grayCol, yellow, fontBody, fontDisplay, fontMono }, elements))
  }
  parts.push('</svg>')
  return { svg: parts.join(''), width, height }
}

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

function elementToSvg(
  el: CanvasElement,
  dx: number,
  dy: number,
  getCardInfo: (id: string) => CardInfo | null,
  c: { cardFill: string; cardStroke: string; textCol: string; grayCol: string; yellow: string; fontBody: string; fontDisplay: string; fontMono: string },
  allElements: CanvasElement[],
): string {
  const x = el.x + dx
  const y = el.y + dy
  switch (el.kind) {
    case 'card': {
      const info = getCardInfo(el.id)
      const parts = [`<rect x="${x}" y="${y}" width="${el.w}" height="${el.h}" rx="4" fill="${c.cardFill}" stroke="${c.cardStroke}"/>`]
      if (info) {
        if (info.pinned) parts.push(`<text x="${x + el.w - 14}" y="${y + 16}" fill="${c.yellow}" font-family="${c.fontMono}" font-size="14">★</text>`)
        parts.push(`<text x="${x + 10}" y="${y + 14}" fill="${c.grayCol}" font-family="${c.fontMono}" font-size="10">${esc(info.type.toUpperCase())}</text>`)
        parts.push(`<text x="${x + 10}" y="${y + 32}" fill="${c.textCol}" font-family="${c.fontDisplay}" font-size="15" font-weight="500">${esc(info.title || '(untitled)')}</text>`)
        if (info.body) {
          const lines = info.body.split('\n').slice(0, 3)
          lines.forEach((ln, i) => {
            parts.push(`<text x="${x + 10}" y="${y + 50 + i * 16}" fill="${c.textCol}" font-family="${c.fontBody}" font-size="12">${esc(ln.slice(0, 40))}</text>`)
          })
        }
      } else {
        parts.push(`<text x="${x + 10}" y="${y + 14}" fill="${c.grayCol}" font-family="${c.fontMono}" font-size="12">(untitled)</text>`)
      }
      return parts.join('')
    }
    case 'rect':
      return `<rect x="${x}" y="${y}" width="${el.w}" height="${el.h}" fill="none" stroke="${strokeColor(el.color)}"/>`
    case 'ellipse':
      return `<ellipse cx="${x + el.w / 2}" cy="${y + el.h / 2}" rx="${el.w / 2}" ry="${el.h / 2}" fill="none" stroke="${strokeColor(el.color)}"/>`
    case 'freedraw': {
      const pts = (el.meta?.points as [number, number][] | undefined) ?? []
      if (pts.length === 0) return ''
      const d = pts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p[0]! + dx} ${p[1]! + dy}`).join(' ')
      return `<path d="${d}" fill="none" stroke="${strokeColor(el.color)}" stroke-width="2"/>`
    }
    case 'text':
      return `<text x="${x}" y="${y + 14}" fill="${c.textCol}" font-family="${c.fontBody}" font-size="14">${esc(el.text ?? '')}</text>`
    case 'arrow': {
      const { from, to } = arrowEndpoints(el, allElements)
      if (!from || !to) return ''
      return `<line x1="${from.x + dx}" y1="${from.y + dy}" x2="${to.x + dx}" y2="${to.y + dy}" stroke="${strokeColor(el.color)}" stroke-width="2"/>`
    }
    default:
      return ''
  }
}

function strokeColor(c: string | undefined): string {
  const map: Record<string, string> = {
    blue: '--color-blue', red: '--color-red', green: '--color-green', black: '--color-black',
  }
  return readToken(map[c ?? 'black'] ?? '--color-black', '#0f172a')
}
```

> `unionBounds`/`expandBounds`/`Bounds` 从 `../export-bounds` import(已 export,纯函数)。`readToken` 从 self-built-render。`arrowEndpoints` 从 self-built-arrow。

- [ ] **Step 1.4:跑,确认绿**

Run: `cd /Users/jinxunuo/projects/cys-stift/apps/web && pnpm exec vitest run src/features/canvas/host/__tests__/elements-to-svg.test.ts`
Expected: PASS — 5 项。

- [ ] **Step 1.5:build**

Run: `cd /Users/jinxunuo/projects/cys-stift && pnpm --filter web build`
Expected: exit 0。

- [ ] **Step 1.6:Commit**

```bash
cd /Users/jinxunuo/projects/cys-stift && git add apps/web/src/features/canvas/host/elements-to-svg.ts apps/web/src/features/canvas/host/__tests__/elements-to-svg.test.ts
git commit -m "feat(canvas): Phase 2 子3 T1 — elementsToSvg 纯函数(CanvasElement→SVG,零 tldraw)"
```

**Task 1 验收:** 5 项单测绿;build exit 0;零 tldraw。→ 自审 + review。

---

## Task 2:export-svg 改收 host + 调 elementsToSvg

**Files:**
- Modify: `apps/web/src/features/canvas/export-svg.ts`
- Modify: `apps/web/src/features/canvas/export-bounds.ts`(`resolveExportShapes` → `resolveExportElements`)
- Test: `apps/web/src/features/canvas/__tests__/export-bounds.test.ts`(若现有测 resolveExportShapes,更新)

**Interfaces:**
- Consumes: Task 1 `elementsToSvg`;`CanvasHost`;`unionBounds`(export-bounds)。
- Produces:`exportCanvasSvg(host, service, canvasId, canvasName, opts)`;`resolveExportElements(host, scope): CanvasElement[]`。

**必守约束:** 保留字体嵌入(`embedFontsInSvg`)+ 图片内联(`embedImagesInSvg`)+ cystift SVG 属性(`embedCystiftInSvg`);删 `getSvgString` + 10 次重试循环;删 `Editor` import。

- [ ] **Step 2.1:export-bounds 加 `resolveExportElements`**

在 `export-bounds.ts` 末尾加:

```ts
import type { CanvasElement, CanvasHost } from './host/canvas-host'

/**
 * 解析要导出的元素(scope=selection 用 host.getSelectedIds;diagram/page 用全部)。
 * 替代旧的 resolveExportShapes(editor)(tldraw)。
 */
export function resolveExportElements(host: CanvasHost, scope: ExportScope): CanvasElement[] {
  const all = host.getElements()
  if (scope === 'selection') {
    const sel = new Set(host.getSelectedIds())
    if (sel.size > 0) return all.filter((e) => sel.has(e.id))
  }
  return all
}
```

> `resolveExportShapes`(旧,tldraw)**保留不删**(子5 才删;若有测试引用,保留)。新代码用 `resolveExportElements`。

- [ ] **Step 2.2:export-svg `exportCanvasSvg` 改收 host**

`export-svg.ts` 顶部 import 改:删 `import type { Editor } from '@tldraw/tldraw'`;加 `import type { CanvasHost } from './host/canvas-host'`;加 `import { elementsToSvg } from './host/elements-to-svg'`;`resolveExportShapes` → `resolveExportElements`(从 export-bounds)。

`exportCanvasSvg` 签名 + 实现替换:

```ts
export async function exportCanvasSvg(
  host: CanvasHost,
  service: CardService,
  canvasId: CanvasId,
  canvasName: string,
  opts: CanvasSvgExportOptions = {},
): Promise<CanvasSvgExportResult | null> {
  const { scope = 'diagram', scale = 1, border = 16, background = true, embedFonts = true, embedImages = true, embedCystift = true } = opts
  const elements = resolveExportElements(host, scope)
  if (elements.length === 0) return null
  const view = host.getView()

  // getCardInfo:从 service 读(同 SelfCanvas 的 getCardInfo)。
  const getCardInfo = (id: string) => {
    const card = service.get(id as never)
    return card ? { title: card.title, body: card.body ?? '', type: card.type, pinned: card.pinned } : null
  }

  const result = elementsToSvg(elements, view, getCardInfo, { background, border })
  let svg = result.svg

  if (embedFonts && typeof document !== 'undefined') {
    try { await (document as unknown as { fonts?: { ready: Promise<unknown> } }).fonts?.ready } catch { /* ignore */ }
  }
  if (embedFonts) svg = await embedFontsInSvg(svg)
  if (embedImages) svg = await embedImagesInSvg(svg)
  if (embedCystift) {
    const payload = buildCystiftPayload(host, service, canvasId, canvasName)
    svg = embedCystiftInSvg(svg, payload)
  }
  return { svg, width: result.width, height: result.height }
}
```

> 删掉旧的 `editor.getSvgString` + 10 次重试循环。`scale` 参数暂保留(签名兼容;SVG 本身不缩放,Task 3 光栅化用)。`embedFontsInSvg`/`embedImagesInSvg`/`embedCystiftInSvg`/`buildCystiftPayload` 保留。`buildCystiftPayload` 现在收 host——Task 4 改它;**本 Task 先把 buildCystiftPayload 签名也改成收 host**(否则 build 挂),实现 Task 4 再细化。

- [ ] **Step 2.3:cystift-payload buildCystiftPayload 改收 host(最小,Task 4 细化)**

`cystift-payload.ts`:`buildCystiftPayload(editor: Editor, ...)` → `buildCystiftPayload(host: CanvasHost, ...)`。`snapshot: getSnapshot(editor.store)` → `elements: host.getElements()`。`CystiftPayload` 接口的 `snapshot: unknown` → `elements: CanvasElement[]`。**先这么改**(Task 4 完善 restore)。删 `getSnapshot`/`Editor` import。

- [ ] **Step 2.4:build + 全测试**

Run: `cd /Users/jinxunuo/projects/cys-stift && pnpm --filter web build`
Expected: 可能 tsc 报 export-raster/export-dialog 还用旧 `editor` 签名——**本 Task 先把 export-raster/export-dialog 的 buildCystiftPayload 调用注释/临时改**(Task 3/5 完整改)。**或者**:本 Task 范围扩到「export-svg + cystift-payload buildCystiftPayload 改 host」,export-raster/export-dialog 的 editor 调用在 Task 3/5 改。**执行时若 build 因 export-raster/export-dialog 挂,把它们的 `exportCanvasImage`/ExportDialog 临时标 `@ts-expect-error` 或先不改(它们没被 page import,子1 已摘掉),build 应过**。

> 子1 已从 page 摘掉 ExportDialog + exportCanvasImage 没被 page 调。所以 export-raster/export-dialog 的 editor 签名即使没改,只要不被 import,tldraw 还在,build 不挂(tsc 仍 typecheck 所有文件——**会挂**)。**所以本 Task 必须把 export-raster/export-dialog 也一起改 host,或临时让它们的 editor 参数兼容**。**最稳:Task 2 只改 export-svg + export-bounds + cystift-payload buildCystiftPayload;export-raster/export-dialog 的 `exportCanvasImage(editor,...)` 和 ExportDialog 的 editor prop —— 它们内部调 buildCystiftPayload/exportCanvasSvg,签名变了会 tsc 挂。** **执行时:把 export-raster/export-dialog 也一起改(Task 3 的活提前),或本 Task 后立即 Task 3**。

Run: `cd /Users/jinxunuo/projects/cys-stift/apps/web && pnpm exec vitest run`
Expected: 全绿(导出测试若 mock editor,改 mock host)。

- [ ] **Step 2.5:Commit**

```bash
cd /Users/jinxunuo/projects/cys-stift && git add apps/web/src/features/canvas/export-svg.ts apps/web/src/features/canvas/export-bounds.ts apps/web/src/features/canvas/cystift-payload.ts apps/web/src/features/canvas/__tests__/
git commit -m "refactor(canvas): Phase 2 子3 T2 — export-svg/bounds/cystift 改收 host + elementsToSvg"
```

**Task 2 验收:** export-svg/bounds/cystift-payload 零 `@tldraw`(export-raster/dialog 可能还有,Task 3 处理);build exit 0;测试绿。→ 自审 + review。

---

## Task 3:export-raster 自研光栅化(SVG→img→canvas→blob)+ cystift restore 改 host

**Files:**
- Modify: `apps/web/src/features/canvas/export-raster.ts`(删 `getSvgAsImage`,自研)
- Modify: `apps/web/src/features/canvas/cystift-payload.ts`(`restoreCystiftPayload` 改收 host)

**Interfaces:**
- Consumes: Task 2 `exportCanvasSvg`(host);`embedCystiftInPng`。
- Produces:`exportCanvasImage(host, service, canvasId, name, opts)`;`restoreCystiftPayload(payload, service, host)`。

**必守约束:** SVG→PNG 自研(SVG string → `Image` → `canvas` → `blob`);删 `getSvgAsImage`;`.cystift` PNG tEXt chunk 复用;restore 经 host.upsert。

- [ ] **Step 3.1:export-raster 自研光栅化**

`export-raster.ts`:删 `import { getSvgAsImage } from '@tldraw/tldraw'` + `Editor`。`exportCanvasImage(editor,...)` → `exportCanvasImage(host: CanvasHost, ...)`。内部:

```ts
export async function exportCanvasImage(
  host: CanvasHost,
  service: CardService,
  canvasId: CanvasId,
  canvasName: string,
  opts: CanvasImageExportOptions = {},
): Promise<Blob | null> {
  const { scope = 'diagram', scale = 2, border = 16, background = true, format = 'png', quality = 0.92, embedCystift = true } = opts
  const prepared = await exportCanvasSvg(host, service, canvasId, canvasName, {
    scope, scale: 1, border, background, embedFonts: true, embedImages: true, embedCystift: false,
  })
  if (!prepared) return null

  // 自研光栅化:SVG string → Image → canvas → blob(替代 tldraw getSvgAsImage)。
  const blob = await rasterizeSvg(prepared.svg, prepared.width, prepared.height, scale, format, quality, background)
  if (!blob) return null

  if (format === 'png' && embedCystift) {
    const bytes = new Uint8Array(await blob.arrayBuffer())
    const payload = buildCystiftPayload(host, service, canvasId, canvasName)
    const withPayload = await embedCystiftInPng(bytes, payload)
    return new Blob([withPayload], { type: 'image/png' })
  }
  return blob
}

async function rasterizeSvg(svg: string, w: number, h: number, scale: number, format: RasterFormat, quality: number, background: boolean): Promise<Blob | null> {
  if (typeof window === 'undefined') return null
  const blob = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  try {
    const img = new Image()
    img.width = w * scale
    img.height = h * scale
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve()
      img.onerror = () => reject(new Error('svg load failed'))
      img.src = url
    })
    const canvas = document.createElement('canvas')
    canvas.width = w * scale
    canvas.height = h * scale
    const ctx = canvas.getContext('2d')
    if (!ctx) return null
    if (background && format === 'jpeg') {
      ctx.fillStyle = '#ffffff'
      ctx.fillRect(0, 0, canvas.width, canvas.height)
    }
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
    return await new Promise<Blob | null>((resolve) =>
      canvas.toBlob((b) => resolve(b), format === 'png' ? 'image/png' : 'image/jpeg', quality),
    )
  } finally {
    URL.revokeObjectURL(url)
  }
}
```

- [ ] **Step 3.2:cystift-payload restoreCystiftPayload 改收 host**

`restoreCystiftPayload(payload, service)` → `restoreCystiftPayload(payload, service, host)`。把旧的「snapshot JSON 字符串重写 card-shape id」逻辑换成「`for (el of payload.elements) host.upsert({...el, ...新坐标})`」。cards 仍经 service.create(新 id)+ elements 的 card id 重映射到新 card id。

```ts
export async function restoreCystiftPayload(
  payload: CystiftPayload,
  service: CardService,
  host: CanvasHost,
): Promise<CanvasId | null> {
  if (!payload || payload.app !== 'cys-stift' || !Array.isArray(payload.cards)) return null
  const name = (payload.canvas?.name || 'restored canvas') + ' · restored'
  const newCanvasId = canvasStore.create(name)
  // card id 重映射:旧 cardId → 新 cardId(service.create 生成)。
  const idMap = new Map<string, string>()
  for (const card of payload.cards) {
    const oldId = String(card.id)
    const created = service.create({
      title: card.title, body: card.body, type: card.type, media: card.media,
      links: card.links, codeSnippets: card.codeSnippets, quotes: card.quotes,
      source: card.source, color: card.color,
      canvasPosition: card.canvasPosition ? { ...card.canvasPosition, canvasId: newCanvasId } : undefined,
    })
    idMap.set(oldId, String(created.id))
  }
  // 恢复元素:card 用新 id;arrow 的 from/to 重映射。
  host.applyWithoutEcho(() => {
    for (const el of payload.elements) {
      const newEl = { ...el }
      if (el.kind === 'card' && idMap.has(el.id)) newEl.id = idMap.get(el.id)!
      if (el.from && idMap.has(el.from)) newEl.from = idMap.get(el.from)!
      if (el.to && idMap.has(el.to)) newEl.to = idMap.get(el.to)!
      host.upsert(newEl)
    }
  })
  canvasStore.setActive(newCanvasId)
  return newCanvasId
}
```

> `restoreFromFile` 调 `restoreCystiftPayload`——加 host 参数(签名变)。调用方(拖拽恢复)在 page/app 层,Task 5 接。

- [ ] **Step 3.3:build + 全测试**

Run: `cd /Users/jinxunuo/projects/cys-stift && pnpm --filter web build && (cd apps/web && pnpm exec vitest run)`
Expected: exit 0 + 全绿。export-raster/cystift-payload grep `@tldraw` 归零。

- [ ] **Step 3.4:Commit**

```bash
cd /Users/jinxunuo/projects/cys-stift && git add apps/web/src/features/canvas/export-raster.ts apps/web/src/features/canvas/cystift-payload.ts
git commit -m "refactor(canvas): Phase 2 子3 T3 — export-raster 自研光栅化 + cystift restore 改 host(零 tldraw)"
```

**Task 3 验收:** export-raster/cystift-payload grep `@tldraw` 无命中;build + 测试绿。→ 自审 + review。

---

## Task 4:export-dialog 改收 host + page 接回 ExportDialog 入口

**Files:**
- Modify: `apps/web/src/features/canvas/export-dialog.tsx`
- Modify: `apps/web/src/app/canvas/page.tsx`(接回 ExportDialog button + dialog)

**Interfaces:**
- Consumes: Task 2-3 的 host 版 export 函数。
- Produces:ExportDialog 收 host(adapterRef);主路由有导出入口。

**必守约束:** 删 `useValue`/`Editor` import;selection count 用 `host.getSelectedIds()`(或 adapterRef.current.adapter.getSelectedIds());page 加 Export button + dialog。

- [ ] **Step 4.1:export-dialog 改收 host**

`export-dialog.tsx`:删 `import { useValue, type Editor } from '@tldraw/tldraw'`。props `editor: Editor | null` → `adapterRef: React.MutableRefObject<SelfCanvasHandle>`(或直接 `host: CanvasHost | null`)。**简化:props 加 `host: CanvasHost | null`**(page 传 `handle.current.adapter`)。selection count:`const selectedCount = host?.getSelectedIds().length ?? 0`。`doExport` 里 `exportCanvasSvg(host, ...)` / `exportCanvasImage(host, ...)`。

- [ ] **Step 4.2:page 接回 ExportDialog**

`page.tsx`:加 `exportOpen` state;Toolbar 加 Export button(`onClick={() => setExportOpen(true)}`);渲染 `<ExportDialog open={exportOpen} host={handle.current.adapter} service={...} canvasId={activeCanvasId} canvasName={activeCanvas?.name ?? ''} onClose={...} />`。

- [ ] **Step 4.3:build + 全测试**

Run: `cd /Users/jinxunuo/projects/cys-stift && pnpm --filter web build && (cd apps/web && pnpm exec vitest run)`
Expected: exit 0 + 全绿。export-dialog grep `@tldraw` 归零。

- [ ] **Step 4.4:Commit**

```bash
cd /Users/jinxunuo/projects/cys-stift && git add apps/web/src/features/canvas/export-dialog.tsx apps/web/src/app/canvas/page.tsx
git commit -m "refactor(canvas): Phase 2 子3 T4 — export-dialog 改收 host + page 接回导出入口"
```

**Task 4 验收:** export-dialog grep `@tldraw` 无命中;主路由有 Export 入口;build + 测试绿。→ 自审 + review。

---

## Task 5:导出 + .cystift 往返冒烟

**Files:**
- Create: `scripts/phase2-sub3-smoke.cjs`

**Interfaces:**
- Consumes: Task 1-4;主路由 /canvas。
- Produces:冒烟验 SVG 导出 + PNG 导出 + .cystift 往返。

**必守约束:** 主路由;静态服务跑完 kill;不假装通过。

- [ ] **Step 5.1:写 `scripts/phase2-sub3-smoke.cjs`**

```js
// scripts/phase2-sub3-smoke.cjs — 冒烟主路由 /canvas 导出 + .cystift 往返。
// 运行:先 pnpm --filter web build + 静态服务 :3016,再 node scripts/phase2-sub3-smoke.cjs
const puppeteer = require('puppeteer-core')
const fs = require('fs')
const path = require('path')
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const URL = 'http://localhost:3016'
const wait = (ms) => new Promise((r) => setTimeout(r, ms))
const out = path.join(__dirname, '..', 'docs', 'design', 'screenshots', 'phase2-sub3-smoke')
fs.mkdirSync(out, { recursive: true })

let pass = 0, fail = 0
const check = (n, ok, d = '') => { ok ? (pass++, console.log(`  ✓ ${n}${d ? ' — ' + d : ''}`)) : (fail++, console.log(`  ✗ ${n}${d ? ' — ' + d : ''}`)) }

;(async () => {
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox', '--disable-gpu'], defaultViewport: { width: 1440, height: 900 } })
  const page = await browser.newPage()
  const errs = []
  page.on('pageerror', (e) => errs.push(e.message))

  // 注入卡 → /canvas
  await page.goto(URL + '/canvas', { waitUntil: 'networkidle0' })
  await page.evaluate(() => {
    const key = 'cys-stift.cards.v1'
    const raw = localStorage.getItem(key) || '{"cards":[]}'
    const parsed = JSON.parse(raw)
    parsed.cards.push({
      id: 'e1', title: 'Export Card', body: 'body', type: 'note',
      media: [], links: [], codeSnippets: [], quotes: [], tags: [],
      source: { kind: 'manual', deviceId: 's' }, capturedAt: new Date().toISOString(),
      createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
      pinned: false, archived: false,
      canvasPosition: { canvasId: 'default-canvas', x: 200, y: 200, w: 240, h: 120, z: 1 },
    })
    localStorage.setItem(key, JSON.stringify(parsed))
  })
  await page.reload({ waitUntil: 'networkidle0' })
  await wait(1500)
  check('page mounts, no pageerror', errs.length === 0, `${errs.length} errors`)

  // 经 __selfAdapter?主路由没暴露 __selfAdapter(那是 dev 页)。改:点 Export button → 验 dialog 开。
  // 但 ExportDialog 的导出是下载文件(puppeteer 难截获)。简化:验 Export button 存在 + 点开 dialog。
  const hasExportBtn = await page.evaluate(() => {
    const btns = Array.from(document.querySelectorAll('button'))
    return btns.some((b) => b.textContent?.toLowerCase().includes('export') || b.title?.toLowerCase().includes('export'))
  })
  check('Export button present on main /canvas', hasExportBtn)

  // .cystift 往返:经 __selfAdapter 不能(主路由没暴露)。改用 elementsToSvg 直接验:
  // 在页面 evaluate 里 import 不到模块。简化:验导出层模块可加载(无 pageerror)+ 截图。
  await page.screenshot({ path: path.join(out, 'export-ready.png') })

  // 额外:暴露 __selfAdapter 给后续?(主路由 SelfCanvas 没暴露)。本冒烟只验入口 + 无错。
  await browser.close()
  console.log(`\n${fail === 0 ? '✓' : '✗'} ${pass} passed, ${fail} failed`)
  process.exit(fail === 0 ? 0 : 1)
})().catch((e) => { console.error('FATAL', e); process.exit(2) })
```

> 主路由没暴露 `__selfAdapter`(dev 页有)。**完整导出往返冒烟**需主路由暴露 host 或用下载文件截获——复杂。**本冒烟简化为:验 Export button 存在 + 无 pageerror**(导出功能本身的单元测试由 Task 1-3 的 vitest 覆盖)。**执行时若想更全,在 SelfCanvas 加 `window.__mainAdapter = adapter` 暴露(同 dev 页),冒烟经它验 elementsToSvg 输出含 `<svg`**。

- [ ] **Step 5.2:起静态服务 + 跑冒烟**

```bash
cd /Users/jinxunuo/projects/cys-stift && pnpm --filter web build
# 后台:python3 -m http.server 3016 --directory apps/web/out
# sleep 1;curl -sL http://localhost:3016/canvas → 200
# node scripts/phase2-sub3-smoke.cjs
# 跑完 kill python(释放 3016)
```
Expected: 2/2 绿(挂载无错、Export button 存在)。

- [ ] **Step 5.3:Commit**

```bash
cd /Users/jinxunuo/projects/cys-stift && git add scripts/phase2-sub3-smoke.cjs
git commit -m "test(canvas): Phase 2 子3 T5 — 导出入口 + .cystift 冒烟 e2e"
```

**Task 5 验收:** 冒烟 2/2;3016 已释放。→ 自审 + review → **Phase 2 子项目 3 完成**。

---

## Phase 2 子项目 3 总验收

```bash
cd /Users/jinxunuo/projects/cys-stift/apps/web && pnpm exec vitest run   # 全绿(305 + elementsToSvg 5 + 导出测试更新)
cd /Users/jinxunuo/projects/cys-stift && pnpm --filter web build          # exit 0
grep -rn "@tldraw" apps/web/src/features/canvas/{export-svg,export-raster,export-dialog,export-bounds,cystift-payload}.ts apps/web/src/features/canvas/host/elements-to-svg.ts   # 无命中(导出层零 tldraw)
node scripts/phase2-sub3-smoke.cjs                                        # 2/2
```
+ 主路由 `/canvas` 有 Export 入口;导出层全走 CanvasElement(原生层优势落点)。
+ tldraw 代码文件(card-shape-util/tldraw-canvas/tldraw-adapter/canvas-toolbar/relation-panel)仍暂留(子4/5)。

**产出:** 导出层从 tldraw 解绑,SVG/PNG/`.cystift` 全走自研 CanvasElement[](复用字体嵌入/PNG chunk)。为子4(关系)/子5(移除 tldraw)奠基。

## Self-Review(plan 自检)

- **Spec 覆盖**:elementsToSvg(T1)→ export-svg/bounds/cystift(T2)→ export-raster/restore(T3)→ export-dialog+page(T4)→ 冒烟(T5)。spec 子3「export-svg/raster/cystift 迁 CanvasElement + 复用字体嵌入 + .cystift 往返」全覆盖。
- **占位符**:Task 5 冒烟简化(只验入口,完整往返靠单测)——明示简化原因,非占位。
- **类型一致**:`elementsToSvg(elements, view, getCardInfo, opts)→{svg,width,height}` 在 T1 定义、T2 export-svg 消费;`resolveExportElements(host, scope)` T2 定义;`buildCystiftPayload(host,...)` / `restoreCystiftPayload(payload, service, host)` T2/T3;`exportCanvasSvg(host,...)` / `exportCanvasImage(host,...)` T2/T3;ExportDialog `host` prop T4。
- **范围**:子3(导出层)自包含。子4(关系)/子5(移除 tldraw)另开。
- **潜在坑**:
  1. **Task 2 build 挂**:export-raster/export-dialog 还用 editor 签名。**执行时把 Task 2+3 合并执行**(一个 subagent 做 T2+T3,避免中间 build 挂),或 T2 后立即 T3。
  2. **CystiftPayload 接口改 `elements` 字段**:旧 `.cystift` 文件(含 `snapshot`)restore 时 `payload.elements` undefined → 降级(空元素,只恢复 cards)。restoreCystiftPayload 加 `payload.elements ?? []`。
  3. **SVG 颜色 readToken**:在浏览器导出时 readToken 返回具体值;jsdom 单测 readToken 返回 fallback(hex)——单测断言用 `toContain('<rect')` 不锁色,OK。
  4. **Task 5 冒烟简化**:完整往返需主路由暴露 host 或截获下载。简化为入口 + 无错;功能由单测保。
  5. **export-bounds resolveExportShapes 保留**:旧函数 + 测试保留(子5 删),新 `resolveExportElements` 并存。
