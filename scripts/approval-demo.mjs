// Approval demo: seed a fixed 6-card canvas, paste a DSL proposal, verify
// preview labels, apply, and assert untouched cards. Uses the existing static
// export in apps/web/out; run `pnpm --filter web build` first. No network.
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { readFile, stat } from 'node:fs/promises'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import puppeteer from 'puppeteer-core'

const root = path.resolve('apps/web/out')
const source = (file) => readFileSync(path.join('apps/web/src/lib', file), 'utf8')
const keyOf = (file) => source(file).match(/const STORAGE_KEY = '([^']+)'/)[1]
const keys = { cards: keyOf('db-client.ts'), canvases: keyOf('canvas-store.ts'), views: keyOf('canvas-view-store.ts') }
const canvasId = `demo-${Date.now()}`
const timestamp = '2026-01-10T00:00:00.000Z'
const cards = ['a', 'b', 'c', 'd', 'e', 'f'].map((id, z) => ({
  id, title: `Card ${id.toUpperCase()}`, body: `Body ${id.toUpperCase()}`, type: 'note',
  media: [], links: [], codeSnippets: [], quotes: [], tags: [],
  pinned: false, archived: false, deletedAt: null,
  source: { kind: 'manual', deviceId: 'seed' },
  capturedAt: timestamp, createdAt: timestamp, updatedAt: timestamp,
  canvasPosition: { canvasId, x: 40 + (z % 3) * 500, y: 40 + Math.floor(z / 3) * 200, w: 220, h: 110, z, rotation: 0 },
}))
const arrows = [
  { id: 'e1', kind: 'arrow', x: 0, y: 0, w: 0, h: 0, rotation: 0, from: 'a', to: 'b', text: 'A to B' },
  { id: 'e2', kind: 'arrow', x: 0, y: 0, w: 0, h: 0, rotation: 0, from: 'b', to: 'c', text: 'B to C' },
  { id: 'e3', kind: 'arrow', x: 0, y: 0, w: 0, h: 0, rotation: 0, from: 'd', to: 'e', text: 'D to E' },
  { id: 'e4', kind: 'arrow', x: 0, y: 0, w: 0, h: 0, rotation: 0, from: 'e', to: 'f', text: 'E to F' },
  { id: 'e5', kind: 'arrow', x: 0, y: 0, w: 0, h: 0, rotation: 0, from: 'c', to: 'f', text: 'C to F', dash: 'dashed' },
]
const seed = {
  [keys.cards]: { cards },
  [keys.canvases]: { snapshot: { activeCanvasId: canvasId, canvases: [{ id: canvasId, workspaceId: 'default', name: 'DSL Demo', view: { zoom: 1, pan: { x: 0, y: 0 }, gridMode: 'free', gridSize: 8 }, createdAt: timestamp, updatedAt: timestamp }] } },
  [keys.views]: { views: { [canvasId]: { zoom: 1, panX: 0, panY: 0, gridMode: 'free', gridSize: 8 } } },
  [`cys-stift.canvas-freeform.${canvasId}.v1`]: { v: 1, app: 'cys-stift', updatedAt: Date.now(), elements: arrows },
}
const proposal = [
  '[card #g create] right-of #b @gap(40) @size(240,120) @title("证据 G") @content("新增证据")',
  '[arrow #e6] from #b to #g',
  '[arrow #e7] from #g to #c',
  '[arrow #e2 delete]',
].join('\n')
const mime = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.woff2': 'font/woff2', '.svg': 'image/svg+xml', '.png': 'image/png', '.json': 'application/json', '.txt': 'text/plain', '.wasm': 'application/wasm' }
const server = createServer(async (request, response) => {
  try {
    const pathname = decodeURIComponent(new URL(request.url, 'http://127.0.0.1').pathname)
    let target = path.resolve(root, `.${pathname}`)
    assert(target.startsWith(`${root}${path.sep}`) || target === root)
    try {
      if ((await stat(target)).isDirectory()) target = path.join(target, 'index.html')
    } catch {
      if (!path.extname(target)) target += '.html'
    }
    const bytes = await readFile(target)
    response.writeHead(200, { 'Content-Type': mime[path.extname(target)] ?? 'application/octet-stream' })
    response.end(bytes)
  } catch { response.writeHead(404).end() }
})
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
const origin = `http://127.0.0.1:${server.address().port}`
let browser
const errors = []
const external = []
try {
  browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, defaultViewport: { width: 1440, height: 900, deviceScaleFactor: 1 } })
  const context = await browser.createBrowserContext()
  const page = await context.newPage()
  page.on('pageerror', (error) => errors.push(error.message))
  page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()) })
  await page.setRequestInterception(true)
  page.on('request', (request) => {
    const url = new URL(request.url())
    if (url.origin === origin || ['data:', 'blob:'].includes(url.protocol)) void request.continue()
    else { external.push(request.url()); void request.abort() }
  })
  await page.evaluateOnNewDocument((payload) => {
    for (const [key, value] of Object.entries(payload)) localStorage.setItem(key, JSON.stringify(value))
  }, seed)
  await page.goto(`${origin}/canvas/`, { waitUntil: 'networkidle0' })
  await page.waitForFunction(() => (document.querySelector('#canvas-accessible-summary')?.textContent ?? '').includes('对象'), { timeout: 20000 })
  const beforeSummary = await page.evaluate(() => document.querySelector('#canvas-accessible-summary').textContent)
  const beforeTitles = await page.evaluate(() => [...document.querySelectorAll('.canvas-a11y-outline [role="option"] > span:first-child')].map((node) => node.textContent))
  await page.screenshot({ path: '/tmp/cys-demo-before.png' })
  const opened = await page.evaluate(() => {
    const button = [...document.querySelectorAll('.cv-rail button')].find((item) => (item.getAttribute('aria-label') ?? '').includes('画布转义') || (item.textContent ?? '').includes('转义'))
    if (button) { button.click(); return true }
    return false
  })
  assert(opened, 'DSL rail button not found')
  await page.waitForSelector('textarea.dsl-text', { timeout: 10000 })
  await page.evaluate((text) => {
    const textarea = document.querySelector('textarea.dsl-text')
    const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set
    setter.call(textarea, text)
    textarea.dispatchEvent(new Event('input', { bubbles: true }))
  }, proposal)
  await page.waitForFunction(() => document.querySelector('.dsl-preview--ok, .dsl-preview--warn'), { timeout: 10000 })
  const preview = await page.evaluate(() => document.querySelector('.dsl-preview')?.textContent ?? '')
  await page.screenshot({ path: '/tmp/cys-demo-preview.png' })
  await page.evaluate(() => {
    const button = [...document.querySelectorAll('.dsl-actions button')].find((item) => item.textContent.trim() === '应用')
    if (button) button.click()
  })
  await page.waitForFunction(() => [...document.querySelectorAll('[role="status"], [role="alert"]')].some((node) => (node.textContent ?? '').includes('已应用')), { timeout: 20000 })
  const toast = await page.evaluate(() => [...document.querySelectorAll('[role="status"], [role="alert"]')].map((node) => node.textContent).find((text) => text.includes('已应用')) ?? '')
  await new Promise((resolve) => setTimeout(resolve, 600))
  const afterSummary = await page.evaluate(() => document.querySelector('#canvas-accessible-summary').textContent)
  const afterTitles = await page.evaluate(() => [...document.querySelectorAll('.canvas-a11y-outline [role="option"] > span:first-child')].map((node) => node.textContent))
  const textarea = await page.evaluate(() => document.querySelector('textarea.dsl-text')?.value ?? '')
  const storedCards = await page.evaluate((key) => JSON.parse(localStorage.getItem(key)).cards, keys.cards)
  await page.keyboard.press('Escape')
  await new Promise((resolve) => setTimeout(resolve, 300))
  await page.screenshot({ path: '/tmp/cys-demo-after.png' })
  const original = new Map(cards.map((card) => [card.id, card]))
  const untouched = storedCards.filter((card) => ['a', 'b', 'c', 'd', 'e', 'f'].includes(card.id)).map((card) => {
    const before = original.get(card.id)
    return { id: card.id, x: card.canvasPosition.x - before.canvasPosition.x, y: card.canvasPosition.y - before.canvasPosition.y, title: card.title === before.title, body: card.body === before.body }
  })
  const g = storedCards.find((card) => card.id === 'g')
  assert(g, 'card g missing after apply')
  assert.equal(g.title, '证据 G')
  assert.equal(g.body, '新增证据')
  assert.equal(g.canvasPosition.x, original.get('b').canvasPosition.x + original.get('b').canvasPosition.w + 40, 'g should be right of b')
  assert(preview.includes('新增'), preview)
  assert(preview.includes('删除') || preview.includes('移除'), preview)
  assert(preview.includes('证据 G'), preview)
  assert(!preview.includes('无标题'), preview)
  assert(preview.includes('Card B→证据 G'), preview)
  assert(toast.includes('4'), toast)
  assert(textarea.includes('[arrow #e6] from #b to #g'), textarea)
  assert(textarea.includes('[arrow #e7] from #g to #c'), textarea)
  assert(!textarea.includes('[arrow #e2]'), textarea)
  assert(untouched.every((item) => item.x === 0 && item.y === 0 && item.title && item.body), JSON.stringify(untouched))

  await page.evaluate(() => {
    const button = [...document.querySelectorAll('.cv-rail button')].find((item) => (item.getAttribute('aria-label') ?? '').includes('画布转义') || (item.textContent ?? '').includes('转义'))
    if (button) button.click()
  })
  await page.waitForSelector('textarea.dsl-text', { timeout: 10000 })
  await page.evaluate((text) => {
    const textarea = document.querySelector('textarea.dsl-text')
    const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set
    setter.call(textarea, text)
    textarea.dispatchEvent(new Event('input', { bubbles: true }))
  }, '[card #e] right-of #ghost @gap(40)')
  await page.waitForFunction(() => [...document.querySelectorAll('.dsl-preview')].some((node) => (node.textContent ?? '').includes('无法应用')), { timeout: 10000 })
  const errorPreview = await page.evaluate(() => [...document.querySelectorAll('.dsl-preview')].map((node) => node.textContent).find((text) => text.includes('无法应用')) ?? '')
  const errorBefore = await page.evaluate((key) => JSON.parse(localStorage.getItem(key)).cards.find((card) => card.id === 'e'), keys.cards)
  await page.evaluate(() => {
    const button = [...document.querySelectorAll('.dsl-actions button')].find((item) => item.textContent.trim() === '应用')
    if (button) button.click()
  })
  await page.waitForFunction(() => [...document.querySelectorAll('[role="status"], [role="alert"]')].some((node) => (node.textContent ?? '').includes('已整单取消')), { timeout: 10000 })
  const errorToast = await page.evaluate(() => [...document.querySelectorAll('[role="status"], [role="alert"]')].map((node) => node.textContent).find((text) => text.includes('已整单取消')) ?? '')
  await new Promise((resolve) => setTimeout(resolve, 500))
  const errorAfter = await page.evaluate((key) => JSON.parse(localStorage.getItem(key)).cards.find((card) => card.id === 'e'), keys.cards)
  await page.screenshot({ path: '/tmp/cys-demo-error.png' })
  assert(errorPreview.includes('ghost'), errorPreview)
  assert.deepEqual(errorAfter.canvasPosition, errorBefore.canvasPosition)
  assert.equal(errorAfter.title, errorBefore.title)

  assert.deepEqual(errors, [])
  assert.deepEqual(external, [])
  console.log(JSON.stringify({ ok: true, beforeSummary, afterSummary, beforeTitles, afterTitles, preview, toast, untouched, g: { x: g.canvasPosition.x, y: g.canvasPosition.y, title: g.title }, errorPreview, errorToast, errors, external }, null, 2))
} finally {
  await browser?.close()
  server.closeAllConnections()
  await new Promise((resolve) => server.close(resolve))
}
