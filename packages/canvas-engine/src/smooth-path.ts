
/**
 * freedraw 点序列 → 平滑贝塞尔路径(本地纯函数,零依赖)。
 *
 * RDP 简化后的点序列(首尾 + 折角 + 曲线代表点)是稀疏的"骨架"。裸折线连接会显折角生硬;
 * 用 **Catmull-Rom → 三次贝塞尔** 过每个点画平滑曲线,质感更像墨水笔迹。
 *
 * ## Catmull-Rom → 贝塞尔
 *
 * 对相邻点 P[i] → P[i+1],用邻点 P[i-1]/P[i+2](首尾缺失则钳制到端点)反算两个控制点:
 *   cp1 = P[i]   + (P[i+1] − P[i-1]) / 6
 *   cp2 = P[i+1] − (P[i+2] − P[i])   / 6
 * 因子 1/6 是标准 Catmull-Rom 张力,曲线 C1 连续且**过每个原始点**。共线点 → 控制点落在线上
 * → 退化为直线(不偏移);折角点 → 微圆(手绘自然,符合 v1 spec 意图)。
 *
 * ## 五视图一致
 *
 * 实时渲染(`self-built-render.ts` 的 `ctx.bezierCurveTo`)与 SVG 导出(`<path d=…>`)都消费
 * {@link smoothBezierSegments} 这一份段数据 —— 平滑逻辑单源,两视图不会漂移。minimap 不平滑
 * (鸟瞰 perf 优先,保留折线)。
 *
 * 点序列是 R2 隐私,全程本地。空/单点 → 无段(SVG/渲染的圆点特例由调用方处理)。
 */

/** 一段三次贝塞尔:从 p0 经控制点 cp1/cp2 到 p1。 */
export interface BezierSegment {
  p0: [number, number]
  cp1: [number, number]
  cp2: [number, number]
  p1: [number, number]
}

/**
 * 点序列 → Catmull-Rom 平滑贝塞尔段序列(过每个点;首尾邻点钳制到端点)。
 * 少于 2 点 → `[]`。不改输入。
 */
export function smoothBezierSegments(points: [number, number][]): BezierSegment[] {
  const n = points.length
  if (n < 2) return []
  const segs: BezierSegment[] = []
  for (let i = 0; i < n - 1; i++) {
    const p0 = points[i]!
    const p1 = points[i + 1]!
    const prev = points[i - 1] ?? p0 // 首段钳制
    const next = points[i + 2] ?? p1 // 末段钳制
    // cp1 = p0 + (p1 − prev) / 6;cp2 = p1 − (next − p0) / 6
    const cp1: [number, number] = [
      p0[0] + (p1[0] - prev[0]) / 6,
      p0[1] + (p1[1] - prev[1]) / 6,
    ]
    const cp2: [number, number] = [
      p1[0] - (next[0] - p0[0]) / 6,
      p1[1] - (next[1] - p0[1]) / 6,
    ]
    segs.push({ p0: [p0[0], p0[1]], cp1, cp2, p1: [p1[0], p1[1]] })
  }
  return segs
}

/**
 * 点序列 → SVG path `d`(`M x y` + 每段 `C cp1 cp2 p1`)。空/单点 → `""`。
 * 调用方(SVG 导出)如需偏移,先把点加 dx/dy 再传入。
 */
export function buildSmoothPath(points: [number, number][]): string {
  const n = points.length
  if (n < 2) return ''
  const segs = smoothBezierSegments(points)
  let d = `M ${points[0]![0]} ${points[0]![1]}`
  for (const s of segs) {
    d += ` C ${s.cp1[0]} ${s.cp1[1]} ${s.cp2[0]} ${s.cp2[1]} ${s.p1[0]} ${s.p1[1]}`
  }
  return d
}
