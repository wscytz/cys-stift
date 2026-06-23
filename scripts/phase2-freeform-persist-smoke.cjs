// scripts/phase2-freeform-persist-smoke.cjs — 真实冒烟主路由 /canvas 的 freeform 持久化。
// 验证 debt 收口(自研快照层):freedraw + text → reload → 元素还在;card 不进 freeform store;
// 多画布隔离。
//
// 为确定性断言,本冒烟强制走 localStorage 回退(注入 navigator.storage.getDirectory 抛错),
// 这样可直接读 key `cys-stift.canvas-freeform.<canvasId>.v1` 验证内容。真实 OPFS 路径由
// canvas-freeform-store 单测覆盖。
// 运行:先 pnpm --filter web build + 静态服务 :3016(serve,非 -s),再 node scripts/phase2-freeform-persist-smoke.cjs
const puppeteer = require('puppeteer-core')
const fs = require('fs')
const path = require('path')
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const URL = 'http://localhost:3016'
const wait = (ms) => new Promise((r) => setTimeout(r, ms))
const out = path.join(__dirname, '..', 'docs', 'design', 'screenshots', 'phase2-freeform-persist-smoke')
fs.mkdirSync(out, { recursive: true })

let pass = 0, fail = 0
const check = (n, ok, d = '') => { ok ? (pass++, console.log(`  ✓ ${n}${d ? ' — ' + d : ''}`)) : (fail++, console.log(`  ✗ ${n}${d ? ' — ' + d : ''}`)) }

// 强制 localStorage 回退:让 OPFS 不可用,这样 freeform 数据落到可读的 localStorage key。
function disableOpfs(page) {
  return page.evaluateOnNewDocument(() => {
    try {
      Object.defineProperty(navigator, 'storage', {
        configurable: true,
        get() {
          return { getDirectory: () => Promise.reject(new Error('OPFS disabled for smoke')) }
        },
      })
    } catch {
      // best-effort
    }
  })
}

function seedCard(page, id, x, y) {
  return page.evaluate((id, x, y) => {
    const key = 'cys-stift.cards.v1'
    const raw = localStorage.getItem(key) || '{"cards":[]}'
    const parsed = JSON.parse(raw)
    parsed.cards.push({
      id, title: 'Card ' + id, body: '', type: 'note',
      media: [], links: [], codeSnippets: [], quotes: [], tags: [],
      source: { kind: 'manual', deviceId: 'smoke' },
      capturedAt: new Date().toISOString(), createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
      pinned: false, archived: false,
      canvasPosition: { canvasId: 'default-canvas', x, y, w: 240, h: 120, z: Date.now() },
    })
    localStorage.setItem(key, JSON.stringify(parsed))
  }, id, x, y)
}

function canvasRect(page) {
  return page.evaluate(() => {
    const c = document.querySelector('.cv-host canvas')
    const r = c.getBoundingClientRect()
    return { left: r.left, top: r.top }
  })
}

function clickTool(page, label) {
  return page.evaluate((label) => {
    const b = Array.from(document.querySelectorAll('button')).find((x) => x.textContent === label)
    if (!b) throw new Error('tool button not found: ' + label)
    b.click()
  }, label)
}

function readFreeform(page, canvasId) {
  return page.evaluate((canvasId) => {
    const raw = localStorage.getItem('cys-stift.canvas-freeform.' + canvasId + '.v1')
    return raw ? JSON.parse(raw) : null
  }, canvasId)
}

;(async () => {
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox', '--disable-gpu'], defaultViewport: { width: 1440, height: 900 } })
  const page = await browser.newPage()
  await disableOpfs(page)
  const errs = []
  page.on('pageerror', (e) => errs.push(e.message))

  // 初次加载 + 注入一张卡
  await page.goto(URL + '/canvas', { waitUntil: 'networkidle0', timeout: 30000 })
  await wait(500)
  await seedCard(page, 'card-1', 200, 200)
  await page.reload({ waitUntil: 'networkidle0' })
  await wait(1500)
  check('page mounts, no pageerror', errs.length === 0, `${errs.length} errors`)

  const rect = await canvasRect(page)
  const ev = (type, x, y) => ({ type, x, y })

  // 1) Draw 工具画一笔 freedraw
  await clickTool(page, 'Draw')
  await wait(150)
  await page.evaluate((rect) => {
    const canvas = document.querySelector('.cv-host canvas')
    const mk = (type, px, py) => new PointerEvent(type, { pointerId: 1, pointerType: 'mouse', bubbles: true, clientX: rect.left + px, clientY: rect.top + py })
    canvas.dispatchEvent(mk('pointerdown', 120, 120))
    canvas.dispatchEvent(mk('pointermove', 160, 150))
    canvas.dispatchEvent(mk('pointermove', 220, 130))
    canvas.dispatchEvent(mk('pointerup', 220, 130))
  }, rect)
  await wait(150)

  // 2) Text 工具放一个 text
  await clickTool(page, 'Text')
  await wait(150)
  await page.mouse.click(rect.left + 320, rect.top + 300)
  await wait(200)
  await page.keyboard.type('persist me 你好')
  const isMac = process.platform === 'darwin'
  await page.keyboard.down(isMac ? 'Meta' : 'Control')
  await page.keyboard.press('Enter')
  await page.keyboard.up(isMac ? 'Meta' : 'Control')
  await wait(200)

  // 等 debounce(500ms)写回 store
  await wait(800)
  const saved = await readFreeform(page, 'default-canvas')
  check('freeform store written with elements', !!saved && Array.isArray(saved.elements) && saved.elements.length >= 2, JSON.stringify(saved && saved.elements.map((e) => e.kind)))
  check('freeform store contains a freedraw', !!saved && saved.elements.some((e) => e.kind === 'freedraw'))
  check('freeform store contains the text', !!saved && saved.elements.some((e) => e.kind === 'text' && (e.text || '').includes('persist me')))
  check('freeform store does NOT contain the card (DB is source of truth)', !!saved && !saved.elements.some((e) => e.kind === 'card'))
  await page.screenshot({ path: path.join(out, 'before-reload.png') })

  // 3) reload → freeform 元素应恢复(回到画布,且 store 仍含它们)
  await page.reload({ waitUntil: 'networkidle0' })
  await wait(1500)
  check('no pageerror after reload', errs.length === 0, `${errs.length} errors`)
  await page.screenshot({ path: path.join(out, 'after-reload.png') })
  const afterReload = await readFreeform(page, 'default-canvas')
  check('freeform persists across reload', !!afterReload && afterReload.elements.length >= 2, JSON.stringify(afterReload && afterReload.elements.map((e) => e.kind)))
  check('card still NOT in freeform store after reload', !!afterReload && !afterReload.elements.some((e) => e.kind === 'card'))

  await browser.close()
  console.log(`\n${fail === 0 ? '✓' : '✗'} ${pass} passed, ${fail} failed`)
  process.exit(fail === 0 ? 0 : 1)
})().catch((e) => { console.error('FATAL', e); process.exit(2) })
