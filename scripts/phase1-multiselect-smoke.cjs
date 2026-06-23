// scripts/phase1-multiselect-smoke.cjs — 真实冒烟 /dev/canvas-self 的多选 + 组移动。
// 运行:先 pnpm --filter web build + 静态服务 :3016,再 node scripts/phase1-multiselect-smoke.cjs
const puppeteer = require('puppeteer-core')
const fs = require('fs')
const path = require('path')
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const URL = 'http://localhost:3016'
const wait = (ms) => new Promise((r) => setTimeout(r, ms))
const out = path.join(__dirname, '..', 'docs', 'design', 'screenshots', 'phase1-multiselect-smoke')
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
    window.__selfAdapter.upsert({ id: 'a', kind: 'card', x: 200, y: 200, w: 100, h: 60, rotation: 0 })
    window.__selfAdapter.upsert({ id: 'b', kind: 'card', x: 400, y: 200, w: 100, h: 60, rotation: 0 })
    window.__selfAdapter.setTool('select')
    const r = document.querySelector('canvas').getBoundingClientRect()
    return { left: r.left, top: r.top }
  })

  // shift+click a,再 shift+click b → 选两个
  await page.keyboard.down('Shift')
  await page.mouse.click(rect.left + 250, rect.top + 230) // a 中心
  await wait(100)
  await page.mouse.click(rect.left + 450, rect.top + 230) // b 中心
  await page.keyboard.up('Shift')
  await wait(200)
  const sel = await page.evaluate(() => window.__selfAdapter.getSelectedIds().sort())
  check('shift-click selects both cards', JSON.stringify(sel) === '["a","b"]', JSON.stringify(sel))

  // 拖 a(已选中)→ 全组 +30,+20
  await page.mouse.move(rect.left + 250, rect.top + 230)
  await page.mouse.down()
  await wait(50)
  await page.mouse.move(rect.left + 280, rect.top + 250)
  await page.mouse.up()
  await wait(200)
  const after = await page.evaluate(() => {
    const a = window.__selfAdapter.getElement('a')
    const b = window.__selfAdapter.getElement('b')
    return { ax: a.x, ay: a.y, bx: b.x, by: b.y }
  })
  check('group move: both moved +30,+20', after.ax === 230 && after.ay === 220 && after.bx === 430 && after.by === 220, JSON.stringify(after))
  await page.screenshot({ path: path.join(out, 'multiselect.png') })

  await browser.close()
  console.log(`\n${fail === 0 ? '✓' : '✗'} ${pass} passed, ${fail} failed`)
  process.exit(fail === 0 ? 0 : 1)
})().catch((e) => { console.error('FATAL', e); process.exit(2) })
