// Phase 0 smoke test — verifies the refactored CanvasHost / TldrawAdapter paths
// against REAL tldraw (not a stub). Exercises the four code paths touched in T0.2:
//   1. canvas mounts with no runtime error (adapter + bridges wired right)
//   2. cardService.create → card shape on editor  (syncCardsToEditor via adapter.upsert)
//   3. shape move (user-source) → position writeback (adapter.onUserChange → bindCardWriteback)
//   4. shape erase (user-source) → card soft-delete (adapter.onUserChange removed → eraser path)
// Run AFTER `pnpm --filter web build` + a static server on :3016:
//   node scripts/_phase0-smoke.cjs
const puppeteer = require('puppeteer-core')
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const URL = 'http://localhost:3016'
const wait = (ms) => new Promise((r) => setTimeout(r, ms))
const path = require('path')
const fs = require('fs')
const out = path.join(__dirname, '..', 'docs', 'design', 'screenshots', 'phase0-smoke')
fs.mkdirSync(out, { recursive: true })

let pass = 0
let fail = 0
const check = (name, ok, detail = '') => {
  if (ok) {
    pass++
    console.log(`  ✓ ${name}${detail ? ' — ' + detail : ''}`)
  } else {
    fail++
    console.log(`  ✗ ${name}${detail ? ' — ' + detail : ''}`)
  }
}

;(async () => {
  const browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: 'new',
    args: ['--no-sandbox', '--disable-gpu'],
    defaultViewport: { width: 1440, height: 900 },
  })
  const page = await browser.newPage()
  const pageerrors = []
  page.on('pageerror', (e) => {
    pageerrors.push(e.message)
    console.log('[pageerror]', e.message)
  })

  // ── 1. mount ───────────────────────────────────────────────────────────
  console.log("\n[1] canvas mounts (refactor didn't break loading)")
  await page.goto(URL + '/canvas', { waitUntil: 'networkidle0', timeout: 30000 })
  await wait(3000) // tldraw lazy-load
  const mounted = await page.evaluate(
    () => !!(window.__canvasEditor && window.__cardService),
  )
  check('window.__canvasEditor + __cardService present', mounted)
  check('no pageerror during mount', pageerrors.length === 0, `${pageerrors.length} errors`)

  // active canvas (default = 'default-canvas'; read from store to be safe)
  const activeCanvasId = await page.evaluate(() => {
    try {
      const raw = localStorage.getItem('cys-stift.canvases.v1')
      if (raw) {
        const p = JSON.parse(raw)
        return p.snapshot?.activeCanvasId ?? 'default-canvas'
      }
    } catch {
      /* ignore */
    }
    return 'default-canvas'
  })

  // ── 2. card create → shape appears (syncCardsToEditor via adapter.upsert) ──
  console.log('\n[2] cardService.create → card shape on editor (adapter sync path)')
  // NB: CardService.create returns a Card synchronously (.id, not Promise<{cardId}>).
  const cardId = await page.evaluate((cid) => {
    const card = window.__cardService.create({
      title: 'phase0-smoke',
      body: 'smoke',
      type: 'note',
      source: { kind: 'manual', deviceId: 'smoke' },
      canvasPosition: { canvasId: cid, x: 200, y: 200, w: 240, h: 120, z: Date.now() },
    })
    return String(card.id)
  }, activeCanvasId)

  let shapeAppeared = false
  for (let i = 0; i < 25; i++) {
    await wait(200)
    shapeAppeared = await page.evaluate(
      (id) => !!window.__canvasEditor.getShape(`shape:${id}`),
      cardId,
    )
    if (shapeAppeared) break
  }
  check('card shape appeared on editor (adapter sync)', shapeAppeared)
  await page.screenshot({ path: path.join(out, 'card-synced.png') })

  if (!shapeAppeared) {
    console.log('  (aborting remaining steps — no shape to move/erase)')
    await browser.close()
    console.log(`\n${fail === 0 ? '✓' : '✗'} ${pass} passed, ${fail} failed`)
    process.exit(fail === 0 ? 0 : 1)
    return
  }

  // ── 3. drag → writeback (adapter.onUserChange → bindCardWriteback) ───────
  console.log('\n[3] shape move (user-source) → cardService position writeback')
  await page.evaluate((id) => {
    // editor.updateShape is a user-source mutation → adapter.onUserChange fires.
    window.__canvasEditor.updateShape({
      id: `shape:${id}`,
      type: 'card',
      x: 555,
      y: 666,
    })
  }, cardId)
  await wait(700) // > 300ms writeback debounce + flush
  const posAfter = await page.evaluate((id) => {
    const c = window.__cardService.get(id)
    return c?.canvasPosition ? { x: c.canvasPosition.x, y: c.canvasPosition.y } : null
  }, cardId)
  check(
    'writeback updated card position (adapter.onUserChange → bindCardWriteback)',
    posAfter?.x === 555 && posAfter?.y === 666,
    `pos=${JSON.stringify(posAfter)}`,
  )

  // ── 4. erase → soft-delete (adapter.onUserChange removed → eraser path) ──
  console.log('\n[4] shape erase (user-source) → card soft-delete')
  await page.evaluate((id) => {
    window.__canvasEditor.deleteShape(`shape:${id}`)
  }, cardId)
  await wait(400)
  const deletedAt = await page.evaluate((id) => {
    const c = window.__cardService.get(id)
    return c?.deletedAt ? String(c.deletedAt) : null
  }, cardId)
  check(
    'card soft-deleted after shape erase (adapter.onUserChange removed path)',
    !!deletedAt,
    `deletedAt=${deletedAt}`,
  )

  await browser.close()
  console.log(`\n${fail === 0 ? '✓' : '✗'} ${pass} passed, ${fail} failed`)
  console.log(`Screenshots → ${out}`)
  process.exit(fail === 0 ? 0 : 1)
})().catch((e) => {
  console.error('FATAL', e)
  process.exit(2)
})
