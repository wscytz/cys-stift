#!/usr/bin/env node
// Phase dark-mode (spec §5.6, 2026-06-20). The 6 Bauhaus primaries
// stay; backgrounds and text swap.
//
//   1. Default: <html data-theme="light">. Background = white.
//   2. Visit /settings, choose "Dark" → <html data-theme="dark">.
//   3. Reload — the inline head script reads the stored preference
//      and re-applies it before paint, so dark is set on first
//      paint (no flash).
//   4. Switch to "Light" → light back.
//   5. Switch to "System" → resolves against prefers-color-scheme.
//      In headless puppeteer the OS preference is no-preference, so
//      'system' resolves to 'light'.
const puppeteer = require('puppeteer-core')
const fs = require('node:fs')
const path = require('node:path')

const SHOTS = path.join(__dirname, '..', 'docs', 'design', 'screenshots', 'phase-dark-mode')
fs.mkdirSync(SHOTS, { recursive: true })

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const URL = process.env.URL || 'http://localhost:3016/'

const wait = (ms) => new Promise((r) => setTimeout(r, ms))

async function shotFull(page, name) {
  const file = path.join(SHOTS, name)
  await page.screenshot({ path: file, fullPage: true })
  console.log(`✓ ${name}  (${(fs.statSync(file).size / 1024).toFixed(1)} kB)`)
}

async function getTheme(page) {
  return page.evaluate(() => document.documentElement.getAttribute('data-theme'))
}

async function getBgVar(page, name) {
  return page.evaluate((n) => {
    return getComputedStyle(document.documentElement)
      .getPropertyValue(n).trim()
  }, name)
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

  // ── 0. Clear any saved theme pref so we start in the default state
  await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 30000 })
  await wait(600)
  await page.evaluate(() => {
    localStorage.removeItem('cys-stift.settings.v1')
  })

  // ── 1. Default: light ────────────────────────────────────────
  await page.goto(URL + 'inbox', { waitUntil: 'domcontentloaded' })
  await wait(800)
  const initialTheme = await getTheme(page)
  const lightWhite = await getBgVar(page, '--color-white')
  const lightBlack = await getBgVar(page, '--color-black')
  console.log(`  [default] data-theme = ${initialTheme}  (expect light)`)
  console.log(`  [default] --color-white = ${lightWhite}  (expect #fafafa)`)
  console.log(`  [default] --color-black = ${lightBlack}  (expect #0a0a0a)`)
  await shotFull(page, '01-light.png')

  // ── 2. Settings → Dark ───────────────────────────────────────
  await page.goto(URL + 'settings', { waitUntil: 'domcontentloaded' })
  await wait(500)
  await page.evaluate(() => {
    const sel = document.querySelector('.set__select')
    sel.value = 'dark'
    sel.dispatchEvent(new Event('change', { bubbles: true }))
  })
  await wait(400)
  const afterDark = await getTheme(page)
  const darkWhite = await getBgVar(page, '--color-white')
  const darkBlack = await getBgVar(page, '--color-black')
  console.log(`  [after dark select] data-theme = ${afterDark}  (expect dark)`)
  console.log(`  [after dark select] --color-white = ${darkWhite}  (expect #0a0a0a — swapped bg)`)
  console.log(`  [after dark select] --color-black = ${darkBlack}  (expect #fafafa — swapped fg)`)
  await shotFull(page, '02-dark.png')

  // ── 3. Reload — inline head script re-applies dark before paint ─
  await page.reload({ waitUntil: 'domcontentloaded' })
  await wait(500)
  const afterReload = await getTheme(page)
  console.log(`  [after reload] data-theme = ${afterReload}  (expect dark)`)

  // ── 4. /inbox should render dark too ───────────────────────
  await page.goto(URL + 'inbox', { waitUntil: 'domcontentloaded' })
  await wait(500)
  const inboxTheme = await getTheme(page)
  console.log(`  [/inbox dark] data-theme = ${inboxTheme}  (expect dark)`)
  await shotFull(page, '03-inbox-dark.png')

  // ── 5. Switch back to light ────────────────────────────────
  await page.goto(URL + 'settings', { waitUntil: 'domcontentloaded' })
  await wait(400)
  await page.evaluate(() => {
    const sel = document.querySelector('.set__select')
    sel.value = 'light'
    sel.dispatchEvent(new Event('change', { bubbles: true }))
  })
  await wait(400)
  const afterLight = await getTheme(page)
  const lightWhite2 = await getBgVar(page, '--color-white')
  console.log(`  [after light select] data-theme = ${afterLight}  (expect light)`)
  console.log(`  [after light select] --color-white = ${lightWhite2}  (expect #fafafa)`)

  // ── 6. System ───────────────────────────────────────────────
  await page.evaluate(() => {
    const sel = document.querySelector('.set__select')
    sel.value = 'system'
    sel.dispatchEvent(new Event('change', { bubbles: true }))
  })
  await wait(400)
  const afterSystem = await getTheme(page)
  console.log(`  [after system select] data-theme = ${afterSystem}  (expect light — headless has no OS dark)`)

  await browser.close()

  console.log('\n── page errors ──')
  if (pageErrors.length === 0) console.log('  none')
  else pageErrors.forEach((e) => console.log(`  ! ${e}`))

  const pass =
    initialTheme === 'light' &&
    lightWhite === '#fafafa' &&
    lightBlack === '#0a0a0a' &&
    afterDark === 'dark' &&
    darkWhite === '#0a0a0a' &&
    darkBlack === '#fafafa' &&
    afterReload === 'dark' &&
    inboxTheme === 'dark' &&
    afterLight === 'light' &&
    lightWhite2 === '#fafafa' &&
    afterSystem === 'light' &&
    pageErrors.length === 0
  console.log(`\nresult: ${pass ? 'PASS ✓' : 'FAIL ✗'}`)
  process.exit(pass ? 0 : 1)
})().catch((e) => {
  console.error(e)
  process.exit(2)
})