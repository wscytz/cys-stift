#!/usr/bin/env node
// Phase UX #2 — send-to-canvas reverse: card on canvas can be sent
// back to inbox via the canvas CardDetailModal "Send back to inbox"
// button (review §🟠 UX #2).
//
//   1. Seed 1 card already on the default canvas (canvasPosition set).
//   2. /canvas — shape renders, window.__canvasEditor shows 1 shape.
//   3. Double-click the shape → canvas CardDetailModal opens in view
//      mode with "Send back to inbox" button visible.
//   4. Click "Send back to inbox" → modal closes, shape disappears.
//   5. Card in localStorage now has canvasPosition === undefined.
//   6. /inbox — card is visible (listInbox excludes canvasPosition
//      cards, so without canvasPosition it reappears).
//   7. No console pageerror.
const puppeteer = require('puppeteer-core')
const fs = require('node:fs')
const path = require('node:path')

const SHOTS = path.join(__dirname, '..', 'docs', 'design', 'screenshots', 'phase-send-back')
fs.mkdirSync(SHOTS, { recursive: true })

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const URL = process.env.URL || 'http://localhost:3016/'
const STORAGE_KEY = 'cys-stift.cards.v1'

const wait = (ms) => new Promise((r) => setTimeout(r, ms))

async function shotFull(page, name) {
  const file = path.join(SHOTS, name)
  await page.screenshot({ path: file, fullPage: true })
  console.log(`✓ ${name}  (${(fs.statSync(file).size / 1024).toFixed(1)} kB)`)
}

async function readCards(page) {
  return page.evaluate((k) => {
    const raw = localStorage.getItem(k)
    return raw ? JSON.parse(raw).cards || [] : []
  }, STORAGE_KEY)
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

  // ── 0. Seed: 1 card already on default canvas ─────────────────
  await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 30000 })
  await wait(800)
  await page.evaluate((k) => {
    const now = new Date().toISOString()
    localStorage.setItem(
      k,
      JSON.stringify({
        cards: [
          {
            id: 'sb-1',
            title: 'Stuck on canvas',
            body: 'take me back',
            type: 'note',
            media: [], links: [], codeSnippets: [], quotes: [],
            source: { kind: 'manual', deviceId: 'web' },
            capturedAt: now, createdAt: now, updatedAt: now,
            pinned: false, archived: false,
            canvasPosition: {
              canvasId: 'default-canvas',
              x: 100, y: 100, w: 240, h: 120, z: 0,
            },
          },
        ],
      }),
    )
  }, STORAGE_KEY)
  console.log('  [seed] 1 card on canvas')

  // ── 1. /canvas — shape renders ────────────────────────────────
  await page.goto(URL + 'canvas', { waitUntil: 'domcontentloaded' })
  await wait(3000) // tldraw mount + loadCardsIntoEditor
  const shapeCount = await page.evaluate(() => {
    const ed = window.__canvasEditor
    if (!ed) return -1
    return ed.getCurrentPageShapes().length
  })
  console.log(`  [/canvas] shapes in editor = ${shapeCount}  (expect 1)`)
  await shotFull(page, '01-canvas-with-shape.png')

  // ── 2. Open the card by double-clicking the shape ─────────────
  const shapePos = await page.evaluate(() => {
    const el = document.querySelector('[data-shape-type="card"]')
    if (!el) return null
    const r = el.getBoundingClientRect()
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 }
  })
  if (!shapePos) {
    console.log('  [FAIL] card shape not found')
    process.exit(2)
  }
  await page.mouse.click(shapePos.x, shapePos.y, { clickCount: 2, delay: 30 })
  await wait(500)
  // Modal opens
  const modalOpen = await page.evaluate(() => {
    return [...document.querySelectorAll('button')]
      .some((b) => b.textContent.trim() === 'Send back to inbox')
  })
  console.log(`  [detail modal] "Send back to inbox" button visible = ${modalOpen}  (expect true)`)
  await shotFull(page, '02-canvas-detail-with-send-back.png')

  // ── 3. Click "Send back to inbox" ─────────────────────────────
  await page.evaluate(() => {
    const btns = [...document.querySelectorAll('button')]
    const btn = btns.find((b) => b.textContent.trim() === 'Send back to inbox')
    btn?.click()
  })
  await wait(500)

  // Modal should be gone
  const modalGone = await page.evaluate(() => {
    return ![...document.querySelectorAll('button')]
      .some((b) => b.textContent.trim() === 'Send back to inbox')
  })
  console.log(`  [after send back] modal gone = ${modalGone}  (expect true)`)

  // localStorage: canvasPosition should be undefined
  const cardsAfter = await readCards(page)
  const cardAfter = cardsAfter.find((c) => c.id === 'sb-1')
  const canvasPosCleared = cardAfter && !cardAfter.canvasPosition
  console.log(`  [storage] canvasPosition cleared = ${canvasPosCleared}  (expect true)`)
  await shotFull(page, '03-canvas-empty-after-send-back.png')

  // ── 4. /inbox — card reappears ────────────────────────────────
  await page.goto(URL + 'inbox', { waitUntil: 'domcontentloaded' })
  await wait(800)
  const inboxTiles = await page.$$('.tile')
  console.log(`  [/inbox] tiles = ${inboxTiles.length}  (expect 1: sb-1 returned)`)
  // Verify tile title
  const inboxTitle = await page.evaluate(() => {
    const t = document.querySelector('.tile__title')
    return t?.textContent || ''
  })
  console.log(`  [/inbox] tile title = ${JSON.stringify(inboxTitle)}  (expect "Stuck on canvas")`)
  await shotFull(page, '04-inbox-after-send-back.png')

  await browser.close()

  console.log('\n── page errors ──')
  if (pageErrors.length === 0) console.log('  none')
  else pageErrors.forEach((e) => console.log(`  ! ${e}`))

  const pass =
    shapeCount === 1 &&
    modalOpen === true &&
    modalGone === true &&
    canvasPosCleared === true &&
    inboxTiles.length === 1 &&
    inboxTitle === 'Stuck on canvas' &&
    pageErrors.length === 0
  console.log(`\nresult: ${pass ? 'PASS ✓' : 'FAIL ✗'}`)
  process.exit(pass ? 0 : 1)
})().catch((e) => {
  console.error(e)
  process.exit(2)
})