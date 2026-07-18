
/**
 * 保角 Douglas-Peucker 点序列简化(本地纯函数,零依赖)。
 *
 * freedraw 的点序列(`[number, number][]`,页坐标绝对值)全量存储会膨胀 —— 同一条笔画
 * 的 live host / freeform store / .cystift / undo snapshot 四处都吃全量点。store-time
 * 跑一次简化,所有下游消费方(render/SVG/minimap/classify)自动受益。
 *
 * ## 为什么是「保角」而非纯距离 DP
 *
 * `detectArrowRoute`(freedraw-classify)靠**方向角突变**判箭头形态:1-2 个明确折角 →
 * elbow。纯距离 DP 在高 epsilon 下会吃掉小折角,把「转 elbow 箭头」搞坏。所以两阶段:
 *
 *  1. **折角锚定**:沿点序列走,方向角突变 > {@link CORNER_ANGLE} 的点标为折角 —— 这些是
 *     笔画的语义转折(箭头肘、矩形角),作为 DP 的锚点强制保留。
 *  2. **分段 DP**:相邻折角(含首尾)之间跑标准 Douglas-Peucker,按垂直距 ≤ epsilon 收拢
 *     共线/抖动点。
 *
 * 折角检测复用 `detectArrowRoute` 的抗抖策略(`MIN_SEGMENT` 跳过短段),阈值更敏(30° vs
 * 45°)留余量 —— 宁可多锚一个点,不可吃掉真折角。
 *
 * ## 不可逆
 *
 * 简化是**有损**的(.cystift 存简化后的点)。对画布工具可接受:画的是草图,不是法证笔迹。
 * 点序列是 R2 隐私,全程本地,不外发。
 */

/** 方向角突变 > 30° 视为折角(detectArrowRoute 用 45°,这里更敏以留余量)。 */
const CORNER_ANGLE = Math.PI / 6
/** 段长 < 4px 视为抖动,不参与方向计算(与 detectArrowRoute.MIN_SEGMENT 一致)。 */
const MIN_SEGMENT = 4

/**
 * 保角 DP 简化点序列。首尾点必留。空/单点/两点原样(深拷贝)返回。
 *
 * @param points  页坐标绝对值点序列 `[x, y][]`。
 * @param epsilon 垂直距离容差(px);越大越激进。epsilon=0 只收完美共线点。
 * @returns       新数组(不改输入),简化后的点序列。
 */
export function simplifyPoints(
  points: [number, number][],
  epsilon: number,
): [number, number][] {
  const n = points.length
  if (n <= 2) return points.map((p) => [...p] as [number, number])

  // 1. 折角检测:相邻有效段(长度 ≥ MIN_SEGMENT)方向角突变点。
  const corners = new Set<number>()
  const dirs: { idx: number; angle: number }[] = []
  for (let i = 1; i < n; i++) {
    const dx = points[i]![0] - points[i - 1]![0]
    const dy = points[i]![1] - points[i - 1]![1]
    if (Math.hypot(dx, dy) < MIN_SEGMENT) continue // 跳过抖动段
    dirs.push({ idx: i, angle: Math.atan2(dy, dx) })
  }
  for (let i = 1; i < dirs.length; i++) {
    let delta = Math.abs(dirs[i]!.angle - dirs[i - 1]!.angle)
    if (delta > Math.PI) delta = 2 * Math.PI - delta // 折到 [0, π]
    // dirs[k].idx is the endpoint of segment points[idx-1] -> points[idx].
    // The turn belongs to the previous effective segment's endpoint. This is
    // also the stable representative when short jitter segments were skipped.
    if (delta > CORNER_ANGLE) corners.add(dirs[i - 1]!.idx)
  }

  // 2. 锚点 = 首尾 ∪ 折角,去重排序。
  const anchors = Array.from(new Set([0, ...corners, n - 1])).sort((a, b) => a - b)

  // 3. 相邻锚点间跑标准 DP。锚点(首尾 + 折角)本身必留。
  const keep = new Array<boolean>(n).fill(false)
  for (const a of anchors) keep[a] = true
  for (let s = 0; s < anchors.length - 1; s++) {
    dpMark(points, anchors[s]!, anchors[s + 1]!, epsilon, keep)
  }

  const out: [number, number][] = []
  for (let i = 0; i < n; i++) if (keep[i]) out.push([...points[i]!] as [number, number])
  return out
}

/**
 * 标准 Douglas-Peucker:在开区间 (start, end) 内标记需保留的点。
 * 找垂直距最大的点;若 > epsilon 则保留它并两侧递归,否则丢弃全部内部点。
 */
function dpMark(
  points: [number, number][],
  start: number,
  end: number,
  epsilon: number,
  keep: boolean[],
): void {
  if (end - start < 2) return
  const sx = points[start]![0]
  const sy = points[start]![1]
  const ex = points[end]![0]
  const ey = points[end]![1]
  let maxDist = -1
  let maxIdx = -1
  for (let i = start + 1; i < end; i++) {
    const d = perpDist(points[i]!, sx, sy, ex, ey)
    if (d > maxDist) {
      maxDist = d
      maxIdx = i
    }
  }
  if (maxIdx === -1 || maxDist <= epsilon) return // 全在容差内 → 丢弃内部点
  keep[maxIdx] = true
  dpMark(points, start, maxIdx, epsilon, keep)
  dpMark(points, maxIdx, end, epsilon, keep)
}

/** 点 p 到直线 (sx,sy)-(ex,ey) 的垂直距离。零长线退化为到 (sx,sy) 的距离。 */
function perpDist(
  p: [number, number],
  sx: number,
  sy: number,
  ex: number,
  ey: number,
): number {
  const dx = ex - sx
  const dy = ey - sy
  const len = Math.hypot(dx, dy)
  if (len === 0) return Math.hypot(p[0] - sx, p[1] - sy)
  return Math.abs(dx * (sy - p[1]) - (sx - p[0]) * dy) / len
}
