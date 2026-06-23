// scripts/phase2-text-main-smoke.cjs — 真实冒烟主路由 /canvas 的文本编辑接线。
// 验证 debt 收口:Text 工具点击 → 浮动 textarea → 输入 → Ctrl+Enter 提交(textarea 卸载)
// + 切换工具取消(textarea 卸载)。元素创建内部逻辑与 /dev 版同源,已由
// phase1-text-smoke + self-built-text 单测覆盖;此处只验主路由的 UI 接线路径。
// 运行:先 pnpm --filter web build + 静态服务 :3016(serve,非 -s),再 node scripts/phase2-text-main-smoke.cjs
const puppeteer = require('puppeteer-core')
const fs = require('fs')
const path = require('path')
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const URL = 'http://localhost:3016'
const wait = (ms) => new Promise((r) => setTimeout(r, ms))
const out = path.join(__dirname, '..', 'docs', 'design', 'screenshots', 'phase2-text-main-smoke')
fs.mkdirSync(out, { recursive: true })

let pass = 0, fail = 0
const check = (n, ok, d = '') => { ok ? (pass++, console.log(`  ✓ ${n}${d ? ' — ' + d : ''}`)) : (fail++, console.log(`  ✗ ${n}${d ? ' — ' + d : ''}`)) }

// 选主路由 toolbar 上的工具按钮(文案 Select/Draw/Text/Connect,见 page.tsx)。
function clickTool(page, label) {
  return page.evaluate((label) => {
    const b = Array.from(document.querySelectorAll('button')).find((x) => x.textContent === label)
    if (!b) throw new Error(`tool button not found: ${label}`)
    b.click()
  }, label)
}

;(async () => {
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox', '--disable-gpu'], defaultViewport: { width: 1440, height: 900 } })
  const page = await browser.newPage()
  const errs = []
  page.on('pageerror', (e) => errs.push(e.message))

  await page.goto(URL + '/canvas', { waitUntil: 'networkidle0', timeout: 30000 })
  await wait(1500)
  check('page mounts, no pageerror', errs.length === 0, `${errs.length} errors`)

  const canvasRect = await page.evaluate(() => {
    const c = document.querySelector('.cv-host canvas')
    const r = c.getBoundingClientRect()
    return { left: r.left, top: r.top }
  })

  // 1) Text 工具 → 点击 canvas → textarea 应出现
  await clickTool(page, 'Text')
  await wait(150)
  await page.mouse.click(canvasRect.left + 320, canvasRect.top + 280)
  await wait(200)
  let hasTextarea = await page.evaluate(() => !!document.querySelector('textarea'))
  check('Text-mode click mounts textarea on main route', hasTextarea)

  // 2) 输入 ascii + CJK + 换行 → Ctrl/Cmd+Enter 提交 → textarea 卸载
  await page.keyboard.type('主路由 text wiring')
  await page.keyboard.down('Shift'); await page.keyboard.press('Enter'); await page.keyboard.up('Shift')
  await page.keyboard.type('第二行')
  await wait(100)
  const isMac = process.platform === 'darwin'
  await page.keyboard.down(isMac ? 'Meta' : 'Control')
  await page.keyboard.press('Enter')
  await page.keyboard.up(isMac ? 'Meta' : 'Control')
  await wait(300)
  hasTextarea = await page.evaluate(() => !!document.querySelector('textarea'))
  check('Ctrl/Cmd+Enter commits and unmounts textarea', !hasTextarea)
  check('no pageerror through commit', errs.length === 0, `${errs.length} errors`)
  await page.screenshot({ path: path.join(out, 'text-committed.png') })

  // 3) 再开一个 textarea → 切到 Select 工具 → textarea 应被取消卸载
  await page.mouse.click(canvasRect.left + 200, canvasRect.top + 200)
  await wait(200)
  hasTextarea = await page.evaluate(() => !!document.querySelector('textarea'))
  check('second Text-mode click reopens textarea', hasTextarea)
  await clickTool(page, 'Select')
  await wait(200)
  hasTextarea = await page.evaluate(() => !!document.querySelector('textarea'))
  check('switching to Select tool dismisses textarea', !hasTextarea)
  check('no pageerror through tool switch', errs.length === 0, `${errs.length} errors`)

  await browser.close()
  console.log(`\n${fail === 0 ? '✓' : '✗'} ${pass} passed, ${fail} failed`)
  process.exit(fail === 0 ? 0 : 1)
})().catch((e) => { console.error('FATAL', e); process.exit(2) })
