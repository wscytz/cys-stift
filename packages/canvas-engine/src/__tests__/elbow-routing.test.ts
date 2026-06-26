import { describe, expect, it } from 'vitest'
import {
  routeElbowAroundObstacles,
  autoElbowPath,
  segmentIntersectsBox,
} from '../self-built-arrow'
import type { CanvasElement } from '../canvas-host'

// 辅助:断言一条路径(折点序列)每段都正交(水平或垂直)。
function expectOrthogonal(path: { x: number; y: number }[]): void {
  for (let i = 1; i < path.length; i++) {
    const a = path[i - 1]!
    const b = path[i]!
    // 任一段必须水平(dy=0)或垂直(dx=0)。
    const horizontal = a.y === b.y
    const vertical = a.x === b.x
    expect(horizontal || vertical).toBe(true)
  }
}

// 辅助:断言路径中任意一段都不与任一 obstacle bbox 相交。
function expectAvoids(
  path: { x: number; y: number }[],
  obstacles: { x: number; y: number; w: number; h: number }[],
): void {
  for (let i = 1; i < path.length; i++) {
    const a = path[i - 1]!
    const b = path[i]!
    for (const ob of obstacles) {
      expect(segmentIntersectsBox(a, b, ob)).toBe(false)
    }
  }
}

describe('segmentIntersectsBox — 线段与 AABB 相交判定', () => {
  const box = { x: 50, y: 50, w: 100, h: 100 }
  it('水平线段穿过 box 中部 → true', () => {
    expect(segmentIntersectsBox({ x: 0, y: 100 }, { x: 200, y: 100 }, box)).toBe(true)
  })
  it('水平线段在 box 上方 → false', () => {
    expect(segmentIntersectsBox({ x: 0, y: 20 }, { x: 200, y: 20 }, box)).toBe(false)
  })
  it('垂直线段穿过 box → true', () => {
    // (100,0)→(100,200) 穿过 box(100 在 50..150 内,y 0..200 覆盖 50..150)
    expect(segmentIntersectsBox({ x: 100, y: 0 }, { x: 100, y: 200 }, box)).toBe(true)
  })
  it('线段在 box 外(右侧)→ false', () => {
    expect(segmentIntersectsBox({ x: 200, y: 0 }, { x: 300, y: 200 }, box)).toBe(false)
  })
  it('线段完全在 box 内 → true', () => {
    expect(segmentIntersectsBox({ x: 60, y: 60 }, { x: 140, y: 60 }, box)).toBe(true)
  })
  it('对角斜线穿过 box → true', () => {
    expect(segmentIntersectsBox({ x: 0, y: 0 }, { x: 200, y: 200 }, box)).toBe(true)
  })
  it('线段端点正好在 box 边上(相切)→ 不算穿过(false)', () => {
    // box y=50..150;线段 y=50(上边线相切)。相切不算相交(与 intersectsBounds 一致)。
    expect(segmentIntersectsBox({ x: 0, y: 50 }, { x: 200, y: 50 }, box)).toBe(false)
  })
})

describe('routeElbowAroundObstacles — 无 obstacle', () => {
  it('无 obstacle → 返回正交路径(每段水平/垂直)', () => {
    const elbows = routeElbowAroundObstacles({ x: 0, y: 0 }, { x: 100, y: 80 }, [])
    expectOrthogonal([{ x: 0, y: 0 }, ...elbows, { x: 100, y: 80 }])
  })
  it('无 obstacle → 最多 2 折点', () => {
    const elbows = routeElbowAroundObstacles({ x: 0, y: 0 }, { x: 100, y: 80 }, [])
    expect(elbows.length).toBeLessThanOrEqual(2)
  })
  it('无 obstacle → 1 折点 L 形(水平→垂直 或 垂直→水平)', () => {
    const elbows = routeElbowAroundObstacles({ x: 0, y: 0 }, { x: 100, y: 80 }, [])
    expect(elbows.length).toBe(1)
  })
  it('from=to(同点退化)→ 返回空折点数组(不崩)', () => {
    const elbows = routeElbowAroundObstacles({ x: 50, y: 50 }, { x: 50, y: 50 }, [])
    expect(elbows).toEqual([])
  })
})

describe('routeElbowAroundObstacles — 单 obstacle 绕障', () => {
  it('直线 from→to 穿一个 obstacle → 返回折点路径不穿该 bbox', () => {
    // from(0,100)→to(200,100) 水平直线穿过 box(50..150, 50..150)。
    const from = { x: 0, y: 100 }
    const to = { x: 200, y: 100 }
    const obstacle = { x: 50, y: 50, w: 100, h: 100 }
    const elbows = routeElbowAroundObstacles(from, to, [obstacle])
    const path = [from, ...elbows, to]
    expectOrthogonal(path)
    expectAvoids(path, [obstacle])
    expect(elbows.length).toBeLessThanOrEqual(2)
  })

  it('obstacle 不在路径上 → 不绕(走默认 L 形)', () => {
    // obstacle 远离 from→to(0,0)→(200,0) 水平直线,box 在下方 50..150。
    const from = { x: 0, y: 0 }
    const to = { x: 200, y: 0 }
    const obstacle = { x: 50, y: 50, w: 100, h: 100 } // 在路径下方,不穿
    const elbows = routeElbowAroundObstacles(from, to, [obstacle])
    expect(elbows.length).toBe(1)
    const path = [from, ...elbows, to]
    expectAvoids(path, [obstacle])
  })

  it('两个 L 形方向都被穿 → 加第 2 折点绕(仍不穿且最多 2 折点)', () => {
    // from(0,0)→to(200,200)。box 居中(80..120, 80..120)。
    // 水平优先 from→(200,0)→(200,200):第一段 (0,0)→(200,0) 不穿;第二段 (200,0)→(200,200) 不穿 → 应直接走 L。
    // 换一个真正堵死两个 L 的场景:from(0,100)→to(200,100),box 大到同时堵 H-first 与 V-first 的两段。
    const from = { x: 0, y: 100 }
    const to = { x: 200, y: 100 }
    // 大 box 覆盖中部,水平直线穿;两个 L 形(到 (200,100) 或 (0,100) 转折)的转折点都在 box 内/边。
    const obstacle = { x: 40, y: 0, w: 120, h: 200 }
    const elbows = routeElbowAroundObstacles(from, to, [obstacle])
    const path = [from, ...elbows, to]
    expectOrthogonal(path)
    expectAvoids(path, [obstacle])
    expect(elbows.length).toBeLessThanOrEqual(2)
  })
})

describe('routeElbowAroundObstacles — 折点约束', () => {
  it('返回的折点数永远 ≤ 2(多 obstacle 也不超)', () => {
    const from = { x: 0, y: 0 }
    const to = { x: 300, y: 0 }
    const obstacles = [
      { x: 40, y: -50, w: 40, h: 100 },
      { x: 120, y: -50, w: 40, h: 100 },
      { x: 200, y: -50, w: 40, h: 100 },
    ]
    const elbows = routeElbowAroundObstacles(from, to, obstacles)
    expect(elbows.length).toBeLessThanOrEqual(2)
  })
})

describe('autoElbowPath — 接线辅助(elbow 空时自动绕障)', () => {
  const from = { x: 0, y: 100 }
  const to = { x: 200, y: 100 }
  const obstacles = [{ x: 50, y: 50, w: 100, h: 100 }]

  it('elbow 空且 route=elbow → 用 routeElbowAroundObstacles 自动算', () => {
    const arrow = {
      id: 'a', kind: 'arrow', x: 0, y: 0, w: 0, h: 0, rotation: 0,
      route: 'elbow',
    } as CanvasElement
    const path = autoElbowPath(arrow, from, to, obstacles)
    expect(path.length).toBeGreaterThanOrEqual(2)
    expect(path[0]).toEqual(from)
    expect(path[path.length - 1]).toEqual(to)
    expectOrthogonal(path)
    expectAvoids(path, obstacles)
  })

  it('elbow 非空(用户手设)→ 尊重手设,走原 [from, ...elbow, to](不自动)', () => {
    const manualElbow = [{ x: 100, y: 0 }]
    const arrow = {
      id: 'a', kind: 'arrow', x: 0, y: 0, w: 0, h: 0, rotation: 0,
      route: 'elbow', elbow: manualElbow,
    } as CanvasElement
    const path = autoElbowPath(arrow, from, to, obstacles)
    expect(path).toEqual([from, ...manualElbow, to])
  })

  it('无 obstacle → autoElbowPath 仍返回正交路径', () => {
    const arrow = {
      id: 'a', kind: 'arrow', x: 0, y: 0, w: 0, h: 0, rotation: 0,
      route: 'elbow',
    } as CanvasElement
    const path = autoElbowPath(arrow, from, to, [])
    expectOrthogonal(path)
  })
})
