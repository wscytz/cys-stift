// scripts/phase2-sub2-smoke.cjs — 冒烟主路由 /canvas 卡片完整渲染 + toolbar。
// 运行:先 pnpm --filter web build + 静态服务 :3016,再 node scripts/phase2-sub2-smoke.cjs
const puppeteer = require('puppeteer-core')
const fs = require('fs')
const path = require('path')
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const URL = 'http://localhost:3016'
const wait = (ms) => new Promise((r) => setTimeout(r, ms))
const out = path.join(__dirname, '..', 'docs', 'design', 'screenshots', 'phase2-sub2-smoke')
fs.mkdirSync(out, { recursive: true })

let pass = 0, fail = 0
const check = (n, ok, d = '') => { ok ? (pass++, console.log(`  ✓ ${n}${d ? ' — ' + d : ''}`)) : (fail++, console.log(`  ✗ ${n}${d ? ' — ' + d : ''}`)) }

;(async () => {
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox', '--disable-gpu'], defaultViewport: { width: 1440, height: 900 } })
  const page = await browser.newPage()
  const errs = []
  page.on('pageerror', (e) => errs.push(e.message))

  // 注入一张带 body + pinned 的卡
  await page.goto(URL + '/canvas', { waitUntil: 'networkidle0' })
  await page.evaluate(() => {
    const key = 'cys-stift.cards.v1'
    const raw = localStorage.getItem(key) || '{"cards":[]}'
    const parsed = JSON.parse(raw)
    parsed.cards.push({
      id: 'c1', title: 'Full Card', body: 'This is the body preview text', type: 'note',
      media: [], links: [], codeSnippets: [], quotes: [], tags: [],
      source: { kind: 'manual', deviceId: 's' }, capturedAt: new Date().toISOString(),
      createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
      pinned: true, archived: false,
      canvasPosition: { canvasId: 'default-canvas', x: 200, y: 200, w: 240, h: 120, z: Date.now() },
    })
    localStorage.setItem(key, JSON.stringify(parsed))
  })
  await page.reload({ waitUntil: 'networkidle0' })
  await wait(1500)
  check('page mounts, no pageerror', errs.length === 0, `${errs.length} errors`)

  // 卡片渲染:截图(视觉验类型标/title/body/pinned)。无 OCR,只验 canvas 像素非空 + 卡区域有内容。
  await page.screenshot({ path: path.join(out, 'full-card.png') })
  const hasContent = await page.evaluate(() => {
    const c = document.querySelector('.cv-host canvas')
    if (!c) return false
    // 卡 at (200,200) 240×120;读该区域像素,非全白 = 有渲染
    const ctx = c.getContext('2d')
    if (!ctx) return false
    const data = ctx.getImageData(250, 250, 100, 60).data
    let nonWhite = 0
    for (let i = 0; i < data.length; i += 4) {
      if (data[i] < 250 || data[i + 1] < 250 || data[i + 2] < 250) nonWhite++
    }
    return nonWhite > 50
  })
  check('card rendered with content (non-white pixels in card area)', hasContent)

  // toolbar 工具按钮存在
  const tools = await page.evaluate(() => {
    const btns = Array.from(document.querySelectorAll('button.tb-snap'))
    return btns.map((b) => b.textContent?.trim()).filter(Boolean)
  })
  check('toolbar has 4 tool buttons', tools.length >= 4, JSON.stringify(tools))

  await browser.close()
  console.log(`\n${fail === 0 ? '✓' : '✗'} ${pass} passed, ${fail} failed`)
  process.exit(fail === 0 ? 0 : 1)
})().catch((e) => { console.error('FATAL', e); process.exit(2) })
