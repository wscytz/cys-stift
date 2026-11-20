// DSL seed e2e: the `?dsl=` entry is a public link surface; its one-shot,
// no-auto-apply, over-limit, and canvas-pinning behavior must have a committed
// gate (not only a gitignored local audit script). Uses the static export in
// apps/web/out — run `pnpm --filter web build` first. No network.
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { readFile, stat } from 'node:fs/promises'
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
// The over-limit case sends a >20k path on purpose; Node's default 16KB header
// limit would reject it with 431 before the app can show its own rejection.
const server = createServer({ maxHeaderSize: 64 * 1024 }, async (request, response) => {
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

const DSL = [
  '[card #seed-a create] @pos(100,100) @size(200,100) @title("A")',
  '[card #seed-b create] right-of #seed-a @gap(40) @title("B")',
].join('\n')

const results = []
function check(name, ok, detail = '') {
  results.push({ name, ok })
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  [${detail}]` : ''}`)
}
async function clickButton(page, scopeSel, re) {
  const ok = await page.evaluate(
    (scopeSel, reSrc) => {
      const scope = document.querySelector(scopeSel)
      if (!scope) return false
      const rx = new RegExp(reSrc, 'i')
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
  if (!ok) throw new Error(`button not found in ${scopeSel}: ${re}`)
}
const objects = (page) => page.$$eval('.canvas-a11y-outline [role="option"]', (els) => els.length)
const dialog = '[role="dialog"] textarea.dsl-text'

let browser
try {
  browser = await puppeteer.launch({
    executablePath: chromePath,
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
    defaultViewport: { width: 1280, height: 800 },
  })

  // 1) prefilled, no auto-apply, URL one-shot (other params kept)
  {
    const context = await browser.createBrowserContext()
    const page = await context.newPage()
    await page.goto(`${origin}/canvas/?dsl=${encodeURIComponent(DSL)}&keep=1`, { waitUntil: 'networkidle0' })
    await page.waitForSelector(dialog, { timeout: 15000 })
    check('seed prefilled', (await page.$eval(dialog, (el) => el.value)) === DSL)
    check('dsl stripped, keep=1 preserved', (await page.evaluate(() => location.search)) === '?keep=1')
    await new Promise((resolve) => setTimeout(resolve, 700))
    check('nothing auto-applied', (await objects(page)) === 0)
    await clickButton(page, '[role="dialog"]', /^(close|关闭)$/)
    await page.waitForFunction((sel) => !document.querySelector(sel), { timeout: 8000 }, dialog)
    await page.reload({ waitUntil: 'networkidle0' })
    await new Promise((resolve) => setTimeout(resolve, 800))
    check('reload does not reopen', !(await page.$(dialog)))
    await context.close()
  }

  // 2) over-limit is rejected (not truncated, no dialog)
  {
    const context = await browser.createBrowserContext()
    const page = await context.newPage()
    await page.goto(`${origin}/canvas/?dsl=${'a'.repeat(20001)}`, { waitUntil: 'networkidle0' })
    const toast = await page.waitForSelector('[role="alert"]', { timeout: 15000 })
    const message = (await toast.evaluate((el) => el.textContent)) ?? ''
    check('over-limit toast', /20001/.test(message) && /(过长|too long)/i.test(message))
    check('over-limit does not open dialog', !(await page.$(dialog)))
    check('over-limit URL cleaned', (await page.evaluate(() => location.search)) === '')
    await context.close()
  }

  // 3) seed applies on the mount-time canvas only (no cross-canvas leakage)
  {
    const context = await browser.createBrowserContext()
    const page = await context.newPage()
    await page.goto(`${origin}/canvas/`, { waitUntil: 'networkidle0' })
    await page.waitForSelector('select.cselect', { timeout: 15000 })
    const firstCanvas = await page.$eval('select.cselect', (el) => el.value)
    await page.evaluate(() => {
      const more = [...document.querySelectorAll('button')].find((button) =>
        /^(More|更多)$/.test((button.getAttribute('aria-label') ?? '').trim()),
      )
      more.click()
    })
    await page.waitForSelector('[role="menu"] [role="menuitem"]', { timeout: 8000 })
    await page.evaluate(() => {
      const item = [...document.querySelectorAll('[role="menu"] [role="menuitem"]')].find((entry) =>
        /^(New canvas|新建画布)$/.test((entry.textContent ?? '').trim()),
      )
      item.click()
    })
    await page.waitForSelector('[role="dialog"] input.cinput', { timeout: 8000 })
    await page.type('[role="dialog"] input.cinput', 'Seed Target')
    await clickButton(page, '[role="dialog"]', /^\+\s*(new|新建)$/)
    await page.waitForFunction(() => !document.querySelector('[role="dialog"]'), { timeout: 10000 })
    await page.waitForFunction((first) => document.querySelector('select.cselect')?.value !== first, { timeout: 10000 }, firstCanvas)
    const secondCanvas = await page.$eval('select.cselect', (el) => el.value)

    await page.goto(`${origin}/canvas/?dsl=${encodeURIComponent(DSL)}`, { waitUntil: 'networkidle0' })
    await page.waitForSelector(dialog, { timeout: 15000 })
    // Chrome on CI defaults to en-US; wait for the preview itself (not just the
    // dialog shell) and accept both locale word orders: "新增 2" / "2 added".
    await page.waitForFunction(
      () => {
        const text = document.querySelector('[role="dialog"]')?.textContent ?? ''
        return /(?:新增\s*2|added\s*2|2\s*added)/i.test(text)
      },
      { timeout: 10000 },
    )
    const previewText = (await page.$eval('[role="dialog"]', (el) => el.textContent)) ?? ''
    check('preview reports 2 additions', /(?:新增\s*2|added\s*2|2\s*added)/i.test(previewText))
    await clickButton(page, '[role="dialog"]', /^(apply|应用)$/)
    await page.waitForFunction(() => document.querySelectorAll('.canvas-a11y-outline [role="option"]').length === 2, { timeout: 10000 })
    check('seed applied on second canvas', (await objects(page)) === 2)
    await clickButton(page, '[role="dialog"]', /^(close|关闭)$/)
    await page.waitForFunction((sel) => !document.querySelector(sel), { timeout: 8000 }, dialog)

    await page.select('select.cselect', firstCanvas)
    await page.waitForFunction(() => document.querySelectorAll('.canvas-a11y-outline [role="option"]').length === 0, { timeout: 10000 })
    check('first canvas untouched', (await objects(page)) === 0)
    await page.select('select.cselect', secondCanvas)
    await page.waitForFunction(() => document.querySelectorAll('.canvas-a11y-outline [role="option"]').length === 2, { timeout: 10000 })
    check('second canvas keeps cards', (await objects(page)) === 2)
    await context.close()
  }
} finally {
  await browser?.close()
  server.close()
  const failed = results.filter((result) => !result.ok)
  console.log(`\n== ${results.length - failed.length}/${results.length} checks passed ==`)
  if (failed.length > 0) process.exitCode = 1
}
