/**
 * fit-view — fit-to-nodes 视口计算(纯函数,便于单测)。
 *
 * 给定节点中心坐标 + 画布尺寸,算一个 {zoom, panX, panY} 把所有节点 bbox
 * 居中塞进画布(留 padding)。图谱「复位」用 —— 此前 reset 把图谱原点拉到
 * 屏幕中心,而节点簇在图谱 (w/2,h/2),双偏移把节点推出屏(「乱飘」)。
 *
 * zoom = clampZoom(min(fit, 1)):fit 是「缩到能看全」,不该把小图放大到 MAX_ZOOM;
 * min(fit,1) 让小图保持 1x(留白居中),大图缩到 <1。clampZoom 夹 [MIN_ZOOM, MAX_ZOOM]。
 * 退化(单节点/全重合 → bboxW=0 → fit=∞)被 min(∞,1)=1 自然吸收,无需特判。
 */
import { clampZoom } from './wheel-math'

/** 节点最小契约:fit 只需中心坐标。 */
export interface FitNode {
  x: number
  y: number
}

/**
 * 算 fit-to-nodes 视口。节点空 → null(调用方 no-op)。
 * padding=画布边距留白;nodeRadius=节点外接半径(计入 bbox,含标签/形状余量)。
 */
export function computeFitView(
  nodes: FitNode[],
  canvasW: number,
  canvasH: number,
  padding = 40,
  nodeRadius = 10,
): { zoom: number; panX: number; panY: number } | null {
  if (nodes.length === 0) return null
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const n of nodes) {
    minX = Math.min(minX, n.x - nodeRadius)
    maxX = Math.max(maxX, n.x + nodeRadius)
    minY = Math.min(minY, n.y - nodeRadius)
    maxY = Math.max(maxY, n.y + nodeRadius)
  }
  const bboxW = maxX - minX
  const bboxH = maxY - minY
  const fitW = (canvasW - padding * 2) / bboxW
  const fitH = (canvasH - padding * 2) / bboxH
  const fit = Math.min(fitW, fitH)
  const zoom = clampZoom(Math.min(fit, 1))
  const centerX = (minX + maxX) / 2
  const centerY = (minY + maxY) / 2
  return {
    zoom,
    panX: canvasW / 2 - centerX * zoom,
    panY: canvasH / 2 - centerY * zoom,
  }
}
