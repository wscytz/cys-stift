#!/usr/bin/env node
// Phase 6.5g — global AppMenu + CaptureSinkRegistry + MenuCaptureSink.
// Menu bar visible on all routes; current route highlighted; Capture
// button dispatches CustomEvent → Mini Input → card.source.kind='menubar'.
const puppeteer = require('puppeteer-core')
const fs = require('node:fs')
const path = require('node:path')

const SHOTS = path.join(__dirname, '..', 'docs', 'design', 'screenshots', 'phase-6.5g')
fs.mkdirSync(SHOTS, { recursive: true })

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const URL = process.env.URL || 'http://localhost:3016/'
const CARDS_KEY = 'cys-stift.cards.v1'

const wait = (ms) => new Promise((r) => setTimeout(r, ms))

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

  // ── 1. Home — menu visible ─────────────────────────────────────────
  await page.goto(URL, { waitUntil: 'domcontentloaded' })
  await wait(600)
  const menuPresent = (await page.$('.app-menu')) !== null
  console.log(`  [home] app-menu present = ${menuPresent}`)
  await shotFull(page, '01-home-with-menu.png')

  // ── 2. /inbox — Inbox highlighted ──────────────────────────────────
  await page.goto(URL + 'inbox', { waitUntil: 'domcontentloaded' })
  await wait(600)
  const activeInbox = await page.$eval('.app-menu__link--active', (el) =>
    el.textContent.trim(),
  )
  console.log(`  [inbox] active entry = ${activeInbox}  (expect 'Inbox')`)
  await shotFull(page, '02-inbox-menu.png')

  // ── 3. /canvas — Canvas highlighted ───────────────────────────────
  await page.goto(URL + 'canvas', { waitUntil: 'domcontentloaded' })
  await wait(2500)
  const activeCanvas = await page.$eval('.app-menu__link--active', (el) =>
    el.textContent.trim(),
  )
  console.log(`  [canvas] active entry = ${activeCanvas}  (expect 'Canvas')`)
  await shotFull(page, '03-canvas-menu.png')

  // ── 4. /archive — Archive highlighted ─────────────────────────────
  await page.goto(URL + 'archive', { waitUntil: 'domcontentloaded' })
  await wait(600)
  const activeArchive = await page.$eval('.app-menu__link--active', (el) =>
    el.textContent.trim(),
  )
  console.log(`  [archive] active entry = ${activeArchive}  (expect 'Archive')`)
  await shotFull(page, '04-archive-menu.png')

  // ── 5. Click Capture in menu → Mini Input → save → source.kind=menubar
  await page.evaluate(() => {
    const btn = document.querySelector('.app-menu__capture')
    btn?.click()
  })
  await wait(400)
  const miniOpen = (await page.$('.mi-backdrop')) !== null
  console.log(`  [capture] mini input open = ${miniOpen}`)

  // Type title + Cmd+Enter save
  await page.keyboard.type('Menubar capture test')
  await wait(200)
  await page.keyboard.down('Control')
  await page.keyboard.press('Enter')
  await page.keyboard.up('Control')
  await wait(500)

  const cards = await readCards(page)
  const c = cards[0]
  console.log(
    `  [menubar] title = ${c?.title}  source.kind = ${c?.source?.kind}  (expect 'menubar')`,
  )
  await shotFull(page, '05-archive-after-menubar-capture.png')

  await browser.close()

  console.log('\n── page errors ──')
  if (pageErrors.length === 0) console.log('  none')
  else pageErrors.forEach((e) => console.log(`  ! ${e}`))

  const pass =
    menuPresent &&
    activeInbox === 'Inbox' &&
    activeCanvas === 'Canvas' &&
    activeArchive === 'Archive' &&
    miniOpen &&
    c?.title === 'Menubar capture test' &&
    c?.source?.kind === 'menubar' &&
    pageErrors.length === 0
  console.log(`\n${pass ? '✓ ALL ASSERTIONS PASS' : '✗ ASSERTIONS FAILED'}`)
  process.exit(pass ? 0 : 1)
})().catch((e) => {
  console.error(e)
  process.exit(2)
})