// scripts/phase1-resize-smoke.cjs — 真实冒烟 /dev/canvas-self 的 resize handle。
// 运行:先 pnpm --filter web build + 静态服务 :3016,再 node scripts/phase1-resize-smoke.cjs
const puppeteer = require('puppeteer-core')
const fs = require('fs')
const path = require('path')
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const URL = 'http://localhost:3016'
const wait = (ms) => new Promise((r) => setTimeout(r, ms))
const out = path.join(__dirname, '..', 'docs', 'design', 'screenshots', 'phase1-resize-smoke')
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

  // 放一张 card + 选中它
  const rect = await page.evaluate(() => {
    window.__selfAdapter.upsert({ id: 'ca', kind: 'card', x: 300, y: 300, w: 200, h: 120, rotation: 0 })
    window.__selfAdapter.setTool('select')
    window.__selfAdapter.setSelectedIds(['ca'])
    const r = document.querySelector('canvas').getBoundingClientRect()
    return { left: r.left, top: r.top }
  })

  // SE 角在页 (300+200, 300+120) = (500,420);相机 pan0/zoom1 → 屏幕 +rect.left/top
  // down 在 SE → 进 resize;move 到 (550,470) → se: w=550-300=250, h=470-300=170
  await page.mouse.move(rect.left + 500, rect.top + 420)
  await page.mouse.down()
  await wait(50)
  await page.mouse.move(rect.left + 550, rect.top + 470)
  await page.mouse.up()
  await wait(200)

  const after = await page.evaluate(() => {
    const c = window.__selfAdapter.getElement('ca')
    return c ? { w: c.w, h: c.h } : null
  })
  check('drag SE handle resized the card (w 200→250, h 120→170)', after && after.w === 250 && after.h === 170, JSON.stringify(after))
  await page.screenshot({ path: path.join(out, 'resized.png') })

  await browser.close()
  console.log(`\n${fail === 0 ? '✓' : '✗'} ${pass} passed, ${fail} failed`)
  process.exit(fail === 0 ? 0 : 1)
})().catch((e) => { console.error('FATAL', e); process.exit(2) })
