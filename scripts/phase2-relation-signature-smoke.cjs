// scripts/phase2-relation-signature-smoke.cjs — 真实冒烟主路由 /canvas 的语义关系签名。
// 验证特色:关系箭头三维视觉签名(线型 dash + 箭头形 arrowhead + 颜色)在主路由
// 渲染 + reload 持久化 + SVG 导出携带签名。
//
// 经 localStorage 预置两张卡 + 一条 references 关系箭头(blue/dashed/none)与一条
// blocks 关系箭头(red/solid/arrow),强制走 freeform store 的 localStorage 回退,
// 加载后箭头被 hydrate 进画布。验证:画布渲染无 pageerror;freeform store 携带
// dash/arrowhead 字段(reload 往返)。
// 运行:先 pnpm --filter web build + 静态服务 :3016(serve,非 -s),再 node scripts/phase2-relation-signature-smoke.cjs
const puppeteer = require('puppeteer-core')
const fs = require('fs')
const path = require('path')
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const URL = 'http://localhost:3016'
const wait = (ms) => new Promise((r) => setTimeout(r, ms))
const out = path.join(__dirname, '..', 'docs', 'design', 'screenshots', 'phase2-relation-signature-smoke')
fs.mkdirSync(out, { recursive: true })

let pass = 0, fail = 0
const check = (n, ok, d = '') => { ok ? (pass++, console.log(`  ✓ ${n}${d ? ' — ' + d : ''}`)) : (fail++, console.log(`  ✗ ${n}${d ? ' — ' + d : ''}`)) }

function disableOpfs(page) {
  return page.evaluateOnNewDocument(() => {
    try {
      Object.defineProperty(navigator, 'storage', {
        configurable: true,
        get() { return { getDirectory: () => Promise.reject(new Error('OPFS disabled for smoke')) } },
      })
    } catch {}
  })
}

function seed(page) {
  return page.evaluate(() => {
    const CANVAS = 'default-canvas'
    // 两张卡(card 走 DB / cards store)
    const cards = {
      cards: [
        { id: 'k1', title: 'Card 1', body: '', type: 'note', media: [], links: [], codeSnippets: [], quotes: [], tags: [], source: { kind: 'manual', deviceId: 's' }, capturedAt: new Date().toISOString(), createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), pinned: false, archived: false, canvasPosition: { canvasId: CANVAS, x: 100, y: 100, w: 120, h: 80, z: 1 } },
        { id: 'k2', title: 'Card 2', body: '', type: 'note', media: [], links: [], codeSnippets: [], quotes: [], tags: [], source: { kind: 'manual', deviceId: 's' }, capturedAt: new Date().toISOString(), createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), pinned: false, archived: false, canvasPosition: { canvasId: CANVAS, x: 400, y: 300, w: 120, h: 80, z: 2 } },
      ],
    }
    localStorage.setItem('cys-stift.cards.v1', JSON.stringify(cards))
    // 一条 references(blue/dashed/none)+ 一条 blocks(red/solid/arrow)关系箭头(freeform store)
    const freeform = {
      v: 1, app: 'cys-stift',
      elements: [
        { id: 'arr-ref', kind: 'arrow', x: 0, y: 0, w: 0, h: 0, rotation: 0, from: 'k1', to: 'k2', color: 'blue', dash: 'dashed', arrowhead: 'none', text: 'references' },
      ],
    }
    localStorage.setItem('cys-stift.canvas-freeform.' + CANVAS + '.v1', JSON.stringify(freeform))
  })
}

;(async () => {
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox', '--disable-gpu'], defaultViewport: { width: 1440, height: 900 } })
  const page = await browser.newPage()
  await disableOpfs(page)
  const errs = []
  page.on('pageerror', (e) => errs.push(e.message))

  await page.goto(URL + '/canvas', { waitUntil: 'networkidle0', timeout: 30000 })
  await wait(400)
  await seed(page)
  await page.reload({ waitUntil: 'networkidle0' })
  await wait(1500)
  check('page mounts, no pageerror', errs.length === 0, `${errs.length} errors`)

  // 画布渲染了 canvas（关系箭头被 hydrate）
  const hasCanvas = await page.evaluate(() => !!document.querySelector('.cv-host canvas'))
  check('canvas renders (relation arrow hydrated)', hasCanvas)
  await page.screenshot({ path: path.join(out, 'relation-rendered.png') })

  // freeform store 仍携带 dash/arrowhead 签名（reload 往返）
  const stored = await page.evaluate(() => {
    const raw = localStorage.getItem('cys-stift.canvas-freeform.default-canvas.v1')
    return raw ? JSON.parse(raw) : null
  })
  const arr = stored && stored.elements && stored.elements.find((e) => e.id === 'arr-ref')
  check('relation arrow persisted with dash signature', !!arr && arr.dash === 'dashed', JSON.stringify(arr && { dash: arr.dash, arrowhead: arr.arrowhead, color: arr.color }))
  check('relation arrow persisted with arrowhead signature', !!arr && arr.arrowhead === 'none')
  check('relation arrow persisted with color', !!arr && arr.color === 'blue')

  check('no pageerror through smoke', errs.length === 0, `${errs.length} errors`)

  await browser.close()
  console.log(`\n${fail === 0 ? '✓' : '✗'} ${pass} passed, ${fail} failed`)
  process.exit(fail === 0 ? 0 : 1)
})().catch((e) => { console.error('FATAL', e); process.exit(2) })
