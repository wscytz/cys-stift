// scripts/phase1-keyboard-smoke.cjs — 真实冒烟 /dev/canvas-self 的键盘(微移 + undo)。
// 运行:先 pnpm --filter web build + 静态服务 :3016,再 node scripts/phase1-keyboard-smoke.cjs
const puppeteer = require('puppeteer-core')
const fs = require('fs')
const path = require('path')
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const URL = 'http://localhost:3016'
const wait = (ms) => new Promise((r) => setTimeout(r, ms))
const out = path.join(__dirname, '..', 'docs', 'design', 'screenshots', 'phase1-keyboard-smoke')
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

  // 放 card + 选中
  const rect = await page.evaluate(() => {
    window.__selfAdapter.upsert({ id: 'ca', kind: 'card', x: 300, y: 300, w: 160, h: 100, rotation: 0 })
    window.__selfAdapter.setTool('select')
    const r = document.querySelector('canvas').getBoundingClientRect()
    return { left: r.left, top: r.top }
  })
  await page.mouse.click(rect.left + 380, rect.top + 350) // 点 card 中心选中
  await wait(200)

  // 方向键右 ×3 → x +3
  await page.keyboard.press('ArrowRight')
  await page.keyboard.press('ArrowRight')
  await page.keyboard.press('ArrowRight')
  await wait(200)
  let x1 = await page.evaluate(() => window.__selfAdapter.getElement('ca').x)
  check('arrow keys nudge +3', x1 === 303, `x=${x1}`)

  // Ctrl/Meta+Z undo ×3 → 撤 3 次微移,x 回 300(实现:每次微移=1 undo 条目)
  const isMac = process.platform === 'darwin'
  for (let i = 0; i < 3; i++) {
    await page.keyboard.down(isMac ? 'Meta' : 'Control')
    await page.keyboard.press('z')
    await page.keyboard.up(isMac ? 'Meta' : 'Control')
  }
  await wait(200)
  let x2 = await page.evaluate(() => window.__selfAdapter.getElement('ca').x)
  check('Ctrl+Z ×3 undo nudges back to 300', x2 === 300, `x=${x2}`)

  await page.screenshot({ path: path.join(out, 'keyboard.png') })
  await browser.close()
  console.log(`\n${fail === 0 ? '✓' : '✗'} ${pass} passed, ${fail} failed`)
  process.exit(fail === 0 ? 0 : 1)
})().catch((e) => { console.error('FATAL', e); process.exit(2) })
