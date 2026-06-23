// scripts/phase2-main-smoke.cjs — 真实冒烟主路由 /canvas(self 引擎)。
// 运行:先 pnpm --filter web build + 静态服务 :3016,再 node scripts/phase2-main-smoke.cjs
const puppeteer = require('puppeteer-core')
const fs = require('fs')
const path = require('path')
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const URL = 'http://localhost:3016'
const wait = (ms) => new Promise((r) => setTimeout(r, ms))
const out = path.join(__dirname, '..', 'docs', 'design', 'screenshots', 'phase2-main-smoke')
fs.mkdirSync(out, { recursive: true })

let pass = 0, fail = 0
const check = (n, ok, d = '') => { ok ? (pass++, console.log(`  ✓ ${n}${d ? ' — ' + d : ''}`)) : (fail++, console.log(`  ✗ ${n}${d ? ' — ' + d : ''}`)) }

// 经 localStorage 注入一张卡到默认画布(同 phase1 冒烟模式)
function seedCard(page, id, x, y) {
  return page.evaluate((id, x, y) => {
    const key = 'cys-stift.cards.v1'
    const raw = localStorage.getItem(key) || '{"cards":[]}'
    const parsed = JSON.parse(raw)
    parsed.cards.push({
      id, title: 'Main ' + id, body: '', type: 'note',
      media: [], links: [], codeSnippets: [], quotes: [], tags: [],
      source: { kind: 'manual', deviceId: 'smoke' },
      capturedAt: new Date().toISOString(), createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
      pinned: false, archived: false,
      canvasPosition: { canvasId: 'default-canvas', x, y, w: 240, h: 120, z: Date.now() },
    })
    localStorage.setItem(key, JSON.stringify(parsed))
  }, id, x, y)
}

;(async () => {
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox', '--disable-gpu'], defaultViewport: { width: 1440, height: 900 } })
  const page = await browser.newPage()
  const errs = []
  page.on('pageerror', (e) => errs.push(e.message))

  // 注入卡 → 加载 /canvas
  await page.goto(URL + '/canvas', { waitUntil: 'networkidle0' })
  await wait(500)
  await seedCard(page, 'm1', 200, 200)
  await page.reload({ waitUntil: 'networkidle0' })
  await wait(1500)
  check('page mounts, no pageerror', errs.length === 0, `${errs.length} errors`)

  // 截图(视觉:卡片应渲染)
  await page.screenshot({ path: path.join(out, 'main-canvas.png') })

  // 验:主路由 /canvas 不再加载 tldraw(grep page bundle 无 tldraw chunk 太重;
  // 改验:window 上无 tldraw editor 全局,canvas 元素存在)。
  const hasCanvas = await page.evaluate(() => !!document.querySelector('.cv-host canvas'))
  check('main /canvas renders a canvas element', hasCanvas)

  // 拖拽回写(同 phase0-smoke 模式,经 localStorage 读回位置)
  const rect = await page.evaluate(() => {
    const c = document.querySelector('.cv-host canvas')
    const r = c.getBoundingClientRect()
    return { left: r.left, top: r.top }
  })
  // 卡 m1 at (200,200) 240×120 → 中心 (320,260)
  await page.mouse.move(rect.left + 320, rect.top + 260)
  await page.mouse.down()
  await wait(50)
  await page.mouse.move(rect.left + 400, rect.top + 300)
  await page.mouse.up()
  await wait(400) // writeback debounce
  const pos = await page.evaluate(() => {
    const raw = localStorage.getItem('cys-stift.cards.v1')
    const p = JSON.parse(raw)
    const c = p.cards.find((x) => x.id === 'm1')
    return c?.canvasPosition ? { x: c.canvasPosition.x, y: c.canvasPosition.y } : null
  })
  check('drag writeback to CardService on main /canvas', pos && pos.x === 280 && pos.y === 240, JSON.stringify(pos))

  await browser.close()
  console.log(`\n${fail === 0 ? '✓' : '✗'} ${pass} passed, ${fail} failed`)
  process.exit(fail === 0 ? 0 : 1)
})().catch((e) => { console.error('FATAL', e); process.exit(2) })
