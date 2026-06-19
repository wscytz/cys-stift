#!/usr/bin/env node
// Phase 6.5f — media upload (inline base64). Upload a tiny PNG via
// file input in detail edit mode → media persists, view shows image,
// reload keeps it. Tighter puppeteer flow (programmatic File).
const puppeteer = require('puppeteer-core')
const fs = require('node:fs')
const path = require('node:path')

const SHOTS = path.join(__dirname, '..', 'docs', 'design', 'screenshots', 'phase-6.5f')
fs.mkdirSync(SHOTS, { recursive: true })

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const URL = process.env.URL || 'http://localhost:3016/'
const CARDS_KEY = 'cys-stift.cards.v1'
const MEDIA_KEY = 'cys-stift.media.v1'

// 1x1 transparent PNG (smallest valid PNG).
const TINY_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=',
  'base64',
)

const wait = (ms) => new Promise((r) => setTimeout(r, ms))

async function shotFull(page, name) {
  const file = path.join(SHOTS, name)
  await page.screenshot({ path: file, fullPage: true })
  console.log(`✓ ${name}  (${(fs.statSync(file).size / 1024).toFixed(1)} kB)`)
}

async function readJson(page, key) {
  return page.evaluate((k) => {
    const raw = localStorage.getItem(k)
    if (!raw) return null
    return JSON.parse(raw)
  }, key)
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
  await page.evaluate(
    (k1, k2) => {
      localStorage.removeItem(k1)
      localStorage.removeItem(k2)
    },
    CARDS_KEY,
    MEDIA_KEY,
  )
  await page.reload({ waitUntil: 'domcontentloaded' })
  await wait(800)

  // Seed a card via localStorage (form fidelity is Phase 3 territory)
  await page.evaluate(
    (k, payload) => localStorage.setItem(k, JSON.stringify({ cards: payload })),
    CARDS_KEY,
    [
      {
        id: 'card-img',
        title: 'Card with image',
        body: 'Body text.',
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
  )
  await page.reload({ waitUntil: 'domcontentloaded' })
  await wait(800)
  await page.goto(URL + 'inbox', { waitUntil: 'domcontentloaded' })
  await wait(800)

  // Open detail → switch to edit
  await page.click('.tile')
  await wait(400)
  await page.evaluate(() => {
    const btns = [...document.querySelectorAll('button')]
    const edit = btns.find((b) => b.textContent.trim() === 'Edit')
    edit?.click()
  })
  await wait(400)

  // Upload file via the hidden file input
  const fileInput = await page.$('input[type="file"]')
  await fileInput.uploadFile({
    // build a tmp file from TINY_PNG
    // puppeteer accepts Buffer as content
  }).catch(() => null)
  // The above doesn't accept Buffer directly; use a real tmp file
  const tmpFile = path.join('/tmp', 'phase-6.5f-tiny.png')
  fs.writeFileSync(tmpFile, TINY_PNG)
  await fileInput.uploadFile(tmpFile)
  await wait(800)
  await shotFull(page, '01-detail-edit-after-upload.png')

  // Save
  await page.evaluate(() => {
    const btns = [...document.querySelectorAll('button')]
    const save = btns.find((b) => b.textContent.trim() === 'Save')
    save?.click()
  })
  await wait(500)
  await shotFull(page, '02-detail-view-after-save.png')

  // Verify localStorage
  const cards = await readJson(page, CARDS_KEY)
  const card = cards.cards[0]
  console.log(`  [saved] media count = ${card?.media?.length}  (expect 1)`)
  const media = await readJson(page, MEDIA_KEY)
  const assetIds = media && media.assets ? Object.keys(media.assets) : []
  console.log(`  [media] asset ids = ${assetIds.length}  (expect 1)`)

  // Verify the image actually renders
  const imgCount = await page.$$eval('.media-list__img', (els) => els.length)
  console.log(`  [view] image elements = ${imgCount}  (expect 1)`)

  // Reload
  await page.reload({ waitUntil: 'domcontentloaded' })
  await wait(800)
  await page.goto(URL + 'inbox', { waitUntil: 'domcontentloaded' })
  await wait(800)
  await page.click('.tile')
  await wait(400)
  const imgCountReload = await page.$$eval('.media-list__img', (els) => els.length)
  console.log(`  [reload] image elements = ${imgCountReload}  (expect 1)`)
  await shotFull(page, '03-detail-view-after-reload.png')

  await browser.close()

  console.log('\n── page errors ──')
  if (pageErrors.length === 0) console.log('  none')
  else pageErrors.forEach((e) => console.log(`  ! ${e}`))

  const pass =
    card?.media?.length === 1 &&
    assetIds.length === 1 &&
    imgCount === 1 &&
    imgCountReload === 1 &&
    pageErrors.length === 0
  console.log(`\n${pass ? '✓ ALL ASSERTIONS PASS' : '✗ ASSERTIONS FAILED'}`)
  process.exit(pass ? 0 : 1)
})().catch((e) => {
  console.error(e)
  process.exit(2)
})