#!/usr/bin/env node
// Phase 6.5d — canvas view persistence (zoom/pan/gridMode across reload).
// Default → zoom → pan → free → reload → state still matches.
const puppeteer = require('puppeteer-core')
const fs = require('node:fs')
const path = require('node:path')

const SHOTS = path.join(__dirname, '..', 'docs', 'design', 'screenshots', 'phase-6.5d')
fs.mkdirSync(SHOTS, { recursive: true })

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const URL = process.env.URL || 'http://localhost:3016/'
const VIEW_KEY = 'cys-stift.canvas-view.v1'

const wait = (ms) => new Promise((r) => setTimeout(r, ms))

async function shot(page, name) {
  const file = path.join(SHOTS, name)
  await page.screenshot({ path: file })
  console.log(`✓ ${name}  (${(fs.statSync(file).size / 1024).toFixed(1)} kB)`)
}
async function shotFull(page, name) {
  const file = path.join(SHOTS, name)
  await page.screenshot({ path: file, fullPage: true })
  console.log(`✓ ${name}  (${(fs.statSync(file).size / 1024).toFixed(1)} kB)`)
}

async function readView(page) {
  return page.evaluate((k) => {
    const raw = localStorage.getItem(k)
    if (!raw) return null
    return JSON.parse(raw).view
  }, VIEW_KEY)
}

async function clearAll(page) {
  await page.evaluate((k) => {
    localStorage.removeItem(k)
    localStorage.removeItem('cys-stift.cards.v1')
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
  await wait(1500)
  await clearAll(page)
  await page.goto(URL + 'canvas', { waitUntil: 'domcontentloaded' })
  await wait(3000) // tldraw mount

  // ── 1. Default state (zoom 1, pan 0,0, grid snap) ──────────────────
  const initialView = await page.evaluate(() => {
    const ed = window.__canvasEditor
    if (!ed) return null
    const cam = ed.getCamera()
    const inst = ed.getInstanceState()
    return {
      zoom: cam.z,
      panX: cam.x,
      panY: cam.y,
      isGridMode: Boolean(inst.isGridMode),
    }
  })
  console.log(`  [default] initial = ${JSON.stringify(initialView)}`)
  await shotFull(page, '01-canvas-default.png')

  // ── 2. Zoom to 200% via the zoom-in toolbar button (×2) ─────────────
  // Phase 5 toolbar has zoom in/out/FIT buttons.
  await page.evaluate(() => {
    const btns = [...document.querySelectorAll('button')]
    const zoomIn = btns.find((b) => b.textContent.trim() === '+')
    zoomIn?.click()
    zoomIn?.click()
  })
  await wait(800) // debounce + render
  await shotFull(page, '02-canvas-zoomed-200.png')

  // ── 3. Switch to free mode via g key (Phase 5 keyboard) ────────────
  await page.keyboard.press('g')
  await wait(800)
  const afterFree = await page.evaluate(() => {
    const ed = window.__canvasEditor
    if (!ed) return null
    const inst = ed.getInstanceState()
    return { isGridMode: Boolean(inst.isGridMode) }
  })
  console.log(`  [free] isGridMode = ${afterFree?.isGridMode}  (expect false)`)

  // ── 4. Pan: drag the editor background ─────────────────────────────
  const containerBox = await page.evaluate(() => {
    const el = document.querySelector('.cv-editor')
    if (!el) return null
    const r = el.getBoundingClientRect()
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 }
  })
  if (containerBox) {
    await page.mouse.move(containerBox.x, containerBox.y)
    await page.mouse.down()
    await page.mouse.move(containerBox.x - 200, containerBox.y - 150, { steps: 10 })
    await page.mouse.up()
    await wait(800)
  }
  await shotFull(page, '03-canvas-panned.png')

  // ── 5. Check what was persisted to localStorage ───────────────────
  const persistedBefore = await readView(page)
  console.log(`  [persisted] ${JSON.stringify(persistedBefore)}`)

  // ── 6. Reload → state restored from localStorage ───────────────────
  await page.reload({ waitUntil: 'domcontentloaded' })
  await wait(3000)
  const afterReload = await page.evaluate(() => {
    const ed = window.__canvasEditor
    if (!ed) return null
    const cam = ed.getCamera()
    const inst = ed.getInstanceState()
    return {
      zoom: cam.z,
      panX: cam.x,
      panY: cam.y,
      isGridMode: Boolean(inst.isGridMode),
    }
  })
  console.log(`  [reload] ${JSON.stringify(afterReload)}`)
  await shotFull(page, '04-canvas-after-reload.png')

  await browser.close()

  console.log('\n── page errors ──')
  if (pageErrors.length === 0) console.log('  none')
  else pageErrors.forEach((e) => console.log(`  ! ${e}`))

  // Assertions
  // After zoom-in ×2: 100% → 200% → 400%; expect ~4
  const zoomChanged = Math.abs(afterReload.zoom - 4) < 0.01 || afterReload.zoom > 1.5
  const panChanged = persistedBefore?.panX !== 0 || persistedBefore?.panY !== 0
  const gridModeKept = afterReload.isGridMode === false
  const persistedMatches =
    Math.abs(persistedBefore.zoom - afterReload.zoom) < 0.01 &&
    Math.abs(persistedBefore.panX - afterReload.panX) < 5 &&
    Math.abs(persistedBefore.panY - afterReload.panY) < 5 &&
    persistedBefore.gridMode === (afterReload.isGridMode ? 'snap' : 'free')
  const pass =
    initialView !== null &&
    initialView.zoom === 1 &&
    initialView.isGridMode === true &&
    afterReload !== null &&
    zoomChanged &&
    panChanged &&
    gridModeKept &&
    persistedMatches &&
    pageErrors.length === 0
  console.log(`\n${pass ? '✓ ALL ASSERTIONS PASS' : '✗ ASSERTIONS FAILED'}`)
  process.exit(pass ? 0 : 1)
})().catch((e) => {
  console.error(e)
  process.exit(2)
})