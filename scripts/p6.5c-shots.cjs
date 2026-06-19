#!/usr/bin/env node
// Phase 6.5c — inbox → canvas send (spec §6.3 / Phase 4 §6.11).
// Detail "Send to canvas" → card.canvasPosition set → /canvas shows
// Card shape (via Phase 4 binding). Persist across reload.
// /inbox list still shows the card (canvasPosition does not hide from inbox).
const puppeteer = require('puppeteer-core')
const fs = require('node:fs')
const path = require('node:path')

const SHOTS = path.join(__dirname, '..', 'docs', 'design', 'screenshots', 'phase-6.5c')
fs.mkdirSync(SHOTS, { recursive: true })

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const URL = process.env.URL || 'http://localhost:3016/'
const CARDS_KEY = 'cys-stift.cards.v1'

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

async function readCards(page) {
  return page.evaluate((k) => {
    const raw = localStorage.getItem(k)
    if (!raw) return []
    return JSON.parse(raw).cards || []
  }, CARDS_KEY)
}

async function seedCards(page, cards) {
  await page.evaluate(
    (k, payload) => {
      localStorage.setItem(k, JSON.stringify({ cards: payload }))
    },
    CARDS_KEY,
    cards,
  )
  await page.reload({ waitUntil: 'domcontentloaded' })
  await wait(800)
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
  await page.evaluate((k) => localStorage.removeItem(k), CARDS_KEY)
  await page.reload({ waitUntil: 'domcontentloaded' })
  await wait(800)

  // ── 1. Seed a card in inbox (no canvasPosition) ───────────────────
  const seed = [
    {
      id: 'card-send', title: 'Send-to-canvas card', body: 'A note to send.',
      type: 'note', media: [], links: [], codeSnippets: [], quotes: [],
      source: { kind: 'manual', deviceId: 'web' },
      capturedAt: '2026-06-19T00:00:00.000Z',
      createdAt: '2026-06-19T00:00:00.000Z',
      updatedAt: '2026-06-19T00:00:00.000Z',
      pinned: false, archived: false,
    },
  ]
  await seedCards(page, seed)
  await page.goto(URL + 'inbox', { waitUntil: 'domcontentloaded' })
  await wait(800)
  await page.click('.tile')
  await wait(400)
  await shotFull(page, '01-detail-with-send-button.png')

  // ── 2. Click "Send to canvas" → detail shows "on canvas" ──────────
  await page.evaluate(() => {
    const btns = [...document.querySelectorAll('button')]
    const send = btns.find((b) => b.textContent.trim() === 'Send to canvas')
    send?.click()
  })
  await wait(500)
  // 验证 button 文本变化 / canvasPosition 写入
  const afterSend = await readCards(page)
  const c1 = afterSend.find((x) => x.id === 'card-send')
  console.log(
    `  [send] canvasPosition = ${JSON.stringify(c1?.canvasPosition)}`,
  )
  const onCanvasBtn = await page.evaluate(() => {
    const btns = [...document.querySelectorAll('button')]
    return !!btns.find((b) => /on canvas/i.test(b.textContent || ''))
  })
  console.log(`  [send] "on canvas" button present = ${onCanvasBtn}`)
  await shotFull(page, '02-detail-on-canvas.png')

  // ── 3. Navigate to /canvas → Card shape rendered ───────────────────
  await page.goto(URL + 'canvas', { waitUntil: 'domcontentloaded' })
  await wait(3000) // tldraw mount takes longer
  // Read tldraw DOM for card shapes (Phase 5 pattern: tl-shape[data-shape-type=card])
  const cardCount = await page.evaluate(() => {
    return document.querySelectorAll(
      '[class*="tl-shape"][data-shape-type="card"]',
    ).length
  })
  console.log(`  [canvas] card shapes = ${cardCount}  (expect 1)`)
  await shotFull(page, '03-canvas-with-card.png')

  // ── 4. Reload → persistence ──────────────────────────────────────
  await page.reload({ waitUntil: 'domcontentloaded' })
  await wait(3000)
  const cardCountReload = await page.evaluate(() => {
    return document.querySelectorAll(
      '[class*="tl-shape"][data-shape-type="card"]',
    ).length
  })
  console.log(`  [canvas-reload] card shapes = ${cardCountReload}  (expect 1)`)
  await shotFull(page, '04-canvas-after-reload.png')

  // ── 5. /inbox list — spec §6.11 / Phase 2 listInbox excludes on-canvas
  // cards (canvasPosition non-null hides from inbox). Card is now
  // "on canvas only" — verify it's gone from /inbox. ─────────────
  await page.goto(URL + 'inbox', { waitUntil: 'domcontentloaded' })
  await wait(800)
  const inboxTiles = await page.$$('.tile')
  console.log(
    `  [inbox] tiles = ${inboxTiles.length}  (expect 0 — on-canvas cards hidden per spec §6.11)`,
  )
  await shotFull(page, '05-inbox-after-send.png')

  await browser.close()

  console.log('\n── page errors ──')
  if (pageErrors.length === 0) console.log('  none')
  else pageErrors.forEach((e) => console.log(`  ! ${e}`))

  const pass =
    c1?.canvasPosition?.canvasId === 'default-canvas' &&
    onCanvasBtn &&
    cardCount === 1 &&
    cardCountReload === 1 &&
    inboxTiles.length === 0 &&
    pageErrors.length === 0
  console.log(`\n${pass ? '✓ ALL ASSERTIONS PASS' : '✗ ASSERTIONS FAILED'}`)
  process.exit(pass ? 0 : 1)
})().catch((e) => {
  console.error(e)
  process.exit(2)
})