#!/usr/bin/env node
// Phase 7 visual + interaction evidence — /archive route (grid + timeline
// + multi-select bulk actions). Cards archived from /inbox show up here;
// bulk unarchive restores them; bulk soft-delete marks them deleted.
// Screenshots archive to docs/design/screenshots/phase-7/
// (spec §5.4 Archive 视觉骨架 + §8 Phase 7 段).
const puppeteer = require('puppeteer-core')
const fs = require('node:fs')
const path = require('node:path')

const SHOTS = path.join(__dirname, '..', 'docs', 'design', 'screenshots', 'phase-7')
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

// Seed three cards directly into the db's localStorage (the in-memory
// client only writes on user actions; this primes the route).
async function seedCards(page, cards) {
  await page.evaluate(
    (k, payload) => {
      localStorage.setItem(k, JSON.stringify({ cards: payload }))
    },
    STORAGE_KEY,
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
  await clearCards(page)

  // ── 1. Home shows Archive entry ──────────────────────────────────────
  await page.goto(URL, { waitUntil: 'domcontentloaded' })
  await wait(800)
  // Next dev normalises /archive → /archive/ (trailing slash).
  const archiveLinkExists =
    (await page.$('a[href="/archive"], a[href="/archive/"]')) !== null
  console.log(`  [home] archive link present = ${archiveLinkExists}`)
  await shotFull(page, '01-home-with-archive-entry.png')

  // ── 2. /archive empty state ──────────────────────────────────────────
  await page.goto(URL + 'archive', { waitUntil: 'domcontentloaded' })
  await wait(800)
  const emptyH = await page.$eval('.empty__h', (el) => el.textContent)
  console.log(`  [archive-empty] heading = ${emptyH}`)
  await shotFull(page, '02-archive-empty.png')

  // ── 3. Seed 3 cards, archive 2 via /inbox, then /archive shows them ─
  // We seed the localStorage directly so we don't need to drive the
  // inbox form (form fidelity is already proven in Phase 3 screenshots).
  const seed = [
    {
      id: 'card-1', title: 'Morning thought', body: 'Coffee + rain.',
      type: 'note', media: [], links: [], codeSnippets: [], quotes: [],
      source: { kind: 'manual', deviceId: 'web' },
      capturedAt: '2026-06-18T08:00:00.000Z',
      createdAt: '2026-06-18T08:00:00.000Z',
      updatedAt: '2026-06-19T10:00:00.000Z',
      pinned: false, archived: true,
    },
    {
      id: 'card-2', title: 'Architecture sketch', body: 'Tldraw + DB binding.',
      type: 'note', media: [], links: [], codeSnippets: [], quotes: [],
      source: { kind: 'shortcut', shortcutId: 'cmd-shift-space', deviceId: 'web' },
      capturedAt: '2026-06-19T09:00:00.000Z',
      createdAt: '2026-06-19T09:00:00.000Z',
      updatedAt: '2026-06-19T11:00:00.000Z',
      pinned: false, archived: true,
    },
    {
      id: 'card-3', title: 'Still in inbox', body: 'Should NOT appear in /archive.',
      type: 'note', media: [], links: [], codeSnippets: [], quotes: [],
      source: { kind: 'manual', deviceId: 'web' },
      capturedAt: '2026-06-19T12:00:00.000Z',
      createdAt: '2026-06-19T12:00:00.000Z',
      updatedAt: '2026-06-19T12:00:00.000Z',
      pinned: false, archived: false,
    },
  ]
  await seedCards(page, seed)
  await page.goto(URL + 'archive', { waitUntil: 'domcontentloaded' })
  await wait(800)
  const gridTiles = await page.$$('.tile')
  console.log(`  [archive-grid] tiles = ${gridTiles.length}  (expect 2)`)
  await shotFull(page, '03-archive-grid.png')

  // ── 4. Switch to timeline view ──────────────────────────────────────
  await page.evaluate(() => {
    const tabs = [...document.querySelectorAll('.tab')]
    const tl = tabs.find((t) => t.textContent.trim() === 'timeline')
    tl?.click()
  })
  await wait(400)
  const dayLabels = await page.$$eval('.tl__day-label', (els) =>
    els.map((e) => e.textContent),
  )
  console.log(`  [timeline] day labels = ${JSON.stringify(dayLabels)}`)
  await shotFull(page, '04-archive-timeline.png')

  // ── 5. Enter select mode, select both cards ─────────────────────────
  await page.evaluate(() => {
    const tabs = [...document.querySelectorAll('.tab')]
    const grid = tabs.find((t) => t.textContent.trim() === 'grid')
    grid?.click()
  })
  await wait(200)
  await page.evaluate(() => {
    const btns = [...document.querySelectorAll('button')]
    const select = btns.find((b) => b.textContent.trim() === 'Select')
    select?.click()
  })
  await wait(300)
  const checks = await page.$$('.tile__check input[type="checkbox"]')
  console.log(`  [select-mode] checkboxes = ${checks.length}  (expect 2)`)
  // Tick both
  for (const c of checks) {
    await c.click()
  }
  await wait(300)
  const floater = await page.$('.floater')
  const floaterLabel = await page.$eval('.floater__label', (el) => el.textContent)
  console.log(`  [floater] present = ${floater !== null}, label = ${floaterLabel}`)
  await shotFull(page, '05-archive-multi-select.png')

  // ── 6. Bulk Unarchive → cards should return to /inbox ──────────────
  await page.evaluate(() => {
    const btns = [...document.querySelectorAll('.floater button')]
    const u = btns.find((b) => b.textContent.trim() === 'Unarchive')
    u?.click()
  })
  await wait(500)
  const afterUnarchive = await readCards(page)
  const archivedCount = afterUnarchive.filter((c) => c.archived).length
  console.log(`  [unarchive] archived count after = ${archivedCount}  (expect 0)`)
  await shotFull(page, '06-archive-after-unarchive.png')

  // ── 7. /inbox shows all 3 cards now ────────────────────────────────
  await page.goto(URL + 'inbox', { waitUntil: 'domcontentloaded' })
  await wait(800)
  const inboxTiles = await page.$$('.tile')
  console.log(`  [inbox] tiles = ${inboxTiles.length}  (expect 3)`)
  await shotFull(page, '07-inbox-after-bulk-unarchive.png')

  // ── 8. Mobile viewport ─────────────────────────────────────────────
  await page.setViewport({ width: 390, height: 844 })
  await page.goto(URL + 'archive', { waitUntil: 'domcontentloaded' })
  await wait(800)
  await shotFull(page, '08-archive-mobile-grid.png')

  await browser.close()

  console.log('\n── page errors ──')
  if (pageErrors.length === 0) console.log('  none')
  else pageErrors.forEach((e) => console.log(`  ! ${e}`))

  // ── Assertion summary ──────────────────────────────────────────────
  const pass =
    archiveLinkExists &&
    emptyH === 'No archived cards.' &&
    gridTiles.length === 2 &&
    checks.length === 2 &&
    floater !== null &&
    floaterLabel === '2 selected' &&
    archivedCount === 0 &&
    inboxTiles.length === 3 &&
    pageErrors.length === 0
  console.log(`\n${pass ? '✓ ALL ASSERTIONS PASS' : '✗ ASSERTIONS FAILED'}`)
  process.exit(pass ? 0 : 1)
})().catch((e) => {
  console.error(e)
  process.exit(2)
})