// Approval demo: seed a fixed 6-card canvas, then exercise three edit shapes
// (insert, move, content-only) plus a blocked missing-anchor path through the
// same DSL confirm chain. Uses the existing static export in apps/web/out; run
// `pnpm --filter web build` first. No network.
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { readFile, stat } from 'node:fs/promises'
import { readFileSync, existsSync } from 'node:fs'
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
  browser = await puppeteer.launch({ executablePath: chromePath, headless: true, defaultViewport: { width: 1440, height: 900, deviceScaleFactor: 1 } })
  const context = await browser.createBrowserContext()
  const page = await context.newPage()
  // The demo asserts Chinese labels; CI runners default to en-US, so pin the
  // navigator language before app scripts run (i18n detects locale from it).
  await page.evaluateOnNewDocument(() => {
    Object.defineProperty(navigator, 'language', { get: () => 'zh-CN' })
  })
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

  const openDsl = async () => {
    await page.evaluate(() => {
      const button = [...document.querySelectorAll('.cv-rail button')].find((item) => (item.getAttribute('aria-label') ?? '').includes('画布转义') || (item.textContent ?? '').includes('转义'))
      if (button) button.click()
    })
    await page.waitForSelector('textarea.dsl-text', { timeout: 10000 })
  }
  const setDsl = async (text) => {
    await page.evaluate((value) => {
      const area = document.querySelector('textarea.dsl-text')
      const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set
      setter.call(area, value)
      area.dispatchEvent(new Event('input', { bubbles: true }))
    }, text)
  }
  const clickApply = async () => {
    await page.evaluate(() => {
      const button = [...document.querySelectorAll('.dsl-actions button')].find((item) => item.textContent.trim() === '应用')
      if (button) button.click()
    })
  }
  const readCards = () => page.evaluate((key) => JSON.parse(localStorage.getItem(key)).cards, keys.cards)
  // h 是渲染层派生值(随内容重算),不作为内容编辑的位置不变量;x/y/w 才是。
  const cardState = (list) => Object.fromEntries(list.map((card) => [card.id, {
    x: card.canvasPosition.x, y: card.canvasPosition.y, w: card.canvasPosition.w,
    title: card.title, body: card.body,
  }]))
  const sameExcept = (before, after, ids) => ids.every((id) => {
    const left = before[id]
    const right = after[id]
    return left && right && JSON.stringify(left) === JSON.stringify(right)
  })

  // 第二类编辑：移动。整段文本只留一条关系式 op，证明省略不等于删除。
  await openDsl()
  await setDsl('[card #e] right-of #f @gap(40)')
  await page.waitForFunction(() => (document.querySelector('.dsl-preview')?.textContent ?? '').includes('横向位置'), { timeout: 10000 })
  const movePreview = await page.evaluate(() => document.querySelector('.dsl-preview')?.textContent ?? '')
  const beforeMove = cardState(await readCards())
  await clickApply()
  await page.waitForFunction(() => (document.querySelector('textarea.dsl-text')?.value ?? '').includes('@pos(1300.0,240.0)'), { timeout: 10000 })
  await new Promise((resolve) => setTimeout(resolve, 600))
  const afterMoveCards = await readCards()
  const afterMove = cardState(afterMoveCards)
  const eAfterMove = afterMoveCards.find((card) => card.id === 'e')
  assert(eAfterMove, 'card e missing after move')
  assert.equal(eAfterMove.canvasPosition.x, 1300, 'e should be right of f')
  assert.equal(eAfterMove.canvasPosition.y, 240, 'e should stay on row 2')
  assert.equal(eAfterMove.title, 'Card E')
  assert.equal(eAfterMove.body, 'Body E')
  assert(sameExcept(beforeMove, afterMove, ['a', 'b', 'c', 'd', 'f', 'g']), 'move changed an unrelated card')
  assert(movePreview.includes('Card E'), movePreview)
  assert(movePreview.includes('横向位置'), movePreview)
  await page.screenshot({ path: '/tmp/cys-demo-move.png' })

  // 第三类编辑：纯内容。位置/元素不变，只改卡片字段。
  await setDsl('[card #a] @title("Alpha Updated") @content("body updated")')
  await page.waitForFunction(() => (document.querySelector('.dsl-preview')?.textContent ?? '').includes('Card A'), { timeout: 10000 })
  const updatePreview = await page.evaluate(() => document.querySelector('.dsl-preview')?.textContent ?? '')
  const beforeUpdate = cardState(await readCards())
  await clickApply()
  await page.waitForFunction(() => {
    const text = document.querySelector('textarea.dsl-text')?.value ?? ''
    return text.includes('Alpha Updated') && text.includes('[card #b]')
  }, { timeout: 10000 })
  await new Promise((resolve) => setTimeout(resolve, 600))
  const afterUpdateCards = await readCards()
  const afterUpdate = cardState(afterUpdateCards)
  const aAfterUpdate = afterUpdateCards.find((card) => card.id === 'a')
  assert(aAfterUpdate, 'card a missing after content update')
  assert.equal(aAfterUpdate.title, 'Alpha Updated')
  assert.equal(aAfterUpdate.body, 'body updated')
  assert.deepEqual(
    { x: afterUpdate.a.x, y: afterUpdate.a.y, w: afterUpdate.a.w },
    { x: beforeUpdate.a.x, y: beforeUpdate.a.y, w: beforeUpdate.a.w },
    'content update moved or resized card a',
  )
  assert(sameExcept(beforeUpdate, afterUpdate, ['b', 'c', 'd', 'e', 'f', 'g']), 'content update changed an unrelated card')
  assert(updatePreview.includes('Card A'), updatePreview)
  assert(updatePreview.includes('标题'), updatePreview)
  assert(updatePreview.includes('正文'), updatePreview)
  await page.screenshot({ path: '/tmp/cys-demo-update.png' })

  // 错误路径：缺失锚点整单取消，画布状态不变。
  await setDsl('[card #e] right-of #ghost @gap(40)')
  await page.waitForFunction(() => document.querySelector('[data-testid="dsl-apply-blocked"]'), { timeout: 10000 })
  const errorPreview = await page.evaluate(() => document.querySelector('[data-testid="dsl-apply-blocked"]')?.textContent ?? '')
  const errorBefore = await page.evaluate((key) => JSON.parse(localStorage.getItem(key)).cards.find((card) => card.id === 'e'), keys.cards)
  await clickApply()
  await page.waitForFunction(() => [...document.querySelectorAll('[role="status"], [role="alert"]')].some((node) => (node.textContent ?? '').includes('已整单取消')), { timeout: 10000 })
  const errorToast = await page.evaluate(() => [...document.querySelectorAll('[role="status"], [role="alert"]')].map((node) => node.textContent).find((text) => text.includes('已整单取消')) ?? '')
  await new Promise((resolve) => setTimeout(resolve, 500))
  const errorAfter = await page.evaluate((key) => JSON.parse(localStorage.getItem(key)).cards.find((card) => card.id === 'e'), keys.cards)
  await page.screenshot({ path: '/tmp/cys-demo-error.png' })
  assert(errorPreview.includes('ghost'), errorPreview)
  assert.deepEqual(errorAfter.canvasPosition, errorBefore.canvasPosition)
  assert.equal(errorAfter.title, errorBefore.title)
  assert.equal(errorAfter.body, errorBefore.body)

  assert.deepEqual(errors, [])
  assert.deepEqual(external, [])
  console.log(JSON.stringify({
    ok: true, beforeSummary, afterSummary, beforeTitles, afterTitles, preview, toast, untouched,
    g: { x: g.canvasPosition.x, y: g.canvasPosition.y, title: g.title },
    move: { preview: movePreview, e: { x: eAfterMove.canvasPosition.x, y: eAfterMove.canvasPosition.y, title: eAfterMove.title } },
    update: { preview: updatePreview, a: { title: aAfterUpdate.title, body: aAfterUpdate.body, x: aAfterUpdate.canvasPosition.x, y: aAfterUpdate.canvasPosition.y } },
    errorPreview, errorToast, errors, external,
  }, null, 2))
} finally {
  await browser?.close()
  server.closeAllConnections()
  await new Promise((resolve) => server.close(resolve))
}
