// scripts/phase1-smoke.cjs — 真实冒烟 SelfBuiltAdapter 渲染 + 拖拽回写。
// 运行:先 pnpm --filter web build + 静态服务 :3016,再 node scripts/phase1-smoke.cjs
const fs = require('fs')
const path = require('path')
const puppeteer = require('puppeteer-core')

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const URL = 'http://localhost:3016'
const wait = (ms) => new Promise((r) => setTimeout(r, ms))

const outDir = path.join(__dirname, '..', 'docs', 'design', 'screenshots', 'phase1-smoke')
fs.mkdirSync(outDir, { recursive: true })

let pass = 0
let fail = 0
const check = (n, ok, d = '') => {
  ok ? (pass++, console.log(`  ✓ ${n}${d ? ' — ' + d : ''}`)) : (fail++, console.log(`  ✗ ${n}${d ? ' — ' + d : ''}`))
}

;(async () => {
  const browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: 'new',
    args: ['--no-sandbox', '--disable-gpu'],
    defaultViewport: { width: 1440, height: 900 },
  })
  const page = await browser.newPage()
  const errs = []
  page.on('pageerror', (e) => {
    errs.push(e.message)
    console.log('[pageerror]', e.message)
  })

  // 1. 页面挂载、canvas 出现、无 pageerror
  await page.goto(URL + '/dev/canvas-self', { waitUntil: 'networkidle0', timeout: 30000 })
  await wait(1500)
  const hasCanvas = await page.evaluate(() => !!document.querySelector('canvas'))
  check('canvas mounted', hasCanvas)
  check('no pageerror', errs.length === 0, `${errs.length} errors`)

  // 2. 经 localStorage 注入一张卡片到默认画布,reload 后 useDb hydrate → loadCardsIntoEditor 渲染。
  const cardId = await page.evaluate(() => {
    const key = 'cys-stift.cards.v1'
    const raw = localStorage.getItem(key) || '{"cards":[]}'
    const parsed = JSON.parse(raw)
    const id = 'smoke-' + Math.random().toString(36).slice(2)
    parsed.cards.push({
      id,
      title: 'Phase1Smoke',
      body: '',
      type: 'note',
      media: [],
      links: [],
      codeSnippets: [],
      quotes: [],
      tags: [],
      source: { kind: 'manual', deviceId: 'smoke' },
      capturedAt: new Date().toISOString(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      pinned: false,
      archived: false,
      canvasPosition: { canvasId: 'default-canvas', x: 200, y: 200, w: 240, h: 120, z: Date.now() },
    })
    localStorage.setItem(key, JSON.stringify(parsed))
    return id
  })
  await page.reload({ waitUntil: 'networkidle0' })
  await wait(1500)

  // 3. 模拟拖拽:pointer down/move/up;相机默认 pan0/zoom1,页坐标≈屏幕坐标。
  //    SelfBuiltAdapter 拖拽经 onUserChange → bindCardWriteback → service.moveToCanvas。
  //    卡片在 (200,200,240,120),中心页坐标 (320,260)≈屏幕坐标。
  //    等 >300ms writeback debounce 再读 localStorage。
  //
  //    坐标偏移修正:AppMenu(sticky, --app-menu-height:69px)占据每个页面顶部,
  //    canvas getBoundingClientRect().top=69,不是 0。adapter 内部 sy=clientY-rect.top,
  //    所以这里 PointerEvent 的 clientX/clientY 必须加上 rect 原点,
  //    使命中点落在卡片上(否则 hitTest 落空 → 进 pan 而非拖拽)。
  const drag = await page.evaluate(async (id) => {
    const canvas = document.querySelector('canvas')
    if (!canvas) return { error: 'no canvas' }
    const r = canvas.getBoundingClientRect()
    const sx = 320 // 想命中的 canvas-local 坐标
    const sy = 260
    const cx = r.left + sx // PointerEvent 用视口坐标
    const cy = r.top + sy
    const opts = { pointerId: 1, bubbles: true, clientX: cx, clientY: cy }
    canvas.dispatchEvent(new PointerEvent('pointerdown', { ...opts, pointerType: 'mouse' }))
    await new Promise((r) => setTimeout(r, 50))
    canvas.dispatchEvent(
      new PointerEvent('pointermove', { ...opts, clientX: cx + 100, clientY: cy + 50, pointerType: 'mouse' }),
    )
    canvas.dispatchEvent(
      new PointerEvent('pointerup', { ...opts, clientX: cx + 100, clientY: cy + 50, pointerType: 'mouse' }),
    )
    await new Promise((r) => setTimeout(r, 500)) // >300ms writeback debounce
    const raw = localStorage.getItem('cys-stift.cards.v1')
    const p = JSON.parse(raw)
    const c = p.cards.find((x) => x.id === id)
    return c?.canvasPosition ? { x: c.canvasPosition.x, y: c.canvasPosition.y } : { error: 'card not found' }
  }, cardId)
  check(
    'drag wrote new position back to CardService',
    drag.x !== undefined && drag.x > 250,
    JSON.stringify(drag),
  )

  await page.screenshot({ path: path.join(outDir, 'self-canvas.png') })
  await browser.close()
  console.log(`\n${fail === 0 ? '✓' : '✗'} ${pass} passed, ${fail} failed`)
  console.log(`Screenshots → ${outDir}`)
  process.exit(fail === 0 ? 0 : 1)
})().catch((e) => {
  console.error('FATAL', e)
  process.exit(2)
})
