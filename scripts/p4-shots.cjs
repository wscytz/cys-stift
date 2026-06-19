#!/usr/bin/env node
// Phase 4 visual evidence — dot-grid canvas, custom Card shapes, detail/create
// modals. Seeded via localStorage so the shots are reproducible. Screenshots
// archive to docs/design/screenshots/phase-4/ (spec §5.4 / §6.3 / §6.11).
const puppeteer = require('puppeteer-core')
const fs = require('node:fs')
const path = require('node:path')

const SHOTS = path.join(__dirname, '..', 'docs', 'design', 'screenshots', 'phase-4')
fs.mkdirSync(SHOTS, { recursive: true })

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const URL = process.env.URL || 'http://localhost:3016/canvas/'
const STORAGE_KEY = 'cys-stift.cards.v1'

const wait = (ms) => new Promise((r) => setTimeout(r, ms))

async function shot(page, name) {
  const file = path.join(SHOTS, name)
  await page.screenshot({ path: file })
  console.log(`✓ ${name}  (${(fs.statSync(file).size / 1024).toFixed(1)} kB)`)
}

function seededCards() {
  const base = {
    body: '', media: [], links: [], codeSnippets: [], quotes: [],
    source: { kind: 'manual', deviceId: 'shots' },
    capturedAt: '2026-06-19T00:00:00.000Z',
    createdAt: '2026-06-19T00:00:00.000Z',
    updatedAt: '2026-06-19T00:00:00.000Z',
    pinned: false, archived: false,
  }
  const at = (id, x, y, w, h, z, type, title, body) => ({
    ...base, id, type, title, body,
    canvasPosition: { canvasId: 'default-canvas', x, y, w, h, z },
  })
  return {
    cards: [
      at('shotcard00000001', 200, 150, 240, 120, 1000, 'note', '灵感：包豪斯 8px 网格', '形随功能，约束即设计。'),
      at('shotcard00000002', 560, 230, 280, 140, 1001, 'link', 'tldraw docs', 'Custom Shape API + 外部 store 绑定.'),
      at('shotcard00000003', 330, 430, 260, 130, 1002, 'code', 'moveToCanvas', '`service.moveToCanvas(id, pos)` 写回位置.'),
    ],
  }
}

async function seedAndLoad(page, data) {
  await page.evaluate((k, d) => localStorage.setItem(k, JSON.stringify(d)), STORAGE_KEY, data)
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.waitForSelector('[class*="tl-"]', { timeout: 15000 })
  await wait(1800)
}

;(async () => {
  const browser = await puppeteer.launch({
    executablePath: CHROME, headless: 'new',
    args: ['--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage'],
    defaultViewport: { width: 1440, height: 900 },
  })
  const page = await browser.newPage()
  page.on('pageerror', (e) => console.log(`  [pageerror] ${e.message}`))

  await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 30000 })

  // 1. Empty canvas (dot grid visible).
  await page.evaluate((k) => localStorage.removeItem(k), STORAGE_KEY)
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.waitForSelector('[class*="tl-"]', { timeout: 15000 })
  await wait(1500)
  await shot(page, '01-empty-desktop.png')

  // 2. Three seeded cards (note / link / code).
  await seedAndLoad(page, seededCards())
  await shot(page, '02-cards-desktop.png')

  // 3. Mobile viewport.
  await page.setViewport({ width: 390, height: 844 })
  await wait(1200)
  await shot(page, '03-cards-mobile.png')
  await page.setViewport({ width: 1440, height: 900 })

  // 4. Detail modal — double-click the first card.
  const center = await page.evaluate((t) => {
    const h3 = Array.from(document.querySelectorAll('h3')).find((h) => h.textContent === t)
    if (!h3) return null
    const b = (h3.parentElement || h3).getBoundingClientRect()
    return { x: Math.round(b.x + b.width / 2), y: Math.round(b.y + b.height / 2) }
  }, '灵感：包豪斯 8px 网格')
  if (center) {
    await page.mouse.click(center.x, center.y, { clickCount: 2 })
    await wait(700)
    await shot(page, '04-detail-modal.png')
    await page.keyboard.press('Escape')
    await wait(300)
  }

  // 5. Create modal — double-click a blank point.
  await page.mouse.click(760, 320, { clickCount: 2 })
  await wait(700)
  await shot(page, '05-create-modal.png')

  // 6. Home page entry (both Inbox + Canvas links).
  await page.goto(URL.replace(/\/canvas\/?$/, '/'), { waitUntil: 'domcontentloaded' })
  await wait(800)
  await shot(page, '06-home-entries.png')

  await browser.close()
  console.log(`\nArchived to ${SHOTS}`)
})()
