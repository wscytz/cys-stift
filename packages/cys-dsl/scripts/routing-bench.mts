import { performance } from 'node:perf_hooks'
import { parseDsl } from '../src/dsl-parser'
import { sanitizeDslOps } from '../src/dsl-sanitize'
import { solveRelational } from '../src/dsl-relational-solver'
import { toSvg, routeAround } from '../src/to-svg'

// 200 卡 10 行 × 20 列密集网格 + 源/目标在外 + 1 条横穿箭头 + 50 条网格内箭头
const lines: string[] = []
for (let r = 0; r < 10; r++) {
  for (let c = 0; c < 20; c++) lines.push(`[card #c${r}_${c}] @pos(${c * 100},${r * 70}) @size(80,50)`)
}
lines.push('[card #src] @pos(-200,-100) @size(80,50)')
lines.push('[card #dst] @pos(2000,700) @size(80,50)')
lines.push('[arrow #cross] from #src to #dst')
for (let r = 0; r < 10; r++) {
  for (let c = 0; c < 5; c++) lines.push(`[arrow #a${r}_${c}] from #c${r}_${c} to #c${r}_${c + 1}`)
}

const text = lines.join('\n')
const ops = solveRelational(sanitizeDslOps(parseDsl(text)).ops).ops
const cards = ops.filter((o) => o.type === 'card') as Array<{ x: number; y: number; w?: number; h?: number }>
const obstacles = cards.map((o) => ({ x: o.x, y: o.y, w: o.w ?? 240, h: o.h ?? 120 }))

// 单箭头:routeAround 直测(横穿 200 卡)
const t0 = performance.now()
const N = 20
let detours = 0
for (let i = 0; i < N; i++) {
  const d = routeAround({ x: -120, y: -75 }, { x: 2000, y: 725 }, obstacles[200]!, obstacles[201]!, obstacles)
  if (d) detours++
}
const t1 = performance.now()
console.log(`routeAround ×${N} (202 obstacles): ${((t1 - t0) / N).toFixed(1)} ms/call, detour=${detours}/${N}`)

// 全画布渲染(toSvg 总时长,含 51 条箭头走线)
const t2 = performance.now()
const { svg, skipped } = toSvg(ops)
const t3 = performance.now()
console.log(`toSvg whole canvas (202 cards + 51 arrows): ${(t3 - t2).toFixed(1)} ms, svg=${(svg.length / 1024).toFixed(0)}KiB, skipped=${skipped.length}`)
