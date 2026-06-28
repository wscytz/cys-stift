// 数据可靠性修复 e2e:撤销不复活 / 导出 canvases key 存在(P1)。
import puppeteer from 'puppeteer-core'

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const URL = process.env.URL || 'http://localhost:3000/canvas'

const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ['--no-sandbox'] })
const page = await browser.newPage()
await page.setViewport({ width: 1280, height: 800 })
const errors = []
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`))
page.on('console', (m) => { if (m.type() === 'error') errors.push(`console.error: ${m.text()}`) })

const wait = (ms) => new Promise((r) => setTimeout(r, ms))
const goto = async () => { await page.goto(URL, { waitUntil: 'networkidle0', timeout: 20000 }); await wait(1500) }
const clear = async () => { await page.evaluate(() => localStorage.clear()); await page.reload({ waitUntil: 'networkidle0' }); await wait(1500) }
const paste = async (dsl) => {
  await page.evaluate((d) => {
    const dt = new DataTransfer(); dt.setData('text/plain', d)
    window.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true }))
  }, dsl)
}

// === P0-1 撤销不复活 ===
await goto(); await clear()
await paste('[card #u1 create] @pos(400,400) @size(150,100)'); await wait(800)
// 点 rail undo 按钮(aria-label 撤销)比键盘稳,不依赖键映射
const undoClicked = await page.evaluate(() => {
  const btns = Array.from(document.querySelectorAll('.cv-rail__btn'))
  const undo = btns.find((b) => /撤销|undo/i.test(b.getAttribute('aria-label') || '') && !b.disabled)
  if (undo) { undo.click(); return true }
  return false
})
if (!undoClicked) { console.log('WARN: undo 按钮未找到/未点,回退键盘'); await page.keyboard.press('Control+KeyZ') }
await wait(500)  // undo: reconcileHistory 应 removeFromCanvas(u1)
await paste('[card #u2 create] @pos(700,400) @size(150,100)'); await wait(1000)  // 触发 onUserChange
const cards = await page.evaluate(() => { try { return JSON.parse(localStorage.getItem('cys-stift.cards.v1')).cards } catch { return [] } })
const onCanvas = cards.filter((c) => c.canvasPosition?.canvasId === 'default-canvas').map((c) => c.id)
console.log('P0-1 撤销后画布卡(应只 [u2],无 u1):', JSON.stringify(onCanvas))

// === P1 导出 canvases key 存在 ===
await clear()
await paste('[text #t1] @pos(200,200) @text("hello") @color(red)'); await wait(1500)  // freeform 走 OPFS,不新建画布
const canvasesV1 = await page.evaluate(() => localStorage.getItem('cys-stift.canvases.v1'))
console.log('P1 canvases.v1 存在(修后 true):', canvasesV1 !== null)

// === 回归:BUG-A 仍正常(paste create 落库) ===
await clear()
await paste('[card #reg1 create] @pos(100,100)'); await wait(800)
const reg1 = await page.evaluate(() => { try { return JSON.parse(localStorage.getItem('cys-stift.cards.v1')).cards.some((c) => c.id === 'reg1') } catch { return false } })
console.log('回归 BUG-A paste create 落库:', reg1)

console.log('errors:', errors.length, errors.slice(0, 3))
await browser.close()
