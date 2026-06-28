// 箭头交互复现 probe:paste DSL 建 card+arrow → 截图渲染 → 选中 → 切 route → 截图对比
// 验证用户反馈「连接逻辑不对 / 弯曲折线用不了」在真实浏览器渲染层是否复现。
import puppeteer from 'puppeteer-core'

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const URL = process.env.URL || 'http://localhost:3000/canvas'

const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ['--no-sandbox'] })
const page = await browser.newPage()
await page.setViewport({ width: 1280, height: 800 })
const errors = []
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`))
page.on('console', (m) => { if (m.type() === 'error') errors.push(`console.error: ${m.text()}`) })

await page.goto(URL, { waitUntil: 'networkidle0', timeout: 15000 })
await new Promise((r) => setTimeout(r, 1500))

// 1. paste DSL 建 2 card + 1 relation arrow(模拟用户 connect 的产物)
const dsl = `[card #c1 create] @pos(100,100) @size(120,120)
[card #c2 create] @pos(400,100) @size(120,120)
[arrow #a1] from #c1 to #c2 @color(black)`
await page.evaluate((dslText) => {
  const dt = new DataTransfer()
  dt.setData('text/plain', dslText)
  window.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true }))
}, dsl)
await new Promise((r) => setTimeout(r, 800))

// 2. 截图:arrow 应该渲染(直线 from c1 右边 ~220,160 到 c2 左边 ~400,160)
await page.screenshot({ path: '/tmp/arrow-1-initial.png' })

// 3. 检查 arrow 是否进了 host + RelationPanel 未浮现(未选中)
const state1 = await page.evaluate(() => {
  const canvases = Array.from(document.querySelectorAll('canvas'))
  const main = canvases.find((c) => !(c.width === 160 && c.height === 120))
  const relation = document.querySelector('.cv-relation')
  return { mainCanvas: !!main, relationPanelBeforeSelect: !!relation }
})

// 4. click arrow 中点(页 ~300,160 → 屏幕 ~300,160,pan0 zoom1)选中它
const canvasBox = await page.evaluate(() => {
  const canvases = Array.from(document.querySelectorAll('canvas'))
  const main = canvases.find((c) => !(c.width === 160 && c.height === 120))
  if (!main) return null
  const r = main.getBoundingClientRect()
  return { left: r.left, top: r.top }
})
let state2 = { clicked: false, relationAfterSelect: false, routeButtons: 0 }
if (canvasBox) {
  // arrow 中点屏幕坐标 = canvasBox.left + 300, canvasBox.top + 160
  const ax = canvasBox.left + 300
  const ay = canvasBox.top + 160
  await page.mouse.click(ax, ay)
  await new Promise((r) => setTimeout(r, 500))
  state2 = await page.evaluate(() => {
    const relation = document.querySelector('.cv-relation')
    const routeBtns = document.querySelectorAll('.cv-relation__route')
    return { clicked: true, relationAfterSelect: !!relation, routeButtons: routeBtns.length }
  })
  await page.screenshot({ path: '/tmp/arrow-2-selected.png' })
}

// 5. 若 RelationPanel 浮现,点 route=curve 按钮(第 2 个 route btn,⌒)
let state3 = { curveClicked: false }
if (state2.routeButtons > 0) {
  const clicked = await page.evaluate(() => {
    const btns = document.querySelectorAll('.cv-relation__route')
    if (btns.length < 2) return false
    ;(btns[1]).click() // ⌒ curve
    return true
  })
  await new Promise((r) => setTimeout(r, 500))
  state3 = { curveClicked: clicked }
  await page.screenshot({ path: '/tmp/arrow-3-curve.png' })
}

console.log('=== arrow probe ===')
console.log('errors:', errors.length, errors.slice(0, 3))
console.log('state1 (建 arrow 后):', JSON.stringify(state1))
console.log('state2 (选中后):', JSON.stringify(state2))
console.log('state3 (切 curve 后):', JSON.stringify(state3))
console.log('screenshots: /tmp/arrow-{1-initial,2-selected,3-curve}.png')

await browser.close()
