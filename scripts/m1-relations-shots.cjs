// M1 canvas relations e2e (v0.27.0):
//   1. 建两张 card shape → fetch 真实 shape ids from store
//   2. 建一条绑定 arrow a→b
//   3. 选中 arrow → RelationPanel 出现 → 点 Blocks → arrow 变 red+solid+arrowhead
//   4. reload → arrow 视觉持久 + RelationPanel 仍高亮 Blocks
//   5. 两张卡的徽标都显示 × 1
// Run AFTER `pnpm --filter web build` and a static server on :3016.
const puppeteer = require('puppeteer-core')
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const URL = 'http://localhost:3016'
const wait = (ms) => new Promise((r) => setTimeout(r, ms))
const path = require('path')
const fs = require('fs')
const out = path.join(__dirname, '..', 'docs', 'design', 'screenshots', 'm1-relations')
fs.mkdirSync(out, { recursive: true })

let pass = 0
let fail = 0
const check = (name, ok, detail = '') => {
  if (ok) { pass++; console.log(`  ✓ ${name}${detail ? ' — ' + detail : ''}`) }
  else    { fail++; console.log(`  ✗ ${name}${detail ? ' — ' + detail : ''}`) }
}

;(async () => {
  const browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: 'new',
    args: ['--no-sandbox', '--disable-gpu'],
    defaultViewport: { width: 1440, height: 900 },
  })
  const page = await browser.newPage()
  page.on('pageerror', (e) => console.log('[pageerror]', e.message))

  console.log('\n[1] two card shapes + one bound arrow')
  await page.goto(URL + '/canvas', { waitUntil: 'networkidle0', timeout: 30000 })
  await wait(3500)

  const setup = await page.evaluate(() => {
    const ed = window.__canvasEditor
    if (!ed) return { error: 'no editor' }
    ed.createShape({ type: 'card', x: 100, y: 100, props: { w: 200, h: 120 } })
    ed.createShape({ type: 'card', x: 500, y: 300, props: { w: 200, h: 120 } })
    // Fetch real ids back from the store; createShape's return `.id` is not
    // the committed id in tldraw 3.15.
    const cardIds = [...ed.getCurrentPageShapeIds()]
      .map((id) => ed.getShape(id))
      .filter((s) => s?.type === 'card')
      .map((s) => String(s.id))
    return { cardIds }
  })
  check('two card shapes created with distinct ids', setup.cardIds?.length === 2 && setup.cardIds[0] !== setup.cardIds[1], JSON.stringify(setup))
  await wait(600)

  const arrowId = await page.evaluate((ids) => {
    const ed = window.__canvasEditor
    if (!ed) return null
    // tldraw 3.15: create a plain arrow first (no binding in props), then
    // bind its terminals via editor.createBinding. Mixing binding props into
    // arrow props is rejected by the schema.
    const arr = ed.createShape({
      type: 'arrow',
      x: 200, y: 160,
      props: {
        kind: 'arc',
        start: { x: 0, y: 0 },
        end: { x: 400, y: 200 },
      },
    })
    const arrows = [...ed.getCurrentPageShapeIds()]
      .map((id) => ed.getShape(id))
      .filter((s) => s?.type === 'arrow')
    const aid = arrows[0]?.id
    if (!aid) return null
    ed.createBinding({
      type: 'arrow',
      fromId: aid,
      toId: ids[0],
      props: { terminal: 'start', normalizedAnchor: { x: 0.5, y: 0.5 }, isPrecise: false, isExact: false, snap: 'none' },
    })
    ed.createBinding({
      type: 'arrow',
      fromId: aid,
      toId: ids[1],
      props: { terminal: 'end', normalizedAnchor: { x: 0.5, y: 0.5 }, isPrecise: false, isExact: false, snap: 'none' },
    })
    return String(aid)
  }, setup.cardIds)
  check('bound arrow a→b created', !!arrowId)
  await wait(600)

  // Select the arrow + click Blocks via RelationPanel
  console.log('\n[2] select arrow + click Blocks via RelationPanel')
  await page.evaluate((aid) => window.__canvasEditor.select(aid), arrowId)
  await wait(500)

  const panelExists = await page.evaluate(() => {
    const p = document.querySelector('.cv-relation')
    if (!p) return { exists: false }
    const btns = Array.from(p.querySelectorAll('.cv-relation__btn'))
    return { exists: true, count: btns.length, ids: btns.map((b) => b.getAttribute('data-relation-id')), labels: btns.map((b) => b.textContent?.trim()) }
  })
  check('RelationPanel renders with 4 type buttons', panelExists.exists && panelExists.count === 4 && panelExists.ids.includes('blocks'), JSON.stringify(panelExists))

  await page.evaluate(() => {
    const btn = document.querySelector('.cv-relation__btn[data-relation-id="blocks"]')
    if (btn) (btn).click()
  })
  await wait(600)

  const arrowProps = await page.evaluate((aid) => {
    const ed = window.__canvasEditor
    const s = ed.getShape(aid)
    return { color: s?.props?.color, dash: s?.props?.dash, arrowheadEnd: s?.props?.arrowheadEnd, labelColor: s?.props?.labelColor }
  }, arrowId)
  check('arrow props = red/solid/arrow/red (blocks)', arrowProps.color === 'red' && arrowProps.dash === 'solid' && arrowProps.arrowheadEnd === 'arrow' && arrowProps.labelColor === 'red', JSON.stringify(arrowProps))
  await page.screenshot({ path: path.join(out, '01-arrow-blocks.png'), fullPage: false })

  const badges = await page.evaluate(() => {
    const badges = Array.from(document.querySelectorAll('.card-badge-arrow'))
    // Polish: badge shows just the number (with a leading dot for visual
    // balance) so the count reads as "connected to N arrows".
    return badges.map((b) => b.textContent?.trim().replace(/\s+/g, ' '))
  })
  check('two cards show "1" badge', badges.length === 2 && badges.every((b) => b === '1'), `badges=${JSON.stringify(badges)}`)

  // Reload persistence
  console.log('\n[3] reload persistence')
  await page.reload({ waitUntil: 'networkidle0' })
  await wait(3500)
  const persisted = await page.evaluate(() => {
    const ed = window.__canvasEditor
    if (!ed) return { error: 'no editor' }
    const arrows = [...ed.getCurrentPageShapeIds()].map((id) => ed.getShape(id)).filter((s) => s?.type === 'arrow')
    const a = arrows[0]
    return {
      arrowCount: arrows.length,
      color: a?.props?.color,
      dash: a?.props?.dash,
      arrowheadEnd: a?.props?.arrowheadEnd,
      labelColor: a?.props?.labelColor,
    }
  })
  check('arrow survived reload', persisted.arrowCount === 1, JSON.stringify(persisted))
  check('arrow style persisted', persisted.color === 'red' && persisted.dash === 'solid' && persisted.arrowheadEnd === 'arrow' && persisted.labelColor === 'red', JSON.stringify(persisted))

  // Re-select → RelationPanel highlights Blocks
  const persistedArrowId = await page.evaluate(() => {
    const ed = window.__canvasEditor
    const arrows = [...ed.getCurrentPageShapeIds()].map((id) => ed.getShape(id)).filter((s) => s?.type === 'arrow')
    return arrows[0] ? String(arrows[0].id) : null
  })
  if (persistedArrowId) {
    await page.evaluate((aid) => window.__canvasEditor.select(aid), persistedArrowId)
    await wait(500)
    const activeBtn = await page.evaluate(() => {
      const active = document.querySelector('.cv-relation__btn--active')
      return active?.getAttribute('data-relation-id') ?? null
    })
    check('after reload, RelationPanel highlights blocks', activeBtn === 'blocks', `active=${activeBtn}`)
  } else {
    check('after reload, RelationPanel highlights Blocks', false, 'no arrow id found')
  }
  await page.screenshot({ path: path.join(out, '02-after-reload.png'), fullPage: false })

  await browser.close()
  console.log(`\n${fail === 0 ? '✓' : '✗'} ${pass} passed, ${fail} failed`)
  console.log(`Screenshots → ${out}`)
  process.exit(fail === 0 ? 0 : 1)
})().catch((e) => {
  console.error('FATAL', e)
  process.exit(2)
})
