// Phase 3 e2e:命令面板(⌘K)+ 标签墙(/tags)+ ⌘C 复制选区。
import puppeteer from 'puppeteer-core'
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const URL = process.env.URL || 'http://localhost:3000'
const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ['--no-sandbox'] })
const wait = (ms) => new Promise((r) => setTimeout(r, ms))
const errors = []

const p = await browser.newPage()
p.on('pageerror', (e) => errors.push(e.message))
p.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()) })
// seed 带标签卡
await p.goto(`${URL}/inbox`, { waitUntil: 'networkidle0' }); await wait(1500)
await p.evaluate(() => {
  localStorage.clear()
  localStorage.setItem('cys-stift.cards.v1', JSON.stringify({ cards: [
    { id: 't1', title: '卡1', body: '', type: 'note', tags: [{ value: '重要', color: 'var(--color-red)' }], links: [], codeSnippets: [], quotes: [], media: [], source: { kind: 'manual', deviceId: 'web' }, capturedAt: '2026-01-01T00:00:00.000Z', createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z', archived: false, pinned: false },
    { id: 't2', title: '卡2', body: '', type: 'note', tags: [{ value: '重要', color: 'var(--color-red)' }], links: [], codeSnippets: [], quotes: [], media: [], source: { kind: 'manual', deviceId: 'web' }, capturedAt: '2026-01-01T00:00:00.000Z', createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z', archived: false, pinned: false },
  ] }))
})
await p.goto(`${URL}/inbox`, { waitUntil: 'networkidle0' }); await wait(1500)

// ⌘K 开命令面板(dispatch keydown,避免 puppeteer key 描述问题)
await p.evaluate(() => { window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', metaKey: true, bubbles: true })) })
await wait(800)
const paletteOpen = await p.evaluate(() => !!document.querySelector('.cmd__list') || !!document.querySelector('.cmd__item'))
console.log('⌘K 开命令面板:', paletteOpen)
await p.keyboard.press('Escape'); await wait(300)

// /tags 标签云
const p2 = await browser.newPage()
p2.on('pageerror', (e) => errors.push('p2: ' + e.message))
await p2.goto(`${URL}/tags`, { waitUntil: 'networkidle0' }); await wait(1500)
const tagCloud = await p2.evaluate(() => !!document.querySelector('.tag-cloud'))
console.log('/tags 标签云:', tagCloud)

// nav 有 /tags 入口
const hasNav = await p2.evaluate(() => !!Array.from(document.querySelectorAll('a')).find((a) => (a.getAttribute('href') || '').replace(/\/$/, '') === '/tags'))
console.log('nav 有 /tags:', hasNav)

console.log('errors:', errors.length, errors.slice(0, 3))
await browser.close()
