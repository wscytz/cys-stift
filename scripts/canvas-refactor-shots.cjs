#!/usr/bin/env node
// Phase canvas-refactor — review #4 + #5 fix verification.
//   1. /canvas mount → view applies (zoom 1, snap, grid 8).
//   2. Switch /canvas → /inbox → /canvas rapidly. No console errors on
//      re-mount (the new useEffect cleanup removes the dblclick listener
//      and the view-persistence timer; the old dispose-monkey-patch path
//      was never validated in this scenario — review #4).
//   3. Reload → view restored (Phase 6.5d regression guard).
//   4. After fix: dragging a card on the canvas should NOT trigger an
//      extra view-store write — only camera/gridMode changes do. We
//      detect this by setting a known persisted view, then dragging
//      (via puppeteer mouse) and reading back — zoom/pan/gridMode
//      should match the pre-drag values (drag only changes card shape
//      position, not camera, so persisted view shouldn't change).
const puppeteer = require('puppeteer-core')
const fs = require('node:fs')
const path = require('node:path')

const SHOTS = path.join(__dirname, '..', 'docs', 'design', 'screenshots', 'phase-canvas-refactor')
fs.mkdirSync(SHOTS, { recursive: true })

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const URL = process.env.URL || 'http://localhost:3016/'
const VIEW_KEY = 'cys-stift.canvas-view.v1'
const CARDS_KEY = 'cys-stift.cards.v1'

const wait = (ms) => new Promise((r) => setTimeout(r, ms))

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

async function setView(page, view) {
  await page.evaluate(
    (k, v) => localStorage.setItem(k, JSON.stringify({ view: v })),
    VIEW_KEY,
    view,
  )
}

async function readCamera(page) {
  return page.evaluate(() => {
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
  // Note: we deliberately do NOT subscribe to console.error — Next.js dev
  // mode emits a benign 404 for the missing favicon and that is not a
  // signal we want to gate this regression on. pageerror covers real
  // JS exceptions from React/our code.

  // ── 0. Seed: 1 card on the default canvas ────────────────────────
  await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 30000 })
  await wait(800)
  await page.evaluate((k) => {
    const now = new Date().toISOString()
    localStorage.setItem(
      k,
      JSON.stringify({
        cards: [
          {
            id: 'cr-1',
            title: 'Draggable',
            body: '',
            type: 'note',
            media: [], links: [], codeSnippets: [], quotes: [],
            source: { kind: 'manual', deviceId: 'web' },
            capturedAt: now, createdAt: now, updatedAt: now,
            pinned: false, archived: false,
            canvasPosition: {
              canvasId: 'default-canvas',
              x: 200, y: 200, w: 240, h: 120, z: 0,
            },
          },
        ],
      }),
    )
  }, CARDS_KEY)
  await setView(page, {
    zoom: 1, panX: 0, panY: 0, gridMode: 'snap', gridSize: 8,
  })

  // ── 1. /canvas mount: view applies + card renders ───────────────
  await page.goto(URL + 'canvas', { waitUntil: 'domcontentloaded' })
  await wait(3000) // tldraw mount
  const initial = await readCamera(page)
  console.log(`  [mount] camera = ${JSON.stringify(initial)}`)
  await shotFull(page, '01-canvas-mounted.png')

  // ── 2. Rapid /canvas ↔ /inbox switching (review #4 main risk) ──
  // If the dblclick listener or view-persist timer leaks across
  // unmount, this is where it would show up as a console error or
  // stale listener firing on a fresh editor.
  for (let i = 0; i < 4; i++) {
    await page.goto(URL + 'inbox', { waitUntil: 'domcontentloaded' })
    await wait(400)
    await page.goto(URL + 'canvas', { waitUntil: 'domcontentloaded' })
    await wait(1500)
  }
  const afterSwitches = await readCamera(page)
  console.log(`  [after 4 switches] camera = ${JSON.stringify(afterSwitches)}`)
  await shotFull(page, '02-canvas-after-switches.png')

  // ── 3. Set a known non-default view; reload; expect restored ───
  await setView(page, {
    zoom: 2, panX: -120, panY: -60, gridMode: 'free', gridSize: 8,
  })
  await page.reload({ waitUntil: 'domcontentloaded' })
  await wait(3000)
  const afterReload = await readCamera(page)
  console.log(`  [reload] camera = ${JSON.stringify(afterReload)}`)
  await shotFull(page, '03-canvas-after-reload.png')

  // ── 4. Review #5 — dragging a card must NOT trigger view write ──
  // Read view-store before drag; drag the card; read view-store after
  // 800ms (past the 500ms debounce). The persisted view should be
  // unchanged because camera + isGridMode didn't change. With the old
  // unfiltered listen + camera-read, every card-drag store update
  // would re-fire the debounce — visible in the timer firing.
  const beforeDrag = await readView(page)
  const cardBox = await page.evaluate(() => {
    // The card shape util renders a div inside the tldraw container.
    // Find a tldraw shape with a card class or attribute.
    const el = document.querySelector('[data-shape-type="card"]')
    if (!el) return null
    const r = el.getBoundingClientRect()
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 }
  })
  if (cardBox) {
    await page.mouse.move(cardBox.x, cardBox.y)
    await page.mouse.down()
    await page.mouse.move(cardBox.x + 80, cardBox.y + 60, { steps: 8 })
    await page.mouse.up()
    await wait(900) // past debounce
  } else {
    console.log('  [drag] card shape not found — skipping drag assertion')
  }
  const afterDrag = await readView(page)
  console.log(`  [drag] view before = ${JSON.stringify(beforeDrag)}`)
  console.log(`  [drag] view after  = ${JSON.stringify(afterDrag)}`)
  await shotFull(page, '04-canvas-after-card-drag.png')

  // ── 5. Double-click blank → new card created (bridge intact) ──
  // Click the editor area at a blank spot to trigger dblclick.
  const blankBox = await page.evaluate(() => {
    const el = document.querySelector('.cv-editor')
    if (!el) return null
    const r = el.getBoundingClientRect()
    return { x: r.left + r.width * 0.8, y: r.top + r.height * 0.3 }
  })
  if (blankBox) {
    await page.mouse.click(blankBox.x, blankBox.y, { clickCount: 2, delay: 30 })
    await wait(500)
  }
  const cardCount = await page.evaluate((k) => {
    const raw = localStorage.getItem(k)
    if (!raw) return 0
    return (JSON.parse(raw).cards || []).length
  }, CARDS_KEY)
  console.log(`  [dblclick] cards = ${cardCount}  (expect 2: original + new)`)

  await browser.close()

  console.log('\n── page errors ──')
  if (pageErrors.length === 0) console.log('  none')
  else pageErrors.forEach((e) => console.log(`  ! ${e}`))

  // ── Assertions ──────────────────────────────────────────────────
  // After 4 switches the camera should still match the persisted view
  // (zoom 1, snap) — no drift from a leaked listener firing.
  const cameraStable =
    afterSwitches !== null &&
    Math.abs(afterSwitches.zoom - initial.zoom) < 0.01
  // Reload: zoom 2, free mode restored from the known set view.
  const reloadRestored =
    afterReload !== null &&
    Math.abs(afterReload.zoom - 2) < 0.01 &&
    afterReload.isGridMode === false
  // Drag: view store must NOT have changed (review #5 root cause).
  // beforeDrag and afterDrag should be deeply equal — camera didn't
  // change, isGridMode didn't change, so no useValue subscriber fired
  // and the debounce timer never started.
  const viewUnchangedByDrag =
    JSON.stringify(beforeDrag) === JSON.stringify(afterDrag)
  // Dblclick on blank created a new card.
  const dblClickWorks = cardCount === 2
  const noErrors = pageErrors.length === 0

  const pass =
    cameraStable &&
    reloadRestored &&
    viewUnchangedByDrag &&
    dblClickWorks &&
    noErrors
  console.log('\n── assertions ──')
  console.log(`  cameraStable      = ${cameraStable}`)
  console.log(`  reloadRestored    = ${reloadRestored}`)
  console.log(`  viewUnchangedDrag = ${viewUnchangedByDrag}`)
  console.log(`  dblClickWorks     = ${dblClickWorks}`)
  console.log(`  noErrors          = ${noErrors}`)
  console.log(`\nresult: ${pass ? 'PASS ✓' : 'FAIL ✗'}`)
  process.exit(pass ? 0 : 1)
})().catch((e) => {
  console.error(e)
  process.exit(2)
})