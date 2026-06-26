// /canvas interaction probe: verify floating panels/minimap actually mount
// (adapter + canvasEl both propagated to children), toggle outline, capture
// runtime errors during interaction. Cold-load sweep can't catch the
// adapter/canvasEl stale-ref timing window that triggered React #310.
import puppeteer from 'puppeteer-core'

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const URL = process.env.URL || 'http://localhost:4455/canvas'

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: true,
  args: ['--no-sandbox', '--disable-setuid-sandbox'],
})

const page = await browser.newPage()
const errors = []
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`))
page.on('console', (m) => {
  if (m.type() === 'error') errors.push(`console.error: ${m.text()}`)
})

await page.goto(URL, { waitUntil: 'networkidle0', timeout: 15000 })
// Give adapter effect + setAdapter re-render time to propagate.
await new Promise((r) => setTimeout(r, 1500))

const probe1 = await page.evaluate(() => {
  // Minimap canvas exists only if Minimap mounted with host+canvasEl non-null.
  const minimapCanvas = document.querySelector('.cv-host canvas[aria-label]')
  // The main canvas (SelfCanvas) vs minimap canvas: minimap is 160x120.
  const canvases = Array.from(document.querySelectorAll('canvas'))
  const minimap = canvases.find((c) => c.width === 160 && c.height === 120)
  const outlinePanel = document.querySelector('.cv-outline')
  const relationPanel = document.querySelector('.cv-relation')
  const freedrawPanel = document.querySelector('.cv-freedraw')
  return {
    canvasCount: canvases.length,
    minimapPresent: !!minimap,
    outlinePresent: !!outlinePanel,
    relationPresent: !!relationPanel,
    freedrawPresent: !!freedrawPanel,
    bodyHasError: /渲染出错|Minified React error|#310/.test(document.body.innerText || ''),
  }
})
console.log('after-load:', JSON.stringify(probe1, null, 2))

// Toggle outline via the side-rail button (Chinese label '大纲').
const outlineBtn = await page.$('button[aria-label="大纲"]')
let toggled = false
if (outlineBtn) {
  await outlineBtn.click()
  await new Promise((r) => setTimeout(r, 600))
  toggled = true
} else {
  // try by clicking buttons in side rail — list all button titles
  const btns = await page.evaluate(() =>
    Array.from(document.querySelectorAll('button')).map((b) => b.getAttribute('aria-label') || b.getAttribute('title') || b.textContent).filter(Boolean),
  )
  console.log('buttons:', btns.slice(0, 30))
}

const probe2 = await page.evaluate(() => ({
  outlinePresent: !!document.querySelector('.cv-outline'),
  bodyHasError: /渲染出错|Minified React error|#310/.test(document.body.innerText || ''),
}))
console.log('after-outline-toggle:', JSON.stringify(probe2, null, 2), `(toggled=${toggled})`)

await browser.close()

const ok = errors.length === 0 && !probe1.bodyHasError && !probe2.bodyHasError && probe1.minimapPresent
console.log(`\n${ok ? '✅ INTERACTION CLEAN' : '❌ ISSUES'} (${errors.length} errors)`)
for (const e of errors) console.log('  ' + e)
process.exit(ok ? 0 : 1)
