#!/usr/bin/env node
// Phase trash — soft-delete recovery view.
//   1. Seed 2 cards (one archived, one inbox).
//   2. Open /inbox, soft-delete the inbox card → /trash shows 1.
//   3. Click Restore → card returns to inbox.
//   4. Re-soft-delete the other card from /archive floater.
//   5. /trash shows 1, click Delete forever → Modal → confirm →
//      listAll() does not contain the id, /trash shows 0.
//   6. Also verify AppMenu shows Trash link active on /trash.
//   7. Screenshots throughout.
const puppeteer = require('puppeteer-core')
const fs = require('node:fs')
const path = require('node:path')

const SHOTS = path.join(__dirname, '..', 'docs', 'design', 'screenshots', 'phase-trash')
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

async function clickButtonWithText(page, text) {
  return page.evaluate((t) => {
    const btn = [...document.querySelectorAll('button')].find(
      (b) => b.textContent.trim() === t,
    )
    if (!btn) return false
    btn.click()
    return true
  }, text)
}

/**
 * Click the "Soft-delete" button in the OPEN confirm dialog (not the one
 * in the detail modal that just opened it). We wait for `.confirm__body`
 * to be visible, which is only present in the confirm modal — so the
 * next "Soft-delete" we find belongs to the confirm action.
 */
async function clickConfirmSoftDelete(page) {
  await page.waitForSelector('.confirm__body', { timeout: 5000 })
  await wait(150)
  return page.evaluate(() => {
    // The confirm modal is the outer Modal that contains .confirm__body.
    // The danger button is inside .confirm__actions; pick the one whose
    // closest ancestor has .confirm__body.
    const body = document.querySelector('.confirm__body')
    if (!body) return false
    // Walk up to the Modal root, then down to its danger button.
    let root = body
    while (root.parentElement && !root.querySelector('.confirm__actions')) {
      root = root.parentElement
    }
    const actions = root.querySelector('.confirm__actions')
    if (!actions) return false
    const danger = [...actions.querySelectorAll('button')].find((b) =>
      b.className.toLowerCase().includes('danger') ||
      b.textContent.trim() === 'Soft-delete',
    )
    if (!danger) return false
    danger.click()
    return true
  })
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

  // ── 0. Seed: 2 cards (one inbox, one archived) ────────────────────
  await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 30000 })
  await wait(800)
  await page.evaluate((k) => {
    const now = new Date().toISOString()
    localStorage.setItem(
      k,
      JSON.stringify({
        cards: [
          {
            id: 'tr-1',
            title: 'Inbox card to trash',
            body: 'round-trip me',
            type: 'note',
            media: [],
            links: [],
            codeSnippets: [],
            quotes: [],
            source: { kind: 'manual', deviceId: 'web' },
            capturedAt: now, createdAt: now, updatedAt: now,
            pinned: false, archived: false,
          },
          {
            id: 'tr-2',
            title: 'Archived card to hard-delete',
            body: 'gone forever',
            type: 'note',
            media: [],
            links: [],
            codeSnippets: [],
            quotes: [],
            source: { kind: 'manual', deviceId: 'web' },
            capturedAt: now, createdAt: now, updatedAt: now,
            pinned: false, archived: true,
          },
        ],
      }),
    )
  }, STORAGE_KEY)
  console.log('  [seed] 2 cards written')

  // ── 1. Open /trash empty ───────────────────────────────────────────
  await page.goto(URL + 'trash', { waitUntil: 'domcontentloaded' })
  await wait(800)
  const initialCount = (await readCards(page)).filter((c) => c.deletedAt).length
  console.log(`  [/trash initial] deletedAt count = ${initialCount}  (expect 0)`)
  await shotFull(page, '01-trash-empty.png')

  // ── 2. AppMenu shows "Trash" link and it is active on /trash ──────
  const trashActive = await page.evaluate(() => {
    const link = [...document.querySelectorAll('.app-menu__link')].find(
      (l) => l.textContent.trim() === 'Trash',
    )
    return link ? link.classList.contains('app-menu__link--active') : false
  })
  console.log(`  [menu] Trash link active on /trash = ${trashActive}  (expect true)`)

  // ── 3. Soft-delete tr-1 from /inbox (open card → soft-delete) ──────
  await page.goto(URL + 'inbox', { waitUntil: 'domcontentloaded' })
  await wait(800)
  const inboxTiles = await page.$$('.tile')
  console.log(`  [inbox tiles] = ${inboxTiles.length}  (expect 1: tr-2 is archived)`)
  await inboxTiles[0].click()
  await wait(400)
  // Detail modal open. Click its "Soft-delete" (danger) to open the
  // confirm modal.
  await clickButtonWithText(page, 'Soft-delete')
  await wait(400)
  // Confirm modal now open. Click its Soft-delete to actually soft-delete.
  const confirmed = await clickConfirmSoftDelete(page)
  console.log(`  [inbox modal confirm] clicked = ${confirmed}  (expect true)`)
  await wait(500)
  const cardsAfterSoft = await readCards(page)
  const tr1 = cardsAfterSoft.find((c) => c.id === 'tr-1')
  console.log(`  [tr-1] deletedAt set = ${!!tr1?.deletedAt}  (expect true)`)

  // ── 4. Visit /trash — 1 card, click Restore ───────────────────────
  await page.goto(URL + 'trash', { waitUntil: 'domcontentloaded' })
  await wait(800)
  const trashItems = await page.$$('.trash-item')
  console.log(`  [/trash] items = ${trashItems.length}  (expect 1)`)
  await shotFull(page, '02-trash-with-one.png')
  const restored = await clickButtonWithText(page, 'Restore')
  console.log(`  [/trash] Restore clicked = ${restored}  (expect true)`)
  await wait(500)
  const cardsAfterRestore = await readCards(page)
  const tr1After = cardsAfterRestore.find((c) => c.id === 'tr-1')
  console.log(
    `  [tr-1] deletedAt after restore = ${tr1After?.deletedAt}  (expect undefined)`,
  )
  // tr-1 should now be back in inbox (was never archived)
  await page.goto(URL + 'inbox', { waitUntil: 'domcontentloaded' })
  await wait(800)
  const inboxAfter = await page.$$('.tile')
  console.log(`  [inbox after restore] tiles = ${inboxAfter.length}  (expect 1: tr-1)`)
  await shotFull(page, '03-inbox-after-restore.png')

  // ── 5. Re-soft-delete tr-1, then hard-delete it from /trash ───────
  // tr-1 is back in inbox; open it, soft-delete, confirm.
  await page.evaluate(() => {
    const tile = document.querySelector('.tile')
    tile?.click()
  })
  await wait(400)
  await clickButtonWithText(page, 'Soft-delete')
  await wait(400)
  await clickConfirmSoftDelete(page)
  await wait(500)
  // Now /trash has tr-1 again. HardDelete it.
  await page.goto(URL + 'trash', { waitUntil: 'domcontentloaded' })
  await wait(800)
  const trashItems2 = await page.$$('.trash-item')
  console.log(`  [/trash second] items = ${trashItems2.length}  (expect 1)`)
  await shotFull(page, '04-trash-before-hard-delete.png')

  // Click Delete forever → Modal
  await clickButtonWithText(page, 'Delete forever')
  await wait(500)
  const modalOpen = await page.evaluate(
    () => document.querySelectorAll('.confirm__body').length > 0,
  )
  console.log(`  [hard-delete modal] open = ${modalOpen}  (expect true)`)
  await shotFull(page, '05-trash-hard-delete-modal.png')
  // Confirm (the confirm modal has a danger button labelled "Delete forever"
  // inside .confirm__actions).
  const confirmedHard = await page.evaluate(() => {
    const body = document.querySelector('.confirm__body')
    if (!body) return false
    let root = body
    while (root.parentElement && !root.querySelector('.confirm__actions')) {
      root = root.parentElement
    }
    const actions = root.querySelector('.confirm__actions')
    if (!actions) return false
    const danger = [...actions.querySelectorAll('button')].find(
      (b) => b.textContent.trim() === 'Delete forever',
    )
    if (!danger) return false
    danger.click()
    return true
  })
  console.log(`  [hard-delete confirm] clicked = ${confirmedHard}  (expect true)`)
  await wait(500)
  const cardsAfterHard = await readCards(page)
  const stillThere = cardsAfterHard.some((c) => c.id === 'tr-1')
  console.log(`  [tr-1] still in store = ${stillThere}  (expect false)`)

  // /trash should be empty now
  await page.goto(URL + 'trash', { waitUntil: 'domcontentloaded' })
  await wait(800)
  const finalTrash = await page.$$('.trash-item')
  console.log(`  [/trash final] items = ${finalTrash.length}  (expect 0)`)
  await shotFull(page, '06-trash-empty-after-hard-delete.png')

  // ── 6. Inbox soft-delete Modal copy now mentions Trash ────────────
  await page.goto(URL + 'inbox', { waitUntil: 'domcontentloaded' })
  await wait(800)
  // Open the only remaining card (tr-2 is archived; but if hard-delete
  // just took tr-1, inbox may be empty). Seed a fresh card to test copy.
  await page.evaluate((k) => {
    const cur = JSON.parse(localStorage.getItem(k) || '{"cards":[]}')
    const now = new Date().toISOString()
    cur.cards.push({
      id: 'tr-copy',
      title: 'Copy check',
      body: '',
      type: 'note',
      media: [], links: [], codeSnippets: [], quotes: [],
      source: { kind: 'manual', deviceId: 'web' },
      capturedAt: now, createdAt: now, updatedAt: now,
      pinned: false, archived: false,
    })
    localStorage.setItem(k, JSON.stringify(cur))
  }, STORAGE_KEY)
  await page.goto(URL + 'inbox', { waitUntil: 'domcontentloaded' })
  await wait(800)
  await page.click('.tile')
  await wait(400)
  // Find Soft-delete button (danger, in detail modal)
  await page.evaluate(() => {
    const btns = [...document.querySelectorAll('button')]
    const soft = btns.find((b) => b.textContent.trim() === 'Soft-delete')
    soft?.click()
  })
  await wait(400)
  const modalBody = await page.evaluate(() => {
    const body = document.querySelector('.confirm__body')
    return body ? body.textContent : ''
  })
  const mentionsTrash = /restore it from Trash/i.test(modalBody)
  console.log(`  [inbox modal body] mentions Trash = ${mentionsTrash}  (expect true)`)
  console.log(`  [inbox modal body text] = ${JSON.stringify(modalBody.slice(0, 80))}`)
  await shotFull(page, '07-inbox-modal-cites-trash.png')

  await browser.close()

  console.log('\n── page errors ──')
  if (pageErrors.length === 0) console.log('  none')
  else pageErrors.forEach((e) => console.log(`  ! ${e}`))

  // ── Assertion summary ──────────────────────────────────────────────
  const pass =
    initialCount === 0 &&
    trashActive === true &&
    !!tr1?.deletedAt &&
    !tr1After?.deletedAt &&
    inboxAfter.length === 1 &&
    stillThere === false &&
    finalTrash.length === 0 &&
    mentionsTrash === true &&
    pageErrors.length === 0
  console.log(`\nresult: ${pass ? 'PASS ✓' : 'FAIL ✗'}`)
  process.exit(pass ? 0 : 1)
})().catch((e) => {
  console.error(e)
  process.exit(1)
})