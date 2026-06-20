#!/usr/bin/env node
// Phase multi-canvas — canvas switcher + create + rename + delete.
//
//   1. Seed 1 card on the default canvas. /canvas shows the card.
//   2. Verify the switcher shows "default canvas" and active.
//   3. Click "+ New" → Modal with input → type "Project B" → Create.
//      Switcher now shows Project B; canvas empty; tldraw has 0 shapes.
//   4. Switch back to default canvas → card visible again.
//   5. Switch to Project B → Rename → "Project C" → switcher shows
//      "Project C".
//   6. Switch to Project C → Delete → Modal (0 cards) → confirm →
//      switcher shows only default canvas; Project C gone.
//   7. The default canvas's Delete button is disabled.
//   8. 0 page error.
const puppeteer = require('puppeteer-core')
const fs = require('node:fs')
const path = require('node:path')

const SHOTS = path.join(__dirname, '..', 'docs', 'design', 'screenshots', 'phase-multi-canvas')
fs.mkdirSync(SHOTS, { recursive: true })

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const URL = process.env.URL || 'http://localhost:3016/'
const CARDS_KEY = 'cys-stift.cards.v1'
const CANVASES_KEY = 'cys-stift.canvases.v1'

const wait = (ms) => new Promise((r) => setTimeout(r, ms))

async function shotFull(page, name) {
  const file = path.join(SHOTS, name)
  await page.screenshot({ path: file, fullPage: true })
  console.log(`✓ ${name}  (${(fs.statSync(file).size / 1024).toFixed(1)} kB)`)
}

async function readCanvases(page) {
  return page.evaluate((k) => {
    const raw = localStorage.getItem(k)
    if (!raw) return null
    return JSON.parse(raw).snapshot
  }, CANVASES_KEY)
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

  // ── 0. Seed: 1 card on default canvas, no canvases store yet ───
  await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 30000 })
  await wait(800)
  await page.evaluate((k) => {
    const now = new Date().toISOString()
    localStorage.setItem(
      k,
      JSON.stringify({
        cards: [
          {
            id: 'mc-1', title: 'Seed card', body: '', type: 'note',
            media: [], links: [], codeSnippets: [], quotes: [],
            source: { kind: 'manual', deviceId: 'web' },
            capturedAt: now, createdAt: now, updatedAt: now,
            pinned: false, archived: false,
            canvasPosition: {
              canvasId: 'default-canvas',
              x: 200, y: 200, w: 240, h: 120, z: 0,
            },
          },
        ],
      }),
    )
  }, CARDS_KEY)
  console.log('  [seed] 1 card on default canvas')

  // ── 1. /canvas: card visible, switcher shows default canvas ───
  await page.goto(URL + 'canvas', { waitUntil: 'domcontentloaded' })
  await wait(3500) // tldraw mount + loadCardsIntoEditor
  const initialShapes = await page.evaluate(() => {
    const ed = window.__canvasEditor
    if (!ed) return -1
    return ed.getCurrentPageShapes().length
  })
  console.log(`  [/canvas] shapes on default = ${initialShapes}  (expect 1)`)
  // Switcher shows default canvas name + active
  const switcherVal = await page.$eval('.cselect', (el) => el.value)
  const switcherOptions = await page.$$eval('.cselect option', (els) =>
    els.map((o) => o.textContent),
  )
  console.log(`  [switcher] value = "${switcherVal}"  (expect contains default-canvas)`)
  console.log(`  [switcher] options = ${JSON.stringify(switcherOptions)}  (expect 1: default canvas)`)
  await shotFull(page, '01-canvas-default-only.png')

  // Default canvas Delete button should be disabled
  const deleteDisabled = await page.evaluate(() => {
    const btns = [...document.querySelectorAll('button')]
    const del = btns.find((b) => b.textContent.trim() === 'Delete')
    return del?.disabled === true
  })
  console.log(`  [default delete] disabled = ${deleteDisabled}  (expect true)`)

  // ── 2. Create new canvas "Project B" ──────────────────────────
  await page.evaluate(() => {
    const btns = [...document.querySelectorAll('button')]
    const add = btns.find((b) => b.textContent.trim() === '+ New')
    add?.click()
  })
  await wait(400)
  await page.evaluate(() => {
    const input = document.querySelector('.cinput')
    if (!input) return
    const proto = window.HTMLInputElement.prototype
    const desc = Object.getOwnPropertyDescriptor(proto, 'value')
    desc.set.call(input, 'Project B')
    input.dispatchEvent(new Event('input', { bubbles: true }))
  })
  await wait(200)
  await page.evaluate(() => {
    const btns = [...document.querySelectorAll('.confirm__actions button')]
    const create = btns.find((b) => b.textContent.trim() === 'Create')
    create?.click()
  })
  await wait(800) // tldraw remount
  const afterCreateShapes = await page.evaluate(() => {
    const ed = window.__canvasEditor
    if (!ed) return -1
    return ed.getCurrentPageShapes().length
  })
  const afterCreateVal = await page.$eval('.cselect', (el) => el.value)
  const afterCreateOptions = await page.$$eval('.cselect option', (els) =>
    els.map((o) => o.textContent),
  )
  console.log(`  [after create] switcher value = "${afterCreateVal}"  (expect NOT default-canvas)`)
  console.log(`  [after create] options = ${JSON.stringify(afterCreateOptions)}  (expect 2)`)
  console.log(`  [after create] shapes on Project B = ${afterCreateShapes}  (expect 0)`)
  await shotFull(page, '02-after-create.png')

  // ── 3. Switch back to default canvas → card visible ─────────
  await page.select('.cselect', 'default-canvas')
  await wait(1200) // tldraw remount
  const backToDefault = await page.evaluate(() => {
    const ed = window.__canvasEditor
    if (!ed) return -1
    return ed.getCurrentPageShapes().length
  })
  console.log(`  [back to default] shapes = ${backToDefault}  (expect 1)`)
  await shotFull(page, '03-back-to-default.png')

  // ── 4. Switch to Project B, rename to "Project C" ────────────
  const projectBId = await page.evaluate(() => {
    const sel = document.querySelector('.cselect')
    const opt = [...sel.options].find((o) => o.textContent.trim() === 'Project B')
    return opt?.value || ''
  })
  await page.select('.cselect', projectBId)
  await wait(1200)
  // Click rename pencil
  await page.evaluate(() => {
    const editBtn = document.querySelector('.cselect-edit')
    editBtn?.click()
  })
  await wait(300)
  // Inline input — clear & type
  await page.evaluate(() => {
    const input = document.querySelector('.crename')
    if (!input) return
    const proto = window.HTMLInputElement.prototype
    const desc = Object.getOwnPropertyDescriptor(proto, 'value')
    desc.set.call(input, 'Project C')
    input.dispatchEvent(new Event('input', { bubbles: true }))
    // Submit by pressing Enter
    const ev = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })
    input.dispatchEvent(ev)
  })
  // commitRename fires onBlur → focus moves out
  await wait(300)
  await page.evaluate(() => (document.activeElement instanceof HTMLElement ? document.activeElement.blur() : null))
  await wait(300)
  const afterRename = await page.evaluate(() => {
    const sel = document.querySelector('.cselect')
    const opts = [...sel.options].map((o) => o.textContent.trim())
    return { active: opts[sel.selectedIndex], opts }
  })
  console.log(`  [after rename] active = ${JSON.stringify(afterRename.active)}  (expect "Project C")`)
  console.log(`  [after rename] options = ${JSON.stringify(afterRename.opts)}  (expect default canvas + Project C)`)
  await shotFull(page, '04-after-rename.png')

  // ── 5. Switch to Project C, Delete → confirm Modal → confirm ──
  await page.select('.cselect', projectBId) // value unchanged after rename
  await wait(1000)
  await page.evaluate(() => {
    const btns = [...document.querySelectorAll('button')]
    const del = btns.find((b) => b.textContent.trim() === 'Delete')
    del?.click()
  })
  await wait(400)
  const confirmOpen = await page.evaluate(
    () => document.querySelectorAll('.confirm__body').length > 0,
  )
  console.log(`  [delete confirm] open = ${confirmOpen}  (expect true)`)
  await shotFull(page, '05-delete-confirm.png')
  await page.evaluate(() => {
    const btns = [...document.querySelectorAll('.confirm__actions button')]
    const danger = btns.find((b) => b.textContent.trim() === 'Delete canvas')
    danger?.click()
  })
  await wait(800)
  const finalCanvases = await readCanvases(page)
  console.log(`  [final canvases] = ${JSON.stringify(finalCanvases.canvases.map((c) => c.name))}  (expect ["default canvas"])`)
  console.log(`  [final active] = ${finalCanvases.activeCanvasId}  (expect default-canvas)`)
  await shotFull(page, '06-after-delete.png')

  // ── 6. Switch back to default canvas to confirm Delete is disabled
  await page.select('.cselect', 'default-canvas')
  await wait(1200)
  const deleteDisabledFinal = await page.evaluate(() => {
    const btns = [...document.querySelectorAll('button')]
    const del = btns.find((b) => b.textContent.trim() === 'Delete')
    return del?.disabled === true
  })
  console.log(`  [final delete-disabled on default] = ${deleteDisabledFinal}  (expect true)`)

  // ── 7. The seed card survived ─────────────────────────────────
  const cardsFinal = await page.evaluate((k) => {
    const raw = localStorage.getItem(k)
    return raw ? JSON.parse(raw).cards : []
  }, CARDS_KEY)
  const seedCard = cardsFinal.find((c) => c.id === 'mc-1')
  const seedStillOnDefault = seedCard && seedCard.canvasPosition?.canvasId === 'default-canvas'
  console.log(`  [seed card] still on default = ${seedStillOnDefault}  (expect true)`)

  await browser.close()

  console.log('\n── page errors ──')
  if (pageErrors.length === 0) console.log('  none')
  else pageErrors.forEach((e) => console.log(`  ! ${e}`))

  // ── Assertions ───────────────────────────────────────────────
  const pass =
    initialShapes === 1 &&
    switcherVal === 'default-canvas' &&
    switcherOptions.length === 1 &&
    deleteDisabled === true &&
    afterCreateShapes === 0 &&
    afterCreateVal !== 'default-canvas' &&
    afterCreateOptions.length === 2 &&
    backToDefault === 1 &&
    afterRename.active === 'Project C' &&
    afterRename.opts.length === 2 &&
    confirmOpen === true &&
    finalCanvases.canvases.length === 1 &&
    finalCanvases.canvases[0].name === 'default canvas' &&
    finalCanvases.activeCanvasId === 'default-canvas' &&
    deleteDisabledFinal === true &&
    seedStillOnDefault === true &&
    pageErrors.length === 0
  console.log(`\nresult: ${pass ? 'PASS ✓' : 'FAIL ✗'}`)
  process.exit(pass ? 0 : 1)
})().catch((e) => {
  console.error(e)
  process.exit(2)
})