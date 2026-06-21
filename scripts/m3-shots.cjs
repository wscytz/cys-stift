// M3 e2e: settings AI panel (visual) + provider factory (unit) + AI
//   buttons reverse-assertion (absent when ai === null) + settings
//   roundtrip (ai key present in localStorage).
//
// Run AFTER `pnpm --filter web build`, `pnpm --filter web test`, and a
// static server on :3016. Honest note: M3 does NOT exercise real API
// calls — those require user-supplied keys. Reverse assertions verify
// the "no AI configured → no AI buttons" guarantee instead.
const puppeteer = require('puppeteer-core')
const path = require('path')
const fs = require('fs')
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const URL = 'http://localhost:3016'
const wait = (ms) => new Promise((r) => setTimeout(r, ms))
const out = path.join(__dirname, '..', 'docs', 'design', 'screenshots', 'm3')
fs.mkdirSync(out, { recursive: true })

let pass = 0, fail = 0
const check = (n, ok, d='') => (ok ? (pass++, console.log(`  ✓ ${n}${d?' — '+d:''}`)) : (fail++, console.log(`  ✗ ${n}${d?' — '+d:''}`)))

;(async () => {
  const browser = await puppeteer.launch({
    executablePath: CHROME, headless: 'new',
    args: ['--no-sandbox', '--disable-gpu'],
    defaultViewport: { width: 1440, height: 900 },
  })
  const page = await browser.newPage()
  page.on('pageerror', (e) => console.log('[pageerror]', e.message))
  page.on('console', (msg) => {
    if (msg.type() === 'error') console.log('[console.error]', msg.text())
  })

  // ── 1. settings page renders AI panel ─────────────────────────────────
  console.log('\n[1] settings: AI panel renders')
  await page.goto(URL + '/settings', { waitUntil: 'networkidle0' })
  await wait(1200)
  const panelVisible = await page.evaluate(() => {
    const sections = [...document.querySelectorAll('section.set')]
    return sections.some((s) => /AI/.test(s.textContent || ''))
  })
  check('AI settings section present', panelVisible)
  await page.screenshot({ path: path.join(out, '01-settings-ai-panel.png'), fullPage: true })

  // ── 2. AI panel has ≥4 rows (enabled/provider/baseUrl/model) ────────────
  const rowsCount = await page.evaluate(() => {
    const aiSection = [...document.querySelectorAll('section.set')].find(
      (s) => /AI/.test(s.textContent || ''),
    )
    if (!aiSection) return 0
    return aiSection.querySelectorAll('.set__row').length
  })
  check('AI panel has ≥4 rows', rowsCount >= 4, `found ${rowsCount}`)

  // ── 3. AI panel plaintext warning ─────────────────────────────────────
  const warnVisible = await page.evaluate(() => {
    const aiSection = [...document.querySelectorAll('section.set')].find(
      (s) => /AI/.test(s.textContent || ''),
    )
    return !!aiSection?.querySelector('.set__warn')
  })
  check('plaintext warning visible', warnVisible)

  // ── 4. provider select has 3 options ──────────────────────────────────
  const providerOptions = await page.evaluate(() => {
    const aiSection = [...document.querySelectorAll('section.set')].find(
      (s) => /AI/.test(s.textContent || ''),
    )
    if (!aiSection) return 0
    // The first <select> in the AI section is the provider select
    // (the others are baseUrl/model <input>s).
    const sel = aiSection.querySelector('select')
    return sel ? sel.options.length : 0
  })
  check('provider select has 3 options', providerOptions === 3, `found ${providerOptions}`)

  // ── 5. canvas auto-relate button hidden when no AI ────────────────────
  console.log('\n[5] canvas: auto-relate button hidden without AI config')
  await page.goto(URL + '/canvas', { waitUntil: 'networkidle0' })
  await wait(2500)
  const canvasBtnHidden = await page.evaluate(
    () => !document.querySelector('.cv-toolbar__btn--ai'),
  )
  check('auto-relate button absent when ai === null', canvasBtnHidden)

  // ── 6. card AI buttons hidden without AI ───────────────────────────────
  await page.goto(URL + '/inbox', { waitUntil: 'networkidle0' })
  await wait(1500)
  // Try to open the first card so the modal renders, then assert no
  // AI button labels show.
  const cardBtnHidden = await page.evaluate(() => {
    return new Promise((resolve) => {
      const card = document.querySelector('[data-card-id], [role="button"], button')
      if (card) card.click()
      setTimeout(() => {
        // CardDetailModal renders the AI buttons with "✨" prefix.
        const allBtns = [...document.querySelectorAll('button')]
        const hasAI = allBtns.some((b) => /✨/.test(b.textContent || ''))
        resolve(!hasAI)
      }, 600)
    })
  })
  check('card AI buttons absent when ai === null', cardBtnHidden)
  await page.screenshot({ path: path.join(out, '02-card-no-ai.png') })

  // ── 7. settings store: enable AI in the panel, then read back the
  //      localStorage roundtrip. The /settings page is the only thing
  //      that writes the ai key on this clean install, so we drive it
  //      through the panel UI.
  console.log('\n[7] settings store: ai field roundtrip')
  await page.goto(URL + '/settings', { waitUntil: 'networkidle0' })
  await wait(1000)
  // Enable the AI checkbox + click Save. This triggers
  // settingsStore.updateAISettings → saveSettings → localStorage write.
  const saved = await page.evaluate(() => {
    const aiSection = [...document.querySelectorAll('section.set')].find(
      (s) => /AI/.test(s.textContent || ''),
    )
    if (!aiSection) return { ok: false, reason: 'no AI section' }
    const cb = aiSection.querySelector('input[type="checkbox"]')
    if (cb && !cb.checked) cb.click()
    // Click the primary save button (set__btn--primary).
    const save = aiSection.querySelector('.set__btn--primary')
    if (save) save.click()
    return { ok: true }
  })
  await wait(400)
  const roundtrip = await page.evaluate(() => {
    const raw = localStorage.getItem('cys-stift.settings.v1')
    if (!raw) return { ok: false, reason: 'no settings' }
    const parsed = JSON.parse(raw)
    const ai = parsed?.settings?.ai
    return {
      ok: ai !== undefined,
      hasEnabled: ai?.enabled === true,
    }
  })
  check('AI enable + save persists ai field', saved.ok && roundtrip.ok && roundtrip.hasEnabled, JSON.stringify(roundtrip))

  await browser.close()
  console.log(`\n${fail === 0 ? '✓' : '✗'} ${pass} passed, ${fail} failed`)
  console.log(`Screenshots → ${out}`)
  process.exit(fail === 0 ? 0 : 1)
})().catch((e) => {
  console.error('FATAL', e)
  process.exit(2)
})