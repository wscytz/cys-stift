// Visual E2E for the pass6 changes. Uses the same committed static-export
// harness as e2e-dsl-seed (puppeteer-core, no network, no new dependency).
//
// Covers the user-visible surfaces that component tests cannot prove:
//   1. canvas loads and opens the visible DSL button
//   2. live parse errors are polite; an explicit Apply escalates to alert
//   3. a card can be created through the real textarea/Apply path
//   4. a meta-only @group edit is previewed and applied (not "no changes")
//
// Screenshots are written under scripts/_e2e-screenshots/pass6 (gitignored).
// Run `pnpm --filter web build` first, then `pnpm e2e:visual`.
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { mkdir, readFile, stat } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import path from 'node:path'
import puppeteer from 'puppeteer-core'

const chromePath = process.env.CHROME_PATH || [
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/google-chrome',
  '/usr/bin/google-chrome-stable',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
].find((candidate) => existsSync(candidate))
if (!chromePath) {
  console.error('Chrome/Chromium not found. Set CHROME_PATH to the browser binary.')
  process.exit(1)
}

const root = path.resolve('apps/web/out')
const shots = path.resolve('scripts/_e2e-screenshots/pass6')
await mkdir(shots, { recursive: true })

const mime = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
  '.webmanifest': 'application/manifest+json',
}
const server = createServer(async (request, response) => {
  try {
    const url = new URL(request.url ?? '/', 'http://127.0.0.1')
    let target = path.join(root, decodeURIComponent(url.pathname))
    try {
      if ((await stat(target)).isDirectory()) target = path.join(target, 'index.html')
    } catch {
      // fall through to 404
    }
    const bytes = await readFile(target)
    response.writeHead(200, { 'Content-Type': mime[path.extname(target)] ?? 'application/octet-stream' })
    response.end(bytes)
  } catch {
    response.writeHead(404).end()
  }
})
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
const origin = `http://127.0.0.1:${server.address().port}`

const results = []
function check(name, ok, detail = '') {
  results.push({ name, ok })
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  [${detail}]` : ''}`)
}

async function clickButton(page, scopeSel, re) {
  const clicked = await page.evaluate(
    (selector, source) => {
      const scope = document.querySelector(selector)
      if (!scope) return false
      const rx = new RegExp(source, 'i')
      const button = [...scope.querySelectorAll('button')].find(
        (item) => rx.test((item.textContent ?? '').trim()) || rx.test(item.getAttribute('aria-label') ?? ''),
      )
      if (!button) return false
      button.click()
      return true
    },
    scopeSel,
    re.source,
  )
  if (!clicked) throw new Error(`button not found in ${scopeSel}: ${re}`)
}

async function buttonDisabled(page, scopeSel, re) {
  return page.evaluate(
    (selector, source) => {
      const scope = document.querySelector(selector)
      if (!scope) return null
      const rx = new RegExp(source, 'i')
      const button = [...scope.querySelectorAll('button')].find(
        (item) => rx.test((item.textContent ?? '').trim()) || rx.test(item.getAttribute('aria-label') ?? ''),
      )
      return button ? button.disabled : null
    },
    scopeSel,
    re.source,
  )
}

async function openDsl(page) {
  await page.waitForFunction(
    () => [...document.querySelectorAll('button')].some((button) => /DSL|转义/i.test(`${button.getAttribute('aria-label') ?? ''} ${button.textContent ?? ''}`)),
    { timeout: 15000 },
  )
  await page.evaluate(() => {
    const button = [...document.querySelectorAll('button')].find((entry) => /DSL|转义/i.test(`${entry.getAttribute('aria-label') ?? ''} ${entry.textContent ?? ''}`))
    button?.click()
  })
  await page.waitForSelector(dialog, { timeout: 8000 })
}

async function closeDsl(page) {
  await page.evaluate(() => {
    const dialog = document.querySelector('[role="dialog"]')
    if (!dialog) return
    const button = [...dialog.querySelectorAll('button')].find(
      (entry) => /close|关闭/i.test(entry.getAttribute('aria-label') ?? '') || (entry.textContent ?? '').trim() === '×',
    )
    button?.click()
  })
  await page.waitForFunction((selector) => !document.querySelector(selector), { timeout: 8000 }, dialog)
}

async function dismissToasts(page) {
  await page.evaluate(() => {
    for (const toast of document.querySelectorAll('[role="alert"], [role="status"]')) {
      const close = [...toast.querySelectorAll('button')].find((button) => (button.textContent ?? '').trim() === '×')
      close?.click()
    }
  })
}

async function setDsl(page, text) {
  await page.$eval('textarea.dsl-text', (textarea, value) => {
    const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set
    setter.call(textarea, value)
    textarea.dispatchEvent(new Event('input', { bubbles: true }))
  }, text)
}

const objects = (page) => page.$$eval('.canvas-a11y-outline [role="option"]', (els) => els.length)
const dialog = '[role="dialog"] textarea.dsl-text'

let browser
try {
  browser = await puppeteer.launch({
    executablePath: chromePath,
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
    defaultViewport: { width: 1365, height: 768 },
  })
  const context = await browser.createBrowserContext()
  const page = await context.newPage()
  const pageErrors = []
  page.on('pageerror', (error) => pageErrors.push(error.message))
  page.on('console', (message) => {
    if (message.type() === 'error') pageErrors.push(message.text())
  })

  await page.goto(`${origin}/canvas/`, { waitUntil: 'networkidle0' })
  check('canvas renders', (await objects(page)) === 0)
  await page.screenshot({ path: path.join(shots, '01-canvas.png') })

  await openDsl(page)
  check('DSL dialog opens from visible control', true)

  await setDsl(page, '[card #a] @pos(')
  await page.waitForSelector('.dsl-errors', { timeout: 8000 })
  const liveRole = await page.$eval('.dsl-errors', (el) => el.getAttribute('role'))
  check('live parse error is polite', liveRole === 'status')
  await page.screenshot({ path: path.join(shots, '02-parse-polite.png') })

  await clickButton(page, '[role="dialog"]', /^(apply|应用)$/)
  await page.waitForFunction(
    () => document.querySelector('.dsl-errors')?.getAttribute('role') === 'alert',
    { timeout: 8000 },
  )
  check('explicit Apply escalates parse error to alert', true)
  await page.screenshot({ path: path.join(shots, '03-parse-alert.png') })
  await dismissToasts(page)

  await setDsl(page, '[card #a create] @pos(100,100) @size(200,120) @title("Card A")')
  await page.waitForFunction(
    () => /(?:新增\s*1|added\s*1|1\s*added)/i.test(document.querySelector('[role="dialog"]')?.textContent ?? ''),
    { timeout: 8000 },
  )
  await clickButton(page, '[role="dialog"]', /^(apply|应用)$/)
  await page.waitForFunction(() => document.querySelectorAll('.canvas-a11y-outline [role="option"]').length === 1, { timeout: 10000 })
  check('DSL create writes one card through the real Apply path', (await objects(page)) === 1)
  await page.screenshot({ path: path.join(shots, '04-card-created.png') })
  await dismissToasts(page)

  await setDsl(page, '[card #a] @group("g")')
  await page.waitForFunction(
    () => [...document.querySelectorAll('.dsl-preview__changed')].some(
      (row) => /Card A/i.test(row.textContent ?? '') && /group|分组/i.test(row.textContent ?? ''),
    ),
    { timeout: 8000 },
  )
  const changedRows = await page.$$eval('.dsl-preview__changed', (rows) => rows.map((row) => row.textContent ?? ''))
  check('meta-only preview has a visible Card A @group row', changedRows.some((row) => /Card A/i.test(row) && /group|分组/i.test(row)), changedRows.join(' | '))
  const metaApplyDisabled = await buttonDisabled(page, '[role="dialog"]', /^(apply|应用)$/)
  check('meta-only proposal is applicable', metaApplyDisabled === false)
  await page.screenshot({ path: path.join(shots, '05-meta-preview.png') })
  await clickButton(page, '[role="dialog"]', /^(apply|应用)$/)
  await page.waitForFunction(
    () => !document.querySelector('.dsl-errors') && !document.querySelector('.dsl-preview'),
    { timeout: 8000 },
  )
  check('meta-only proposal applies without a fake error', (await objects(page)) === 1)
  await page.screenshot({ path: path.join(shots, '06-meta-applied.png') })

  // Round-trip proof: close and reopen the DSL dialog; the fresh serialization
  // must contain the persisted @group, not merely a transient preview.
  await closeDsl(page)
  await openDsl(page)
  const serialized = await page.$eval('textarea.dsl-text', (textarea) => textarea.value)
  const cardLine = serialized.split('\n').find((line) => line.includes('[card #a]')) ?? ''
  check('meta survives close/reopen serialization', /@group\("g"\)/.test(cardLine), cardLine)
  await page.screenshot({ path: path.join(shots, '07-meta-reopened.png') })

  check('no page errors during visual flow', pageErrors.length === 0, pageErrors.join(' | '))
  await context.close()
} finally {
  await browser?.close()
  server.close()
  const failed = results.filter((result) => !result.ok)
  console.log(`\n== ${results.length - failed.length}/${results.length} visual checks passed ==`)
  console.log(`screenshots: ${path.relative(process.cwd(), shots)}`)
  if (failed.length > 0) process.exitCode = 1
}
