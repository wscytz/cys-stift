#!/usr/bin/env node
// Phase 6.5a visual + interaction evidence — draft autosave (spec §5.5).
// Mini Input: type → close (Escape keeps draft) → reopen → restored.
// Update → close → reopen → latest. Cmd+Enter save → reopen → empty.
// CreateCardForm: type → navigate away → back → restored.
// localStorage cys-stift.drafts.v1 inspected directly.
const puppeteer = require('puppeteer-core')
const fs = require('node:fs')
const path = require('node:path')

const SHOTS = path.join(__dirname, '..', 'docs', 'design', 'screenshots', 'phase-6.5a')
fs.mkdirSync(SHOTS, { recursive: true })

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const URL = process.env.URL || 'http://localhost:3016/'
const DRAFTS_KEY = 'cys-stift.drafts.v1'
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

async function openMiniInput(page) {
  await page.keyboard.down('Control')
  await page.keyboard.down('Shift')
  await page.keyboard.press('Space')
  await page.keyboard.up('Shift')
  await page.keyboard.up('Control')
  await wait(400)
}

async function closeMiniInput(page) {
  await page.keyboard.press('Escape')
  await wait(300)
}

async function readDrafts(page) {
  return page.evaluate((k) => {
    const raw = localStorage.getItem(k)
    if (!raw) return null
    return JSON.parse(raw)
  }, DRAFTS_KEY)
}

async function readTitleValue(page) {
  return page.$eval('.mi-title', (el) => el.value).catch(() => '')
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
  // Clean slate
  await page.evaluate(() => {
    localStorage.removeItem('cys-stift.drafts.v1')
    localStorage.removeItem('cys-stift.cards.v1')
  })
  await page.reload({ waitUntil: 'domcontentloaded' })
  await wait(800)

  // ── 1. Type a draft in Mini Input, close via Escape (keeps draft) ───
  await openMiniInput(page)
  await page.keyboard.type('草稿测试 A')
  await wait(200)
  await shot(page, '01-mini-input-with-draft-a.png')
  // Let the 500ms debounce fire.
  await wait(700)
  await closeMiniInput(page)
  const draftsAfterEscape = await readDrafts(page)
  const captureKept =
    draftsAfterEscape?.drafts?.capture?.payload?.title === '草稿测试 A'
  console.log(
    `  [escape-keeps-draft] capture title = ${draftsAfterEscape?.drafts?.capture?.payload?.title}  (expect 草稿测试 A)`,
  )

  // ── 2. Reopen → restored ───────────────────────────────────────────
  await openMiniInput(page)
  await wait(400)
  const restoredA = await readTitleValue(page)
  console.log(`  [restore] title after reopen = ${restoredA}  (expect 草稿测试 A)`)
  await shot(page, '02-mini-input-restored-a.png')

  // ── 3. Update to B, close, reopen → latest ─────────────────────────
  // Clear and retype.
  await page.click('.mi-title', { clickCount: 3 })
  await page.keyboard.type('草稿测试 B')
  await wait(200)
  await wait(700) // debounce
  await closeMiniInput(page)
  await openMiniInput(page)
  await wait(400)
  const restoredB = await readTitleValue(page)
  console.log(`  [update] title after reopen = ${restoredB}  (expect 草稿测试 B)`)
  await shot(page, '03-mini-input-restored-b.png')

  // ── 4. Cmd+Enter save → draft cleared ─────────────────────────────
  await page.keyboard.down('Control')
  await page.keyboard.press('Enter')
  await page.keyboard.up('Control')
  await wait(500)
  const draftsAfterSave = await readDrafts(page)
  const captureCleared =
    !draftsAfterSave?.drafts?.capture ||
    draftsAfterSave.drafts.capture == null
  console.log(
    `  [save-clears-draft] capture present = ${!!draftsAfterSave?.drafts?.capture}  (expect false)`,
  )
  // Confirm card landed in /inbox.
  await page.goto(URL + 'inbox', { waitUntil: 'domcontentloaded' })
  await wait(800)
  const inboxTiles = await page.$$('.tile')
  console.log(`  [card-saved] inbox tiles = ${inboxTiles.length}  (expect 1)`)
  await shotFull(page, '04-inbox-after-save.png')

  // ── 5. CreateCardForm draft restore ────────────────────────────────
  await page.goto(URL + 'inbox', { waitUntil: 'domcontentloaded' })
  await wait(600)
  // Type into the form title input (the first input in CreateCardForm).
  await page.evaluate(() => {
    const inputs = document.querySelectorAll('#__next input, input')
    // find the form title input by name attr containing 'title'
    const t = [...inputs].find((i) => /title/i.test(i.name || '') || i.placeholder === '灵感标题…')
    t?.focus()
  })
  await wait(200)
  await page.keyboard.type('表单草稿')
  await wait(200)
  await wait(700) // debounce
  const draftsManual = await readDrafts(page)
  const manualKept =
    draftsManual?.drafts?.manual?.payload?.title === '表单草稿'
  console.log(
    `  [form-draft-saved] manual title = ${draftsManual?.drafts?.manual?.payload?.title}  (expect 表单草稿)`,
  )
  await shotFull(page, '05-form-with-draft.png')

  // Navigate away and back → restored.
  await page.goto(URL, { waitUntil: 'domcontentloaded' })
  await wait(400)
  await page.goto(URL + 'inbox', { waitUntil: 'domcontentloaded' })
  await wait(800)
  const formTitleRestored = await page.evaluate(() => {
    const t = [...document.querySelectorAll('input')].find(
      (i) => i.placeholder === '灵感标题…',
    )
    return t?.value ?? ''
  })
  console.log(
    `  [form-draft-restored] title after navigate = ${formTitleRestored}  (expect 表单草稿)`,
  )
  await shotFull(page, '06-form-restored-after-nav.png')

  await browser.close()

  console.log('\n── page errors ──')
  if (pageErrors.length === 0) console.log('  none')
  else pageErrors.forEach((e) => console.log(`  ! ${e}`))

  const pass =
    captureKept &&
    restoredA === '草稿测试 A' &&
    restoredB === '草稿测试 B' &&
    captureCleared &&
    inboxTiles.length === 1 &&
    manualKept &&
    formTitleRestored === '表单草稿' &&
    pageErrors.length === 0
  console.log(`\n${pass ? '✓ ALL ASSERTIONS PASS' : '✗ ASSERTIONS FAILED'}`)
  process.exit(pass ? 0 : 1)
})().catch((e) => {
  console.error(e)
  process.exit(2)
})