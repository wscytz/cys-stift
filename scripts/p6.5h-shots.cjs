#!/usr/bin/env node
// Phase 6.5h — keymap customisation. /settings page writes capture
// shortcut; CaptureHost reads it. Change to Ctrl+⇧+KeyC, verify the new
// combo opens Mini Input (old one still works too — cross-platform).
const puppeteer = require('puppeteer-core')
const fs = require('node:fs')
const path = require('node:path')

const SHOTS = path.join(__dirname, '..', 'docs', 'design', 'screenshots', 'phase-6.5h')
fs.mkdirSync(SHOTS, { recursive: true })

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const URL = process.env.URL || 'http://localhost:3016/'
const SETTINGS_KEY = 'cys-stift.settings.v1'

const wait = (ms) => new Promise((r) => setTimeout(r, ms))

async function shotFull(page, name) {
  const file = path.join(SHOTS, name)
  await page.screenshot({ path: file, fullPage: true })
  console.log(`✓ ${name}  (${(fs.statSync(file).size / 1024).toFixed(1)} kB)`)
}

async function readSettings(page) {
  return page.evaluate((k) => {
    const raw = localStorage.getItem(k)
    if (!raw) return null
    return JSON.parse(raw).settings
  }, SETTINGS_KEY)
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
  await page.evaluate((k) => localStorage.removeItem(k), SETTINGS_KEY)
  await page.reload({ waitUntil: 'domcontentloaded' })
  await wait(800)

  // ── 1. /settings default state ────────────────────────────────────
  await page.goto(URL + 'settings', { waitUntil: 'domcontentloaded' })
  await wait(600)
  const defaultCurrent = await page.$eval('.set__current code', (el) =>
    el.textContent.trim(),
  )
  console.log(`  [default] current shortcut = ${defaultCurrent}`)
  await shotFull(page, '01-settings-default.png')

  // ── 2. Change key to 'C' ───────────────────────────────────────────
  await page.evaluate(() => {
    const selects = document.querySelectorAll('select')
    // last select is the Key selector
    const keySel = selects[selects.length - 1]
    keySel.value = 'KeyC'
    keySel.dispatchEvent(new Event('change', { bubbles: true }))
  })
  await wait(400)
  const afterChange = await page.$eval('.set__current code', (el) =>
    el.textContent.trim(),
  )
  console.log(`  [changed] current shortcut = ${afterChange}  (expect ⌘+⇧+C)`)
  await shotFull(page, '02-settings-changed.png')

  // Verify localStorage persisted
  const persisted = await readSettings(page)
  console.log(`  [persisted] code = ${persisted?.captureShortcut?.code}  (expect KeyC)`)

  // ── 3. Navigate home, press new combo → Mini Input opens ───────────
  await page.goto(URL, { waitUntil: 'domcontentloaded' })
  await wait(600)
  // Reload so the new settings hydrate into CaptureHost (settings hydrate
  // on mount; changing them updates the store live, but the keydown
  // listener deps include sc.code so it re-binds. Either way:)
  await page.keyboard.down('Control')
  await page.keyboard.down('Shift')
  await page.keyboard.press('KeyC')
  await page.keyboard.up('Shift')
  await page.keyboard.up('Control')
  await wait(400)
  const miniOpen = (await page.$('.mi-backdrop')) !== null
  console.log(`  [new-combo] mini input open = ${miniOpen}`)
  await shotFull(page, '03-mini-input-with-custom-key.png')
  if (miniOpen) {
    await page.keyboard.press('Escape')
    await wait(200)
  }

  await browser.close()

  console.log('\n── page errors ──')
  if (pageErrors.length === 0) console.log('  none')
  else pageErrors.forEach((e) => console.log(`  ! ${e}`))

  const pass =
    /⌘\+⇧\+Space/.test(defaultCurrent || '') &&
    /⌘\+⇧\+C/.test(afterChange || '') &&
    persisted?.captureShortcut?.code === 'KeyC' &&
    miniOpen &&
    pageErrors.length === 0
  console.log(`\n${pass ? '✓ ALL ASSERTIONS PASS' : '✗ ASSERTIONS FAILED'}`)
  process.exit(pass ? 0 : 1)
})().catch((e) => {
  console.error(e)
  process.exit(2)
})