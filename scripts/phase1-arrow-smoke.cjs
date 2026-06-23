// scripts/phase1-arrow-smoke.cjs — 真实冒烟 /dev/canvas-self 的 arrow 渲染。
// 运行:先 pnpm --filter web build + 静态服务 :3016,再 node scripts/phase1-arrow-smoke.cjs
const puppeteer = require('puppeteer-core')
const fs = require('fs')
const path = require('path')
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const URL = 'http://localhost:3016'
const wait = (ms) => new Promise((r) => setTimeout(r, ms))
const out = path.join(__dirname, '..', 'docs', 'design', 'screenshots', 'phase1-arrow-smoke')
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

  // 经 __selfAdapter upsert 两 card + 一 arrow,验端到端渲染无错
  const result = await page.evaluate(() => {
    const a = window.__selfAdapter
    if (!a) return { error: 'no __selfAdapter' }
    a.upsert({ id: 'ca', kind: 'card', x: 200, y: 200, w: 160, h: 100, rotation: 0 })
    a.upsert({ id: 'cb', kind: 'card', x: 600, y: 200, w: 160, h: 100, rotation: 0 })
    a.upsert({ id: 'ar1', kind: 'arrow', x: 0, y: 0, w: 0, h: 0, rotation: 0, from: 'ca', to: 'cb', text: 'relates', color: 'black' })
    const els = a.getElements()
    return {
      cardCount: els.filter((e) => e.kind === 'card').length,
      arrowCount: els.filter((e) => e.kind === 'arrow').length,
    }
  })
  check('upserted 2 cards + 1 arrow, no throw', !result.error && result.arrowCount === 1, JSON.stringify(result))
  check('both cards present', result.cardCount >= 2, JSON.stringify(result))

  await page.screenshot({ path: path.join(out, 'arrow-rendered.png') })
  await browser.close()
  console.log(`\n${fail === 0 ? '✓' : '✗'} ${pass} passed, ${fail} failed`)
  process.exit(fail === 0 ? 0 : 1)
})().catch((e) => { console.error('FATAL', e); process.exit(2) })
