// scripts/phase1-connect-smoke.cjs — 真实冒烟 /dev/canvas-self 的 connect 工具(拖出 arrow)。
// 运行:先 pnpm --filter web build + 静态服务 :3016,再 node scripts/phase1-connect-smoke.cjs
const puppeteer = require('puppeteer-core')
const fs = require('fs')
const path = require('path')
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const URL = 'http://localhost:3016'
const wait = (ms) => new Promise((r) => setTimeout(r, ms))
const out = path.join(__dirname, '..', 'docs', 'design', 'screenshots', 'phase1-connect-smoke')
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

  const rect = await page.evaluate(() => {
    window.__selfAdapter.upsert({ id: 'a', kind: 'card', x: 200, y: 200, w: 160, h: 100, rotation: 0 })
    window.__selfAdapter.upsert({ id: 'b', kind: 'card', x: 600, y: 200, w: 160, h: 100, rotation: 0 })
    window.__selfAdapter.setTool('connect')
    const r = document.querySelector('canvas').getBoundingClientRect()
    return { left: r.left, top: r.top }
  })

  // 从 a 中心(280,250)拖到 b 中心(680,250)
  await page.mouse.move(rect.left + 280, rect.top + 250)
  await page.mouse.down()
  await wait(50)
  await page.mouse.move(rect.left + 680, rect.top + 250)
  await page.mouse.up()
  await wait(200)

  const result = await page.evaluate(() => {
    const a = window.__selfAdapter.getElements().filter((e) => e.kind === 'arrow')
    if (a.length !== 1) return { error: 'arrow count', count: a.length }
    return { from: a[0].from, to: a[0].to }
  })
  check('connect committed 1 arrow a→b', !result.error && result.from === 'a' && result.to === 'b', JSON.stringify(result))
  await page.screenshot({ path: path.join(out, 'connected.png') })

  await browser.close()
  console.log(`\n${fail === 0 ? '✓' : '✗'} ${pass} passed, ${fail} failed`)
  process.exit(fail === 0 ? 0 : 1)
})().catch((e) => { console.error('FATAL', e); process.exit(2) })
