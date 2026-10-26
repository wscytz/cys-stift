import { describe, expect, it } from 'vitest'
import { planRoute, DEFAULT_ROUTING } from '../routing'
import type { RoutingPoint, RoutingRect } from '../routing'

/** 确定性伪随机(mulberry32):同种子同场景,测试可复现。 */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** 与 routing.segHitsRect 同口径的复刻(Liang-Barsky,内缩 2px,开内域语义:
 *  与边共线 qq=0 不算穿——边界相切允许,贴边滑行的合法解不误报)。 */
function segHitsRect(a: RoutingPoint, b: RoutingPoint, r: RoutingRect): boolean {
  const sh = { x: r.x + 2, y: r.y + 2, w: r.w - 4, h: r.h - 4 }
  if (sh.w <= 0 || sh.h <= 0) return false
  let t0 = 0
  let t1 = 1
  const dx = b.x - a.x
  const dy = b.y - a.y
  const edges: Array<[number, number]> = [
    [-dx, a.x - sh.x],
    [dx, sh.x + sh.w - a.x],
    [-dy, a.y - sh.y],
    [dy, sh.y + sh.h - a.y],
  ]
  for (const [p, qq] of edges) {
    if (p === 0) {
      if (qq <= 0) return false
    } else {
      const t = qq / p
      if (p < 0) {
        if (t > t1) return false
        if (t > t0) t0 = t
      } else {
        if (t < t0) return false
        if (t < t1) t1 = t
      }
    }
  }
  return t1 - t0 > 0.01
}

function pathCrosses(pts: RoutingPoint[], rects: RoutingRect[]): boolean {
  for (let i = 0; i < pts.length - 1; i++) {
    for (const r of rects) {
      if (segHitsRect(pts[i]!, pts[i + 1]!, r)) return true
    }
  }
  return false
}

/** 端点在矩形边界上(量化 0.5px 容差)。 */
function onBorder(p: RoutingPoint, r: RoutingRect): boolean {
  const eps = 0.51
  const inX = p.x >= r.x - eps && p.x <= r.x + r.w + eps
  const inY = p.y >= r.y - eps && p.y <= r.y + r.h + eps
  const onEdge =
    Math.abs(p.x - r.x) <= eps ||
    Math.abs(p.x - (r.x + r.w)) <= eps ||
    Math.abs(p.y - r.y) <= eps ||
    Math.abs(p.y - (r.y + r.h)) <= eps
  return inX && inY && onEdge
}

/** 随机场景:n 张不重叠卡(含与固定源/目标保持间距)+ 指定源/目标。密度低,真无解极少。 */
function randomScene(
  rng: () => number,
  n: number,
  spreadX = 900,
  spreadY = 700,
): { rects: RoutingRect[]; src: RoutingRect; dst: RoutingRect } {
  const rects: RoutingRect[] = []
  const src = { x: -spreadX - 200, y: -spreadY - 100, w: 80, h: 50 }
  const dst = { x: spreadX + 120, y: spreadY + 20, w: 80, h: 50 }
  let guard = 0
  while (rects.length < n && guard < n * 50) {
    guard++
    const r: RoutingRect = {
      x: Math.round((rng() * 2 - 1) * spreadX),
      y: Math.round((rng() * 2 - 1) * spreadY),
      w: 60 + Math.round(rng() * 160),
      h: 40 + Math.round(rng() * 120),
    }
    const others = [...rects, src, dst]
    const clash = others.some((o) => r.x < o.x + o.w + 24 && r.x + r.w > o.x - 24 && r.y < o.y + o.h + 24 && r.y + r.h > o.y - 24)
    if (!clash) rects.push(r)
  }
  return { rects, src, dst }
}

describe('planRoute(走廊增强稀疏正交可见图 + 方向状态 A*)', () => {
  it('性质测试:1000 随机场景 × 2 模式,输出零穿越 + 端点贴边(硬性一票否决)', () => {
    let routed = 0
    for (let seed = 1; seed <= 1000; seed++) {
      const rng = mulberry32(seed)
      const { rects, src, dst } = randomScene(rng, 3 + Math.floor(rng() * 25))
      const p1 = { x: src.x + src.w, y: src.y + src.h / 2 }
      const p2 = { x: dst.x, y: dst.y + dst.h / 2 }
      for (const mode of ['free', 'orthogonal'] as const) {
        const path = planRoute(p1, p2, src, dst, rects, mode)
        if (!path) continue
        routed++
        const msg = `seed=${seed} mode=${mode} path=${JSON.stringify(path)}`
        expect(pathCrosses(path, rects), msg).toBe(false)
        expect(onBorder(path[0]!, src), msg).toBe(true)
        expect(onBorder(path[path.length - 1]!, dst), msg).toBe(true)
        if (mode === 'orthogonal') {
          for (let i = 0; i < path.length - 1; i++) {
            const a = path[i]!
            const b = path[i + 1]!
            expect(a.x === b.x || a.y === b.y, `${msg} seg${i} 非正交`).toBe(true)
          }
        }
      }
    }
    expect(routed).toBeGreaterThan(1500) // 绝大多数场景有解,null 是少数
  })

  it('确定性:同场景跑 100 次,输出字节级一致', () => {
    const rng = mulberry32(2026)
    const { rects, src, dst } = randomScene(rng, 40)
    const p1 = { x: src.x + src.w, y: src.y + src.h / 2 }
    const p2 = { x: dst.x, y: dst.y + dst.h / 2 }
    const sig = JSON.stringify(planRoute(p1, p2, src, dst, rects, 'orthogonal'))
    for (let i = 0; i < 100; i++) {
      expect(JSON.stringify(planRoute(p1, p2, src, dst, rects, 'orthogonal'))).toBe(sig)
    }
    expect(sig).not.toBe('null')
  })

  it('free 模式:直连已清返回 null(保持原直连);正交模式有障碍必给正交路径', () => {
    const src = { x: 0, y: 0, w: 100, h: 60 }
    const dst = { x: 500, y: 0, w: 100, h: 60 }
    expect(planRoute({ x: 100, y: 30 }, { x: 500, y: 30 }, src, dst, [], 'free')).toBeNull()
    const obstacle = { x: 200, y: -200, w: 100, h: 400 } // 挡死水平直连,只能上/下绕
    const path = planRoute({ x: 100, y: 30 }, { x: 500, y: 30 }, src, dst, [obstacle], 'orthogonal')
    expect(path).not.toBeNull()
    expect(pathCrosses(path!, [obstacle])).toBe(false)
  })

  it('启发回归:错位卡(无障碍)最优为 1 折 L(688),2 折 Z(696)是旧启发误价的产物', () => {
    // 历史:mb/terminalBend 分支计折对「一弯两用」重复计折 → h 虚高 λ,
    // 688 最优解(起点/终点端口各拐一次)全程被抬价,696 的 Z 解抢先出堆。
    // 修后启发 = 方向集下界(对齐轴一弯两用只计一折,终态含转身折),此处钉死。
    const src = { x: 0, y: 0, w: 200, h: 100 }
    const dst = { x: 600, y: 300, w: 200, h: 100 }
    const path = planRoute({ x: 200, y: 50 }, { x: 600, y: 350 }, src, dst, [], 'orthogonal')!
    expect(path).not.toBeNull()
    let len = 0
    let bends = 0
    for (let i = 0; i < path.length - 1; i++) {
      len += Math.abs(path[i + 1]!.x - path[i]!.x) + Math.abs(path[i + 1]!.y - path[i]!.y)
      if (i > 0) {
        const d1x = Math.sign(path[i]!.x - path[i - 1]!.x)
        const d1y = Math.sign(path[i]!.y - path[i - 1]!.y)
        const d2x = Math.sign(path[i + 1]!.x - path[i]!.x)
        const d2y = Math.sign(path[i + 1]!.y - path[i]!.y)
        if (d1x !== d2x || d1y !== d2y) bends++
      }
    }
    // 曼哈顿下界 660(单调路径必达)+ 最少 1 折:总代价恰为理论最优 688
    expect(len).toBe(660)
    expect(bends).toBe(1)
  })
  it('已知最优:上下全封死时走障碍边 ± margin 的窄走廊,4 点 3 段', () => {
    const src = { x: 0, y: 0, w: 100, h: 60 }
    const dst = { x: 500, y: 0, w: 100, h: 60 }
    // 障碍 y ∈ [-50,110]:盖过卡片带(y 0..60)和下方通道,上方走廊 y=-66 是唯一近路
    const obstacle = { x: 200, y: -50, w: 100, h: 160 }
    const path = planRoute({ x: 100, y: 30 }, { x: 500, y: 30 }, src, dst, [obstacle], 'orthogonal')!
    expect(path).not.toBeNull()
    // 走廊轴从内缩 hitEpsilon 后的障碍边外扩:-48-16=-64(视觉间距 18px ≥ margin,
    // 验证与轴同基准,自洽)
    const ys = new Set(path.map((p) => p.y))
    expect(path.length).toBe(4)
    expect(ys.has(-64)).toBe(true)
    expect(pathCrosses(path, [obstacle])).toBe(false)
  })

  it('性能门:202 障碍单箭头 ≤ 50ms(简报 §6.4;实测应为个位数 ms)', async () => {
    const { performance } = await import('node:perf_hooks')
    const rects: RoutingRect[] = []
    for (let r = 0; r < 10; r++) {
      for (let c = 0; c < 20; c++) rects.push({ x: c * 100, y: r * 70, w: 80, h: 50 })
    }
    const src = { x: -200, y: -100, w: 80, h: 50 }
    const dst = { x: 2000, y: 700, w: 80, h: 50 }
    const p1 = { x: -120, y: -75 }
    const p2 = { x: 2000, y: 725 }
    // 预热(JIT)后计量,取 10 次均值
    planRoute(p1, p2, src, dst, rects, 'orthogonal')
    const t0 = performance.now()
    for (let i = 0; i < 10; i++) planRoute(p1, p2, src, dst, rects, 'orthogonal')
    const perCall = (performance.now() - t0) / 10
    expect(perCall).toBeLessThan(50)
  })

  it('配置可调:λ=8(启发式时代对拍参数)与 λ=28 都给出不穿模路径', () => {
    const src = { x: 0, y: 0, w: 100, h: 60 }
    const dst = { x: 500, y: 300, w: 100, h: 60 }
    const rects = [{ x: 250, y: 100, w: 100, h: 100 }]
    for (const bendPenalty of [8, 28]) {
      const path = planRoute(
        { x: 100, y: 30 },
        { x: 500, y: 330 },
        src,
        dst,
        rects,
        'orthogonal',
        { ...DEFAULT_ROUTING, bendPenalty },
      )
      expect(path).not.toBeNull()
      expect(pathCrosses(path!, rects)).toBe(false)
    }
  })

  it('最优性对拍:稀疏 A* ≤ 密集网格 Dijkstra 参照 + 0.75px(同 margin 空间)', () => {
    // 密集参照:1px 网格、同端口/引出段模型、μ=0、障碍外扩 16px(margin 空间,
    // 顾问契约修补——参照最优算在同配置空间)。稀疏只许在轴线上转弯,实测余差
    // ≤0.7px(轴集量化),门取 0.75px。
    const LAMBDA = DEFAULT_ROUTING.bendPenalty
    const STUB = DEFAULT_ROUTING.minStub
    const normals: Array<[number, number]> = [
      [0, -1],
      [1, 0],
      [0, 1],
      [-1, 0],
    ]
    const geoCost = (path: RoutingPoint[]): number => {
      let len = 0
      let bends = 0
      for (let i = 0; i < path.length - 1; i++) {
        len += Math.abs(path[i + 1]!.x - path[i]!.x) + Math.abs(path[i + 1]!.y - path[i]!.y)
        if (i > 0) {
          const a = [
            Math.sign(path[i]!.x - path[i - 1]!.x),
            Math.sign(path[i]!.y - path[i - 1]!.y),
          ]
          const b = [
            Math.sign(path[i + 1]!.x - path[i]!.x),
            Math.sign(path[i + 1]!.y - path[i]!.y),
          ]
          if (a[0] !== b[0] || a[1] !== b[1]) bends++
        }
      }
      return len + bends * LAMBDA
    }
    const denseReference = (
      rects: RoutingRect[],
      src: RoutingRect,
      dst: RoutingRect,
    ): number | null => {
      const pad = (r: RoutingRect, m: number): RoutingRect => ({ x: r.x - m, y: r.y - m, w: r.w + 2 * m, h: r.h + 2 * m })
      const shrunk = rects.map((r) => ({ x: r.x + 2, y: r.y + 2, w: r.w - 4, h: r.h - 4 })).filter((r) => r.w > 0 && r.h > 0)
      const blockedRects = shrunk.map((r) => pad(r, 14))
      const dstC = { x: dst.x + dst.w / 2, y: dst.y + dst.h / 2 }
      const srcC = { x: src.x + src.w / 2, y: src.y + src.h / 2 }
      const ports = (r: RoutingRect, toward: RoutingPoint) => {
        const cs = (v: number, lo: number, len: number): number => Math.min(lo + len * 0.8, Math.max(lo + len * 0.2, v))
        return [
          { pt: { x: cs(toward.x, r.x, r.w), y: r.y }, dir: 0 },
          { pt: { x: r.x + r.w, y: cs(toward.y, r.y, r.h) }, dir: 1 },
          { pt: { x: cs(toward.x, r.x, r.w), y: r.y + r.h }, dir: 2 },
          { pt: { x: r.x, y: cs(toward.y, r.y, r.h) }, dir: 3 },
        ]
      }
      const stubPt = (p: { pt: RoutingPoint; dir: number }): RoutingPoint => ({
        x: Math.round(p.pt.x + normals[p.dir]![0] * STUB),
        y: Math.round(p.pt.y + normals[p.dir]![1] * STUB),
      })
      const x0 = Math.min(src.x, dst.x) - 220
      const y0 = Math.min(src.y, dst.y) - 220
      const W = Math.max(src.x + src.w, dst.x + dst.w) + 220 - x0
      const H = Math.max(src.y + src.h, dst.y + dst.h) + 220 - y0
      if (W * H > 700_000) return null
      const blocked = new Uint8Array(W * H)
      for (let y = 0; y < H; y++) {
        for (let x = 0; x < W; x++) {
          const gx = x0 + x
          const gy = y0 + y
          for (const r of blockedRects) {
            if (gx > r.x && gx < r.x + r.w && gy > r.y && gy < r.y + r.h) {
              blocked[y * W + x] = 1
              break
            }
          }
        }
      }
      const starts: Array<{ u: number; dir: number; pt: RoutingPoint }> = []
      for (const p of ports(src, dstC)) {
        const s = stubPt(p)
        const ix = s.x - x0
        const iy = s.y - y0
        if (ix < 0 || iy < 0 || ix >= W || iy >= H || blocked[iy * W + ix]) continue
        starts.push({ u: iy * W + ix, dir: p.dir, pt: p.pt })
      }
      const ends = new Map<number, RoutingPoint>()
      for (const p of ports(dst, srcC)) {
        const s = stubPt(p)
        const ix = s.x - x0
        const iy = s.y - y0
        if (ix < 0 || iy < 0 || ix >= W || iy >= H || blocked[iy * W + ix]) continue
        ends.set(iy * W + ix, p.pt)
      }
      if (starts.length === 0 || ends.size === 0) return null
      const size = W * H * 4
      const dist = new Float64Array(size).fill(Infinity)
      const parent = new Int32Array(size).fill(-1)
      const heap: Array<[number, number]> = []
      const push = (it: [number, number]): void => {
        heap.push(it)
        let i = heap.length - 1
        while (i > 0) {
          const p = (i - 1) >> 1
          if (heap[i]![0] < heap[p]![0]) {
            ;[heap[i], heap[p]] = [heap[p]!, heap[i]!]
            i = p
          } else break
        }
      }
      const pop = (): [number, number] | undefined => {
        const top = heap[0]
        const last = heap.pop()
        if (heap.length > 0 && last) {
          heap[0] = last
          let i = 0
          for (;;) {
            const l = 2 * i + 1
            const r = l + 1
            let m = i
            if (l < heap.length && heap[l]![0] < heap[m]![0]) m = l
            if (r < heap.length && heap[r]![0] < heap[m]![0]) m = r
            if (m === i) break
            ;[heap[i], heap[m]] = [heap[m]!, heap[i]!]
            i = m
          }
        }
        return top
      }
      for (const s of starts) {
        const key = s.u * 4 + s.dir
        if (STUB < dist[key]!) {
          dist[key] = STUB
          push([STUB, key])
        }
      }
      while (heap.length > 0) {
        const [g, key] = pop()!
        if (g > dist[key]!) continue
        const u = Math.floor(key / 4)
        const dir = key % 4
        if (ends.has(u)) {
          const nodes: RoutingPoint[] = []
          let k: number = key
          let rootU = -1
          for (;;) {
            const uu = Math.floor(k / 4)
            nodes.push({ x: x0 + (uu % W), y: y0 + Math.floor(uu / W) })
            const pk = parent[k]!
            if (pk < 0) {
              rootU = uu
              break
            }
            k = pk
          }
          nodes.reverse()
          const st = starts.find((s) => s.u === rootU)
          return st ? geoCost([st.pt, ...nodes, ends.get(u)!]) : null
        }
        const ux = u % W
        const uy = Math.floor(u / W)
        for (let nd = 0; nd < 4; nd++) {
          const tx = ux + normals[nd]![0]
          const ty = uy + normals[nd]![1]
          if (tx < 0 || ty < 0 || tx >= W || ty >= H) continue
          const v = ty * W + tx
          if (blocked[v]) continue
          const ng = g + 1 + (nd !== dir ? LAMBDA : 0)
          const nkey = v * 4 + nd
          if (ng < dist[nkey]! - 1e-9) {
            dist[nkey] = ng
            parent[nkey] = key
            push([ng, nkey])
          }
        }
      }
      return null
    }
    let checked = 0
    for (let seed = 1; seed <= 12; seed++) {
      const rng = mulberry32(seed * 7)
      // 紧盒场景:源/目标在盒内(±150×±100),障碍夹中间——参照盒可控
      const src = { x: -150, y: Math.round((rng() * 2 - 1) * 60), w: 50, h: 36 }
      const dst = { x: 100, y: Math.round((rng() * 2 - 1) * 60), w: 50, h: 36 }
      const all = [src, dst]
      let guard = 0
      while (all.length < 5 + Math.floor(rng() * 3) && guard < 100) {
        guard++
        const r: RoutingRect = {
          x: Math.round((rng() * 2 - 1) * 140),
          y: Math.round((rng() * 2 - 1) * 100),
          w: 30 + Math.round(rng() * 50),
          h: 24 + Math.round(rng() * 36),
        }
        const clash = all.some((o) => r.x < o.x + o.w + 20 && r.x + r.w > o.x - 20 && r.y < o.y + o.h + 20 && r.y + r.h > o.y - 20)
        if (!clash) all.push(r)
      }
      const rects = all.slice(2)
      const p1 = { x: src.x + src.w, y: src.y + src.h / 2 }
      const p2 = { x: dst.x, y: dst.y + dst.h / 2 }
      const cfg = { ...DEFAULT_ROUTING, uturnPenalty: 0 }
      const sparse = planRoute(p1, p2, src, dst, rects, 'orthogonal', cfg)
      const dense = denseReference(rects, src, dst)
      if (!dense || !sparse) continue
      checked++
      const slack = geoCost(sparse) - dense
      expect(slack, `seed=${seed} sparse=${geoCost(sparse)} dense=${dense}`).toBeLessThanOrEqual(0.75)
    }
    expect(checked).toBeGreaterThanOrEqual(6)
  })
})
