// scripts/phase2-sub3-smoke.cjs — 冒烟主路由 /canvas 导出入口 + .cystift 往返(e2e)。
// 运行:先 pnpm --filter web build + 静态服务 :3016,再 node scripts/phase2-sub3-smoke.cjs
//
// 简化冒烟(计划 Step 5.1 已明示):
//   主路由没暴露 __selfAdapter(dev 页有),所以只验「入口 + 无错」。
//   完整导出往返(SVG/PNG/.cystift)靠 T1 elementsToSvg 单测 + T2/T3 导出函数单测覆盖。
const puppeteer = require('puppeteer-core')
const fs = require('fs')
const path = require('path')
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const URL = 'http://localhost:3016'
const wait = (ms) => new Promise((r) => setTimeout(r, ms))
const out = path.join(__dirname, '..', 'docs', 'design', 'screenshots', 'phase2-sub3-smoke')
fs.mkdirSync(out, { recursive: true })

let pass = 0, fail = 0
const check = (n, ok, d = '') => { ok ? (pass++, console.log(`  ✓ ${n}${d ? ' — ' + d : ''}`)) : (fail++, console.log(`  ✗ ${n}${d ? ' — ' + d : ''}`)) }

;(async () => {
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox', '--disable-gpu'], defaultViewport: { width: 1440, height: 900 } })
  const page = await browser.newPage()
  const errs = []
  page.on('pageerror', (e) => errs.push(e.message))

  // 注入卡 → /canvas → reload(adapter 重建后从 localStorage 读卡)
  await page.goto(URL + '/canvas', { waitUntil: 'networkidle0' })
  await page.evaluate(() => {
    const key = 'cys-stift.cards.v1'
    const raw = localStorage.getItem(key) || '{"cards":[]}'
    const parsed = JSON.parse(raw)
    parsed.cards.push({
      id: 'e1', title: 'Export Card', body: 'body', type: 'note',
      media: [], links: [], codeSnippets: [], quotes: [], tags: [],
      source: { kind: 'manual', deviceId: 's' }, capturedAt: new Date().toISOString(),
      createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
      pinned: false, archived: false,
      canvasPosition: { canvasId: 'default-canvas', x: 200, y: 200, w: 240, h: 120, z: 1 },
    })
    localStorage.setItem(key, JSON.stringify(parsed))
  })
  await page.reload({ waitUntil: 'networkidle0' })
  await wait(1500)
  check('page mounts, no pageerror', errs.length === 0, `${errs.length} errors`)

  // Export button 存在(toolbar 入口)。
  // i18n canvas.export = { zh: '导出画布', en: 'Export canvas' };默认 locale zh
  // (html lang="zh-CN" → fallback zh)。断言对两种语言都鲁棒:文本命中任一,
  // 或 title 含 'export'/'导出'。验「入口存在」不验「可点」(adapter 未就绪时 disabled)。
  const hasExportBtn = await page.evaluate(() => {
    const btns = Array.from(document.querySelectorAll('button'))
    const ZH = '导出画布'
    const EN = 'export canvas'
    return btns.some((b) => {
      const txt = (b.textContent || '').trim().toLowerCase()
      const title = (b.title || '').toLowerCase()
      return txt === ZH || txt === EN || title.includes('export') || title.includes('导出')
    })
  })
  check('Export button present on main /canvas', hasExportBtn)

  // 截图(视觉留档;无 OCR,功能由单测保)。
  await page.screenshot({ path: path.join(out, 'export-ready.png') })

  await browser.close()
  console.log(`\n${fail === 0 ? '✓' : '✗'} ${pass} passed, ${fail} failed`)
  process.exit(fail === 0 ? 0 : 1)
})().catch((e) => { console.error('FATAL', e); process.exit(2) })
