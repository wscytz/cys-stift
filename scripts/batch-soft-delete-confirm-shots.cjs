#!/usr/bin/env node
// Phase batch-soft-delete-confirm — review §🟠 UX #3.
//   1. Seed 3 archived cards with distinct titles.
//   2. /archive, enter select mode, tick all 3.
//   3. Click floater "Soft-delete" → confirm Modal opens (3 cards
//      listed by title; "restore from Trash" link visible).
//   4. Click Cancel → Modal closes, 3 cards still in archive,
//      selection preserved.
//   5. Click floater "Soft-delete" again → Modal reopens.
//   6. Click danger "Soft-delete 3" → /archive empty, /trash has 3.
const puppeteer = require('puppeteer-core')
const fs = require('node:fs')
const path = require('node:path')

const SHOTS = path.join(__dirname, '..', 'docs', 'design', 'screenshots', 'phase-batch-confirm')
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

  // ── 0. Seed: 3 archived cards with distinct titles ─────────────
  await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 30000 })
  await wait(800)
  await page.evaluate((k) => {
    const now = new Date().toISOString()
    const cards = ['First', 'Second', 'Third'].map((label, i) => ({
      id: `bc-${i + 1}`,
      title: `${label} archived card`,
      body: `body ${i + 1}`,
      type: 'note',
      media: [], links: [], codeSnippets: [], quotes: [],
      source: { kind: 'manual', deviceId: 'web' },
      capturedAt: now, createdAt: now, updatedAt: now,
      pinned: false, archived: true,
    }))
    localStorage.setItem(k, JSON.stringify({ cards }))
  }, STORAGE_KEY)
  console.log('  [seed] 3 archived cards written')

  // ── 1. /archive + select all 3 ─────────────────────────────────
  await page.goto(URL + 'archive', { waitUntil: 'domcontentloaded' })
  await wait(800)
  await page.evaluate(() => {
    const btns = [...document.querySelectorAll('button')]
    const sel = btns.find((b) => b.textContent.trim() === 'Select')
    sel?.click()
  })
  await wait(300)
  const checks = await page.$$('.tile__check input[type="checkbox"]')
  console.log(`  [select-mode] checkboxes = ${checks.length}  (expect 3)`)
  for (const c of checks) await c.click()
  await wait(300)
  const floaterLabel = await page.$eval('.floater__label', (el) => el.textContent)
  console.log(`  [floater] label = ${floaterLabel}  (expect "3 selected")`)

  // ── 2. Click floater "Soft-delete" → confirm Modal opens ────────
  await page.evaluate(() => {
    const btns = [...document.querySelectorAll('.floater button')]
    const soft = btns.find((b) => b.textContent.trim() === 'Soft-delete')
    soft?.click()
  })
  await wait(400)
  const confirmOpen = await page.evaluate(
    () => document.querySelectorAll('.confirm__body').length > 0,
  )
  console.log(`  [confirm modal] open = ${confirmOpen}  (expect true)`)
  // Modal title should mention 3 cards
  const modalTitle = await page.evaluate(() => {
    const dialog = document.querySelector('[role="dialog"]')
    return dialog?.querySelector('h2')?.textContent || ''
  })
  console.log(`  [confirm title] = ${JSON.stringify(modalTitle)}  (expect contains "3 cards")`)
  // Body should list 3 titles + Trash link
  const bodyHasTitles = await page.evaluate(() => {
    const bodies = [...document.querySelectorAll('.confirm__body')]
    return bodies.some((b) =>
      ['First', 'Second', 'Third'].every((label) => b.textContent.includes(label)),
    )
  })
  console.log(`  [confirm body] lists 3 titles = ${bodyHasTitles}  (expect true)`)
  const bodyHasTrashLink = await page.evaluate(() => {
    return [...document.querySelectorAll('.confirm__body a')]
      .some((a) => a.getAttribute('href') === '/trash/' || a.getAttribute('href') === '/trash')
  })
  console.log(`  [confirm body] links to /trash = ${bodyHasTrashLink}  (expect true)`)
  await shotFull(page, '01-confirm-modal-open.png')

  // ── 3. Click Cancel → Modal closes, 3 cards still in archive ──
  await page.evaluate(() => {
    const btns = [...document.querySelectorAll('.confirm__actions button')]
    const cancel = btns.find((b) => b.textContent.trim() === 'Cancel')
    cancel?.click()
  })
  await wait(300)
  const afterCancelModal = await page.evaluate(
    () => document.querySelectorAll('.confirm__body').length,
  )
  console.log(`  [after cancel] confirm modal present = ${afterCancelModal}  (expect 0)`)
  const afterCancelCards = await readCards(page)
  const stillArchived = afterCancelCards.filter((c) => c.archived && !c.deletedAt).length
  console.log(`  [after cancel] archived + not deleted = ${stillArchived}  (expect 3)`)
  const selectionAfterCancel = await page.$eval('.floater__label', (el) => el.textContent)
  console.log(`  [after cancel] floater label = ${selectionAfterCancel}  (expect "3 selected")`)
  await shotFull(page, '02-after-cancel.png')

  // ── 4. Re-trigger confirm Modal ───────────────────────────────
  await page.evaluate(() => {
    const btns = [...document.querySelectorAll('.floater button')]
    const soft = btns.find((b) => b.textContent.trim() === 'Soft-delete')
    soft?.click()
  })
  await wait(400)
  const reopenOpen = await page.evaluate(
    () => document.querySelectorAll('.confirm__body').length > 0,
  )
  console.log(`  [reopen] confirm modal present = ${reopenOpen}  (expect true)`)

  // ── 5. Click danger "Soft-delete 3" → all 3 soft-deleted ──────
  await page.evaluate(() => {
    const btns = [...document.querySelectorAll('.confirm__actions button')]
    const danger = btns.find((b) => b.textContent.trim() === 'Soft-delete 3')
    danger?.click()
  })
  await wait(500)
  const afterConfirm = await readCards(page)
  const stillArchived2 = afterConfirm.filter((c) => c.archived && !c.deletedAt).length
  const inTrash = afterConfirm.filter((c) => c.deletedAt).length
  console.log(`  [after confirm] archived + not deleted = ${stillArchived2}  (expect 0)`)
  console.log(`  [after confirm] in trash (deletedAt set) = ${inTrash}  (expect 3)`)

  // /archive should be empty
  await page.goto(URL + 'archive', { waitUntil: 'domcontentloaded' })
  await wait(800)
  const archiveAfter = await page.$$('.tile')
  console.log(`  [/archive after] tiles = ${archiveAfter.length}  (expect 0)`)
  await shotFull(page, '03-archive-empty-after.png')

  // /trash should have 3
  await page.goto(URL + 'trash', { waitUntil: 'domcontentloaded' })
  await wait(800)
  const trashAfter = await page.$$('.trash-item')
  console.log(`  [/trash after] items = ${trashAfter.length}  (expect 3)`)
  await shotFull(page, '04-trash-with-three.png')

  await browser.close()

  console.log('\n── page errors ──')
  if (pageErrors.length === 0) console.log('  none')
  else pageErrors.forEach((e) => console.log(`  ! ${e}`))

  // ── Assertions ───────────────────────────────────────────────
  const pass =
    checks.length === 3 &&
    floaterLabel === '3 selected' &&
    confirmOpen === true &&
    modalTitle.includes('3 cards') &&
    bodyHasTitles === true &&
    bodyHasTrashLink === true &&
    afterCancelModal === 0 &&
    stillArchived === 3 &&
    selectionAfterCancel === '3 selected' &&
    reopenOpen === true &&
    stillArchived2 === 0 &&
    inTrash === 3 &&
    archiveAfter.length === 0 &&
    trashAfter.length === 3 &&
    pageErrors.length === 0
  console.log(`\nresult: ${pass ? 'PASS ✓' : 'FAIL ✗'}`)
  process.exit(pass ? 0 : 1)
})().catch((e) => {
  console.error(e)
  process.exit(2)
})