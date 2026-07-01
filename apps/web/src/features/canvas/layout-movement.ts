/**
 * 排版位移汇总(Fix 4c)。
 *
 * 纯函数:不 import CanvasHost —— 输入只是 id→{x,y} 的位置映射,故可单测。
 * 用途:AI 排版后,把 before/after 两份位置映射对比,产出「实际移动了几张卡、
 * 平均/最大位移多少」,从而区分两种历史上无法区分的反馈:
 *  - AI 真的重排了(moved > 0)→ success「重排了 N 张」
 *  - AI 把位置原样吐回(moved === 0)→ info「认为当前布局已合理,未改动」
 *
 * 后者是「AI 排版从来没有改变过我的布局」投诉的诚实解释:applyLayout 报
 * applied>0,但卡片没动 —— 因为 AI 返回的坐标和原坐标一致。
 */

export interface CardPosition {
  x: number
  y: number
}

/** id → {x, y}。只放被 apply 的卡的坐标即可(不必含全部卡)。 */
export interface PositionMap {
  [id: string]: CardPosition
}

export interface MovementSummary {
  /** 位移 > MOVE_THRESHOLD 的卡数(即肉眼可见移动的卡)。 */
  moved: number
  /** 参与比较的卡数(= before/after 交集大小)。 */
  total: number
  /** moved 卡的平均位移(px,四舍五入到整数)。无 moved 卡时为 0。 */
  avgPx: number
  /** moved 卡的最大位移(px)。无 moved 卡时为 0。 */
  maxPx: number
}

/**
 * 位移阈值(px)。低于此值视为抖动/取整误差,不计为 moved。
 * 1px 足以滤掉浮点噪声,又能捕捉任何肉眼可见的重排。
 */
export const MOVE_THRESHOLD = 1

function displacement(a: CardPosition, b: CardPosition): number {
  const dx = a.x - b.x
  const dy = a.y - b.y
  // 欧氏距离(直线位移),非曼哈顿 —— 与用户视觉感知一致。
  return Math.sqrt(dx * dx + dy * dy)
}

/**
 * 比较 before/after 位置,产出位移汇总。只比较两份 map 都含的 id(交集)。
 *
 * avgPx/maxPx 基于 moved 卡统计;无 moved 卡时回落 0(此时 total 仍有意义,
 * 表示「AI 处理了 N 张但都没动」)。
 */
export function summarizeMovement(
  before: PositionMap,
  after: PositionMap,
): MovementSummary {
  const ids = Object.keys(before).filter((id) => after[id] !== undefined)
  const displacements: number[] = []
  for (const id of ids) {
    const d = displacement(before[id]!, after[id]!)
    if (d > MOVE_THRESHOLD) displacements.push(d)
  }
  const moved = displacements.length
  const total = ids.length
  if (moved === 0) {
    return { moved, total, avgPx: 0, maxPx: 0 }
  }
  const sum = displacements.reduce((acc, d) => acc + d, 0)
  const max = displacements.reduce((acc, d) => (d > acc ? d : acc), 0)
  return {
    moved,
    total,
    avgPx: Math.round(sum / moved),
    maxPx: Math.round(max),
  }
}
