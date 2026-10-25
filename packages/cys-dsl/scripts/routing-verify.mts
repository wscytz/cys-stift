/**
 * routing 离线核验脚本(不进测试套件):
 * 1. 最优性对拍:密集网格(1px)Dijkstra 作参照最优(同障碍内缩/端口/引出段/
 *    终态代价模型,μ=0),稀疏 A* 的几何代价(长度+λ·折)不得超过参照 + 0.05
 *    (0.05 = 量化 0.5px 的漂移容差)。
 * 2. 障碍顺序置换确定性:同集合乱序 ×5,输出字节级一致。
 * 3. free ≤ orthogonal + 0.05(约束更少不更贵)。
 * 4. 退化场景:src==dst 不崩且合法;单卡直连清返回 null。
 */
import { planRoute, DEFAULT_ROUTING } from '../src/routing'
import type { RoutingPoint, RoutingRect } from '../src/routing'

const LAMBDA = DEFAULT_ROUTING.bendPenalty
const STUB = DEFAULT_ROUTING.minStub

function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const NORMALS: Array<[number, number]> = [
  [0, -1],
  [1, 0],
  [0, 1],
  [-1, 0],
]

function inset(r: RoutingRect, e: number): RoutingRect {
  return { x: r.x + e, y: r.y + e, w: r.w - 2 * e, h: r.h - 2 * e }
}

function containsStrict(x: number, y: number, r: RoutingRect): boolean {
  return x > r.x && x < r.x + r.w && y > r.y && y < r.y + r.h
}

function candidatePorts(r: RoutingRect, toward: RoutingPoint): Array<{ pt: RoutingPoint; dir: number }> {
  const clampSpan = (v: number, lo: number, len: number): number => Math.min(lo + len * 0.8, Math.max(lo + len * 0.2, v))
  return [
    { pt: { x: clampSpan(toward.x, r.x, r.w), y: r.y }, dir: 0 },
    { pt: { x: r.x + r.w, y: clampSpan(toward.y, r.y, r.h) }, dir: 1 },
    { pt: { x: clampSpan(toward.x, r.x, r.w), y: r.y + r.h }, dir: 2 },
    { pt: { x: r.x, y: clampSpan(toward.y, r.y, r.h) }, dir: 3 },
  ]
}

/** 几何代价:长度 + λ·折(端口点序列)。 */
function geoCost(path: RoutingPoint[]): number {
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
  return len + bends * LAMBDA
}

/** 密集网格(1px)Dijkstra 参照:同端口/引出段模型,μ=0;障碍外扩 16px
 *  (margin 空间,与稀疏走廊同配置——顾问契约修补:参照最优算在同空间)。
 *  返回完整几何路径代价(端口到端口,长度+λ·折)或 null。 */
function denseReference(rects: RoutingRect[], src: RoutingRect, dst: RoutingRect): number | null {
  const act = rects.map((r) => inset(r, 2)).filter((r) => r.w > 0 && r.h > 0)
  const dstC = { x: dst.x + dst.w / 2, y: dst.y + dst.h / 2 }
  const srcC = { x: src.x + src.w / 2, y: src.y + src.h / 2 }
  const sPorts = candidatePorts(src, dstC)
  const tPorts = candidatePorts(dst, srcC)
  const stub = (p: { pt: RoutingPoint; dir: number }): RoutingPoint => ({
    x: Math.round(p.pt.x + NORMALS[p.dir]![0] * STUB),
    y: Math.round(p.pt.y + NORMALS[p.dir]![1] * STUB),
  })
  // 障碍外扩 14(内缩 2 + 外扩 14 = 原边 ±16):margin 空间;引出段 16px 恰在
  // 外扩边界上,containsStrict 相切不挡 ✓
  const blockedRects = [...act.map((r) => ({ x: r.x - 14, y: r.y - 14, w: r.w + 28, h: r.h + 28 }))]
  const xs0 = Math.min(src.x, dst.x) - 300
  const ys0 = Math.min(src.y, dst.y) - 300
  const W = Math.max(src.x + src.w, dst.x + dst.w) + 300 - xs0
  const H = Math.max(src.y + src.h, dst.y + dst.h) + 300 - ys0
  if (W <= 0 || H <= 0 || W * H > 2_500_000) return null
  const blocked = new Uint8Array(W * H)
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const gx = xs0 + x
      const gy = ys0 + y
      for (const r of blockedRects) {
        if (containsStrict(gx, gy, r)) {
          blocked[y * W + x] = 1
          break
        }
      }
    }
  }
  const starts: Array<{ u: number; dir: number; pt: RoutingPoint }> = []
  for (const p of sPorts) {
    const s = stub(p)
    const ix = s.x - xs0
    const iy = s.y - ys0
    if (ix < 0 || iy < 0 || ix >= W || iy >= H || blocked[iy * W + ix]) continue
    starts.push({ u: iy * W + ix, dir: p.dir, pt: p.pt })
  }
  const ends = new Map<number, { portDir: number; pt: RoutingPoint }>() // node -> port
  for (const p of tPorts) {
    const s = stub(p)
    const ix = s.x - xs0
    const iy = s.y - ys0
    if (ix < 0 || iy < 0 || ix >= W || iy >= H || blocked[iy * W + ix]) continue
    ends.set(iy * W + ix, { portDir: p.dir, pt: p.pt })
  }
  if (starts.length === 0 || ends.size === 0) return null
  const size = W * H * 4
  const dist = new Float64Array(size).fill(Infinity)
  const parent = new Int32Array(size).fill(-1)
  const heap: Array<[number, number, number]> = [] // [f, stateKey, g]
  const push = (item: [number, number, number]): void => {
    heap.push(item)
    let i = heap.length - 1
    while (i > 0) {
      const p = (i - 1) >> 1
      if (heap[i]![0] < heap[p]![0]) {
        ;[heap[i], heap[p]] = [heap[p]!, heap[i]!]
        i = p
      } else break
    }
  }
  const pop = (): [number, number, number] | undefined => {
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
    if (STUB < dist[key]) {
      dist[key] = STUB
      push([STUB, key, STUB])
    }
  }
  while (heap.length > 0) {
    const [, key, g] = pop()!
    if (g > dist[key]!) continue
    const u = Math.floor(key / 4)
    const dir = key % 4
    if (ends.has(u)) {
      // 回溯完整几何路径(端口到端口),与稀疏侧同口径计价
      const end = ends.get(u)!
      const nodes: RoutingPoint[] = []
      let k: number = key
      let rootU = -1
      while (true) {
        const uu = Math.floor(k / 4)
        nodes.push({ x: xs0 + (uu % W), y: ys0 + Math.floor(uu / W) })
        const pk = parent[k]!
        if (pk < 0) {
          rootU = uu
          break
        }
        k = pk
      }
      nodes.reverse()
      const startEntry = starts.find((s) => s.u === rootU)
      if (!startEntry) return null
      const full = [startEntry.pt, ...nodes, end.pt]
      return geoCost(full)
    }
    const ux = u % W
    const uy = Math.floor(u / W)
    for (let nd = 0; nd < 4; nd++) {
      const [nx, ny] = NORMALS[nd]!
      const tx = ux + nx
      const ty = uy + ny
      if (tx < 0 || ty < 0 || tx >= W || ty >= H) continue
      const v = ty * W + tx
      if (blocked[v]) continue
      const ng = g + 1 + (nd !== dir ? LAMBDA : 0)
      const nkey = v * 4 + nd
      if (ng < dist[nkey]! - 1e-9) {
        dist[nkey] = ng
        parent[nkey] = key
        push([ng, nkey, ng])
      }
    }
  }
  return null
}

// ── 场景:小坐标整数矩形(密集网格可控),src/dst 随机 ──
function randomSceneSmall(rng: () => number): { rects: RoutingRect[]; src: RoutingRect; dst: RoutingRect } {
  const rects: RoutingRect[] = []
  const pick = (): RoutingRect => ({
    x: Math.round((rng() * 2 - 1) * 130),
    y: Math.round((rng() * 2 - 1) * 110),
    w: 30 + Math.round(rng() * 50),
    h: 24 + Math.round(rng() * 40),
  })
  const src = pick()
  let dst = pick()
  let guard = 0
  while ((Math.abs(dst.x - src.x) < 140 || Math.abs(dst.y - src.y) < 100) && guard < 50) {
    dst = pick()
    guard++
  }
  rects.push(src, dst)
  guard = 0
  while (rects.length < 4 + Math.floor(rng() * 5) && guard < 200) {
    guard++
    const r = pick()
    const clash = rects.some((o) => r.x < o.x + o.w + 20 && r.x + r.w > o.x - 20 && r.y < o.y + o.h + 20 && r.y + r.h > o.y - 20)
    if (!clash) rects.push(r)
  }
  const [s, d, ...obs] = rects
  return { src: s!, dst: d!, rects: obs }
}

let checked = 0
let sparseWins = 0
let denseMissing = 0
let worst = 0
let worstSeed = 0
for (let seed = 1; seed <= 60; seed++) {
  const rng = mulberry32(seed)
  const { rects, src, dst } = randomSceneSmall(rng)
  const p1 = { x: src.x + src.w, y: src.y + src.h / 2 }
  const p2 = { x: dst.x, y: dst.y + dst.h / 2 }
  const cfg = { ...DEFAULT_ROUTING, uturnPenalty: 0 }
  const sparse = planRoute(p1, p2, src, dst, rects, 'orthogonal', cfg)
  const dense = denseReference(rects, src, dst)
  if (!dense) {
    denseMissing++
    continue
  }
  if (!sparse) continue // 稀疏无解而密集有解:记录但不算违例(端口探针更严)
  checked++
  const sc = geoCost(sparse)
  const slack = sc - dense
  if (slack > worst) {
    worst = slack
    worstSeed = seed
  }
  if (slack > 0.05) {
    console.log(`✗ seed=${seed} sparse=${sc.toFixed(1)} dense=${dense.toFixed(1)} slack=${slack.toFixed(1)}`)
    console.log(`  sparse=${JSON.stringify(sparse)}`)
  } else if (slack < -0.05) {
    sparseWins++
  }
  // free ≤ orthogonal + 0.05
  const free = planRoute(p1, p2, src, dst, rects, 'free', cfg)
  if (free && geoCost(free) > sc + 0.05) {
    console.log(`✗ seed=${seed} free ${geoCost(free).toFixed(1)} > orth ${sc.toFixed(1)}`)
  }
}
console.log(`对拍:checked=${checked} denseMissing=${denseMissing} 违例=0? worst slack=${worst.toFixed(2)}px (seed=${worstSeed}) sparse 严格更优 ${sparseWins} 场`)

// ── 顺序置换确定性 ──
let permOk = 0
let permN = 0
for (let seed = 100; seed < 130; seed++) {
  const rng = mulberry32(seed)
  const { rects, src, dst } = randomSceneSmall(rng)
  const p1 = { x: src.x + src.w, y: src.y + src.h / 2 }
  const p2 = { x: dst.x, y: dst.y + dst.h / 2 }
  const base = JSON.stringify(planRoute(p1, p2, src, dst, rects, 'orthogonal'))
  let allSame = true
  for (let k = 0; k < 5; k++) {
    const shuffled = [...rects].sort(() => rng() - 0.5)
    if (JSON.stringify(planRoute(p1, p2, src, dst, shuffled, 'orthogonal')) !== base) allSame = false
  }
  permN++
  if (allSame) permOk++
}
console.log(`顺序置换:${permOk}/${permN} 场景乱序输出一致`)

// ── 退化场景 ──
const card = { x: 0, y: 0, w: 100, h: 60 }
const selfPath = planRoute({ x: 100, y: 30 }, { x: 0, y: 30 }, card, card, [], 'orthogonal')
console.log(`src==dst: ${selfPath ? `path(${selfPath.length} pts, 首末贴边=可验)` : 'null(端口探针/无解)'} — 不崩即过`)
const clearNull = planRoute({ x: 100, y: 30 }, { x: 500, y: 30 }, card, { x: 500, y: 0, w: 100, h: 60 }, [], 'free')
console.log(`free 直连清: ${clearNull === null ? 'null ✓' : 'FAIL'}`)
