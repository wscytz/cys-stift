#!/usr/bin/env node
// Phase 9 — JSON export. Seed a card + media + settings, click Export,
// capture the download via CDP, validate the JSON shape.
const puppeteer = require('puppeteer-core')
const fs = require('node:fs')
const path = require('node:path')

const SHOTS = path.join(__dirname, '..', 'docs', 'design', 'screenshots', 'phase-9')
fs.mkdirSync(SHOTS, { recursive: true })

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const URL = process.env.URL || 'http://localhost:3016/'
const DL_DIR = '/tmp/phase-9-downloads'

const wait = (ms) => new Promise((r) => setTimeout(r, ms))

async function shotFull(page, name) {
  const file = path.join(SHOTS, name)
  await page.screenshot({ path: file, fullPage: true })
  console.log(`✓ ${name}  (${(fs.statSync(file).size / 1024).toFixed(1)} kB)`)
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

  // Configure download via CDP
  const client = await page.target().createCDPSession()
  await client.send('Page.setDownloadBehavior', {
    behavior: 'allow',
    downloadPath: DL_DIR,
  })

  await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 30000 })
  await wait(1500)

  // Seed: 2 cards + 1 media asset + changed setting
  await page.evaluate(() => {
    localStorage.setItem(
      'cys-stift.cards.v1',
      JSON.stringify({
        cards: [
          {
            id: 'c1',
            title: 'Export test card 1',
            body: 'body 1',
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
            id: 'c2',
            title: 'Export test card 2',
            body: 'body 2',
            type: 'note',
            media: [],
            links: [],
            codeSnippets: [],
            quotes: [],
            source: { kind: 'menubar', deviceId: 'web' },
            capturedAt: '2026-06-19T00:00:00.000Z',
            createdAt: '2026-06-19T00:00:00.000Z',
            updatedAt: '2026-06-19T00:00:00.000Z',
            pinned: false,
            archived: false,
          },
        ],
      }),
    )
    localStorage.setItem(
      'cys-stift.media.v1',
      JSON.stringify({
        assets: {
          'ma-1': {
            id: 'ma-1',
            kind: 'image',
            mimeType: 'image/png',
            dataUrl: 'data:image/png;base64,xxx',
            byteSize: 123,
            createdAt: '2026-06-19T00:00:00.000Z',
          },
        },
      }),
    )
    localStorage.setItem(
      'cys-stift.settings.v1',
      JSON.stringify({
        settings: {
          captureShortcut: { modKey: 'ctrl', shift: true, code: 'KeyC' },
        },
      }),
    )
  })

  // Go to /settings → click Export
  await page.goto(URL + 'settings', { waitUntil: 'domcontentloaded' })
  await wait(600)
  await shotFull(page, '01-settings-with-export.png')

  await page.evaluate(() => {
    const btns = [...document.querySelectorAll('button')]
    const exp = btns.find((b) => /export json/i.test(b.textContent || ''))
    exp?.click()
  })

  // Wait for download
  await wait(1500)
  await shotFull(page, '02-settings-after-export-click.png')

  // Find the downloaded file
  const files = fs.readdirSync(DL_DIR).filter((f) => f.endsWith('.json'))
  console.log(`  [download] files = ${JSON.stringify(files)}`)
  let payload = null
  if (files.length > 0) {
    const raw = fs.readFileSync(path.join(DL_DIR, files[0]), 'utf8')
    payload = JSON.parse(raw)
    console.log(
      `  [payload] version = ${payload.version}  cards = ${payload.cards?.length}  mediaAssets keys = ${Object.keys(payload.mediaAssets || {}).length}  settings.code = ${payload.settings?.captureShortcut?.code}`,
    )
  }

  await browser.close()

  console.log('\n── page errors ──')
  if (pageErrors.length === 0) console.log('  none')
  else pageErrors.forEach((e) => console.log(`  ! ${e}`))

  const pass =
    files.length === 1 &&
    payload?.version === 1 &&
    payload?.app === "cy's Stift" &&
    payload?.cards?.length === 2 &&
    payload?.cards[0]?.title === 'Export test card 1' &&
    Object.keys(payload?.mediaAssets || {}).length === 1 &&
    payload?.settings?.captureShortcut?.code === 'KeyC' &&
    typeof payload?.exportedAt === 'string' &&
    pageErrors.length === 0
  console.log(`\n${pass ? '✓ ALL ASSERTIONS PASS' : '✗ ASSERTIONS FAILED'}`)
  process.exit(pass ? 0 : 1)
})().catch((e) => {
  console.error(e)
  process.exit(2)
})