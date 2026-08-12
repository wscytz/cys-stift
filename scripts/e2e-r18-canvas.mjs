#!/usr/bin/env node
/**
 * e2e-r18-canvas.mjs — R18 画布交互修复验证。
 *
 *   A  text 工具在 frame 内放字(R18:旧 getElements().find 层序优先,frame 层 -1 排最前,
 *      点在 frame 内空白先命中 frame → 文字工具永远放不了字;改顶层 hitTest + 忽略 frame)。
 *   C  橡皮 card 模式点空白不再误报「模式不匹配」(R18:adapter.eraserHitFiltered 区分
 *      「命中但被模式过滤」vs「点到空白」;正对照:点 text 元素仍应提示)。
 *
 * 用法:先 pnpm --filter web dev(localhost:3000),再 node scripts/e2e-r18-canvas.mjs [--headed]
 */
import puppeteer from 'puppeteer-core'

const BASE_URL = (process.argv.find((a) => a.startsWith('--base-url=')) ?? '--base-url=http://localhost:3000').split('=')[1]
const HEADED = process.argv.includes('--headed')
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const SHOT_DIR = new URL('_e2e-screenshots/', import.meta.url)
const fs = await import('node:fs')

let results = []
let browser
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function launch() {
  browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: !HEADED,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
    defaultViewport: { width: 1280, height: 900 },
  })
}

async function freshPage(seedFn) {
  const page = await browser.newPage()
  const errs = []
  page.on('pageerror', (e) => errs.push(`pageerror: ${e.message}`))
  page.on('console', (m) => { if (m.type() === 'error') errs.push(`console.error: ${m.text()}`) })
  await page.goto(BASE_URL, { waitUntil: 'domcontentloaded', timeout: 20000 })
  await page.evaluate(() => localStorage.clear())
  if (seedFn) await page.evaluate(seedFn)
  await page.reload({ waitUntil: 'domcontentloaded', timeout: 20000 })
  await sleep(800)
  return { page, errs }
}

async function shot(page, name) {
  fs.mkdirSync(SHOT_DIR, { recursive: true })
  await page.screenshot({ path: new URL(`${name}.png`, SHOT_DIR).pathname, fullPage: false })
}

async function runCase(name, fn) {
  const { page, errs } = await freshPage()
  try {
    const detail = await fn(page)
    const hasJsErr = errs.length > 0
    results.push({ name, pass: !hasJsErr, detail: detail ?? '', errs })
    if (hasJsErr) await shot(page, name.replace(/\W+/g, '_'))
  } catch (e) {
    await shot(page, name.replace(/\W+/g, '_'))
    results.push({ name, pass: false, detail: `exception: ${e.message}`, errs })
  } finally {
    await page.close()
  }
}

const assert = (cond, msg) => { if (!cond) throw new Error(msg) }

/** 种子:画布 cv-1 + 卡 c1(placed)+ 自由元素(自选)+ 视图 zoom=1 pan=0(页坐标=画布内屏幕坐标)。 */
const seedCanvas = (freeform) => `(() => {
  localStorage.setItem('cys-stift.canvases.v1', JSON.stringify({ snapshot: { canvases: [{
    id: 'cv-1', workspaceId: 'ws', name: '画布一', view: { zoom: 1, panX: 0, panY: 0 }, createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  }], activeCanvasId: 'cv-1' } }))
  localStorage.setItem('cys-stift.cards.v1', JSON.stringify({ cards: [{
    id: 'c1', title: '种子卡', body: '', type: 'note', media: [], links: [], codeSnippets: [], quotes: [],
    source: { kind: 'manual', deviceId: 'seed-device-abc' },
    capturedAt: '2026-01-10T00:00:00Z', createdAt: '2026-01-10T00:00:00Z', updatedAt: '2026-01-10T00:00:00Z',
    tags: [], pinned: false, archived: false, deletedAt: null,
    canvasPosition: { canvasId: 'cv-1', x: 30, y: 30, w: 160, h: 96, z: 0 },
  }] }))
  localStorage.setItem('cys-stift.canvas-freeform.cv-1.v1', JSON.stringify({ v: 1, app: 'cys-stift', elements: ${JSON.stringify(freeform)} }))
  localStorage.setItem('cys-stift.canvas-view.v1', JSON.stringify({ views: { 'cv-1': { zoom: 1, panX: 0, panY: 0, gridMode: 'free' } } }))
})()`

/** 主画布元素(自研 canvas,aria-label=灵感画布/Inspiration canvas;排除 minimap)。 */
async function mainCanvas(page) {
  return page.evaluateHandle(() =>
    [...document.querySelectorAll('canvas')].find((c) =>
      c.getAttribute('aria-label') === '灵感画布' || c.getAttribute('aria-label') === 'Inspiration canvas',
    ),
  )
}

async function canvasRect(page) {
  const h = await mainCanvas(page)
  const rect = await h.evaluate((el) => {
    const r = el.getBoundingClientRect()
    return { left: r.left, top: r.top, w: r.width, h: r.height }
  })
  return rect
}

/** 点主画布上页坐标 (px,py)(view zoom=1 pan=0 → 页坐标 = 画布内相对坐标)。 */
async function clickCanvas(page, px, py) {
  const rect = await canvasRect(page)
  await page.mouse.click(rect.left + px, rect.top + py)
}

async function dblClickCanvas(page, px, py) {
  const rect = await canvasRect(page)
  await page.mouse.click(rect.left + px, rect.top + py, { clickCount: 2 })
}

/** 顶栏工具按钮(select/freedraw/eraser/text/connect):按 aria-label 匹配。 */
async function clickTool(page, re) {
  const clicked = await page.evaluate((reSrc) => {
    const re = new RegExp(reSrc)
    const btn = [...document.querySelectorAll('button.tb-tool')].find((b) => re.test(b.getAttribute('aria-label') ?? ''))
    if (!btn) return false
    btn.click()
    return true
  }, re.source ?? re)
  assert(clicked, `tool button not found (regex ${re})`)
}

// ── Test A:text 工具在 frame 内放字 ─────────────────────────────────────────
async function caseATextInFrame(page) {
  // frame 占 (200,200,600,400);卡在 (30,30)。frame 内空白点 (400,300)。
  await page.evaluate(seedCanvas([
    { id: 'fr-1', kind: 'frame', x: 200, y: 200, w: 600, h: 400, text: '主题区', rotation: 0 },
  ]))
  await page.goto(BASE_URL + '/canvas', { waitUntil: 'domcontentloaded', timeout: 20000 })
  await sleep(1000)
  // sanity:卡 + frame 应都在画布上(否则空画布假通过)
  const summaryA = await page.evaluate(() => document.getElementById('canvas-accessible-summary')?.textContent ?? '')
  assert(/2\s*个对象|2\s*objects/.test(summaryA), `画布对象数非 2(种子未加载):${summaryA}`)
  await clickTool(page, /文本|^Text$/)
  await clickCanvas(page, 400, 300) // frame 内空白
  await sleep(300)
  const textareaCount = await page.evaluate(() =>
    [...document.querySelectorAll('textarea')].filter((t) => t.offsetParent !== null).length,
  )
  assert(textareaCount > 0, `text 工具在 frame 内点空白未出现 textarea (textarea=${textareaCount})`)
  return `frame 内空白点 → textarea 出现 ✓`
}

// ── Test C:橡皮 card 模式点空白不误报;点 text 元素仍提示 ────────────────────
async function caseCEraserEmpty(page) {
  // text 元素 t1 在 (600,80,100,40);空白点 (400,400) 画布内且远离元素。
  await page.evaluate(seedCanvas([
    { id: 't1', kind: 'text', x: 600, y: 80, w: 100, h: 40, rotation: 0, text: '某个文字' },
  ]))
  await page.goto(BASE_URL + '/canvas', { waitUntil: 'domcontentloaded', timeout: 20000 })
  await sleep(1000)
  const summaryC = await page.evaluate(() => document.getElementById('canvas-accessible-summary')?.textContent ?? '')
  assert(/2\s*个对象|2\s*objects/.test(summaryC), `画布对象数非 2(种子未加载):${summaryC}`)
  await clickTool(page, /橡皮|^Eraser$/)
  await clickTool(page, /只擦卡片|Erase cards/)
  await sleep(200)
  // ① 点空白(无元素)→ 不应出现「模式不匹配」toast
  // 注意:画布上恒有 role=status 的「✓ 已保存」badge,不能数 role=status 总数,要专查文案。
  await clickCanvas(page, 400, 400) // 画布内空白(远离 card c1 / text t1)
  await sleep(1200)
  const mismatchAfterEmpty = await page.evaluate(() =>
    [...document.querySelectorAll('[role="status"], [role="alert"]')].some((t) =>
      /擦不掉|cannot erase/i.test(t.textContent ?? ''),
    ),
  )
  assert(!mismatchAfterEmpty, '橡皮 card 模式点空白误报「模式不匹配」')
  // ② 点 text 元素(命中但被模式过滤)→ 应提示(正对照)
  await clickCanvas(page, 650, 100)
  await sleep(400)
  const mismatch = await page.evaluate(() =>
    [...document.querySelectorAll('[role="status"]')].some((t) => /擦不掉|cannot erase/i.test(t.textContent ?? '')),
  )
  assert(mismatch, '橡皮 card 模式点 text 元素未提示「模式不匹配」(正对照失败)')
  return `空白不误报 ✓ · 点 text 仍提示 ✓`
}

// ── run ────────────────────────────────────────────────────────────────────
await launch()
await runCase('R18-A text 工具在 frame 内放字', caseATextInFrame)
await runCase('R18-C 橡皮 card 模式空白不误报', caseCEraserEmpty)
await browser.close()

let pass = 0
for (const r of results) {
  if (r.pass) pass++
  console.log(`[${r.pass ? '✅ PASS' : '❌ FAIL'}] ${r.name}`)
  if (!r.pass) {
    if (r.errs?.length) r.errs.forEach((e) => console.log(`    ${e}`))
    if (r.detail) console.log(`    ${r.detail}`)
  }
}
console.log(`\n${pass}/${results.length} 通过`)
process.exit(pass === results.length ? 0 : 1)
