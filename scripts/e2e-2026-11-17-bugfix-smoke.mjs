#!/usr/bin/env node
/**
 * e2e-2026-11-17-bugfix-smoke.mjs — 2026-11-16 用户实测 4 bug 修复的真机冒烟。
 *
 *   H  hover 速览时序(④/f4dc077):拖拽按住不弹浮层;静停 ~500ms 出现;
 *      离卡 ~200ms 宽限后消失;切工具立即消失。
 *   D  DSL delete 应用(③/ee61e1e):`[card #c1 delete]` 预览报"删除 1"→
 *      应用后画布 0 对象 + 卡的 canvasPosition 清空(DB 先行)。
 *   U  DSL apply echo + 撤销(①/6cea3dc):echo 写入后 undo 生效(单步,
 *      不再"⌘Z 回到 AI 前整表替换")——用 DSL 对话框 apply 路径验同一 applyLayout 链。
 *   E  导出边界(②/88efa6f):elbow 箭头远折点 (850,-200) 参与导出 bounds
 *      (修复前 bounds 恒被卡盒/原点污染,PNG ≤ 1384×1056;修复后 ≥ 1650×1400),
 *      真下载 PNG 并解析 IHDR 尺寸。
 *
 * 用法:
 *   node scripts/e2e-2026-11-17-bugfix-smoke.mjs              # 内置静态 server serve apps/web/out
 *   node scripts/e2e-2026-11-17-bugfix-smoke.mjs --build      # 先 build 再 serve
 *   node scripts/e2e-2026-11-17-bugfix-smoke.mjs --headed     # 可视化调试
 */
import puppeteer from 'puppeteer-core'
import { createServer } from 'node:http'
import { readFile, stat } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'

const HEADED = process.argv.includes('--headed')
const WANT_BUILD = process.argv.includes('--build')
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const SHOT_DIR = new URL('_e2e-screenshots/', import.meta.url)
const DL_DIR = path.resolve('scripts/_e2e-downloads')
const fs = await import('node:fs')

const OUT_DIR = path.resolve('apps/web/out')

// ── 静态 server(与 e2e-r18-canvas 同款) ────────────────────────────────────
const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript',
  '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png',
  '.ico': 'image/x-icon', '.woff': 'font/woff', '.woff2': 'font/woff2', '.wasm': 'application/wasm',
}

function startStaticServer(port) {
  const server = createServer(async (req, res) => {
    try {
      let p = path.join(OUT_DIR, decodeURIComponent(req.url.split('?')[0]))
      if (existsSync(p) && (await stat(p)).isDirectory()) p = path.join(p, 'index.html')
      if (!existsSync(p) && !path.extname(p)) { const h = p + '.html'; if (existsSync(h)) p = h }
      if (!existsSync(p)) { const f = path.join(OUT_DIR, '404.html'); if (existsSync(f)) { res.writeHead(404); res.end(await readFile(f)); return } res.writeHead(404); res.end('nf'); return }
      res.writeHead(200, { 'Content-Type': MIME[path.extname(p)] ?? 'application/octet-stream' })
      res.end(await readFile(p))
    } catch (e) { res.writeHead(500); res.end(String(e)) }
  })
  return new Promise((r) => server.listen(port, () => r({ server, base: `http://localhost:${port}` })))
}

let BASE_URL = (process.argv.find((a) => a.startsWith('--base-url=')) ?? '').split('=')[1]
let _staticServer
if (WANT_BUILD) {
  console.log('▶ pnpm --filter web build(强制重建 out/)')
  const r = spawnSync('pnpm', ['--filter', 'web', 'build'], { stdio: 'inherit', encoding: 'utf8' })
  if (r.status !== 0) { console.error('✗ build 失败'); process.exit(1) }
}
if (!BASE_URL) {
  if (!existsSync(path.join(OUT_DIR, 'index.html'))) {
    console.error('✗ apps/web/out 不存在 —— 先 pnpm --filter web build,或加 --build,或 --base-url 指 dev server')
    process.exit(1)
  }
  _staticServer = await startStaticServer(4498)
  BASE_URL = _staticServer.base
  console.log(`▶ 静态产物 server: ${BASE_URL} (serve ${OUT_DIR})`)
}

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

const NOISE_RE = /favicon|Failed to load resource.*404|ERR_ABORTED/i

async function freshPage(seedFn) {
  const page = await browser.newPage()
  const errs = []
  page.on('pageerror', (e) => errs.push(`pageerror: ${e.message}`))
  page.on('console', (m) => {
    const t = m.text()
    if (m.type() === 'error' && !NOISE_RE.test(t)) errs.push(`console.error: ${t}`)
  })
  page.on('requestfailed', (r) => {
    const u = r.url()
    if (!NOISE_RE.test(u) && !u.includes('favicon')) errs.push(`requestfailed: ${u}`)
  })
  await page.goto(BASE_URL, { waitUntil: 'domcontentloaded', timeout: 20000 })
  await page.evaluate(() => localStorage.clear())
  if (seedFn) await page.evaluate(seedFn)
  await page.reload({ waitUntil: 'domcontentloaded', timeout: 20000 })
  await waitReady(page)
  return { page, errs }
}

async function waitReady(page) {
  await page.waitForSelector('main', { timeout: 10000 }).catch(() => {})
  await page.waitForFunction(() => !/读取中/.test(document.body.innerText || ''), { timeout: 10000 }).catch(() => {})
}

async function go(page, route) {
  await page.goto(BASE_URL + route, { waitUntil: 'domcontentloaded', timeout: 20000 })
  await waitReady(page)
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

/** 种子:画布 cv-1 + 卡 c1 (+可选 c2)+ 自由元素 + 视图 zoom=1 pan=0。 */
const seedCanvas = (cards, freeform) => `(() => {
  localStorage.setItem('cys-stift.canvases.v1', JSON.stringify({ snapshot: { canvases: [{
    id: 'cv-1', workspaceId: 'ws', name: '画布一', view: { zoom: 1, panX: 0, panY: 0 }, createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  }], activeCanvasId: 'cv-1' } }))
  localStorage.setItem('cys-stift.cards.v1', JSON.stringify({ cards: ${JSON.stringify(cards)} }))
  localStorage.setItem('cys-stift.canvas-freeform.cv-1.v1', JSON.stringify({ v: 1, app: 'cys-stift', elements: ${JSON.stringify(freeform ?? [])} }))
  localStorage.setItem('cys-stift.canvas-view.v1', JSON.stringify({ views: { 'cv-1': { zoom: 1, panX: 0, panY: 0, gridMode: 'free' } } }))
})()`

const seedCard = (id, x, y, z = 0) => ({
  id, title: `种子卡${id}`, body: '', type: 'note', media: [], links: [], codeSnippets: [], quotes: [],
  source: { kind: 'manual', deviceId: 'seed-device-abc' },
  capturedAt: '2026-01-10T00:00:00Z', createdAt: '2026-01-10T00:00:00Z', updatedAt: '2026-01-10T00:00:00Z',
  tags: [], pinned: false, archived: false, deletedAt: null,
  canvasPosition: { canvasId: 'cv-1', x, y, w: 160, h: 96, z },
})

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

/** 画布页坐标 → 浏览器页坐标 mouse 坐标(zoom=1 pan=0 时 1:1)。 */
async function canvasXY(page, px, py) {
  const rect = await canvasRect(page)
  return { x: rect.left + px, y: rect.top + py }
}

const summaryText = (page) =>
  page.evaluate(() => document.getElementById('canvas-accessible-summary')?.textContent ?? '')

/** 按 aria-label 正则点顶栏/侧栏按钮(工具 tb-tool 或 rail 按钮)。 */
async function clickButton(page, re, scopeSel) {
  const clicked = await page.evaluate(({ reSrc, scopeSel }) => {
    const re = new RegExp(reSrc)
    const root = scopeSel ? document.querySelector(scopeSel) : document
    const btn = [...(root?.querySelectorAll('button') ?? [])].find((b) => re.test(b.getAttribute('aria-label') ?? ''))
    if (!btn) return false
    btn.click()
    return true
  }, { reSrc: re.source, scopeSel: scopeSel ?? null })
  assert(clicked, `button not found (aria-label ~ ${re})`)
}

async function clickTool(page, re) {
  await clickButton(page, re, 'body')
}

/** 浮层是否存在(hoveredCardId 条件渲染,清了即卸载)。 */
const popoverShown = (page) =>
  page.evaluate(() => document.querySelector('.cv-preview') !== null)

/** 在 .actions 容器内按可见文本点按钮。 */
async function clickByText(page, containerSel, re) {
  const clicked = await page.evaluate(({ containerSel, reSrc }) => {
    const re = new RegExp(reSrc)
    const root = document.querySelector(containerSel)
    const btn = [...(root?.querySelectorAll('button') ?? [])].find((b) => re.test(b.textContent ?? ''))
    if (!btn) return false
    btn.click()
    return true
  }, { containerSel, reSrc: re.source })
  assert(clicked, `text button not found in ${containerSel} (~ ${re})`)
}

/** 覆写 DSL textarea 全文(原生 setter + input 事件 → React onChange)。
 *  对话框打开时预填画布序列化文本,直接 type 会追加到同一行 → 解析成"无变化"。 */
async function setDslText(page, text) {
  await page.evaluate((t) => {
    const ta = document.querySelector('textarea.dsl-text')
    const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set
    setter.call(ta, t)
    ta.dispatchEvent(new Event('input', { bubbles: true }))
  }, text)
}

// ── Case H:hover 速览时序(④) ───────────────────────────────────────────────
async function caseHHover(page) {
  await page.evaluate(seedCanvas(
    [seedCard('c1', 30, 30)],
    [{ id: 't1', kind: 'text', x: 700, y: 80, w: 100, h: 40, rotation: 0, text: '远处文字' }],
  ))
  await go(page, '/canvas')
  const s0 = await summaryText(page)
  assert(/2\s*个对象|2\s*objects/.test(s0), `画布对象数非 2:${s0}`)
  await clickTool(page, /选择|^Select$/)

  // ① 拖拽按住不弹浮层:进卡 200ms(<500 防抖)按下拖走,按住 800ms 全程无浮层
  let p = await canvasXY(page, 110, 78)
  await page.mouse.move(p.x, p.y, { steps: 4 })
  await sleep(200)
  assert(!(await popoverShown(page)), '静停不足 500ms 浮层已弹(防抖失效)')
  await page.mouse.down()
  await page.mouse.move(p.x + 190, p.y + 222, { steps: 10 }) // 拖到 ~(300,300)
  await sleep(800) // 按住状态 > 500ms —— 修复前这里会弹
  assert(!(await popoverShown(page)), '拖拽按住期间浮层弹出(e.buttons 门控失效)')
  await page.mouse.up()
  await sleep(100)
  assert(!(await popoverShown(page)), '松手后浮层残留(拖动卡已不在指针下,不应弹)')

  // ② 正对照:静停 >500ms 浮层出现(拖后卡中心 ~(300,300))
  await page.mouse.move(p.x + 190, p.y + 222, { steps: 4 })
  await sleep(800)
  assert(await popoverShown(page), '静停 800ms 浮层未出现(正对照失败,浮层功能整体失效)')

  // ③ 离卡 → ~200ms 宽限后消失
  const q = await canvasXY(page, 520, 520)
  await page.mouse.move(q.x, q.y, { steps: 4 })
  await sleep(500)
  assert(!(await popoverShown(page)), '离卡 500ms 后浮层仍滞留(宽限/隐藏失效)')

  // ④ 切工具浮层立即消失(修复前:切工具后 onPointerMove 早退,浮层无限滞留)
  const r2 = await canvasXY(page, 300, 300)
  await page.mouse.move(r2.x, r2.y, { steps: 4 })
  await sleep(800)
  assert(await popoverShown(page), '再次静停浮层未出现')
  await clickTool(page, /橡皮|^Eraser$/)
  await sleep(150)
  assert(!(await popoverShown(page)), '切工具后浮层未立即消失(tool 变化清理失效)')

  return '拖拽不弹 ✓ · 静停 ~500ms 弹 ✓ · 离卡 ~200ms 消 ✓ · 切工具即消 ✓'
}

// ── Case D:DSL delete 应用(③) ──────────────────────────────────────────────
async function caseDDelete(page) {
  await page.evaluate(seedCanvas([seedCard('c1', 30, 30)]))
  await go(page, '/canvas')
  const s0 = await summaryText(page)
  assert(/1\s*个对象|1\s*objects/.test(s0), `画布对象数非 1:${s0}`)

  await clickButton(page, /画布转义|Canvas DSL/)
  await page.waitForSelector('textarea.dsl-text', { visible: true, timeout: 5000 })
  await setDslText(page, '[card #c1 delete]')
  await sleep(300)
  const preview = await page.evaluate(() => document.querySelector('.dsl-preview--ok')?.textContent ?? '')
  assert(/删除\s*1|\b1\s*removed/.test(preview), `diff 预览未报删除 1:${preview}`)

  await clickByText(page, '.dsl-actions', /^应用$|^Apply$/)
  await sleep(600)
  await clickByText(page, '.dsl-actions', /^取消$|^Cancel$/)
  await sleep(300)

  const s1 = await summaryText(page)
  assert(/0\s*个对象|0\s*objects/.test(s1), `delete 应用后画布对象数非 0:${s1}`)
  const pos = await page.evaluate(() => {
    const db = JSON.parse(localStorage.getItem('cys-stift.cards.v1') ?? '{}')
    return db.cards?.find((c) => c.id === 'c1')?.canvasPosition
  })
  assert(!pos, `DB 先行落库失败:c1.canvasPosition 仍存在 ${JSON.stringify(pos)}`)
  return '预览报删除 1 ✓ · 应用后 0 对象 ✓ · canvasPosition 已清(DB 先行) ✓'
}

// ── Case U:DSL apply echo + 撤销(①) ────────────────────────────────────────
async function caseUEchoUndo(page) {
  await page.evaluate(seedCanvas([seedCard('c1', 30, 30)]))
  await go(page, '/canvas')

  await clickButton(page, /画布转义|Canvas DSL/)
  await page.waitForSelector('textarea.dsl-text', { visible: true, timeout: 5000 })
  await setDslText(page, '[card #n1 create] @pos(300, 500) @size(160, 96) @title("冒烟新卡")')
  await sleep(300)
  await clickByText(page, '.dsl-actions', /^应用$|^Apply$/)
  await sleep(600)
  const toasts = await page.evaluate(() =>
    [...document.querySelectorAll('[role="status"], [role="alert"]')].map((e) => e.textContent?.trim() ?? '').join(' | '),
  )
  assert(/已应用\s*1|Applied\s*1/.test(toasts), `apply toast 未报"已应用 1":${toasts}`)
  const s1 = await summaryText(page)
  assert(/2\s*个对象|2\s*objects/.test(s1), `apply 后画布对象数非 2:${s1}`)
  await clickByText(page, '.dsl-actions', /^取消$|^Cancel$/)
  await sleep(300)

  // echo 修复核心:apply 是普通 echo 写入(单 undo 步)→ 一步 undo 回到 apply 前
  await clickButton(page, /^撤销$|^Undo$/)
  await sleep(400)
  const s2 = await summaryText(page)
  assert(/1\s*个对象|1\s*objects/.test(s2), `undo 后画布对象数非 1(echo 写入未入 undo 栈?):${s2}`)
  return 'DSL apply(echo)→ 2 对象 ✓ · 一步 undo → 1 对象 ✓'
}

// ── Case E:导出边界(②) ─────────────────────────────────────────────────────
async function caseEExportBounds(page) {
  // elbow 折点 (850,-200) 远超卡盒(30..660, 30..496)——修复前 bounds 不含折点
  await page.evaluate(seedCanvas(
    [seedCard('c1', 30, 30, 0), seedCard('c2', 500, 400, 1)],
    [{ id: 'a1', kind: 'arrow', x: 0, y: 0, w: 0, h: 0, rotation: 0, from: 'c1', to: 'c2', route: 'elbow', elbow: [{ x: 850, y: -200 }], text: '' }],
  ))
  await go(page, '/canvas')
  const s0 = await summaryText(page)
  assert(/3\s*个对象|3\s*objects/.test(s0), `画布对象数非 3(箭头种子未加载):${s0}`)

  // CDP 接管下载 → 真跑导出管线(SVG 序列化 → 光栅化 → PNG 落盘)
  fs.mkdirSync(DL_DIR, { recursive: true })
  for (const f of fs.readdirSync(DL_DIR)) fs.unlinkSync(path.join(DL_DIR, f))
  const cdp = await page.createCDPSession()
  await cdp.send('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: DL_DIR })

  await clickButton(page, /导出画布|Export canvas/) // rail 导出 → 二级菜单
  await sleep(300)
  await clickByText(page, '[role="menu"], .cv-menu, body', /图片|Image \(SVG\/PNG\)/)
  await page.waitForSelector('.exp-actions', { timeout: 5000 })
  await clickByText(page, '.exp-actions', /^导出$|^Export$/) // format=png scale=2 默认
  await sleep(300)

  // 等下载落盘(15s)
  let file = null
  for (let i = 0; i < 30 && !file; i++) {
    await sleep(500)
    const pngs = fs.readdirSync(DL_DIR).filter((f) => f.endsWith('.png') && !f.endsWith('.crdownload'))
    if (pngs.length > 0) file = path.join(DL_DIR, pngs[0])
  }
  assert(file, '导出 PNG 未落盘(download 未触发或管线失败)')
  const buf = fs.readFileSync(file)
  assert(buf.length > 5 * 1024, `PNG 过小(${buf.length}B),疑似空白图`)
  assert(buf.readUInt32BE(12) === 0x49484452, 'PNG 签名异常(非 IHDR)')
  const w = buf.readUInt32BE(16)
  const h = buf.readUInt32BE(20)
  // 修复前:bounds 被 (0,0,0,0) 箭头污染 → 逻辑 ≤ 692×528 → ×2 = 1384×1056
  // 修复后:折点 (850,-200) 入 bounds → 逻辑 ≈ 870×740 → ×2 ≈ 1740×1480
  assert(w >= 1600, `PNG 宽 ${w}px 未覆盖 elbow 远折点(修复前上界 1384)`)
  assert(h >= 1300, `PNG 高 ${h}px 未覆盖 elbow 负 y 折点(修复前上界 1056)`)
  return `真下载 PNG ${w}×${h}(≥1600×1300,折点入 bounds)✓ · ${path.basename(file)}`
}

// ── run ────────────────────────────────────────────────────────────────────
await launch()
await runCase('S-H hover 速览时序(拖拽不弹/500ms 弹/离卡消/切工具消)', caseHHover)
await runCase('S-D DSL delete 应用+DB 先行', caseDDelete)
await runCase('S-U DSL apply echo+单步撤销', caseUEchoUndo)
await runCase('S-E 导出边界(elbow 折点入 bounds,真下载)', caseEExportBounds)
await browser.close()
if (_staticServer) _staticServer.server.close()

let pass = 0
for (const r of results) {
  if (r.pass) pass++
  console.log(`${r.pass ? '✓' : '✗'} ${r.name}\n    ${r.detail}${r.errs.length ? `\n    JS errors: ${r.errs.join(' | ')}` : ''}`)
}
console.log(`\n${pass}/${results.length} passed`)
process.exit(pass === results.length ? 0 : 1)
