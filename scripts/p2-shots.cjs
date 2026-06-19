#!/usr/bin/env node
// P2 visual + persistence evidence with puppeteer-core driving system Chrome.
const puppeteer = require('puppeteer-core')
const fs = require('node:fs')
const path = require('node:path')

const SHOTS = path.join(__dirname, '..', 'docs', 'design', 'screenshots', 'phase-2')
fs.mkdirSync(SHOTS, { recursive: true })

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const PROFILE = '/tmp/cys-stift-chrome-p2-' + Date.now()
const URL = 'http://localhost:3002/dev/db/'

async function shot(page, name) {
  const file = path.join(SHOTS, name)
  await page.screenshot({ path: file, fullPage: true })
  const size = fs.statSync(file).size
  console.log(`✓ ${name}  (${(size / 1024).toFixed(1)} kB)`)
}

;(async () => {
  const browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: 'new',
    args: ['--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage'],
    defaultViewport: { width: 1440, height: 900 },
  })

  // session A: clear, then seed via the UI (type into the form)
  const ctxA = await browser.createBrowserContext()
  const pageA = await ctxA.newPage()
  pageA.on('console', async (msg) => {
    if (msg.type() !== 'error' && msg.type() !== 'warning') return
    const txt = msg.text()
    console.log(`  [console.${msg.type()}] ${txt}`)
    for (const handle of msg.args()) {
      try {
        const remote = handle.asElement() || handle.asFunction()
        // try to get the underlying error object
        const obj = await handle.evaluate((v) => {
          if (v instanceof Error) {
            return { name: v.name, message: v.message, stack: (v.stack || '').split('\n').slice(0, 6).join('\n') }
          }
          return null
        })
        if (obj) {
          console.log(`    name: ${obj.name}`)
          console.log(`    message: ${obj.message}`)
          console.log(`    stack: ${obj.stack}`)
        }
      } catch (e) {
        // ignore
      }
    }
  })
  await pageA.goto(URL, { waitUntil: 'networkidle0' })
  // dump every error from the page side
  const dump = await pageA.evaluate(() => {
    const out = []
    // catch the most recent unhandled rejection by inspecting window
    return {
      bodyText: document.body.innerText.slice(0, 200),
      bodyHtml: document.body.innerHTML.slice(0, 400),
      hasReact: !!window.React,
      nextData: !!document.getElementById('__NEXT_DATA__'),
    }
  })
  console.log('  page dump:', JSON.stringify(dump, null, 2))
  await shot(pageA, '01-empty.png')

  // type a title and click Create
  await pageA.waitForSelector('input[placeholder*="灵感标题"]')
  await pageA.click('input[placeholder*="灵感标题"]')
  await pageA.type('input[placeholder*="灵感标题"]', '凌晨 3 点的产品想法')
  await pageA.click('input[placeholder*="随便写点"]')
  await pageA.type(
    'input[placeholder*="随便写点"]',
    '如果卡片本身就是网格的节点，Inbox 和 Canvas 就是同一个空间的不同视图。',
  )
  await pageA.click('button:not([disabled])')
  await new Promise((r) => setTimeout(r, 400))
  await pageA.type('input[placeholder*="灵感标题"]', '包豪斯 = 约束即自由')
  await pageA.click('button:not([disabled])')
  await new Promise((r) => setTimeout(r, 400))
  await pageA.type('input[placeholder*="灵感标题"]', '网格即内存')
  await pageA.click('button:not([disabled])')
  await new Promise((r) => setTimeout(r, 600))

  await shot(pageA, '02-three-created.png')

  // what does the page report?
  const countsA = await pageA.evaluate(() => {
    const cards = document.querySelectorAll('.cards__item')
    return Array.from(cards).map((c) => c.querySelector('strong')?.textContent ?? '')
  })
  console.log('  session A inbox titles:', countsA)

  // session B: completely fresh context, same OS profile = no — different
  // browser context = different localStorage. So this will be empty.
  // We need session B to share storage with A. Use a SINGLE context, navigate
  // to a different page then back, to simulate "refresh".
  await pageA.goto('about:blank')
  await pageA.goto(URL, { waitUntil: 'networkidle0' })
  await new Promise((r) => setTimeout(r, 500))
  await shot(pageA, '03-after-refresh.png')

  const countsB = await pageA.evaluate(() => {
    const cards = document.querySelectorAll('.cards__item')
    return Array.from(cards).map((c) => c.querySelector('strong')?.textContent ?? '')
  })
  console.log('  session B inbox titles (after "refresh"):', countsB)

  // pass condition
  const same = JSON.stringify(countsA) === JSON.stringify(countsB)
  console.log(same ? '\n✅ persistence confirmed (titles match after refresh)' : '\n❌ persistence BROKEN')

  // also mobile shot
  const ctxM = await browser.createBrowserContext()
  const pageM = await ctxM.newPage()
  await pageM.setViewport({ width: 390, height: 800 })
  await pageM.goto(URL, { waitUntil: 'networkidle0' })
  await shot(pageM, '04-mobile.png')

  await browser.close()

  if (!same) process.exit(1)
})().catch((err) => {
  console.error(err)
  process.exit(1)
})