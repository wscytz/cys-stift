'use client'

/**
 * P5.4 — the `.cystift` roundtrip payload (drawio P5-7).
 *
 * A `.cystift.svg` / `.cystift.png` carries the full canvas — cards (domain
 * content) + CanvasElement[] (geometry: card shapes, freeform draw, arrows,
 * rects, text) + canvas meta — embedded IN the image file. Drop the file back
 * onto the app and the canvas is restored onto a fresh canvas. Single-file
 * portable cards, no sidecar.
 *
 * Why both cards AND elements: the card element stores geometry + a card-id
 * reference; the card CONTENT (title/body/links/…) lives in the CardService.
 * Restoring fully needs both. The geometry is now a transparent
 * `CanvasElement[]` (was an opaque tldraw `getSnapshot` before Phase 2 子3).
 *
 * Re-import remaps card ids (CardService.create mints fresh ids) and rewrites
 * the elements' card id + arrow from/to references to match, so importing the
 * same `.cystift` twice never collides. Elements are restored via `host.upsert`
 * when a host is supplied (drop-in restore path); without a host only the
 * cards are restored (legacy/drag-drop fallback).
 */
import type { Card, CardId, CardService, CanvasId } from '@cys-stift/domain'
import { canvasStore } from '@/lib/canvas-store'
import { canvasFreeformStore } from '@/lib/canvas-freeform-store'
import {
  writePngTextChunk,
  readPngTextChunk,
  encodePayload,
  decodePayload,
} from '@/lib/png-text-chunk'
import type { CanvasElement, CanvasHost } from '@cys-stift/canvas-engine'

const CYSTIFT_KEY = 'cystift'
const CYSTIFT_ATTR = 'data-cystift'

export interface CystiftPayload {
  /** Payload version — bump + migrate on breaking changes. */
  v: 1
  /** Producer app + format marker (lets re-import sanity-check). */
  app: 'cys-stift'
  canvas: { id: string; name: string }
  /** Cards on this canvas at export time (content source of truth). */
  cards: Card[]
  /** Geometry as a transparent CanvasElement[] (was opaque tldraw snapshot).
   *  Old `.cystift` files (pre-子3) carry a `snapshot` field instead — restore
   *  degrades to `payload.elements ?? []` (cards-only) for those. */
  elements: CanvasElement[]
}

/** Build the payload from a live host + service. */
export function buildCystiftPayload(
  host: CanvasHost,
  service: CardService,
  canvasId: CanvasId,
  canvasName: string,
): CystiftPayload {
  return {
    v: 1,
    app: 'cys-stift',
    canvas: { id: canvasId, name: canvasName },
    cards: service.listAll().filter((c) => c.canvasPosition?.canvasId === canvasId),
    elements: host.getElements(),
  }
}

/**
 * Restore a payload onto a FRESH canvas (never clobbers an existing one).
 * Creates the canvas, re-imports the cards (new ids, positions remapped to
 * the new canvas), then — when a host is supplied — re-inserts the geometry
 * elements via host.upsert (card ids + arrow from/to remapped to the new
 * card ids). Returns the new canvas id (or null if the payload is bad).
 *
 * `host` is optional: the legacy drag-drop path has no live host for the new
 * canvas, so it previously lost the geometry (cards-only restore). Now, when
 * no host is supplied, the freeform elements are persisted into the new
 * canvas's freeform store — the host that mounts for that canvas hydrates them
 * on load. Callers with a host (e.g. the export-restore flow) pass it to
 * restore full geometry directly.
 */
export async function restoreCystiftPayload(
  payload: CystiftPayload,
  service: CardService,
  host?: CanvasHost,
): Promise<CanvasId | null> {
  if (!payload || payload.app !== 'cys-stift' || !Array.isArray(payload.cards)) {
    return null
  }
  const name = (payload.canvas?.name || 'restored canvas') + ' · ' + 'restored'
  const newCanvasId = canvasStore.create(name)
  // canvasStore.create returns '' on quota failure (rolled back). Without a
  // valid canvas id we cannot attach cards or geometry — every card would be
  // orphaned under canvasPosition.canvasId = '' (invisible on any real canvas,
  // not in the inbox since it has a canvasPosition). Bail out so the caller
  // surfaces the failure (returns null, same contract as a bad payload).
  if (!newCanvasId) return null

  // card id 重映射:旧 cardId → 新 cardId(service.create 生成)。
  const idMap = new Map<string, string>()
  for (const card of payload.cards) {
    // 坏值防御(恶意/损坏 .cystift):card 本身为 null/非对象时,typeof card.title 抛
    // TypeError → catch 回退当普通附件建卡(数据混淆)。与元素层 line 154 同源守卫。
    if (!card || typeof card !== 'object') continue
    // 坏值防御(恶意/损坏 .cystift):.cystift card 字段无运行时校验,坏类型
    // (title=42 / links="x")直接进 DB → 后续 card.links.map / title.trim 崩到
    // 错误边界。逐字段守卫:非预期类型用默认值替代(best-effort 恢复,不跳整张卡)。
    const safeCard = {
      ...card,
      title: typeof card.title === 'string' ? card.title : '',
      body: typeof card.body === 'string' ? card.body : '',
      type: typeof card.type === 'string' ? card.type : 'note',
      media: Array.isArray(card.media) ? card.media : [],
      links: Array.isArray(card.links) ? card.links : [],
      codeSnippets: Array.isArray(card.codeSnippets) ? card.codeSnippets : [],
      quotes: Array.isArray(card.quotes) ? card.quotes : [],
    }
    const oldId = String(card.id)
    // H2: cardRepo.insert 现在在配额满时抛 StorageQuotaError。restore 是
    // best-effort 批量恢复——单卡持久化失败不应让整批恢复崩掉(已恢复的卡
    // 留下,其余跳过)。捕获后 break,用已建好的 idMap 继续恢复几何元素。
    let created: { id: string } | null = null
    try {
      created = service.create({
        title: safeCard.title,
        body: safeCard.body,
        type: safeCard.type,
        media: safeCard.media,
        links: safeCard.links,
        codeSnippets: safeCard.codeSnippets,
        quotes: safeCard.quotes,
        source: card.source,
        color: card.color,
        canvasPosition: card.canvasPosition
          ? { ...card.canvasPosition, canvasId: newCanvasId }
          : undefined,
      })
    } catch {
      break // 配额满:停止恢复后续卡片,保留已恢复的部分
    }
    idMap.set(oldId, String(created.id))
  }

  // 恢复几何元素:card 用新 id;arrow 的 from/to 重映射。旧 .cystift 文件
  // (含 snapshot,无 elements)降级为空元素(只恢复 cards)。
  // elements 非数组(恶意/损坏:数字/布尔)守卫 —— 否则 for...of 抛 not iterable。
  const elements = (Array.isArray(payload.elements) ? payload.elements : []) as CanvasElement[]
  // 重映射 card id + arrow from/to(无论有无 host 都要重映射,因为下面要么进 host
  // 要么进 freeform store,两者都用新 id)。
  // 配额中断保护:break 后 idMap 只含已成功创建的卡。引用失败卡片的元素必须跳过——
  //   - card 元素:id 不在 idMap → 该卡几何没有对应 DB 卡,留下是孤儿(选不中/无内容)。
  //   - arrow 元素:from/to 指向不在 idMap 的卡 → 悬空引用,渲染成连着虚无的箭头,
  //     选不中删不掉,reload 仍在(真 bug,非设计约束)。跳过它。
  // 自由箭头(无 from/to,bbox 编码端点)不依赖 idMap,正常保留。
  const remapped: CanvasElement[] = []
  for (const el of elements) {
    // 坏值防御(恶意/损坏 .cystift):元素非对象直接跳过,不访问 el.kind 崩
    // (此前 null/数字元素 → el.kind 抛 TypeError → catch 回退当普通附件建卡 = 数据混淆)。
    if (!el || typeof el !== 'object') continue
    if (el.kind === 'card') {
      if (!idMap.has(el.id)) continue // 配额中断:该卡未创建,跳过孤儿几何
      const newEl: CanvasElement = { ...el, id: idMap.get(el.id)! }
      remapped.push(newEl)
      continue
    }
    // arrow:from/to 若任一指向不在 idMap 的卡 → 悬空,跳过(自由箭头无 from/to 不受影响)
    if (el.kind === 'arrow' && ((el.from && !idMap.has(el.from)) || (el.to && !idMap.has(el.to)))) {
      continue
    }
    const newEl: CanvasElement = { ...el }
    if (el.from && idMap.has(el.from)) newEl.from = idMap.get(el.from)!
    if (el.to && idMap.has(el.to)) newEl.to = idMap.get(el.to)!
    remapped.push(newEl)
  }

  if (host && remapped.length > 0) {
    // 有 host:直接 upsert(导出-恢复路径,host 即新画布的 host)。
    host.applyWithoutEcho(() => {
      for (const el of remapped) host.upsert(el)
    })
  } else if (remapped.length > 0) {
    // 无 host(拖放路径,host 还没为新画布建):把 freeform 元素持久化到新画布的
    // freeform store——新画布的 host mount 时 hydrate 会恢复它们。card 几何走 DB
    // (loadCardsIntoEditor 从 canvasPosition 重建),不进 store(三层防双写)。
    // await(非 fire-and-forget):OPFS 写完成后才 setActive → 新 host mount 时的 load
    // 一定读到这次 save 的数据。此前 void + 紧随的 setActive 触发 mount load,save/load
    // 竞争同一文件,load 可能先解析读到空 → freeform 不可见,用户再画一笔会覆盖性 save
    // 永久销毁恢复的几何。localStorage 回退路径同步不受影响。
    await canvasFreeformStore.save(newCanvasId, remapped)
  }

  canvasStore.setActive(newCanvasId)
  return newCanvasId
}

// ── SVG embedding (`data-cystift` on the root <svg>) ────────────────────────

/** Embed a payload as a `data-cystift` attribute on the SVG root. The
 *  encoded form is URL-safe (no quotes), so it sits cleanly in an attr. */
export function embedCystiftInSvg(svg: string, payload: CystiftPayload): string {
  const encoded = encodePayload(payload)
  if (svg.includes(CYSTIFT_ATTR)) return svg // don't double-embed
  // Inject right after the opening <svg ...> tag.
  return svg.replace(/^(<svg\b[^>]*>)/, `$1 ${CYSTIFT_ATTR}="${encoded}"`)
}

export function extractCystiftFromSvg(svg: string): CystiftPayload | null {
  const m = svg.match(new RegExp(`${CYSTIFT_ATTR}="([^"]*)"`))
  if (!m || !m[1]) return null
  return decodePayload<CystiftPayload>(m[1])
}

// ── PNG embedding (`tEXt` chunk, keyword `cystift`) ──────────────────────────

export async function embedCystiftInPng(
  pngBytes: Uint8Array,
  payload: CystiftPayload,
): Promise<Uint8Array> {
  return writePngTextChunk(pngBytes, CYSTIFT_KEY, encodePayload(payload))
}

export async function extractCystiftFromPng(
  pngBytes: Uint8Array,
): Promise<CystiftPayload | null> {
  const text = readPngTextChunk(pngBytes, CYSTIFT_KEY)
  if (!text) return null
  return decodePayload<CystiftPayload>(text)
}

/** Detect + restore a `.cystift` payload from a dropped File (PNG or SVG).
 *  Returns the new canvas id, or null if the file isn't a cystift file.
 *  `host` optional — when supplied, geometry elements are restored via
 *  host.upsert; without it only cards are restored (drag-drop fallback). */
export async function restoreFromFile(
  file: File,
  service: CardService,
  host?: CanvasHost,
): Promise<CanvasId | null> {
  const isPng = file.type === 'image/png' || file.name.toLowerCase().endsWith('.png')
  const isSvg = file.type === 'image/svg+xml' || file.name.toLowerCase().endsWith('.svg')
  if (!isPng && !isSvg) return null

  if (isSvg) {
    const text = await file.text()
    const payload = extractCystiftFromSvg(text)
    if (!payload) return null
    return await restoreCystiftPayload(payload, service, host)
  }

  // PNG — read bytes, look for the cystift tEXt chunk.
  const buf = new Uint8Array(await file.arrayBuffer())
  const payload = await extractCystiftFromPng(buf)
  if (!payload) return null
  return await restoreCystiftPayload(payload, service, host)
}

/** Quick check whether a File MIGHT be a cystift file (cheap — name/mime
 *  only; full detection reads the bytes in restoreFromFile). Exported so
 *  the drop handler can short-circuit the normal capture path. */
export function looksLikeCystiftFile(file: File): boolean {
  const n = file.name.toLowerCase()
  return (
    (n.endsWith('.png') || n.endsWith('.svg')) &&
    // `.cystift.png` / `.cystift.svg` is our naming convention; we ALSO
    // probe any png/svg (a plain export may have been renamed) in the
    // handler, so be permissive here.
    true
  )
}

// Re-export the card-id type for callers that build payloads by hand.
export type { Card, CardId }
