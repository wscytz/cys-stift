// scripts/phase1-freedraw-smoke.cjs — 真实冒烟 /dev/canvas-self 的 freedraw 输入。
// 运行:先 pnpm --filter web build + 静态服务 :3016,再 node scripts/phase1-freedraw-smoke.cjs
const puppeteer = require('puppeteer-core')
const fs = require('fs')
const path = require('path')
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const URL = 'http://localhost:3016'
const wait = (ms) => new Promise((r) => setTimeout(r, ms))
const out = path.join(__dirname, '..', 'docs', 'design', 'screenshots', 'phase1-freedraw-smoke')
fs.mkdirSync(out, { recursive: true })

let pass = 0, fail = 0
const check = (n, ok, d = '') => { ok ? (pass++, console.log(`  ✓ ${n}${d ? ' — ' + d : ''}`)) : (fail++, console.log(`  ✗ ${n}${d ? ' — ' + d : ''}`)) }

;(async () => {
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox', '--disable-gpu'], defaultViewport: { width: 1440, height: 900 } })
  const page = await browser.newPage()
  const errs = []
  page.on('pageerror', (e) => errs.push(e.message))

  await page.goto(URL + '/dev/canvas-self', { waitUntil: 'networkidle0', timeout: 30000 })
  await wait(1500)
  check('page mounts, no pageerror', errs.length === 0, `${errs.length} errors`)

  // 切到 Draw 工具(经暴露的 __selfAdapter,避开 AppMenu 偏移的点按钮命中问题)
  const switched = await page.evaluate(() => {
    const a = window.__selfAdapter
    if (!a) return false
    a.setTool('freedraw')
    return a.getTool() === 'freedraw'
  })
  check('setTool(freedraw) via __selfAdapter', switched)

  // 画一笔:pointerdown/move×3/up。坐标按 canvas getBoundingClientRect 算(避 AppMenu 偏移)。
  const drew = await page.evaluate(() => {
    const canvas = document.querySelector('canvas')
    const a = window.__selfAdapter
    if (!canvas || !a) return { error: 'no canvas/adapter' }
    const rect = canvas.getBoundingClientRect()
    const ev = (type, px, py) => new PointerEvent(type, { pointerId: 1, pointerType: 'mouse', bubbles: true, clientX: rect.left + px, clientY: rect.top + py })
    canvas.dispatchEvent(ev('pointerdown', 100, 100))
    canvas.dispatchEvent(ev('pointermove', 150, 120))
    canvas.dispatchEvent(ev('pointermove', 200, 100))
    canvas.dispatchEvent(ev('pointerup', 200, 100))
    const f = a.getElements().filter((e) => e.kind === 'freedraw')
    return f.length === 1
      ? { ok: true, points: f[0].meta?.points?.length, bbox: { x: f[0].x, y: f[0].y, w: f[0].w, h: f[0].h } }
      : { ok: false, count: f.length }
  })
  check('drew 1 freedraw element with 3 points + bbox', drew.ok && drew.points === 3, JSON.stringify(drew))

  await page.screenshot({ path: path.join(out, 'freedraw-drawn.png') })
  await browser.close()
  console.log(`\n${fail === 0 ? '✓' : '✗'} ${pass} passed, ${fail} failed`)
  process.exit(fail === 0 ? 0 : 1)
})().catch((e) => { console.error('FATAL', e); process.exit(2) })
