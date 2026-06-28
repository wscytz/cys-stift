// 画布可用性打磨 e2e 复跑:BUG-A DSL建卡不丢 / BUG-B 坏DSL反馈 / motif渲染。
import puppeteer from 'puppeteer-core'

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const URL = process.env.URL || 'http://localhost:3000/canvas'

const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ['--no-sandbox'] })
const page = await browser.newPage()
await page.setViewport({ width: 1280, height: 800 })
const errors = []
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`))
page.on('console', (m) => { if (m.type() === 'error') errors.push(`console.error: ${m.text()}`) })

await page.goto(URL, { waitUntil: 'networkidle0', timeout: 20000 })
await new Promise((r) => setTimeout(r, 1500))

// 清场
await page.evaluate(() => localStorage.clear())
await page.reload({ waitUntil: 'networkidle0' })
await new Promise((r) => setTimeout(r, 1500))

// BUG-A: paste [card #c1 create] → localStorage 含 c1 + canvasPosition
const dsl = '[card #c1 create] @pos(100,100) @size(140,100)'
await page.evaluate((d) => {
  const dt = new DataTransfer(); dt.setData('text/plain', d)
  window.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true }))
}, dsl)
await new Promise((r) => setTimeout(r, 1000))
const ls1 = await page.evaluate(() => localStorage.getItem('cys-stift.cards.v1'))
let hasC1 = false
try { hasC1 = !!(ls1 && JSON.parse(ls1).cards.some((c) => c.id === 'c1')) } catch {}
console.log('BUG-A localStorage 含 c1:', hasC1)
if (ls1) console.log('  localStorage cards count:', JSON.parse(ls1).cards?.length)

// F5 刷新后卡仍在
await page.reload({ waitUntil: 'networkidle0' })
await new Promise((r) => setTimeout(r, 1500))
const ls2 = await page.evaluate(() => localStorage.getItem('cys-stift.cards.v1'))
let hasC1AfterReload = false
try { hasC1AfterReload = !!(ls2 && JSON.parse(ls2).cards.some((c) => c.id === 'c1')) } catch {}
console.log('BUG-A 刷新后 c1 仍在:', hasC1AfterReload)

// BUG-B: 粘 [unknown_kind #foo] → toast 出现
await page.evaluate(() => localStorage.clear())
await page.reload({ waitUntil: 'networkidle0' })
await new Promise((r) => setTimeout(r, 1500))
await page.evaluate(() => {
  const dt = new DataTransfer(); dt.setData('text/plain', '[unknown_kind #foo]')
  window.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true }))
})
await new Promise((r) => setTimeout(r, 1000))
const toastShown = await page.evaluate(() => !!document.querySelector('[class*="toast" i]'))
console.log('BUG-B 坏DSL有反馈(toast DOM):', toastShown)

// motif 渲染:空画布 → SVG 存在
await page.evaluate(() => localStorage.clear())
await page.reload({ waitUntil: 'networkidle0' })
await new Promise((r) => setTimeout(r, 1500))
const motifSvg = await page.evaluate(() => !!document.querySelector('.cv-empty__motif'))
console.log('motif SVG 渲染:', motifSvg)

console.log('errors:', errors.length, errors.slice(0, 5))
await browser.close()
