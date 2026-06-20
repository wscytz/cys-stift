#!/usr/bin/env node
// Phase 6.5b — inbox multi-media edit (spec §4.2 / Phase 3 closeout
// "intentionally not exposed (Phase 3 MVP)" 移除).
// Open a card with links/code/quotes → Edit → add/remove entries →
// Save → /inbox list shows updated media. Persist across reload.
const puppeteer = require('puppeteer-core')
const fs = require('node:fs')
const path = require('node:path')

const SHOTS = path.join(__dirname, '..', 'docs', 'design', 'screenshots', 'phase-6.5b')
fs.mkdirSync(SHOTS, { recursive: true })

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const URL = process.env.URL || 'http://localhost:3016/'
const CARDS_KEY = 'cys-stift.cards.v1'

const wait = (ms) => new Promise((r) => setTimeout(r, ms))

async function shot(page, name) {
  const file = path.join(SHOTS, name)
  await page.screenshot({ path: file })
  console.log(`✓ ${name}  (${(fs.statSync(file).size / 1024).toFixed(1)} kB)`)
}
async function shotFull(page, name) {
  const file = path.join(SHOTS, name)
  await page.screenshot({ path: file, fullPage: true })
  console.log(`✓ ${name}  (${(fs.statSync(file).size / 1024).toFixed(1)} kB)`)
}

async function readCards(page) {
  return page.evaluate((k) => {
    const raw = localStorage.getItem(k)
    if (!raw) return []
    return JSON.parse(raw).cards || []
  }, CARDS_KEY)
}

async function seedCards(page, cards) {
  await page.evaluate(
    (k, payload) => {
      localStorage.setItem(k, JSON.stringify({ cards: payload }))
    },
    CARDS_KEY,
    cards,
  )
  await page.reload({ waitUntil: 'domcontentloaded' })
  await wait(800)
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
  await page.evaluate((k) => localStorage.removeItem(k), CARDS_KEY)
  await page.reload({ waitUntil: 'domcontentloaded' })
  await wait(800)

  // ── 1. Seed a card with full multi-media ───────────────────────────
  const seed = [
    {
      id: 'card-mm', title: 'Multi-media card', body: '# heading\nA note.',
      type: 'note', media: [],
      links: [{ url: 'https://original.example', fetchedAt: '2026-06-19T00:00:00.000Z' }],
      codeSnippets: [{ language: 'ts', code: 'const a = 1' }],
      quotes: [{ text: 'Original quote', attribution: 'Original author' }],
      source: { kind: 'manual', deviceId: 'web' },
      capturedAt: '2026-06-19T00:00:00.000Z',
      createdAt: '2026-06-19T00:00:00.000Z',
      updatedAt: '2026-06-19T00:00:00.000Z',
      pinned: false, archived: false,
    },
  ]
  await seedCards(page, seed)
  await page.goto(URL + 'inbox', { waitUntil: 'domcontentloaded' })
  await wait(800)
  await shotFull(page, '01-inbox-with-multi-media-card.png')

  // ── 2. Open detail (view) → see links/code/quotes ───────────────────
  await page.click('.tile')
  await wait(400)
  // 验证 Phase 3 view 已渲染 links / code / quotes(草稿级断言)
  // Phase archive-detail: shared CardDetailModal uses `cd__*` class
  // namespace (was `link-list` / `code-block` / `detail__quote` in the
  // pre-extraction inbox local CardDetail).
  const detailLinks = await page.$$eval('.cd__links a', (els) => els.map((a) => a.href))
  const codeBlocks = await page.$$eval('.cd__code-lang', (els) =>
    els.map((e) => e.textContent),
  )
  const quoteTexts = await page.$$eval('.cd__quote p', (els) =>
    els.map((e) => e.textContent),
  )
  console.log(`  [view] links = ${JSON.stringify(detailLinks)}`)
  console.log(`  [view] code langs = ${JSON.stringify(codeBlocks)}`)
  console.log(`  [view] quotes = ${JSON.stringify(quoteTexts)}`)
  await shotFull(page, '02-detail-view.png')

  // ── 3. Switch to edit mode ──────────────────────────────────────────
  await page.evaluate(() => {
    const btns = [...document.querySelectorAll('button')]
    const edit = btns.find((b) => b.textContent.trim() === 'Edit')
    edit?.click()
  })
  await wait(400)
  // 编辑模式现在应该暴露 ListEditor / CodeEditor / QuoteEditor(3 个 .le 块)
  const editPanels = await page.$$('.le')
  console.log(`  [edit-mode] editor panels = ${editPanels.length}  (expect 3)`)
  // Phase 3 hint 已移除
  const hint = await page.$('.cd__hint')
  console.log(`  [edit-mode] phase-3 hint present = ${hint !== null}  (expect false)`)
  await shotFull(page, '03-detail-edit-mode-with-editors.png')

  // ── 4. Edit: 修改 title + 改链接 + 加 1 个 code + 改 quote ────────
  // Strategy: 在 page context 内定义 React 兼容的受控 input setter
  // (通过覆盖原生 setter 让 React 监听 onChange),然后直接调用。
  await page.evaluate(() => {
    window.__setReactInputValue = (el, value) => {
      const proto = el.tagName === 'TEXTAREA'
        ? window.HTMLTextAreaElement.prototype
        : window.HTMLInputElement.prototype
      const desc = Object.getOwnPropertyDescriptor(proto, 'value')
      desc.set.call(el, value)
      el.dispatchEvent(new Event('input', { bubbles: true }))
    }
  })

  await page.evaluate(() => {
    window.__setReactInputValue(
      document.querySelector('input[name="edit-title"]'),
      'Edited title',
    )
  })
  await wait(200)

  // 替换 link 1: 删 → 加
  await page.evaluate(() => {
    const rows = [...document.querySelectorAll('.le .le__row')]
    rows[0]?.querySelector('.le__remove')?.click()
  })
  await wait(200)
  await page.evaluate(() => {
    const adds = [...document.querySelectorAll('.le .le__add')]
    adds[0]?.click()
  })
  await wait(200)
  await page.evaluate(() => {
    const inputs = [...document.querySelectorAll('.le .le__row .le__input')]
    const last = inputs[inputs.length - 1]
    if (last) window.__setReactInputValue(last, 'https://edited.example')
  })
  await wait(200)

  // 加 1 个 code → 填 lang + area
  await page.evaluate(() => {
    const adds = [...document.querySelectorAll('.le .le__add')]
    const codeAdd = adds.find((b) => b.textContent.includes('code block'))
    codeAdd?.click()
  })
  await wait(200)
  await page.evaluate(() => {
    const items = [...document.querySelectorAll('.le__code')]
    const last = items[items.length - 1]
    const lang = last.querySelector('.le__lang')
    const area = last.querySelector('.le__code-area')
    if (lang) window.__setReactInputValue(lang, 'rust')
    if (area) window.__setReactInputValue(area, 'fn main() { println!("hi"); }')
  })
  await wait(200)

  // 改第一个 quote 的 attribution
  await page.evaluate(() => {
    const items = [...document.querySelectorAll('.le__quote .le__input')]
    if (items[0]) window.__setReactInputValue(items[0], 'New attribution')
  })
  await wait(200)
  await shotFull(page, '04-detail-edit-modified.png')

  // ── 5. Save → 验证持久化 ──────────────────────────────────────────
  await page.evaluate(() => {
    const btns = [...document.querySelectorAll('button')]
    const save = btns.find((b) => b.textContent.trim() === 'Save')
    save?.click()
  })
  await wait(500)
  const after = await readCards(page)
  const c = after.find((x) => x.id === 'card-mm')
  console.log(
    `  [saved] title = ${c?.title}  links = ${JSON.stringify(c?.links.map((l) => l.url))}  codes = ${c?.codeSnippets.length}  quotes = ${c?.quotes.length}`,
  )
  await shotFull(page, '05-detail-after-save.png')

  // ── 6. 跨刷新保留 ──────────────────────────────────────────────
  await page.reload({ waitUntil: 'domcontentloaded' })
  await wait(800)
  const afterReload = await readCards(page)
  const c2 = afterReload.find((x) => x.id === 'card-mm')
  console.log(
    `  [reload] title = ${c2?.title}  codes = ${c2?.codeSnippets.length}  (expect Edited title / 2)`,
  )
  await shotFull(page, '06-inbox-after-reload.png')

  await browser.close()

  console.log('\n── page errors ──')
  if (pageErrors.length === 0) console.log('  none')
  else pageErrors.forEach((e) => console.log(`  ! ${e}`))

  const pass =
    detailLinks.length === 1 &&
    codeBlocks.length === 1 &&
    quoteTexts.length === 1 &&
    editPanels.length === 3 &&
    hint === null &&
    c?.title === 'Edited title' &&
    c?.links.map((l) => l.url).includes('https://edited.example') &&
    c?.codeSnippets.length === 2 &&
    c?.quotes[0]?.attribution === 'New attribution' &&
    c2?.title === 'Edited title' &&
    c2?.codeSnippets.length === 2 &&
    pageErrors.length === 0
  console.log(`\n${pass ? '✓ ALL ASSERTIONS PASS' : '✗ ASSERTIONS FAILED'}`)
  process.exit(pass ? 0 : 1)
})().catch((e) => {
  console.error(e)
  process.exit(2)
})