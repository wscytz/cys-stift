/**
 * @cys-stift/canvas-engine — 自研画布引擎(引擎无关的核心)。
 *
 * 公开 API:CanvasHost 接口 + CanvasElement 通用模型 + SelfBuiltAdapter(Canvas 2D
 * 实现) + 各纯渲染/几何/交互函数。零业务依赖,可独立于 apps/web 复用。
 *
 * 颜色/字体走注入式 TokenResolver(默认 domTokenResolver 读 CSS 变量)——引擎不耦合
 * DOM 也不认识 cys-stift 调色板。
 */

// ── 契约 + 通用模型 ─────────────────────────────────────────────────────────
export type {
  CanvasHost,
  CanvasElement,
  CanvasElementKind,
  ActiveCanvasKind,
  LegacyCanvasKind,
  CanvasView,
  UserChange,
} from './canvas-host'
export { ACTIVE_CANVAS_KINDS, KIND_LAYER, sortByLayer, sanitizeView, ZOOM_MIN, ZOOM_MAX } from './canvas-host'

// ── 实现 ────────────────────────────────────────────────────────────────────
export { SelfBuiltAdapter } from './self-built-adapter'
export { InMemoryCanvasHost } from './in-memory-host'

// ── 渲染 ────────────────────────────────────────────────────────────────────
export {
  renderElements,
  drawSelectionOutlines,
  drawMarquee,
  readToken,
  domTokenResolver,
  colorOf,
  wrapLines,
} from './self-built-render'
export type { TokenResolver, CardInfo } from './self-built-render'

// ── 文本 ────────────────────────────────────────────────────────────────────
export { measureText, textEditKeyAction } from './self-built-text'

// ── 命中测试 ──────────────────────────────────────────────────────────────────
export { screenToPage, hitTest } from './self-built-hittest'

// ── 箭头几何(端点 / dash 线型 / arrowhead 箭头形) ──────────────────────────────
export {
  dashPattern,
  arrowheadPoints,
  arrowEndpoints,
  arrowPreviewEndpoints,
  elementCenter,
  borderPoint,
} from './self-built-arrow'

// ── SVG 导出(对齐渲染视觉) ───────────────────────────────────────────────────
export { elementsToSvg } from './elements-to-svg'
export type { ElementsToSvgOptions } from './elements-to-svg'

// ── freedraw(手绘) ──────────────────────────────────────────────────────────
export { commitFreedraw, bboxOf, translateFreedraw, scaleFreedrawToBox } from './self-built-freedraw'

// ── freedraw 语义识别(本地几何启发式;手绘点序列 R2 隐私,不外泄,不走 AI) ──────
export {
  classifyFreedraw,
  duplicateFreedraw,
  freedrawPoints,
  freedrawToArrow,
} from './freedraw-classify'
export type { FreedrawKind, FreedrawClassification } from './freedraw-classify'

// ── resize handle ───────────────────────────────────────────────────────────
export { handleAtPoint, resizeGeometry } from './self-built-resize'
export type { Handle } from './self-built-resize'

// ── 框选 ────────────────────────────────────────────────────────────────────
export { marqueeSelect } from './self-built-marquee'

// ── 键盘 ────────────────────────────────────────────────────────────────────
export { arrowKeyDelta, selectAllIds, parseKeyboardAction } from './self-built-keyboard'

// ── 通用 AABB 几何(供 SVG 导出 bbox 计算) ─────────────────────────────────────
export { unionBounds, expandBounds } from './bounds'
export type { Bounds } from './bounds'
