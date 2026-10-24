/**
 * types — 包内自持的边界类型(发布自持,零 workspace 依赖)。
 *
 * 结构性复制自应用侧权威源:
 *   - CanvasElement / CanvasElementKind ← @cys-stift/canvas-engine(canvas-host.ts)
 *   - CardId / CardType / TagColor / TagRef / LinkPreview / CodeBlock / Quote ← @cys-stift/domain(types.ts)
 *
 * 同步由 `__tests__/types-compat.test.ts` 的编译期双向可赋值断言钉住——任何一侧漂移,
 * `tsc --noEmit`(lint)即红。本包是画布的「文字视图」契约:只需要元素/字段的形状,
 * 不关心应用侧的存储、渲染与交互。
 */

// ---------- 画布元素(源:@cys-stift/canvas-engine canvas-host.ts) ----------

/** 主动支持的元素种类(用户可见 6 种;DSL 只序列化 active 集合)。 */
export type ActiveCanvasKind = 'card' | 'arrow' | 'freedraw' | 'text' | 'rect' | 'frame'

/** Legacy 种类——接口仍能表示(读旧画布),但 DSL 不序列化。 */
export type LegacyCanvasKind = 'ellipse' | 'line' | 'note' | 'image'

export type CanvasElementKind = ActiveCanvasKind | LegacyCanvasKind

/** 通用画布元素模型(字段语义详见引擎侧权威源;此处为发布自持的结构性复制)。 */
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
  /** arrow 终点箭头形:arrow=开口V / triangle=实心三角 / none=无。缺省 arrow。 */
  arrowhead?: 'arrow' | 'triangle' | 'none'
  /** note/text 的文本;arrow 的 label。 */
  text?: string
  /** arrow 端点(id 引用,无 '#' 前缀)。 */
  from?: string
  to?: string
  /** arrow 弯曲控制点(二次贝塞尔,绝对页坐标)。无则直线。 */
  curve?: { cx: number; cy: number }
  /** 箭头路由形态:straight(直线)/ curve(单控制点)/ elbow(折线)。缺省 straight。 */
  route?: 'straight' | 'curve' | 'elbow'
  /** 折线折点(1-2 个,绝对页坐标)。route='elbow' 时用。 */
  elbow?: { x: number; y: number }[]
  /** freedraw/image 只在此层带 metadata;原始点序列/二进制不进 DSL。 */
  meta?: Record<string, unknown>
}

// ---------- 卡片字段(源:@cys-stift/domain types.ts) ----------

export type CardId = string & { readonly __brand: 'CardId' }

export type CardType = 'note' | 'image' | 'link' | 'code' | 'quote'

/** 规范 tag 色 token(与 domain TAG_COLORS 逐字一致)。 */
export type CanonicalTagColor =
  | 'var(--color-red)'
  | 'var(--color-blue)'
  | 'var(--color-yellow)'
  | 'var(--color-black)'
  | 'var(--color-white)'
  | 'var(--color-gray)'

/** 历史 preview 写入的旧 token(读兼容;持久化边界统一 normalize)。 */
export type LegacyTagColor =
  | 'var(--color-teal)'
  | 'var(--color-pink)'
  | 'var(--color-orange)'
  | 'var(--color-purple)'
  | 'var(--color-green)'

export type TagColor = CanonicalTagColor | LegacyTagColor

export interface TagRef {
  value: string
  color: TagColor
}

export interface LinkPreview {
  url: string
  title?: string
  description?: string
  ogImageUrl?: string
  fetchedAt: Date
}

export interface CodeBlock {
  language: string
  code: string
  caption?: string
}

export interface Quote {
  text: string
  attribution?: string
  sourceUrl?: string
}
