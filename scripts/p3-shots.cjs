#!/usr/bin/env node
// Phase 3 visual + persistence evidence with puppeteer-core driving system Chrome.
const puppeteer = require('puppeteer-core')
const fs = require('node:fs')
const path = require('node:path')

const SHOTS = path.join(__dirname, '..', 'docs', 'design', 'screenshots', 'phase-3')
fs.mkdirSync(SHOTS, { recursive: true })

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const PROFILE = '/tmp/cys-stift-chrome-p3-' + Date.now()
const URL = 'http://localhost:3002/inbox/'

async function shot(page, name) {
  const file = path.join(SHOTS, name)
  await page.screenshot({ path: file, fullPage: true })
  const size = fs.statSync(file).size
  console.log(`✓ ${name}  (${(size / 1024).toFixed(1)} kB)`)
}

async function typeInto(page, selector, value) {
  await page.waitForSelector(selector, { visible: true })
  await page.click(selector)
  await page.type(selector, value, { delay: 5 })
}

async function wait(ms) {
  return new Promise((r) => setTimeout(r, ms))
}

;(async () => {
  const browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: 'new',
    args: ['--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage'],
    defaultViewport: { width: 1440, height: 900 },
  })

  // session A: clear, then seed via the UI
  const ctxA = await browser.createBrowserContext()
  const pageA = await ctxA.newPage()
  pageA.on('pageerror', (err) => console.log(`  [pageerror] ${err.message}`))
  pageA.on('console', (msg) => {
    if (msg.type() === 'error') console.log(`  [console.error] ${msg.text()}`)
  })

  await pageA.goto(URL, { waitUntil: 'networkidle0' })
  await wait(300)
  await shot(pageA, '01-empty.png')

  // Create card #1 — simple note
  await typeInto(pageA, 'input[name$="-title"]', '凌晨 3 点的产品想法')
  await typeInto(
    pageA,
    'textarea[name$="-body"]',
    '# heading\n\n如果卡片本身就是 **网格的节点**，Inbox 和 Canvas 就是同一个空间的不同视图。\n\n- 捕获 ≠ 整理\n- 草稿 ≠ 作品\n',
  )
  // Submit
  await pageA.evaluate(() => {
    const btn = Array.from(document.querySelectorAll('button')).find(
      (b) => b.textContent && b.textContent.trim() === 'Add to inbox',
    )
    btn && btn.click()
  })
  await wait(400)

  // Create card #2 — multi-media
  await typeInto(pageA, 'input[name$="-title"]', 'Bauhaus 几何规则速查')
  await typeInto(
    pageA,
    'textarea[name$="-body"]',
    '包豪斯 = 约束即自由。\n\n- 6 原色\n- 8px 网格\n- 三种字体（display / body / mono）\n',
  )
  // Open the Link section and add one link
  await pageA.evaluate(() => {
    const btn = Array.from(document.querySelectorAll('button')).find(
      (b) => b.textContent && b.textContent.trim().startsWith('+ Link'),
    )
    btn && btn.click()
  })
  await wait(200)
  await pageA.evaluate(() => {
    const btn = Array.from(document.querySelectorAll('.le button')).find(
      (b) => b.textContent && b.textContent.trim() === '+ Add url',
    )
    btn && btn.click()
  })
  await wait(150)
  await typeInto(pageA, 'input[placeholder="https://…"]', 'https://example.com/bauhaus')

  // Open the Code section and add one code block
  await pageA.evaluate(() => {
    const btn = Array.from(document.querySelectorAll('button')).find(
      (b) => b.textContent && b.textContent.trim().startsWith('+ Code'),
    )
    btn && btn.click()
  })
  await wait(200)
  await pageA.evaluate(() => {
    const btn = Array.from(document.querySelectorAll('.le button')).find(
      (b) => b.textContent && b.textContent.trim() === '+ Add code block',
    )
    btn && btn.click()
  })
  await wait(150)
  await typeInto(pageA, 'input[placeholder="language (e.g. ts)"]', 'ts')
  await typeInto(pageA, 'textarea[placeholder="code…"]', 'const colors = ["red", "yellow", "blue"] as const')

  // Open the Quote section and add one quote
  await pageA.evaluate(() => {
    const btn = Array.from(document.querySelectorAll('button')).find(
      (b) => b.textContent && b.textContent.trim().startsWith('+ Quote'),
    )
    btn && btn.click()
  })
  await wait(200)
  await pageA.evaluate(() => {
    const btn = Array.from(document.querySelectorAll('.le button')).find(
      (b) => b.textContent && b.textContent.trim() === '+ Add quote',
    )
    btn && btn.click()
  })
  await wait(150)
  await typeInto(pageA, 'textarea[placeholder="quote text…"]', '形随功能。')
  await typeInto(pageA, 'input[placeholder^="attribution"]', 'Louis Sullivan')
  // Submit
  await pageA.evaluate(() => {
    const btn = Array.from(document.querySelectorAll('button')).find(
      (b) => b.textContent && b.textContent.trim() === 'Add to inbox',
    )
    btn && btn.click()
  })
  await wait(400)

  // Create card #3 — empty body
  await typeInto(pageA, 'input[name$="-title"]', '网格即内存')
  await pageA.evaluate(() => {
    const btn = Array.from(document.querySelectorAll('button')).find(
      (b) => b.textContent && b.textContent.trim() === 'Add to inbox',
    )
    btn && btn.click()
  })
  await wait(400)

  await shot(pageA, '02-three-created.png')

  // Inspect what's in the DOM
  const stateA = await pageA.evaluate(() => {
    const tiles = Array.from(document.querySelectorAll('.tile'))
    return tiles.map((t) => ({
      title: t.querySelector('.tile__title')?.textContent?.trim(),
      preview: t.querySelector('.tile__preview')?.textContent?.trim()?.slice(0, 50),
    }))
  })
  console.log('  session A tile titles:', stateA.map((s) => s.title))

  // Open the detail modal for the second card (multi-media one)
  await pageA.evaluate(() => {
    const tile = Array.from(document.querySelectorAll('.tile')).find(
      (t) => t.querySelector('.tile__title')?.textContent?.includes('Bauhaus'),
    )
    tile && tile.click()
  })
  await wait(400)
  await shot(pageA, '03-detail-view.png')

  // Switch to edit mode
  await pageA.evaluate(() => {
    const btn = Array.from(document.querySelectorAll('button')).find(
      (b) => b.textContent && b.textContent.trim() === 'Edit',
    )
    btn && btn.click()
  })
  await wait(300)
  await shot(pageA, '04-detail-edit.png')

  // Cancel edit and close
  await pageA.evaluate(() => {
    const btn = Array.from(document.querySelectorAll('button')).find(
      (b) => b.textContent && b.textContent.trim() === 'Cancel',
    )
    btn && btn.click()
  })
  await wait(200)
  // Close modal
  await pageA.keyboard.press('Escape')
  await wait(300)

  // Archive the first card via the detail flow
  await pageA.evaluate(() => {
    const tile = Array.from(document.querySelectorAll('.tile')).find(
      (t) => t.querySelector('.tile__title')?.textContent?.includes('凌晨'),
    )
    tile && tile.click()
  })
  await wait(300)
  await pageA.evaluate(() => {
    const btn = Array.from(document.querySelectorAll('button')).find(
      (b) => b.textContent && b.textContent.trim() === 'Archive',
    )
    btn && btn.click()
  })
  await wait(300)
  await shot(pageA, '05-after-archive.png')

  // Switch to archived tab
  await pageA.evaluate(() => {
    const tab = Array.from(document.querySelectorAll('button')).find(
      (b) => b.textContent && b.textContent.trim() === 'archived',
    )
    tab && tab.click()
  })
  await wait(300)
  await shot(pageA, '06-archived-tab.png')

  // ── Persistence check: navigate away and back ────────────────────────────
  await pageA.goto('about:blank')
  await pageA.goto(URL, { waitUntil: 'networkidle0' })
  await wait(500)

  // Switch back to active tab so we can check inbox persistence
  await pageA.evaluate(() => {
    const tab = Array.from(document.querySelectorAll('button')).find(
      (b) => b.textContent && b.textContent.trim() === 'active',
    )
    tab && tab.click()
  })
  await wait(200)
  await shot(pageA, '07-after-refresh.png')

  const stateB = await pageA.evaluate(() => {
    const tiles = Array.from(document.querySelectorAll('.tile'))
    return tiles.map((t) => t.querySelector('.tile__title')?.textContent?.trim())
  })
  console.log('  session B tile titles (after refresh):', stateB)

  // Persistence: original 2 active should still be there
  const inboxAfter = stateB.filter((t) => !t || !t.includes('凌晨'))
  const persistOK =
    stateB.length === 2 &&
    inboxAfter.every((t) => typeof t === 'string')
  console.log(
    persistOK
      ? '\n✅ persistence confirmed (2 active cards survived refresh)'
      : '\n❌ persistence BROKEN — got: ' + JSON.stringify(stateB),
  )

  // ── Mobile shot ──────────────────────────────────────────────────────────
  const ctxM = await browser.createBrowserContext()
  const pageM = await ctxM.newPage()
  await pageM.setViewport({ width: 390, height: 800 })
  await pageM.goto(URL, { waitUntil: 'networkidle0' })
  await wait(400)
  await shot(pageM, '08-mobile.png')

  await browser.close()

  if (!persistOK) process.exit(1)
})().catch((err) => {
  console.error(err)
  process.exit(1)
})
