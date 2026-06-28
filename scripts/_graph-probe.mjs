// 图谱视图 e2e:/graph 加载 + 有卡有边渲染 + 空态 + nav 入口。
import puppeteer from 'puppeteer-core'
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const URL = process.env.URL || 'http://localhost:3000'
const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ['--no-sandbox'] })
const wait = (ms) => new Promise((r) => setTimeout(r, ms))
const errors = []
const paste = async (page, dsl) => page.evaluate((d) => { const dt = new DataTransfer(); dt.setData('text/plain', d); window.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true })) }, dsl)

// seed:canvas 建 2 卡 + 1 关系箭头
const p = await browser.newPage()
p.on('pageerror', (e) => errors.push(e.message))
p.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()) })
await p.goto(`${URL}/canvas`, { waitUntil: 'networkidle0', timeout: 20000 }); await wait(1500)
await p.evaluate(() => localStorage.clear()); await p.reload({ waitUntil: 'networkidle0' }); await wait(1500)
await paste(p, '[card #g1 create] @pos(100,100) @size(120,80)\n[card #g2 create] @pos(400,100) @size(120,80)\n[arrow #a1] from #g1 to #g2 @color(red)')
await wait(1500)

// 打开图谱
await p.goto(`${URL}/graph`, { waitUntil: 'networkidle0', timeout: 20000 }); await wait(2500)
const hasCanvas = await p.evaluate(() => !!document.querySelector('.graph-canvas'))
console.log('/graph 渲染 graph-canvas:', hasCanvas)

// nav 有图谱入口
const hasNav = await p.evaluate(() => !!Array.from(document.querySelectorAll('a')).find((a) => (a.getAttribute('href') || '').replace(/\/$/, '') === '/graph'))
console.log('nav 有 /graph 入口:', hasNav)

// 过滤器渲染
const hasFilters = await p.evaluate(() => !!document.querySelector('.graph-filters'))
console.log('过滤器渲染:', hasFilters)

// 空态:清库后 /graph
const p2 = await browser.newPage()
await p2.goto(`${URL}/graph`, { waitUntil: 'networkidle0' }); await wait(1000)
await p2.evaluate(() => localStorage.clear()); await p2.reload({ waitUntil: 'networkidle0' }); await wait(2500)
const emptyShown = await p2.evaluate(() => !!document.querySelector('.graph-empty'))
console.log('空库空态:', emptyShown)

console.log('errors:', errors.length, errors.slice(0, 3))
await browser.close()
