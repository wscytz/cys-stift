#!/usr/bin/env node
// Phase archive-detail — review §🟠 UX #4: archive tile click opens
// detail Modal (view + edit + actions), shared with inbox.
//
//   1. Seed 1 archived card (with body, links, code, quotes).
//   2. /archive grid: click tile → Modal opens in view mode → shows
//      type, time, body markdown, links/code/quotes sections.
//   3. Click Edit → edit mode shows title input, body textarea, link/
//      code/quote editors.
//   4. Change title → Save → persisted to localStorage.
//   5. Re-open Modal (close + click again) → view shows new title.
//   6. Switch to Timeline view → click row → Modal opens again.
//   7. Open Modal → Soft-delete → confirm Modal (built into shared
//      CardDetailModal) → confirm → /archive grid empty, /trash has
//      the card.
//
// Notes: we use CardDetailModal's `cd__*` class namespace (inherited
// from Phase archive-detail's extraction). The Modal close is via
// the Modal's close button (Escape or overlay click — puppeteer uses
// Escape).
const puppeteer = require('puppeteer-core')
const fs = require('node:fs')
const path = require('node:path')

const SHOTS = path.join(__dirname, '..', 'docs', 'design', 'screenshots', 'phase-archive-detail')
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

  // ── 0. Seed: 1 archived card with rich content ──────────────────
  await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 30000 })
  await wait(800)
  await page.evaluate((k) => {
    const now = new Date().toISOString()
    localStorage.setItem(
      k,
      JSON.stringify({
        cards: [
          {
            id: 'arch-1',
            title: 'Rich archived card',
            body: '**Bold** body content.\n\n- item a\n- item b',
            type: 'note',
            media: [],
            links: [{ url: 'https://example.com', fetchedAt: now }],
            codeSnippets: [{ language: 'ts', code: 'const x = 1' }],
            quotes: [{ text: 'quote text', attribution: 'someone' }],
            source: { kind: 'manual', deviceId: 'web' },
            capturedAt: now, createdAt: now, updatedAt: now,
            pinned: false, archived: true,
          },
        ],
      }),
    )
  }, STORAGE_KEY)
  console.log('  [seed] 1 archived card written')

  // ── 1. /archive grid: click tile → Modal opens ───────────────────
  await page.goto(URL + 'archive', { waitUntil: 'domcontentloaded' })
  await wait(800)
  const tiles = await page.$$('.tile')
  console.log(`  [/archive grid] tiles = ${tiles.length}  (expect 1)`)
  await shotFull(page, '01-archive-grid.png')
  await tiles[0].click()
  await wait(400)
  // Modal open → look for shared CardDetailModal markers
  const detailOpen = await page.evaluate(() => {
    return !!document.querySelector('.cd__meta') && !!document.querySelector('.cd__actions')
  })
  console.log(`  [detail] modal open (grid click) = ${detailOpen}  (expect true)`)
  // View mode should show sections (cd__sec with h3 headings)
  const sections = await page.$$eval('.cd__sec-h', (els) =>
    els.map((e) => e.textContent),
  )
  console.log(`  [detail view] sections = ${JSON.stringify(sections)}  (expect Links/Code/Quotes)`)
  await shotFull(page, '02-detail-view-from-grid.png')

  // ── 2. Click Edit → edit mode ────────────────────────────────────
  await page.evaluate(() => {
    const btns = [...document.querySelectorAll('button')]
    const edit = btns.find((b) => b.textContent.trim() === 'Edit')
    edit?.click()
  })
  await wait(400)
  const editPanels = await page.$$('.le')
  console.log(`  [edit-mode] editor panels = ${editPanels.length}  (expect 3: links/code/quotes)`)
  await shotFull(page, '03-detail-edit-mode.png')

  // ── 3. Change title via React-compatible input setter ────────────
  await page.evaluate(() => {
    const proto = window.HTMLInputElement.prototype
    const desc = Object.getOwnPropertyDescriptor(proto, 'value')
    const el = document.querySelector('input[name="edit-title"]')
    desc.set.call(el, 'Renamed archive card')
    el.dispatchEvent(new Event('input', { bubbles: true }))
  })
  await wait(200)

  // ── 4. Save → verify persisted ──────────────────────────────────
  await page.evaluate(() => {
    const btns = [...document.querySelectorAll('button')]
    const save = btns.find((b) => b.textContent.trim() === 'Save')
    save?.click()
  })
  await wait(500)
  const afterSave = await readCards(page)
  const card1 = afterSave.find((c) => c.id === 'arch-1')
  console.log(`  [saved] title = ${card1?.title}  (expect Renamed archive card)`)
  await shotFull(page, '04-after-save.png')

  // ── 5. Modal should be back in view mode after save ─────────────
  const inViewAfterSave = await page.evaluate(() => {
    return !!document.querySelector('.cd__meta')
  })
  console.log(`  [detail] back in view = ${inViewAfterSave}  (expect true)`)

  // Close Modal via Escape
  await page.keyboard.press('Escape')
  await wait(300)
  const closedAfterEsc = await page.evaluate(() => !document.querySelector('.cd__meta'))
  console.log(`  [detail] closed on Escape = ${closedAfterEsc}  (expect true)`)

  // ── 6. Timeline view → click row tile → Modal opens ────────────
  await page.evaluate(() => {
    const btns = [...document.querySelectorAll('button')]
    const timeline = btns.find((b) => b.textContent.trim() === 'timeline')
    timeline?.click()
  })
  await wait(400)
  const rows = await page.$$('.row')
  console.log(`  [/archive timeline] rows = ${rows.length}  (expect 1)`)
  await shotFull(page, '05-archive-timeline.png')
  await rows[0].click()
  await wait(400)
  const detailFromTimeline = await page.evaluate(() => !!document.querySelector('.cd__meta'))
  console.log(`  [detail] modal open (timeline click) = ${detailFromTimeline}  (expect true)`)
  // Title should be the new one
  const modalTitle = await page.evaluate(() => {
    // Modal title is in the modal's first heading — we just check title input value is gone
    // (we're in view mode after timeline click)
    return document.querySelector('.cd__meta')?.closest('[role="dialog"]')?.querySelector('h2')?.textContent || ''
  })
  console.log(`  [detail timeline] modal title = ${JSON.stringify(modalTitle)}  (expect "Renamed archive card")`)
  await shotFull(page, '06-detail-view-from-timeline.png')

  // ── 7. Soft-delete from inside the Modal ────────────────────────
  await page.evaluate(() => {
    const btns = [...document.querySelectorAll('.cd__actions button')]
    const soft = btns.find((b) => b.textContent.trim() === 'Soft-delete')
    soft?.click()
  })
  await wait(400)
  const confirmOpen = await page.evaluate(() => !!document.querySelector('.cd__confirm'))
  console.log(`  [soft-delete confirm] open = ${confirmOpen}  (expect true)`)
  await shotFull(page, '07-soft-delete-confirm.png')
  // Click the danger "Soft-delete" inside .cd__confirm-actions
  await page.evaluate(() => {
    const body = document.querySelector('.cd__confirm')
    let root = body
    while (root.parentElement && !root.querySelector('.cd__confirm-actions')) {
      root = root.parentElement
    }
    const actions = root.querySelector('.cd__confirm-actions')
    const danger = [...actions.querySelectorAll('button')].find(
      (b) => b.textContent.trim() === 'Soft-delete',
    )
    danger.click()
  })
  await wait(500)
  const afterSoft = await readCards(page)
  const stillThere = afterSoft.find((c) => c.id === 'arch-1')
  const softDeleted = stillThere && !!stillThere.deletedAt
  console.log(`  [soft-delete] deletedAt set = ${softDeleted}  (expect true)`)

  // /archive should be empty now
  await page.goto(URL + 'archive', { waitUntil: 'domcontentloaded' })
  await wait(800)
  const archiveAfter = await page.$$('.tile')
  console.log(`  [/archive after soft-delete] tiles = ${archiveAfter.length}  (expect 0)`)
  await shotFull(page, '08-archive-empty-after-soft-delete.png')

  // /trash should have 1
  await page.goto(URL + 'trash', { waitUntil: 'domcontentloaded' })
  await wait(800)
  const trashAfter = await page.$$('.trash-item')
  console.log(`  [/trash after soft-delete] items = ${trashAfter.length}  (expect 1)`)

  await browser.close()

  console.log('\n── page errors ──')
  if (pageErrors.length === 0) console.log('  none')
  else pageErrors.forEach((e) => console.log(`  ! ${e}`))

  // ── Assertions ──────────────────────────────────────────────────
  const pass =
    detailOpen === true &&
    sections.includes('Links') &&
    sections.includes('Code') &&
    sections.includes('Quotes') &&
    editPanels.length === 3 &&
    card1?.title === 'Renamed archive card' &&
    inViewAfterSave === true &&
    closedAfterEsc === true &&
    rows.length === 1 &&
    detailFromTimeline === true &&
    modalTitle === 'Renamed archive card' &&
    confirmOpen === true &&
    softDeleted === true &&
    archiveAfter.length === 0 &&
    trashAfter.length === 1 &&
    pageErrors.length === 0
  console.log(`\nresult: ${pass ? 'PASS ✓' : 'FAIL ✗'}`)
  process.exit(pass ? 0 : 1)
})().catch((e) => {
  console.error(e)
  process.exit(2)
})