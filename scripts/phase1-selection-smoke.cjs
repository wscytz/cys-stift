// scripts/phase1-selection-smoke.cjs — 真实冒烟 /dev/canvas-self 的选择 + Delete。
// 运行:先 pnpm --filter web build + 静态服务 :3016,再 node scripts/phase1-selection-smoke.cjs
const puppeteer = require('puppeteer-core')
const fs = require('fs')
const path = require('path')
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const URL = 'http://localhost:3016'
const wait = (ms) => new Promise((r) => setTimeout(r, ms))
const out = path.join(__dirname, '..', 'docs', 'design', 'screenshots', 'phase1-selection-smoke')
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

  // 经 __selfAdapter upsert 两 card(避 AppMenu 偏移用 rect 算点击)
  const rect = await page.evaluate(() => {
    window.__selfAdapter.upsert({ id: 'ca', kind: 'card', x: 200, y: 200, w: 160, h: 100, rotation: 0 })
    window.__selfAdapter.upsert({ id: 'cb', kind: 'card', x: 500, y: 200, w: 160, h: 100, rotation: 0 })
    window.__selfAdapter.setTool('select')
    const r = document.querySelector('canvas').getBoundingClientRect()
    return { left: r.left, top: r.top }
  })

  // 点 ca(中心 200+80=280, 200+50=250)→ 选中 ca
  await page.mouse.click(rect.left + 280, rect.top + 250)
  await wait(200)
  const sel1 = await page.evaluate(() => window.__selfAdapter.getSelectedIds())
  check('click selects the card', sel1.includes('ca'), JSON.stringify(sel1))
  await page.screenshot({ path: path.join(out, 'selected.png') })

  // Delete → ca 消失,cb 还在
  await page.keyboard.press('Delete')
  await wait(200)
  const after = await page.evaluate(() => ({
    ca: !!window.__selfAdapter.getElement('ca'),
    cb: !!window.__selfAdapter.getElement('cb'),
    sel: window.__selfAdapter.getSelectedIds(),
  }))
  check('Delete removes selected card', after.ca === false, JSON.stringify(after))
  check('Delete leaves non-selected card', after.cb === true, JSON.stringify(after))
  check('Delete clears selection', after.sel.length === 0, JSON.stringify(after.sel))

  await browser.close()
  console.log(`\n${fail === 0 ? '✓' : '✗'} ${pass} passed, ${fail} failed`)
  process.exit(fail === 0 ? 0 : 1)
})().catch((e) => { console.error('FATAL', e); process.exit(2) })
