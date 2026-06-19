#!/usr/bin/env node
// Phase 6.5e — manual capture routes through WebCaptureSink.
// Card created via inbox form should have source.kind === 'manual'.
// We re-use the same React-input setter pattern from p6.5b.
const puppeteer = require('puppeteer-core')
const fs = require('node:fs')
const path = require('node:path')

const SHOTS = path.join(__dirname, '..', 'docs', 'design', 'screenshots', 'phase-6.5e')
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

  // /inbox → fill form → submit
  await page.goto(URL + 'inbox', { waitUntil: 'domcontentloaded' })
  await wait(800)

  // Type title into CreateCardForm (placeholder "灵感标题…")
  await page.evaluate(() => {
    window.__setReactInputValue = (el, value) => {
      const proto = el.tagName === 'TEXTAREA'
        ? window.HTMLTextAreaElement.prototype
        : window.HTMLInputElement.prototype
      const desc = Object.getOwnPropertyDescriptor(proto, 'value')
      desc.set.call(el, value)
      el.dispatchEvent(new Event('input', { bubbles: true }))
    }
  })
  await page.evaluate(() => {
    const t = [...document.querySelectorAll('input')].find(
      (i) => i.placeholder === '灵感标题…',
    )
    if (t) window.__setReactInputValue(t, 'P6.5e manual capture test')
  })
  await wait(200)

  // Click Add to inbox
  await page.evaluate(() => {
    const btns = [...document.querySelectorAll('button')]
    const submit = btns.find((b) => /add to inbox/i.test(b.textContent || ''))
    submit?.click()
  })
  await wait(800)
  await shotFull(page, '01-inbox-after-manual-create.png')

  // Verify source.kind === 'manual'
  const cards = await readCards(page)
  const c = cards[0]
  console.log(`  [created] title = ${c?.title}`)
  console.log(`  [created] source.kind = ${c?.source?.kind}  (expect 'manual')`)

  // Reload, verify persistence
  await page.reload({ waitUntil: 'domcontentloaded' })
  await wait(800)
  const cards2 = await readCards(page)
  const c2 = cards2[0]
  console.log(`  [reload] title = ${c2?.title}  source.kind = ${c2?.source?.kind}`)

  await browser.close()

  console.log('\n── page errors ──')
  if (pageErrors.length === 0) console.log('  none')
  else pageErrors.forEach((e) => console.log(`  ! ${e}`))

  const pass =
    c?.title === 'P6.5e manual capture test' &&
    c?.source?.kind === 'manual' &&
    c?.source?.deviceId === 'web' &&
    c2?.title === 'P6.5e manual capture test' &&
    c2?.source?.kind === 'manual' &&
    pageErrors.length === 0
  console.log(`\n${pass ? '✓ ALL ASSERTIONS PASS' : '✗ ASSERTIONS FAILED'}`)
  process.exit(pass ? 0 : 1)
})().catch((e) => {
  console.error(e)
  process.exit(2)
})