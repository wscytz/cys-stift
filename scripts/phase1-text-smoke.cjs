// scripts/phase1-text-smoke.cjs — 真实冒烟 /dev/canvas-self 的文本编辑(含中文)。
// 运行:先 pnpm --filter web build + 静态服务 :3016,再 node scripts/phase1-text-smoke.cjs
const puppeteer = require('puppeteer-core')
const fs = require('fs')
const path = require('path')
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const URL = 'http://localhost:3016'
const wait = (ms) => new Promise((r) => setTimeout(r, ms))
const out = path.join(__dirname, '..', 'docs', 'design', 'screenshots', 'phase1-text-smoke')
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

  // 切到 Text 工具 —— 点 Text 按钮(而非 window.__selfAdapter.setTool):文本编辑走 React
  // 的 onCanvasClick(读 React tool state),只改 adapter tool 不会同步 React state → textarea 不会起。
  // 按钮同时 setState('text') + adapter.setTool('text'),与真实 UI 流程一致。
  await page.evaluate(() => {
    const t = Array.from(document.querySelectorAll('button')).find((b) => b.textContent === 'Text')
    if (!t) throw new Error('Text button not found')
    t.click()
  })
  await wait(200)

  // 读 canvas rect 算点击坐标(避 AppMenu 偏移),点击放 textarea
  const rect = await page.evaluate(() => {
    const c = document.querySelector('canvas')
    const r = c.getBoundingClientRect()
    return { left: r.left, top: r.top }
  })
  await page.mouse.click(rect.left + 300, rect.top + 300)
  await wait(200)
  const hasTextarea = await page.evaluate(() => !!document.querySelector('textarea'))
  check('textarea mounted on text-mode click', hasTextarea)

  // 输入英文 + 中文字符 + 换行(puppeteer keyboard.type 直接发字符;IME 组合态本身由 textEditKeyAction 单测覆盖)
  await page.keyboard.type('Hello 你好')
  await page.keyboard.down('Shift')
  await page.keyboard.press('Enter')
  await page.keyboard.up('Shift')
  await page.keyboard.type('第二行')
  await wait(100)

  // Ctrl+Enter commit(mac 用 Meta)
  const isMac = process.platform === 'darwin'
  await page.keyboard.down(isMac ? 'Meta' : 'Control')
  await page.keyboard.press('Enter')
  await page.keyboard.up(isMac ? 'Meta' : 'Control')
  await wait(300)

  // 验:text 元素入 host + 文本含中英文 + 多行
  const result = await page.evaluate(() => {
    const a = window.__selfAdapter
    const texts = a.getElements().filter((e) => e.kind === 'text')
    if (texts.length !== 1) return { error: 'text count != 1', count: texts.length }
    const t = texts[0]
    return { text: t.text, w: t.w, h: t.h }
  })
  check('1 text element committed', !result.error, JSON.stringify(result))
  check('text has ascii + CJK + 2 lines', !result.error && result.text.includes('Hello') && result.text.includes('第二行') && result.text.includes('\n'), JSON.stringify(result))
  check('text measured w/h (non-zero)', !result.error && result.w > 0 && result.h >= 36, JSON.stringify(result))

  await page.screenshot({ path: path.join(out, 'text-committed.png') })
  await browser.close()
  console.log(`\n${fail === 0 ? '✓' : '✗'} ${pass} passed, ${fail} failed`)
  process.exit(fail === 0 ? 0 : 1)
})().catch((e) => { console.error('FATAL', e); process.exit(2) })
