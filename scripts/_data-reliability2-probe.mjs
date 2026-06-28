// 第二轮数据可靠性 e2e:inbox 建卡/引导 / 导出复选框。
import puppeteer from 'puppeteer-core'
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const URL = process.env.URL || 'http://localhost:3000'
const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ['--no-sandbox'] })
const wait = (ms) => new Promise((r) => setTimeout(r, ms))
const errors = []
const paste = async (page, dsl) => page.evaluate((d) => {
  const dt = new DataTransfer(); dt.setData('text/plain', d)
  window.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true }))
}, dsl)

// === 严重5 inbox 建卡 ===
const p1 = await browser.newPage()
p1.on('pageerror', (e) => errors.push(`p1: ${e.message}`))
await p1.goto(`${URL}/inbox`, { waitUntil: 'networkidle0', timeout: 20000 }); await wait(1500)
await p1.evaluate(() => localStorage.clear()); await p1.reload({ waitUntil: 'networkidle0' }); await wait(1500)
await paste(p1, '[card #inbox1 create] @pos(100,100) @size(120,80)'); await wait(800)
const inboxCreated = await p1.evaluate(() => { try { return JSON.parse(localStorage.getItem('cys-stift.cards.v1')).cards.some((c) => c.id === 'inbox1') } catch { return false } })
console.log('严重5 inbox paste 建卡落库:', inboxCreated)

// inbox 粘 rect DSL → 引导 toast
await p1.evaluate(() => localStorage.clear()); await p1.reload({ waitUntil: 'networkidle0' }); await wait(1500)
await paste(p1, '[rect #r1] @pos(100,100) @size(80,60)'); await wait(800)
const guideToast = await p1.evaluate(() => !!document.querySelector('[class*="toast" i]'))
console.log('严重5 inbox 非 card DSL 引导 toast:', guideToast)

// === P2 settings 导出复选框存在 ===
const p2 = await browser.newPage()
p2.on('pageerror', (e) => errors.push(`p2: ${e.message}`))
await p2.goto(`${URL}/settings`, { waitUntil: 'networkidle0', timeout: 20000 }); await wait(1500)
// 找含 "导出含已删除" 文案的 checkbox label
const hasCheckbox = await p2.evaluate(() => {
  const labels = Array.from(document.querySelectorAll('label'))
  return labels.some((l) => /导出含已删除|Include deleted/i.test(l.textContent || '') && l.querySelector('input[type="checkbox"]'))
})
console.log('P2 settings 导出复选框存在:', hasCheckbox)

// === 回归:canvas paste create 仍落库(BUG-A) ===
const p3 = await browser.newPage()
p3.on('pageerror', (e) => errors.push(`p3: ${e.message}`))
await p3.goto(`${URL}/canvas`, { waitUntil: 'networkidle0' }); await wait(1500)
await p3.evaluate(() => localStorage.clear()); await p3.reload({ waitUntil: 'networkidle0' }); await wait(1500)
await paste(p3, '[card #reg1 create] @pos(100,100)'); await wait(800)
const reg1 = await p3.evaluate(() => { try { return JSON.parse(localStorage.getItem('cys-stift.cards.v1')).cards.some((c) => c.id === 'reg1') } catch { return false } })
console.log('回归 BUG-A canvas paste create 落库:', reg1)

console.log('errors:', errors.length, errors.slice(0, 3))
await browser.close()
