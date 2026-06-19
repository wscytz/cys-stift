#!/usr/bin/env node
// Phase 9.1 — JSON reverse import. Seed data → export → clear → import
// the same file → verify cards/media restored.
const puppeteer = require('puppeteer-core')
const fs = require('node:fs')
const path = require('node:path')

const SHOTS = path.join(__dirname, '..', 'docs', 'design', 'screenshots', 'phase-9.1')
fs.mkdirSync(SHOTS, { recursive: true })

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const URL = process.env.URL || 'http://localhost:3016/'
const DL_DIR = '/tmp/phase-9.1-downloads'

const wait = (ms) => new Promise((r) => setTimeout(r, ms))

async function shotFull(page, name) {
  const file = path.join(SHOTS, name)
  await page.screenshot({ path: file, fullPage: true })
  console.log(`✓ ${name}  (${(fs.statSync(file).size / 1024).toFixed(1)} kB)`)
}

async function readCards(page) {
  return page.evaluate(() => {
    const raw = localStorage.getItem('cys-stift.cards.v1')
    return raw ? JSON.parse(raw).cards || [] : []
  })
}

;(async () => {
  fs.rmSync(DL_DIR, { recursive: true, force: true })
  fs.mkdirSync(DL_DIR, { recursive: true })

  const browser = await puppeteer.launch({
    executablePath: CHROME, headless: 'new',
    args: ['--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage'],
    defaultViewport: { width: 1440, height: 900 },
  })
  const page = await browser.newPage()
  const pageErrors = []
  page.on('pageerror', (e) => pageErrors.push(e.message))

  const client = await page.target().createCDPSession()
  await client.send('Page.setDownloadBehavior', {
    behavior: 'allow',
    downloadPath: DL_DIR,
  })

  await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 30000 })
  await wait(1500)

  // ── 1. Seed 2 cards ────────────────────────────────────────────────
  await page.evaluate(() => {
    localStorage.setItem(
      'cys-stift.cards.v1',
      JSON.stringify({
        cards: [
          {
            id: 'imp-1',
            title: 'Import test A',
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
          },
          {
            id: 'imp-2',
            title: 'Import test B',
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
          },
        ],
      }),
    )
  })

  // ── 2. Export ──────────────────────────────────────────────────────
  await page.goto(URL + 'settings', { waitUntil: 'domcontentloaded' })
  await wait(500)
  await page.evaluate(() => {
    const btns = [...document.querySelectorAll('button')]
    const exp = btns.find((b) => /export json/i.test(b.textContent || ''))
    exp?.click()
  })
  await wait(1500)
  const exportFiles = fs.readdirSync(DL_DIR).filter((f) => f.endsWith('.json'))
  console.log(`  [export] files = ${exportFiles.length}`)
  if (exportFiles.length === 0) throw new Error('no export file')
  const exportedJson = fs.readFileSync(path.join(DL_DIR, exportFiles[0]), 'utf8')

  // ── 3. Clear localStorage → verify empty ───────────────────────────
  await page.evaluate(() => {
    localStorage.removeItem('cys-stift.cards.v1')
    localStorage.removeItem('cys-stift.media.v1')
  })
  await page.reload({ waitUntil: 'domcontentloaded' })
  await wait(500)
  const afterClear = await readCards(page)
  console.log(`  [clear] cards = ${afterClear.length}  (expect 0)`)

  // ── 4. Import via file input ───────────────────────────────────────
  await page.goto(URL + 'settings', { waitUntil: 'domcontentloaded' })
  await wait(500)
  await shotFull(page, '01-settings-before-import.png')

  const importInput = await page.$('input[type="file"]')
  const tmpImport = path.join('/tmp', 'phase-9.1-import.json')
  fs.writeFileSync(tmpImport, exportedJson)
  await importInput.uploadFile(tmpImport)
  await wait(1200) // result renders + reload queued

  // After reload, check cards restored
  await page.goto(URL + 'inbox', { waitUntil: 'domcontentloaded' })
  await wait(800)
  const restored = await readCards(page)
  console.log(
    `  [import] cards = ${restored.length}  (expect 2)  titles = ${JSON.stringify(restored.map((c) => c.title))}`,
  )
  await shotFull(page, '02-inbox-after-import.png')

  await browser.close()

  console.log('\n── page errors ──')
  if (pageErrors.length === 0) console.log('  none')
  else pageErrors.forEach((e) => console.log(`  ! ${e}`))

  const pass =
    exportFiles.length === 1 &&
    afterClear.length === 0 &&
    restored.length === 2 &&
    restored.some((c) => c.title === 'Import test A') &&
    restored.some((c) => c.title === 'Import test B') &&
    pageErrors.length === 0
  console.log(`\n${pass ? '✓ ALL ASSERTIONS PASS' : '✗ ASSERTIONS FAILED'}`)
  process.exit(pass ? 0 : 1)
})().catch((e) => {
  console.error(e)
  process.exit(2)
})