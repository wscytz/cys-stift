
/**
 * CanvasHost — 引擎无关的画布接口(Phase 0 / 路线 A)。
 *
 * 业务代码(绑定 / DSL / 快照 / 关系)只依赖此接口,不直接 import 渲染器实现。
 * 本期唯一实现是 TldrawAdapter(Task 2);Phase 1 加 SelfBuiltAdapter(Canvas 2D)。
 *
 * id 约定:CanvasElement.id = domain CardId(无 'shape:' 前缀)。引擎特定的 id 格式化
 * (tldraw 的 'shape:' 前缀)由 adapter 内部处理。
 *
 * `CanvasElement` 是**统一模型**:Phase 1/2 后,实时渲染 / SVG 导出 / `.cystift` 几何 /
 * DSL 文本 全是 `CanvasElement[]` 的四种视图。现状里「shape→SVG」外包给 tldraw、
 * `.cystift` 几何是 opaque tldraw snapshot;自研后这两步回到我们手里——现有原生导出
 * 机器(字体/图片嵌入、PNG tEXt chunk、card-id 重映射)复用,底层数据换成 CanvasElement[]。
 */

/**
 * 主动支持的元素种类(用户 6/22 定:5 种)。工具栏只创建这些;DSL 只序列化这些。
 *   card=卡片 / arrow=关系箭头 / freedraw=手绘 / text=浮动文本 / rect=分组框
 */
export type ActiveCanvasKind = 'card' | 'arrow' | 'freedraw' | 'text' | 'rect'

/**
 * Legacy 种类——接口仍能表示(读旧画布 / `.cystift` 导入),但自研画布不创建、
 * DSL 不序列化。note 语义并入 text;image 并入卡片 MediaRef;ellipse/line 退役。
 * Phase 2 迁移时旧画布的 legacy 形状走转换/只读路径(届时定)。
 */
export type LegacyCanvasKind = 'ellipse' | 'line' | 'note' | 'image'

export type CanvasElementKind = ActiveCanvasKind | LegacyCanvasKind

export const ACTIVE_CANVAS_KINDS: readonly ActiveCanvasKind[] = [
  'card',
  'arrow',
  'freedraw',
  'text',
  'rect',
]

/**
 * 确定性 z 序:按 kind 分层(同 kind 内保插入序「后建在上」)。
 *
 * 渲染顺序 = getElements() 顺序 = hitTest/SVG/快照/DSL/.cystift 全用同一份。
 * 透明统一模型要求「z 序是模型的属性,一次决定,五个视图全一致」——以前 z 序
 * 是 Map 插入序(card 同步先入、freeform 异步后入 → freeform 总压 card 上;reload
 * 前后不一致)。现在由 KIND_LAYER 固定,与建/载顺序无关,reload 视觉不变。
 *
 * 底 → 顶:rect(背景框)< freedraw(草图层)< card(主内容)< arrow(关系,压卡边可见)
 *        < text(浮标,永远可读)。
 *
 * 想调层级:改下面这张表即可,所有视图自动跟上。
 */
export const KIND_LAYER: Record<CanvasElementKind, number> = {
  rect: 0,
  freedraw: 1,
  card: 2,
  note: 2, // legacy note → text 层(语义并入 text),与 card 同档不抢
  image: 2, // legacy image → card 档(并入卡片 MediaRef)
  arrow: 3,
  ellipse: 3, // legacy ellipse → arrow 档(装饰层)
  line: 3, // legacy line → arrow 档(线形)
  text: 4,
}

/** 把元素数组按 KIND_LAYER 稳定排序(同层保原序)。用于 getElements / SVG。 */
export function sortByLayer<T extends CanvasElement>(elements: T[]): T[] {
  return [...elements].sort((a, b) => KIND_LAYER[a.kind] - KIND_LAYER[b.kind])
}

export interface CanvasElement {
  id: string
  kind: CanvasElementKind
  x: number
  y: number
  w: number
  h: number
  rotation: number
  /** 样式色(token 名或引擎色名,如 'blue');freedraw 不用。 */
  color?: string
  /** arrow 线型(语义关系签名的一维):solid/dashed/dotted。缺省按 solid 渲染。 */
  dash?: 'solid' | 'dashed' | 'dotted'
  /** arrow 终点箭头形(语义关系签名的一维):arrow=开口V / triangle=实心三角 / none=无。缺省 arrow。 */
  arrowhead?: 'arrow' | 'triangle' | 'none'
  /** note/text 的文本;arrow 的 label。 */
  text?: string
  /** arrow 端点(id 引用,无 '#' 前缀)。 */
  from?: string
  to?: string
  /** freedraw/image 只在此层带 metadata;原始点序列/二进制留在 adapter 的引擎存储,不进 DSL。 */
  meta?: Record<string, unknown>
}

export interface CanvasView {
  panX: number
  panY: number
  zoom: number
  gridMode: 'snap' | 'free'
}

/** zoom 合法区间。低于则交互坐标(screenToPage/handleAtPoint 除 zoom)失真,
 *  高于则溢出。引擎层强约束——不信任调用方传干净 view。 */
export const ZOOM_MIN = 0.1
export const ZOOM_MAX = 8

/**
 * 净化一个 view:zoom 钳到 [ZOOM_MIN, ZOOM_MAX] 且非有限值(NaN/±Infinity)兜底;
 * pan 非有限值兜底 0;gridMode 非法值兜底 'free'。
 *
 * 为什么在引擎层做:view 可能来自脏来源(.cystift 导入 / localStorage / AI 输出),
 * zoom=0/负/NaN 会让 screenToPage(除 zoom)产出 Infinity/NaN 坐标 → 全画布交互失灵。
 * 引擎是独立资产,setView 必须自我防御,而非假设调用方已钳制。纯函数,可单测。
 */
export function sanitizeView(v: CanvasView): CanvasView {
  const finite = (n: number, fallback: number): number =>
    Number.isFinite(n) ? n : fallback
  const zoom = finite(v.zoom, 1)
  return {
    panX: finite(v.panX, 0),
    panY: finite(v.panY, 0),
    zoom: Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, zoom)),
    gridMode: v.gridMode === 'snap' ? 'snap' : 'free',
  }
}

/** 一次「用户源」变更:被改/被创建的元素 + 被删的 id。 */
export interface UserChange {
  updated: CanvasElement[]
  removed: string[]
}

export interface CanvasHost {
  /** 当前页可见元素(已排除引擎内部隐藏)。 */
  getElements(): CanvasElement[]
  getElement(id: string): CanvasElement | undefined
  /** 当前选中的元素 id(导出层 scope=selection 用)。 */
  getSelectedIds(): string[]
  /** 设置选区(实际变化时触发 onSelectionChange)。 */
  setSelectedIds(ids: string[]): void
  /** create-or-update。 */
  upsert(el: CanvasElement): void
  remove(id: string): void
  /** 单一 undo 步(tldraw editor.batch / 自研的 undo 边界)。 */
  batch(fn: () => void): void
  /** 应用变更但不触发 onUserChange(= tldraw mergeRemoteChanges)。用于回写循环抑制。 */
  applyWithoutEcho(fn: () => void): void
  /** 订阅「用户源」变更(拖拽/绘制/删除)→ 回写 DB + 快照持久化。返回取消订阅。 */
  onUserChange(cb: (c: UserChange) => void): () => void
  /** 订阅选区变更(setSelectedIds 实际改变时触发)。返回取消订阅。
   *  替代选区轮询(RelationPanel / auto-relate 按钮)。 */
  onSelectionChange(cb: (ids: string[]) => void): () => void
  getView(): CanvasView
  setView(v: CanvasView): void
  /** 订阅视图(pan/zoom/grid)变更。返回取消订阅。 */
  onViewChange(cb: (v: CanvasView) => void): () => void
}
