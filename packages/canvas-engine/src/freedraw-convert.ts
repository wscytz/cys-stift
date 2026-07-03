
import type { CanvasElement } from './canvas-host'
import { bboxOf, freedrawPointsOf } from './self-built-freedraw'

/**
 * freedraw → 规则图形转换(纯函数,镜像 `freedrawToArrow` 的契约)。
 *
 * 读 freedraw 的 bbox,产对应**原生可渲染 kind** 的 CanvasElement:
 *  - `freedrawToRect`:→ `rect`(active kind,render/SVG 都画)。
 *
 * 应用走 `host.batch(remove + upsert)` 单 undo + `setSelectedIds([newId])`(由调用方
 * FreedrawPanel 编排,沿用 `freedrawToArrow` 现有模式,不改 batch 契约)。
 *
 * **v1 不做 circle / triangle**:引擎无 ellipse / triangle / polygon active kind
 * (ellipse 是 legacy,`self-built-render` 无 case → 画布不可见);加 kind 是五视图连锁大改,
 * 守 YAGNI,留待未来「shape kinds」专项。点序列是 R2 隐私,全程本地。
 */

/**
 * 把一条手绘转成**矩形**:bbox → rect 元素。保留原 color(红笔画 → 红 rect);rotation 归零
 * (对齐坐标轴)。非 freedraw / 点序列 <2 → null。纯函数,不改原元素。
 */
export function freedrawToRect(el: CanvasElement, newId: string): CanvasElement | null {
  const pts = freedrawPointsOf(el)
  if (!pts || pts.length < 2) return null
  const { x, y, w, h } = bboxOf(pts)
  const rect: CanvasElement = {
    id: newId,
    kind: 'rect',
    x,
    y,
    w,
    h,
    rotation: 0,
  }
  if (el.color !== undefined) rect.color = el.color
  return rect
}
