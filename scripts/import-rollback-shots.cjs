#!/usr/bin/env node
// Review bugfix #1 — import atomicity / rollback.
//
// Verifies the fix in apps/web/src/lib/export-service.ts (importFromJson):
// when a store write fails partway (simulated quota error on the media
// key, AFTER the cards key was already overwritten), the import must roll
// the cards store back to its pre-import value and report ok:false — not
// leave a half-overwritten state. Then the happy path (no failure) still
// writes cleanly.
//
// Run after `pnpm --filter web dev --port 3016` is up:
//   node scripts/import-rollback-shots.cjs
const puppeteer = require('puppeteer-core')
const fs = require('node:fs')
const path = require('node:path')

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const URL = process.env.URL || 'http://localhost:3016/'

const SHOTS = path.join(__dirname, '..', 'docs', 'design', 'screenshots', 'review-import-rollback')
fs.mkdirSync(SHOTS, { recursive: true })

const wait = (ms) => new Promise((r) => setTimeout(r, ms))

const ORIG_CARD = {
  id: 'orig-1',
  title: 'ORIGINAL (must survive rollback)',
  body: '',
  type: 'note',
  media: [],
  links: [],
  codeSnippets: [],
  quotes: [],
  source: { kind: 'manual', deviceId: 'web' },
  capturedAt: '2026-06-19T00:00:00.000Z',
  createdAt: '2026-06-19T00:00:00.000Z',
  updatedAt: '2026-06-19T00:00:00.000Z',
  pinned: false,
  archived: false,
}
const NEW_CARD = {
  ...ORIG_CARD,
  id: 'new-1',
  title: 'NEW (only on happy path)',
}

// Payload with DIFFERENT cards + a media asset so the media write runs
// (and is the one we sabotage to trigger rollback).
const IMPORT_PAYLOAD = {
  version: 1,
  exportedAt: '2026-06-20T00:00:00.000Z',
  app: "cy's Stift",
  cards: [NEW_CARD],
  mediaAssets: {
    'asset-1': {
      id: 'asset-1',
      kind: 'image',
      mimeType: 'image/png',
      byteSize: 4,
      dataUrl: 'data:image/png;base64,iVBORw0KGgo=',
    },
  },
}

async function readCardsRaw(page) {
  return page.evaluate(() => localStorage.getItem('cys-stift.cards.v1'))
}

;(async () => {
  const tmp = path.join('/tmp', 'review-import-rollback.json')
  fs.writeFileSync(tmp, JSON.stringify(IMPORT_PAYLOAD, null, 2))
  const origRaw = JSON.stringify({ cards: [ORIG_CARD] })

  const browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: 'new',
    args: ['--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage'],
    defaultViewport: { width: 1440, height: 900 },
  })
  const page = await browser.newPage()
  await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 30000 })
  await wait(1000)

  // ── 1. Seed ORIGINAL cards. Capture the exact raw string that must
  //       survive a failed import. ─────────────────────────────────────
  await page.evaluate((raw) => localStorage.setItem('cys-stift.cards.v1', raw), origRaw)

  // ── 2. Navigate to settings, THEN install the monkeypatch on THIS
  //       page's window (page.goto resets window, so it must come after
  //       the navigation). The patch makes the media-key write throw,
  //       simulating a quota failure on a big base64 blob. ─────────────
  await page.goto(URL + 'settings', { waitUntil: 'domcontentloaded' })
  await wait(500)
  await page.evaluate(() => {
    const orig = window.localStorage.setItem.bind(window.localStorage)
    window.localStorage.setItem = function (key) {
      if (key === 'cys-stift.media.v1') {
        throw new DOMException('quota exceeded (simulated)', 'QuotaExceededError')
      }
      return orig.apply(window.localStorage, arguments)
    }
  })

  // ── 3. Drive the import via the settings file input. No reload on
  //       failure, so we read the cards store on the same page right
  //       after. ───────────────────────────────────────────────────────
  const input = await page.$('input[type="file"]')
  await input.uploadFile(tmp)
  await wait(1500)
  const cardsAfterFailure = await readCardsRaw(page)
  const errorVisible = await page.evaluate(() => {
    const el = [...document.querySelectorAll('p')].find((p) =>
      /import failed/i.test(p.textContent || ''),
    )
    return el ? el.textContent.trim() : null
  })
  await page.screenshot({
    path: path.join(SHOTS, '01-settings-import-failed.png'),
    fullPage: true,
  })

  // ── 4. Happy path. Reload resets the window (monkeypatch gone → native
  //       setItem). Re-seed original, then import — NEW card should land.
  await page.goto(URL, { waitUntil: 'domcontentloaded' })
  await wait(500)
  await page.evaluate((raw) => localStorage.setItem('cys-stift.cards.v1', raw), origRaw)
  await page.goto(URL + 'settings', { waitUntil: 'domcontentloaded' })
  await wait(500)
  const input2 = await page.$('input[type="file"]')
  await input2.uploadFile(tmp)
  await wait(1800) // reload queued on success
  await page.goto(URL + 'settings', { waitUntil: 'domcontentloaded' })
  await wait(500)
  const cardsAfterSuccess = await readCardsRaw(page)

  await browser.close()

  // ── assertions ──────────────────────────────────────────────────────
  const failRolledBack = cardsAfterFailure === origRaw
  const failNewAbsent = !cardsAfterFailure.includes('NEW (only on happy path')
  const failReported = !!errorVisible
  const successWroteNew = cardsAfterSuccess.includes('NEW (only on happy path')

  console.log('── review import-rollback ──')
  console.log(`  [fail] cards rolled back to original : ${failRolledBack}`)
  console.log(`  [fail] NEW card absent after failure : ${failNewAbsent}`)
  console.log(`  [fail] error surfaced to UI          : ${failReported}  → ${errorVisible}`)
  console.log(`  [ok  ] happy path writes NEW card    : ${successWroteNew}`)

  const pass = failRolledBack && failNewAbsent && failReported && successWroteNew
  console.log(`\n${pass ? '✓ ALL ASSERTIONS PASS' : '✗ ASSERTIONS FAILED'}`)
  process.exit(pass ? 0 : 1)
})().catch((e) => {
  console.error(e)
  process.exit(2)
})
