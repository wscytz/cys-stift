/**
 * routing — 正交绕障走线求解器(走廊增强稀疏正交可见图 + 方向状态 A*)。
 *
 * 取代 to-svg 的四族启发式(routeAround 保留为兜底)。来源:2026-10-25 外包咨询蓝图
 * (🔒 cys-stift-docs development/2026-10-25-routing-algorithm-outsourcing-brief.md),
 * 落地时两处有意偏离:
 * - 源/目标矩形保留为障碍(内缩 hitEpsilon:贴边合法、深入即拦),不整体剔除——
 *   防路径倒穿源/目标内部;仅"严格包含贴边端点"的矩形豁免(外层容器语义)。
 * - 转折代价 λ 默认 28(咨询建议 [24,32];启发式时代的 8 保留为对拍参数)。
 *
 * 管线:活跃障碍过滤 → 端口候选(四边投影点,引出段探针验合法)→ 局部视野内建
 * 坐标轴(障碍外扩边 + 间隙中线 + 端口/引出/源目中线坐标)→ 网格节点/邻接边遮挡
 * 剔除 → 多源多汇方向状态 A*(字典序破平局,确定性)→ 共线合并 → free 模式视线
 * 拉直(带 12px 安全边距的贪心 LOS 合并)→ 端点重贴边 + 量化(0.5px)+ 全路径终验。
 * 同输入同输出(无随机、无时间依赖)。
 */

export interface RoutingRect {
  x: number
  y: number
  w: number
  h: number
}
export interface RoutingPoint {
  x: number
  y: number
}

export interface RoutingConfig {
  /** 障碍外扩安全边距(走廊到卡边的距离) */
  margin: number
  /** 碰撞检测内缩容差(贴边端点免误报) */
  hitEpsilon: number
  /** 最小可通行间隙(窄缝仍出中线走廊) */
  minGap: number
  /** 转折视觉代价 λ(px/折);对拍可传 8,生产 28 */
  bendPenalty: number
  /** 非单调折返微惩罚(远离目标的移动),抑制同代价阶梯线 */
  uturnPenalty: number
  /** 端口垂直引出段长度 */
  minStub: number
  /** 坐标量化步长(0.5px),确定性 */
  quant: number
  /** 局部视野外扩(障碍吸收闭包半径) */
  localPad: number
}

export const DEFAULT_ROUTING: RoutingConfig = {
  margin: 16,
  hitEpsilon: 2,
  minGap: 8,
  bendPenalty: 28,
  uturnPenalty: 4,
  minStub: 16,
  quant: 0.5,
  localPad: 160,
}

type Dir = 0 | 1 | 2 | 3 // 外法线:N E S W
const NORMALS: Array<[number, number]> = [
  [0, -1],
  [1, 0],
  [0, 1],
  [-1, 0],
]
const OPP = (d: Dir): Dir => ((d + 2) % 4) as Dir

const q = (v: number, step: number): number => Math.round(v / step) * step

function inset(r: RoutingRect, e: number): RoutingRect {
  return { x: r.x + e, y: r.y + e, w: r.w - 2 * e, h: r.h - 2 * e }
}

function expand(r: RoutingRect, m: number): RoutingRect {
  return { x: r.x - m, y: r.y - m, w: r.w + 2 * m, h: r.h + 2 * m }
}

function containsStrict(p: RoutingPoint, r: RoutingRect): boolean {
  return p.x > r.x && p.x < r.x + r.w && p.y > r.y && p.y < r.y + r.h
}

/** 线段与矩形内域相交(Liang-Barsky;相交段需有实长,贴边擦过不算)。 */
function segHitsRect(a: RoutingPoint, b: RoutingPoint, r: RoutingRect): boolean {
  let t0 = 0
  let t1 = 1
  const dx = b.x - a.x
  const dy = b.y - a.y
  const edges: Array<[number, number]> = [
    [-dx, a.x - r.x],
    [dx, r.x + r.w - a.x],
    [-dy, a.y - r.y],
    [dy, r.y + r.h - a.y],
  ]
  for (const [p, qq] of edges) {
    if (p === 0) {
      // 开内域语义:线与边共线(qq=0)不进开内域,相切允许——与图侧
      // containsStrict 口径一致,否则贴边滑行的合法解被终验误杀退兜底
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

function segClear(a: RoutingPoint, b: RoutingPoint, rects: RoutingRect[]): boolean {
  for (const r of rects) if (segHitsRect(a, b, r)) return false
  return true
}

function pathClear(pts: RoutingPoint[], rects: RoutingRect[]): boolean {
  for (let i = 0; i < pts.length - 1; i++) {
    if (!segClear(pts[i]!, pts[i + 1]!, rects)) return false
  }
  return true
}

/** 矩形中心到 (tx,ty) 方向的贴边点(与 to-svg.borderPoint 同式)。 */
function borderPoint(r: RoutingRect, tx: number, ty: number): RoutingPoint {
  const cx = r.x + r.w / 2
  const cy = r.y + r.h / 2
  const dx = tx - cx
  const dy = ty - cy
  if (dx === 0 && dy === 0) return { x: cx, y: cy }
  const sx = dx !== 0 ? r.w / 2 / Math.abs(dx) : Infinity
  const sy = dy !== 0 ? r.h / 2 / Math.abs(dy) : Infinity
  const s = Math.min(sx, sy)
  return { x: cx + dx * s, y: cy + dy * s }
}

/** 活跃障碍:过小矩形跳过(与启发式同口径);严格包含贴边端点的矩形豁免(容器
 *  语义,咨询修补 §2-1);源/目标保留——内缩后贴边端点在外,深入即拦(防倒穿)。 */
function activeObstacles(obstacles: RoutingRect[], p0: RoutingPoint, pk: RoutingPoint, eps: number): RoutingRect[] {
  const out: RoutingRect[] = []
  for (const r of obstacles) {
    if (r.w <= 12 && r.h <= 12) continue
    const sh = inset(r, eps)
    if (sh.w <= 0 || sh.h <= 0) continue
    if (containsStrict(p0, sh) || containsStrict(pk, sh)) continue
    out.push(sh)
  }
  return out
}

interface Port {
  pt: RoutingPoint
  dir: Dir
}

/** 四边候选端口:对方中心在该边上的投影,钳在边长 [20%,80%](防贴死圆角)。 */
function candidatePorts(r: RoutingRect, toward: RoutingPoint): Port[] {
  const clampSpan = (v: number, lo: number, len: number): number => Math.min(lo + len * 0.8, Math.max(lo + len * 0.2, v))
  return [
    { pt: { x: clampSpan(toward.x, r.x, r.w), y: r.y }, dir: 0 },
    { pt: { x: r.x + r.w, y: clampSpan(toward.y, r.y, r.h) }, dir: 1 },
    { pt: { x: clampSpan(toward.x, r.x, r.w), y: r.y + r.h }, dir: 2 },
    { pt: { x: r.x, y: clampSpan(toward.y, r.y, r.h) }, dir: 3 },
  ]
}

function stubOf(p: Port, len: number): RoutingPoint {
  const [nx, ny] = NORMALS[p.dir]!
  return { x: p.pt.x + nx * len, y: p.pt.y + ny * len }
}

/** 引出段探针:端口向外 stub 长度的段不得穿任何障碍(四面全堵的端口不可用)。 */
function portUsable(p: Port, rects: RoutingRect[], stub: number): boolean {
  return segClear(p.pt, stubOf(p, stub), rects)
}

/** 局部视野:源/目标包围盒外扩,吸收相交障碍的外扩盒直至闭包,再补一圈边距。 */
function viewBox(src: RoutingRect, dst: RoutingRect, act: RoutingRect[], cfg: RoutingConfig): RoutingRect {
  const sx = Math.min(src.x, dst.x)
  const sy = Math.min(src.y, dst.y)
  let b = expand(
    {
      x: sx,
      y: sy,
      w: Math.max(src.x + src.w, dst.x + dst.w) - sx,
      h: Math.max(src.y + src.h, dst.y + dst.h) - sy,
    },
    cfg.localPad,
  )
  for (let round = 0; round < 4; round++) {
    let changed = false
    for (const r of act) {
      const hit = r.x < b.x + b.w && r.x + r.w > b.x && r.y < b.y + b.h && r.y + r.h > b.y
      if (!hit) continue
      const re = expand(r, cfg.margin)
      const nb = {
        x: Math.min(b.x, re.x),
        y: Math.min(b.y, re.y),
        w: Math.max(b.x + b.w, re.x + re.w) - Math.min(b.x, re.x),
        h: Math.max(b.y + b.h, re.y + re.h) - Math.min(b.y, re.y),
      }
      if (nb.x !== b.x || nb.y !== b.y || nb.w !== b.w || nb.h !== b.h) {
        b = nb
        changed = true
      }
    }
    if (!changed) break
  }
  return expand(b, cfg.margin)
}

/** 单轴障碍区间并集的空隙中点(空隙 ≥ minGap;窄缝中线也在轴上,穿缝走正中)。 */
function gapMidlines(rects: RoutingRect[], axis: 'x' | 'y', minGap: number): number[] {
  const ivals = rects
    .map((r) => (axis === 'x' ? [r.x, r.x + r.w] : [r.y, r.y + r.h]))
    .sort((a, b) => a[0]! - b[0]!)
  const merged: Array<[number, number]> = []
  for (const iv of ivals) {
    const last = merged[merged.length - 1]
    if (last && iv[0]! <= last[1]) last[1] = Math.max(last[1], iv[1]!)
    else merged.push([iv[0]!, iv[1]!])
  }
  const mids: number[] = []
  for (let i = 0; i < merged.length - 1; i++) {
    const start = merged[i]![1]
    const end = merged[i + 1]![0]
    if (end - start >= minGap) mids.push((start + end) / 2)
  }
  return mids
}

interface Graph {
  xs: number[]
  ys: number[]
  /** 节点在障碍开内域 */
  blocked: Uint8Array
  /** 每个 y 行:覆盖该 y 的障碍(横边遮挡) */
  hCover: RoutingRect[][]
  /** 每个 x 列:覆盖该 x 的障碍(竖边遮挡) */
  vCover: RoutingRect[][]
}

function buildGraph(act: RoutingRect[], src: RoutingRect, dst: RoutingRect, ports: Port[], cfg: RoutingConfig): Graph {
  const view = viewBox(src, dst, act, cfg)
  const inView = (r: RoutingRect): boolean =>
    r.x < view.x + view.w && r.x + r.w > view.x && r.y < view.y + view.h && r.y + r.h > view.y
  const local = act.filter(inView)
  const xs = new Set<number>()
  const ys = new Set<number>()
  const addX = (v: number): void => {
    if (v >= view.x && v <= view.x + view.w) xs.add(q(v, cfg.quant))
  }
  const addY = (v: number): void => {
    if (v >= view.y && v <= view.y + view.h) ys.add(q(v, cfg.quant))
  }
  for (const r of local) {
    addX(r.x - cfg.margin)
    addX(r.x + r.w + cfg.margin)
    addY(r.y - cfg.margin)
    addY(r.y + r.h + cfg.margin)
  }
  for (const m of gapMidlines(local, 'x', cfg.minGap)) addX(m)
  for (const m of gapMidlines(local, 'y', cfg.minGap)) addY(m)
  for (const p of ports) {
    addX(p.pt.x)
    addY(p.pt.y)
    const sp = stubOf(p, cfg.minStub)
    addX(sp.x)
    addY(sp.y)
  }
  addX((src.x + src.w / 2 + dst.x + dst.w / 2) / 2)
  addY((src.y + src.h / 2 + dst.y + dst.h / 2) / 2)
  const xsArr = [...xs].sort((a, b) => a - b)
  const ysArr = [...ys].sort((a, b) => a - b)
  const blocked = new Uint8Array(xsArr.length * ysArr.length)
  for (let iy = 0; iy < ysArr.length; iy++) {
    for (let ix = 0; ix < xsArr.length; ix++) {
      const p = { x: xsArr[ix]!, y: ysArr[iy]! }
      for (const r of local) {
        if (containsStrict(p, r)) {
          blocked[iy * xsArr.length + ix] = 1
          break
        }
      }
    }
  }
  const hCover: RoutingRect[][] = ysArr.map((y) => local.filter((r) => y > r.y && y < r.y + r.h))
  const vCover: RoutingRect[][] = xsArr.map((x) => local.filter((r) => x > r.x && x < r.x + r.w))
  return { xs: xsArr, ys: ysArr, blocked, hCover, vCover }
}

interface HeapItem {
  f: number
  g: number
  bends: number
  u: number
  dir: Dir
}

/** 二叉堆,比较器按 (⌊f·100⌋, bends, u, dir) 字典序——确定性破平局。 */
class Heap {
  private a: HeapItem[] = []

  private less(i: number, j: number): boolean {
    const A = this.a[i]!
    const B = this.a[j]!
    const fa = Math.floor(A.f * 100)
    const fb = Math.floor(B.f * 100)
    return fa !== fb ? fa < fb : A.bends !== B.bends ? A.bends < B.bends : A.u !== B.u ? A.u < B.u : A.dir < B.dir
  }

  push(it: HeapItem): void {
    this.a.push(it)
    let i = this.a.length - 1
    while (i > 0) {
      const p = (i - 1) >> 1
      if (this.less(i, p)) {
        ;[this.a[i], this.a[p]] = [this.a[p]!, this.a[i]!]
        i = p
      } else break
    }
  }

  pop(): HeapItem | undefined {
    const top = this.a[0]
    const last = this.a.pop()
    if (this.a.length > 0 && last) {
      this.a[0] = last
      let i = 0
      for (;;) {
        const l = 2 * i + 1
        const r = l + 1
        let m = i
        if (l < this.a.length && this.less(l, m)) m = l
        if (r < this.a.length && this.less(r, m)) m = r
        if (m === i) break
        ;[this.a[i], this.a[m]] = [this.a[m]!, this.a[i]!]
        i = m
      }
    }
    return top
  }

  get size(): number {
    return this.a.length
  }
}

/**
 * 主入口:规划从 src 贴边到 dst 贴边的绕障路径(整条,含端点)。
 * free 模式直连已清 → 返回 null(调用方保持原直连);无解 → null(调用方退兜底)。
 * orthogonal 模式恒返正交路径(除非无解)。
 */
export function planRoute(
  p1: RoutingPoint,
  p2: RoutingPoint,
  src: RoutingRect,
  dst: RoutingRect,
  obstacles: RoutingRect[],
  mode: 'free' | 'orthogonal' = 'free',
  cfg: RoutingConfig = DEFAULT_ROUTING,
): RoutingPoint[] | null {
  const act = activeObstacles(obstacles, p1, p2, cfg.hitEpsilon)
  if (mode === 'free' && segClear(p1, p2, act)) return null // V1 直连短路
  const dstCenter = { x: dst.x + dst.w / 2, y: dst.y + dst.h / 2 }
  const srcCenter = { x: src.x + src.w / 2, y: src.y + src.h / 2 }
  const sPorts = candidatePorts(src, dstCenter).filter((p) => portUsable(p, act, cfg.minStub))
  const tPorts = candidatePorts(dst, srcCenter).filter((p) => portUsable(p, act, cfg.minStub))
  if (sPorts.length === 0 || tPorts.length === 0) return null
  const g = buildGraph(act, src, dst, [...sPorts, ...tPorts], cfg)
  const W = g.xs.length
  const H = g.ys.length
  const nodeIndexOf = (p: RoutingPoint): number => {
    const x = q(p.x, cfg.quant)
    const y = q(p.y, cfg.quant)
    const ix = g.xs.indexOf(x)
    const iy = g.ys.indexOf(y)
    return ix < 0 || iy < 0 ? -1 : iy * W + ix
  }
  interface End {
    port: Port
    stub: RoutingPoint
    u: number
  }
  const ends = tPorts
    .map((p): End | null => {
      const stub = stubOf(p, cfg.minStub)
      const u = nodeIndexOf(stub)
      return u >= 0 && !g.blocked[u] ? { port: p, stub, u } : null
    })
    .filter((e): e is End => e !== null)
  const starts = sPorts
    .map((p): { port: Port; stub: RoutingPoint; u: number } | null => {
      const stub = stubOf(p, cfg.minStub)
      const u = nodeIndexOf(stub)
      return u >= 0 && !g.blocked[u] ? { port: p, stub, u } : null
    })
    .filter((s): s is NonNullable<typeof s> => s !== null)
  if (starts.length === 0 || ends.length === 0) return null

  // 可采纳启发:到任一目标引出点的曼哈顿距离 + 必要折数(途中 + 入汇转向)× λ + 引出段。
  // 终态处 h = 精确剩余成本 → 首个出堆终态即全路径最优。
  const hFn = (u: number, dir: Dir): number => {
    const ux = g.xs[u % W]!
    const uy = g.ys[Math.floor(u / W)]!
    let best = Infinity
    for (const e of ends) {
      const dx = Math.abs(ux - e.stub.x)
      const dy = Math.abs(uy - e.stub.y)
      let mb: number
      if (dx < 1e-6 && dy < 1e-6) {
        mb = 0
      } else if (dx < 1e-6 || dy < 1e-6) {
        const [dvx, dvy] = NORMALS[dir]!
        const toward = dx < 1e-6 ? Math.sign(e.stub.y - uy) : Math.sign(e.stub.x - ux)
        const cur = dx < 1e-6 ? dvy! : dvx!
        mb = cur === toward ? 0 : 1
      } else {
        mb = 1
      }
      const terminalBend = dir !== OPP(e.port.dir) ? 1 : 0
      const cand = dx + dy + (mb + terminalBend) * cfg.bendPenalty + cfg.minStub
      if (cand < best) best = cand
    }
    return best === Infinity ? 0 : best
  }

  const size = W * H * 4
  const dist = new Float64Array(size).fill(Infinity)
  const parent = new Int32Array(size).fill(-1)
  const bendsArr = new Int16Array(size).fill(0)
  const endSet = new Set(ends.map((e) => e.u))
  const heap = new Heap()
  for (const s of starts) {
    const key = s.u * 4 + s.port.dir
    if (cfg.minStub < dist[key]!) {
      dist[key] = cfg.minStub
      bendsArr[key] = 0
      parent[key] = -1
      heap.push({ f: cfg.minStub + hFn(s.u, s.port.dir), g: cfg.minStub, bends: 0, u: s.u, dir: s.port.dir })
    }
  }
  let goalKey = -1
  let goalEnd: End | null = null
  while (heap.size > 0) {
    const it = heap.pop()!
    const key = it.u * 4 + it.dir
    if (it.g > dist[key]! + 1e-9) continue // 惰性删除:过期堆项
    if (endSet.has(it.u)) {
      // 终态 h 已含入汇精确成本,首个出堆即最优
      goalKey = key
      goalEnd = ends.find((e) => e.u === it.u)!
      break
    }
    const ux = it.u % W
    const uy = Math.floor(it.u / W)
    const px = g.xs[ux]!
    const py = g.ys[uy]!
    for (let nd = 0; nd < 4; nd++) {
      const [nx, ny] = NORMALS[nd]!
      const tx = ux + nx
      const ty = uy + ny
      if (tx < 0 || ty < 0 || tx >= W || ty >= H) continue
      const v = ty * W + tx
      if (g.blocked[v]) continue
      // 邻接边遮挡:横边查行覆盖,竖边查列覆盖(端点在 shrunk 边界上=允许)
      if (nd === 1 || nd === 3) {
        const cover = g.hCover[ty]!
        const xLo = Math.min(px, g.xs[tx]!)
        const xHi = Math.max(px, g.xs[tx]!)
        let blockedEdge = false
        for (const r of cover) {
          if (r.x < xHi - 0.01 && r.x + r.w > xLo + 0.01) {
            blockedEdge = true
            break
          }
        }
        if (blockedEdge) continue
      } else {
        const cover = g.vCover[tx]!
        const yLo = Math.min(py, g.ys[ty]!)
        const yHi = Math.max(py, g.ys[ty]!)
        let blockedEdge = false
        for (const r of cover) {
          if (r.y < yHi - 0.01 && r.y + r.h > yLo + 0.01) {
            blockedEdge = true
            break
          }
        }
        if (blockedEdge) continue
      }
      const len = Math.abs(g.xs[tx]! - px) + Math.abs(g.ys[ty]! - py)
      const bend = nd !== it.dir ? cfg.bendPenalty : 0
      const away = nx * (dstCenter.x - px) + ny * (dstCenter.y - py) < 0 ? cfg.uturnPenalty : 0
      const ng = it.g + len + bend + away
      const nkey = v * 4 + nd
      if (ng < dist[nkey]! - 1e-9) {
        dist[nkey] = ng
        parent[nkey] = key
        bendsArr[nkey] = bendsArr[key]! + (bend > 0 ? 1 : 0)
        heap.push({ f: ng + hFn(v, nd as Dir), g: ng, bends: bendsArr[nkey]!, u: v, dir: nd as Dir })
      }
    }
  }
  if (goalKey < 0 || !goalEnd) return null

  // 回溯节点序列(stub_s → … → stub_t)
  const seq: number[] = []
  let k = goalKey
  while (k >= 0) {
    seq.push(Math.floor(k / 4))
    k = parent[k]!
  }
  seq.reverse()
  const pts = seq.map((u) => ({ x: g.xs[u % W]!, y: g.ys[Math.floor(u / W)]! }))
  const start = starts.find((s) => s.u === seq[0])!
  const full: RoutingPoint[] = [start.port.pt, start.stub, ...pts.slice(1), goalEnd.port.pt]
  const merged = mergeCollinear(full)
  const validate = (pts: RoutingPoint[]): RoutingPoint[] | null => {
    // 量化后再合并一次:取整可能让原本微歪的相邻段变共线,留冗余点
    const cand = mergeCollinear(quantizePath(pts, cfg.quant))
    return pathClear(cand, act) ? cand : null
  }
  if (mode === 'free') {
    // 斜线合法 → 视线拉直出斜线捷径。两个候选取几何代价低者(平手取拉直版,
    // 确定性):拉直原样(端口本就贴边)vs 重贴边版(端点朝新首段方向滑动——
    // 拉直常吃掉引出段,重贴边让出段朝向合理;但 borderPoint 沿边滑动可能
    // 更长,不盲取)。正交模式禁重贴(端口钳位点不在中心射线上,重贴会把
    // 首段扭成斜线,破坏正交契约)
    const pulled = stringPull(merged, act)
    const cost = (pts: RoutingPoint[]): number => {
      let len = 0
      let bends = 0
      for (let i = 0; i < pts.length - 1; i++) {
        len += Math.abs(pts[i + 1]!.x - pts[i]!.x) + Math.abs(pts[i + 1]!.y - pts[i]!.y)
        if (i > 0) {
          const t1x = Math.sign(pts[i]!.x - pts[i - 1]!.x)
          const t1y = Math.sign(pts[i]!.y - pts[i - 1]!.y)
          const t2x = Math.sign(pts[i + 1]!.x - pts[i]!.x)
          const t2y = Math.sign(pts[i + 1]!.y - pts[i]!.y)
          if (t1x !== t2x || t1y !== t2y) bends++
        }
      }
      return len + bends * cfg.bendPenalty
    }
    const plain = validate(pulled)
    const reattached = validate([
      borderPoint(src, pulled[1]!.x, pulled[1]!.y),
      ...pulled.slice(1, -1),
      borderPoint(dst, pulled[pulled.length - 2]!.x, pulled[pulled.length - 2]!.y),
    ])
    const best =
      plain && reattached ? (cost(reattached) < cost(plain) ? reattached : plain) : (plain ?? reattached)
    if (best) return best
  }
  return validate(merged)
}

function mergeCollinear(pts: RoutingPoint[]): RoutingPoint[] {
  if (pts.length < 3) return pts.slice()
  const out: RoutingPoint[] = [pts[0]!]
  for (let i = 1; i < pts.length - 1; i++) {
    const a = out[out.length - 1]!
    const b = pts[i]!
    const c = pts[i + 1]!
    const cross = (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x)
    if (Math.abs(cross) > 1e-9) out.push(b)
  }
  out.push(pts[pts.length - 1]!)
  return out
}

function quantizePath(pts: RoutingPoint[], step: number): RoutingPoint[] {
  return pts.map((p) => ({ x: q(p.x, step), y: q(p.y, step) }))
}

/** V3 视线拉直:中间点带安全边距(12px)的贪心合并,从最远可直视点回缩。 */
function stringPull(pts: RoutingPoint[], act: RoutingRect[]): RoutingPoint[] {
  if (pts.length < 3) return pts.slice()
  const pad = act.map((r) => expand(r, 12))
  const out: RoutingPoint[] = [pts[0]!]
  let i = 0
  while (i < pts.length - 1) {
    let far = i + 1
    for (let j = pts.length - 1; j > i + 1; j--) {
      if (segClear(pts[i]!, pts[j]!, pad)) {
        far = j
        break
      }
    }
    out.push(pts[far]!)
    i = far
  }
  return out
}
