// 白板专业度 e2e:画布渲染不崩 + 对齐工具条(选中后)+ 模板。
import puppeteer from 'puppeteer-core'
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const URL = process.env.URL || 'http://localhost:3000'
const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ['--no-sandbox'] })
const wait = (ms) => new Promise((r) => setTimeout(r, ms))
const errors = []
const paste = async (p, d) => p.evaluate((d) => { const dt = new DataTransfer(); dt.setData('text/plain', d); window.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true })) }, d)

const p = await browser.newPage()
p.on('pageerror', (e) => errors.push(e.message))
p.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()) })
await p.goto(`${URL}/canvas`, { waitUntil: 'networkidle0' }); await wait(1500)
await p.evaluate(() => localStorage.clear()); await p.reload({ waitUntil: 'networkidle0' }); await wait(1500)
// 建 3 卡(不同位置)
await paste(p, '[card #a1 create] @pos(10,10) @size(100,80)\n[card #a2 create] @pos(50,50) @size(100,80)\n[card #a3 create] @pos(100,100) @size(100,80)')
await wait(1500)

// 全选(adapter.selectAllIds?用 Ctrl+A 或 marquee)。简化:用 keyboard Ctrl+A 看 canvas 是否接管。
// canvas 的 selectAll 快捷键?试 dispatch。先验证画布渲染。
const hasHost = await p.evaluate(() => !!document.querySelector('.cv-host canvas'))
console.log('画布渲染:', hasHost)

// 尝试全选(Ctrl+A 可能被 canvas 接管 selectAllIds)
await p.evaluate(() => { window.dispatchEvent(new KeyboardEvent('keydown', { key: 'a', ctrlKey: true, bubbles: true })) })
await wait(500)
// 检查对齐工具条出现(selectedCount>=2)
const hasAlignBar = await p.evaluate(() => !!document.querySelector('.tb-align'))
console.log('对齐工具条(选中后):', hasAlignBar)

// 新建画布 modal 有模板选项
await p.evaluate(() => {
  const btns = Array.from(document.querySelectorAll('.cv-rail__btn'))
  const newBtn = btns.find((b) => /新建画布|new canvas/i.test(b.getAttribute('aria-label') || ''))
  if (newBtn) newBtn.click()
})
await wait(800)
const hasTemplatePicker = await p.evaluate(() => !!document.querySelector('.template-picker') || document.body.textContent.includes('思维导图') || document.body.textContent.includes('Mind map'))
console.log('模板选择器:', hasTemplatePicker)

console.log('errors:', errors.length, errors.slice(0, 3))
await browser.close()
