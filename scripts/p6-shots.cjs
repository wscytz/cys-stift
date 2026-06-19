#!/usr/bin/env node
// Phase 6 visual + interaction evidence — global shortcut Cmd/Ctrl+Shift+Space
// opens Mini Input anywhere; Cmd+Enter saves via WebCaptureSink → service.fromCapture
// (source.kind=shortcut, shortcutId=cmd-shift-space). New card appears in
// /inbox and survives reload. Screenshots archive to
// docs/design/screenshots/phase-6/ (spec §5.5 / §1.3 Q10 / §7 CaptureSink).
const puppeteer = require('puppeteer-core')
const fs = require('node:fs')
const path = require('node:path')

const SHOTS = path.join(__dirname, '..', 'docs', 'design', 'screenshots', 'phase-6')
fs.mkdirSync(SHOTS, { recursive: true })

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const URL = process.env.URL || 'http://localhost:3016/'
const STORAGE_KEY = 'cys-stift.cards.v1'

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
  }, STORAGE_KEY)
}

async function clearCards(page) {
  await page.evaluate((k) => localStorage.removeItem(k), STORAGE_KEY)
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

  // Start with empty state on the home page.
  await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 30000 })
  await wait(1500)
  await clearCards(page)
  await shotFull(page, '01-home-with-capture.png')

  // 1. Trigger Cmd+Shift+Space on /.
  // mac → Meta. win → Control. We use Control so it works on the mac Chrome
  // we're driving (Meta+Shift+Space can be eaten by Spotlight on macOS).
  await page.keyboard.down('Control')
  await page.keyboard.down('Shift')
  await page.keyboard.press('Space')
  await page.keyboard.up('Shift')
  await page.keyboard.up('Control')
  await wait(400)
  const opened = await page.$('.mi-backdrop') !== null
  console.log(`  [shortcut] mini input opened = ${opened}`)
  await shot(page, '02-mini-input-open.png')

  // 2. Type a title, press Enter to expand the body textarea.
  await page.keyboard.type('灵感：凌晨四点的小想法')
  await wait(200)
  await shot(page, '03-mini-input-with-title.png')

  await page.keyboard.press('Enter')
  await wait(300)
  const bodyOpen = await page.$('.mi-textarea') !== null
  console.log(`  [enter on title] body opened = ${bodyOpen}`)
  await shot(page, '04-mini-input-body-expanded.png')

  // 3. Type body and Cmd+Enter to save.
  await page.keyboard.type('全局快捷键 + Mini Input 应该 3 秒内完成捕获。')
  await wait(200)
  await page.keyboard.down('Control')
  await page.keyboard.press('Enter')
  await page.keyboard.up('Control')
  await wait(500)
  const closedAfterSave = await page.$('.mi-backdrop') === null
  console.log(`  [cmd+enter] mini input closed after save = ${closedAfterSave}`)

  // 4. Navigate to /inbox and confirm the new card is there.
  await page.goto(URL.replace(/\/?$/, '/inbox'), { waitUntil: 'domcontentloaded' })
  await page.waitForSelector('[class*="tile"], .empty-state, .ib-grid', { timeout: 15000 })
  await wait(800)
  await shotFull(page, '05-inbox-after-capture.png')

  const cards = await readCards(page)
  const found = cards.find((c) => c.title === '灵感：凌晨四点的小想法')
  const sourceOk =
    !!found &&
    found.source &&
    found.source.kind === 'shortcut' &&
    found.source.shortcutId === 'cmd-shift-space' &&
    found.source.deviceId === 'web'
  console.log(`  [persist] found card: ${!!found}, source.kind=shortcut: ${sourceOk}`)

  // 5. Reload and confirm the card still exists (localStorage round-trip).
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.waitForSelector('[class*="tile"], .empty-state, .ib-grid', { timeout: 15000 })
  await wait(800)
  const cardsAfterReload = await readCards(page)
  const stillThere = cardsAfterReload.find((c) => c.title === '灵感：凌晨四点的小想法')
  console.log(`  [reload] card still present = ${!!stillThere}`)

  // 6. Re-open on /canvas to prove the shortcut works on any route.
  await page.goto(URL.replace(/\/?$/, '/canvas'), { waitUntil: 'domcontentloaded' })
  await page.waitForSelector('[class*="tl-"]', { timeout: 15000 })
  await wait(1500)
  await page.keyboard.down('Control')
  await page.keyboard.down('Shift')
  await page.keyboard.press('Space')
  await page.keyboard.up('Shift')
  await page.keyboard.up('Control')
  await wait(400)
  const openedOnCanvas = await page.$('.mi-backdrop') !== null
  console.log(`  [shortcut on /canvas] opened = ${openedOnCanvas}`)
  await shot(page, '06-mini-input-on-canvas.png')

  // Close and capture /canvas with MiniInput dismissed.
  await page.keyboard.press('Escape')
  await wait(300)

  // 7. Input focus guard: when focus is in an INPUT, the shortcut must NOT
  // open the Mini Input. Open inbox, click into the CreateCardForm title
  // field, then send the shortcut. Expectation: no .mi-backdrop.
  await page.goto(URL.replace(/\/?$/, '/inbox'), { waitUntil: 'domcontentloaded' })
  await page.waitForSelector('[class*="tile"], .empty-state, .ib-grid', { timeout: 15000 })
  await wait(800)
  // The inbox create form's title input. Phase 3 form has the first input
  // (title) under .ib-create-form or similar — use a robust selector that
  // matches the first text input on the page that is not inside .mi-backdrop.
  const inputFound = await page.evaluate(() => {
    const inputs = Array.from(document.querySelectorAll('input[type="text"], input:not([type])'))
    for (const i of inputs) {
      // Skip the (now-closed) mini input if any
      if (i.closest('.mi-backdrop')) continue
      i.focus()
      return i.tagName + ':' + (i.placeholder || i.name || '')
    }
    return null
  })
  console.log(`  [input guard] focused element = ${inputFound}`)
  await page.keyboard.down('Control')
  await page.keyboard.down('Shift')
  await page.keyboard.press('Space')
  await page.keyboard.up('Shift')
  await page.keyboard.up('Control')
  await wait(300)
  const guardHeld = await page.$('.mi-backdrop') === null
  console.log(`  [input guard] mini input did NOT open = ${guardHeld}`)
  await shotFull(page, '07-inbox-focus-guard.png')

  // 8. Mobile viewport with the Mini Input open.
  await page.setViewport({ width: 390, height: 844 })
  await page.goto(URL.replace(/\/?$/, '/'), { waitUntil: 'domcontentloaded' })
  await wait(1000)
  await page.keyboard.down('Control')
  await page.keyboard.down('Shift')
  await page.keyboard.press('Space')
  await page.keyboard.up('Shift')
  await page.keyboard.up('Control')
  await wait(400)
  await shot(page, '08-mini-input-mobile.png')
  await page.keyboard.press('Escape')
  await wait(200)
  await shotFull(page, '09-home-mobile.png')
  await page.setViewport({ width: 1440, height: 900 })

  console.log(`\nPage errors: ${pageErrors.length === 0 ? 'none' : pageErrors.join(' | ')}`)
  await browser.close()
  console.log(`\nArchived to ${SHOTS}`)

  const ok = {
    shortcutOpen: opened,
    enterExpandsBody: bodyOpen,
    cmdEnterSaves: closedAfterSave,
    sourceShortcut: sourceOk,
    persistedAcrossReload: !!stillThere,
    shortcutOnCanvas: openedOnCanvas,
    inputGuard: guardHeld,
    pageErrors: pageErrors.length === 0,
  }
  console.log('\nPhase 6 acceptance:')
  for (const [k, v] of Object.entries(ok)) console.log(`  ${v ? '✓' : '✗'} ${k}`)
  if (Object.values(ok).every(Boolean)) {
    console.log('\nALL CHECKS PASSED')
  } else {
    console.log('\nSOME CHECKS FAILED — see ✗ above')
    process.exit(1)
  }
})()