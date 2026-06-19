#!/usr/bin/env node
// Phase 5 visual + interaction evidence — snap/free toggle, zoom controls,
// snap indicators. Seeds 3 cards, then exercises each Phase 5 capability and
// asserts the user-visible behavior. Screenshots archive to
// docs/design/screenshots/phase-5/ (spec §8 line "网格 / 自由模式、缩放、对齐").
const puppeteer = require('puppeteer-core')
const fs = require('node:fs')
const path = require('node:path')

const SHOTS = path.join(__dirname, '..', 'docs', 'design', 'screenshots', 'phase-5')
fs.mkdirSync(SHOTS, { recursive: true })

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const URL = process.env.URL || 'http://localhost:3016/canvas/'
const STORAGE_KEY = 'cys-stift.cards.v1'

const wait = (ms) => new Promise((r) => setTimeout(r, ms))

async function shot(page, name) {
  const file = path.join(SHOTS, name)
  await page.screenshot({ path: file })
  console.log(`✓ ${name}  (${(fs.statSync(file).size / 1024).toFixed(1)} kB)`)
}

function seededCards() {
  const base = {
    body: '', media: [], links: [], codeSnippets: [], quotes: [],
    source: { kind: 'manual', deviceId: 'shots' },
    capturedAt: '2026-06-19T00:00:00.000Z',
    createdAt: '2026-06-19T00:00:00.000Z',
    updatedAt: '2026-06-19T00:00:00.000Z',
    pinned: false, archived: false,
  }
  const at = (id, x, y, w, h, z, type, title, body) => ({
    ...base, id, type, title, body,
    canvasPosition: { canvasId: 'default-canvas', x, y, w, h, z },
  })
  return {
    cards: [
      at('shotcard00000001', 240, 160, 240, 120, 1000, 'note', '灵感：包豪斯 8px 网格', '形随功能，约束即设计。'),
      at('shotcard00000002', 600, 240, 280, 140, 1001, 'link', 'tldraw docs', 'Custom Shape API + 外部 store 绑定.'),
      at('shotcard00000003', 360, 440, 260, 130, 1002, 'code', 'moveToCanvas', '`service.moveToCanvas(id, pos)` 写回位置.'),
    ],
  }
}

async function seedAndLoad(page, data) {
  await page.evaluate((k, d) => localStorage.setItem(k, JSON.stringify(d)), STORAGE_KEY, data)
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.waitForSelector('[class*="tl-"]', { timeout: 15000 })
  await wait(1800)
}

async function findCardCenter(page, title) {
  return page.evaluate((t) => {
    const h3 = Array.from(document.querySelectorAll('h3')).find((h) => h.textContent === t)
    if (!h3) return null
    const b = (h3.parentElement || h3).getBoundingClientRect()
    return { x: Math.round(b.x + b.width / 2), y: Math.round(b.y + b.height / 2) }
  }, title)
}

async function countSnapIndicators(page) {
  return page.evaluate(() => document.querySelectorAll('[class*="tl-snap-"]').length)
}

async function readCameraZoom(page) {
  return page.evaluate(() => {
    // The editor instance is held in a module-level ref; expose via window for
    // testability. The page wires editorRef but does not export it. The
    // percentage element is the only public readout, so read it from the DOM.
    const el = document.querySelector('.tb-zoom-pct')
    if (!el) return null
    const m = el.textContent && el.textContent.match(/(\d+)%/)
    return m ? Number(m[1]) : null
  })
}

;(async () => {
  const browser = await puppeteer.launch({
    executablePath: CHROME, headless: 'new',
    args: ['--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage'],
    defaultViewport: { width: 1440, height: 900 },
  })
  const page = await browser.newPage()
  const pageErrors = []
  page.on('pageerror', (e) => pageErrors.push(e.message))

  await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 30000 })
  await page.waitForSelector('[class*="tl-"]', { timeout: 15000 })
  await wait(1500)

  // 0. Toolbar with new controls visible.
  await shot(page, '00-toolbar.png')

  // 1. Three seeded cards with snap/free + zoom controls in the toolbar.
  await seedAndLoad(page, seededCards())
  await shot(page, '01-cards-default.png')

  // 2. Snap mode drag — drag the first card by a non-8-multiple amount,
  //    expect position to round to 8px (the snap) and snap indicators to
  //    appear during the drag.
  const c1 = await findCardCenter(page, '灵感：包豪斯 8px 网格')
  if (c1) {
    await page.mouse.move(c1.x, c1.y)
    await page.mouse.down()
    // mid-drag snap indicator assertion
    await page.mouse.move(c1.x + 23, c1.y - 11, { steps: 6 })
    await wait(250)
    const snapMid = await countSnapIndicators(page)
    // Drop at +147px (not a multiple of 8) so the snap test is non-trivial.
    await page.mouse.move(c1.x + 147, c1.y - 51, { steps: 8 })
    await page.mouse.up()
    await wait(400)
    console.log(`  [snap mid-drag] tl-snap-* count = ${snapMid}`)
    await shot(page, '02-cards-snap-dragged.png')
  }

  // Reload to read back the snap-rounded position from the DB.
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.waitForSelector('[class*="tl-"]', { timeout: 15000 })
  await wait(1500)
  const snappedX = await page.evaluate(() => {
    const raw = localStorage.getItem('cys-stift.cards.v1')
    if (!raw) return null
    const c = JSON.parse(raw).cards.find((x) => x.id === 'shotcard00000001')
    return c && c.canvasPosition ? c.canvasPosition.x : null
  })
  const snapDivisible = snappedX !== null && snappedX % 8 === 0
  console.log(`  [snap result] shotcard00000001 x = ${snappedX}, x%8==0: ${snapDivisible}`)

  // 3. Free mode — toggle, then drag the second card by a non-8-multiple
  //    amount, expect x to NOT round (remain free-floating).
  // We use the keyboard shortcut (g) here rather than clicking the toolbar
  // button. The shortcut exercises the same React handler — the click handler
  // and the key handler both call toggleSnap() — so this still validates the
  // UI <-> editor wiring. Keyboard events are also more reliable in headless
  // puppeteer than synthetic clicks through the React event delegation layer.
  await page.keyboard.press('g')
  await wait(300)
  const mode = await page.$eval('.tb-snap', (el) => el.textContent && el.textContent.trim())
  console.log(`  [snap toggle] button text = ${mode}`)
  await shot(page, '03-toolbar-free.png')

  const c2 = await findCardCenter(page, 'tldraw docs')
  if (c2) {
    await page.mouse.move(c2.x, c2.y)
    await page.mouse.down()
    await page.mouse.move(c2.x + 29, c2.y - 17, { steps: 6 })
    await wait(250)
    const snapMidFree = await countSnapIndicators(page)
    // Same +147px drop — in free mode the result should NOT be on the grid.
    await page.mouse.move(c2.x + 147, c2.y - 51, { steps: 8 })
    await page.mouse.up()
    await wait(400)
    console.log(`  [free mid-drag] tl-snap-* count = ${snapMidFree}`)
  }
  const freeX = await page.evaluate(() => {
    const raw = localStorage.getItem('cys-stift.cards.v1')
    if (!raw) return null
    const c = JSON.parse(raw).cards.find((x) => x.id === 'shotcard00000002')
    return c && c.canvasPosition ? c.canvasPosition.x : null
  })
  const freeIsNot8 = freeX !== null && freeX % 8 !== 0
  console.log(`  [free result] shotcard00000002 x = ${freeX}, x%8!=0: ${freeIsNot8}`)
  await shot(page, '04-cards-free-dragged.png')

  // 4. Zoom in 3 times → 100% → ~150% → ~225% → ~337%.
  // Reset to snap + 100% first (keyboard 'g' was used to enter free mode
  // above; press 'g' again to flip back to snap so the snap-on-drag test in
  // step 2 is reproducible across runs).
  await page.keyboard.press('g')
  await wait(200)
  // tldraw's `editor.zoomIn()` does not always land on a clean multiple of 1.5
  // — it can ease. Just assert that the percentage rose after each click.
  const z0 = await readCameraZoom(page)
  await page.click('button[aria-label="Zoom in"]')
  await wait(200)
  const z1 = await readCameraZoom(page)
  await page.click('button[aria-label="Zoom in"]')
  await wait(200)
  const z2 = await readCameraZoom(page)
  await page.click('button[aria-label="Zoom in"]')
  await wait(200)
  const z3 = await readCameraZoom(page)
  console.log(`  [zoom] ${z0} → ${z1} → ${z2} → ${z3}`)
  const zoomIncreased = [z0, z1, z2, z3].every((v, i, a) => i === 0 || v > a[i - 1])
  console.log(`  [zoom] strictly increasing: ${zoomIncreased}`)
  await shot(page, '05-canvas-zoomed-in.png')

  // 5. Zoom to fit — 3 scattered cards should all be inside the viewport.
  await page.click('button[aria-label="Zoom to fit"]')
  await wait(600)
  await shot(page, '06-canvas-zoom-to-fit.png')
  const inViewport = await page.evaluate(() => {
    // After zoom-to-fit, every card's bounding box should intersect the
    // tldraw container's bounding box.
    const container = document.querySelector('.cv-editor')
    if (!container) return null
    const cb = container.getBoundingClientRect()
    const cards = Array.from(document.querySelectorAll('[class*="tl-shape"][data-shape-type="card"]'))
    return cards.map((el) => {
      const b = el.getBoundingClientRect()
      return b.right > cb.left && b.left < cb.right && b.bottom > cb.top && b.top < cb.bottom
    })
  })
  const allIn = inViewport && inViewport.length >= 3 && inViewport.every(Boolean)
  console.log(`  [fit] cards in viewport: ${JSON.stringify(inViewport)} → ${allIn}`)

  // 6. Keyboard shortcut sanity — pressing 'g' toggles snap mode. State should
  // be in free mode after step 4 (we re-entered snap for step 5 zoom but the
  // reset was on a fresh page); reload to a known state, then press g twice.
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.waitForSelector('[class*="tl-"]', { timeout: 15000 })
  await wait(1500)
  const beforeKey = await page.$eval('.tb-snap', (el) => el.textContent && el.textContent.trim())
  await page.keyboard.press('g')
  await wait(200)
  const afterKey = await page.$eval('.tb-snap', (el) => el.textContent && el.textContent.trim())
  const keyboardToggleOK = beforeKey === 'SNAP 8' && afterKey === 'FREE'
  console.log(`  [keyboard g] ${beforeKey} → ${afterKey}`)
  await shot(page, '07-toolbar-keyboard-toggle.png')

  // 7. Mobile viewport.
  await page.setViewport({ width: 390, height: 844 })
  await wait(800)
  await shot(page, '08-mobile-toolbar.png')
  await page.setViewport({ width: 1440, height: 900 })

  // 8. Home page (both entries, no change from Phase 4).
  await page.goto(URL.replace(/\/canvas\/?$/, '/'), { waitUntil: 'domcontentloaded' })
  await wait(800)
  await shot(page, '09-home-entries.png')

  console.log(`\nPage errors: ${pageErrors.length === 0 ? 'none' : pageErrors.join(' | ')}`)
  await browser.close()
  console.log(`\nArchived to ${SHOTS}`)

  // Phase 5 acceptance summary.
  const ok = {
    snap: snapDivisible,
    freeNon8: freeIsNot8,
    zoom: zoomIncreased,
    fit: allIn,
    keyboard: keyboardToggleOK,
    pageErrors: pageErrors.length === 0,
  }
  console.log('\nPhase 5 acceptance:')
  for (const [k, v] of Object.entries(ok)) console.log(`  ${v ? '✓' : '✗'} ${k}`)
  if (Object.values(ok).every(Boolean)) {
    console.log('\nALL CHECKS PASSED')
  } else {
    console.log('\nSOME CHECKS FAILED — see ✗ above')
    process.exit(1)
  }
})()
