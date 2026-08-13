#!/usr/bin/env node
/**
 * e2e-data.mjs — 数据完整性(A)+ v1.2.0 回归(B)对抗性测试。
 *
 * 补 e2e-ai.mjs(G1-G7 AI 主路径)没覆盖的数据层:
 *   A2  软删→硬删:media eager 清理 + card record 删除(trash/page.tsx:119-128)
 *   B1  编辑器合并:改 body 不 clobber codeSnippets/quotes/links 富字段
 *       (use-card-draft.ts buildPatch per-field dirty 门控的直接验证)
 *   (A1 JSON 全量往返、A3 DSL v8 往返、A4 导入 reject/回滚 待补)
 *
 * 用法:
 *   node scripts/e2e-data.mjs              # 默认:内置静态 server serve apps/web/out(=线上产物)
 *   node scripts/e2e-data.mjs --build      # 先 pnpm --filter web build 再 serve
 *   node scripts/e2e-data.mjs --base-url http://localhost:3000  # 指向 dev server(慢,不推荐)
 *   node scripts/e2e-data.mjs --headed     # 可视化跑(调试)
 *
 * 为什么跑静态产物而非 dev:Next 15 dev 按需编译 + 水合,固定 sleep 等不够会让断言
 * 在元素还没渲染时就跑,全部误报 FAIL。静态产物 = 线上真实产物,无编译延迟。
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
const fs = await import('node:fs')

const OUT_DIR = path.resolve('apps/web/out')

// ── 静态 server(默认 baseURL;--base-url 覆盖则跳过) ────────────────────────
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
if (WANT_BUILD && !existsSync(OUT_DIR)) {
  console.log('▶ pnpm --filter web build(生成 out/)')
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

// ── helpers(复用 e2e-ai.mjs 模式)────────────────────────────────────────────

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

// dev server 会刷 favicon/HMR 404 噪音 —— 过滤掉,只留真错误。
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

/** 等 app 水合完毕(导航后的通用就绪门)。 */
async function waitReady(page) {
  await page.waitForSelector('main', { timeout: 10000 }).catch(() => {})
  await page.waitForFunction(() => !/读取中/.test(document.body.innerText || ''), { timeout: 10000 }).catch(() => {})
}

/** 导航到 route 并等水合就绪(用例内二次跳转用这个,别裸 goto)。 */
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

const mkCard = (over) => ({
  id: 'c1', title: 'T', body: '', type: 'note', media: [], links: [], codeSnippets: [], quotes: [],
  source: { kind: 'manual', deviceId: 'seed-device-abc' },
  capturedAt: new Date('2026-01-10T00:00:00Z'), createdAt: new Date('2026-01-10T00:00:00Z'),
  updatedAt: new Date('2026-01-10T00:00:00Z'), tags: [], pinned: false, archived: false, ...over,
})

/** seed 多 store:cards / settings / conversation / media / canvases / canvasView。 */
const seed = ({ cards, settings, conversation, media, canvases, canvasView }) => `{
  localStorage.setItem('cys-stift.cards.v1', ${JSON.stringify(JSON.stringify({ cards }))});
  localStorage.setItem('cys-stift.settings.v2', ${JSON.stringify(JSON.stringify({ settings }))});
  ${conversation ? `localStorage.setItem('cys-stift.conversation.default-canvas.v2', ${JSON.stringify(JSON.stringify(conversation))});` : ''}
  ${media ? `localStorage.setItem('cys-stift.media.v1', ${JSON.stringify(JSON.stringify(media))});` : ''}
  ${canvases ? `localStorage.setItem('cys-stift.canvases.v1', ${JSON.stringify(JSON.stringify(canvases))});` : ''}
  ${canvasView ? `localStorage.setItem('cys-stift.canvas-view.v1', ${JSON.stringify(JSON.stringify(canvasView))});` : ''}
}`

/** 读 localStorage 的 cards.v1 里某张卡(e2e 断言用)。 */
const readCard = (page, id) => page.evaluate((cid) => {
  const raw = JSON.parse(localStorage.getItem('cys-stift.cards.v1') ?? '{"cards":[]}')
  return raw.cards.find((c) => c.id === cid) ?? null
}, id)

/** 读 media.v1 的 asset 计数。 */
const mediaCount = (page) => page.evaluate(() =>
  Object.keys((JSON.parse(localStorage.getItem('cys-stift.media.v1') ?? '{"assets":{}}')).assets).length)

// ── A2 · 软删→硬删 media eager 清理 ──────────────────────────────────────────

await launch()

await runCase('A2 软删→硬删:media eager 清理 + card record 删除', async (page) => {
  const card = mkCard({
    id: 'c-del', title: '待硬删', body: '配图',
    media: [{ assetId: 'ma-del', order: 0, kind: 'image' }],
    deletedAt: new Date('2026-01-15T00:00:00Z'),
  })
  const media = { assets: { 'ma-del': { id: 'ma-del', kind: 'image', mimeType: 'image/png',
    // 1x1 透明 PNG(真 base64),媒体只存 localStorage 不进 OPFS
    dataUrl: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
    byteSize: 70, createdAt: '2026-01-10T00:00:00.000Z', checksum: 'seed-1' } } }
  const settings = { locale: 'zh', theme: 'system',
    captureShortcut: { modKey: 'meta', shift: true, code: 'KeyE' }, export: { includeDeleted: true } }
  await page.evaluate(seed({ cards: [card], settings, media }))
  await go(page, '/trash')

  // 软删态:card record 在(带 deletedAt),media asset 保留
  assert(await mediaCount(page) === 1, `软删后 media 应保留(=1),实际 ${await mediaCount(page)}`)

  // 点「永久删除」(列表项操作行的 danger 按钮,触发 confirm Modal)
  const clicked = await page.evaluate(() => {
    const b = [...document.querySelectorAll('.trash-item__actions button, .grid button, .grid li button')]
      .find((e) => /永久删除|Delete forever/.test((e.textContent ?? '').trim()))
    if (b) { b.click(); return true }
    return false
  })
  assert(clicked, '应找到「永久删除」按钮')
  await sleep(700)

  // confirm Modal:输入确认词(locale=zh →「删除」)
  const ci = await page.$('input.confirm__type')
  assert(ci, 'confirm Modal 应有 input.confirm__type')
  await ci.focus()
  await ci.type('删除')
  await sleep(400)

  // 点 confirm 内非 disabled 的红按钮(填对确认词后启用)
  const confirmed = await page.evaluate(() => {
    const btns = [...document.querySelectorAll('.confirm button, [role="dialog"] button, body > div button')]
    const red = btns.find((b) => /永久删除|Delete forever/.test((b.textContent ?? '').trim()) && !b.disabled)
    if (red) { red.click(); return true }
    return false
  })
  assert(confirmed, '应能点确认红按钮(填对确认词后启用)')
  await sleep(600) // mediaStore.remove 是 fire-and-forget 异步,等一拍

  // 硬删后:media asset 清空 + card record 删除
  assert(await mediaCount(page) === 0, `硬删后 media 应清空(=0),实际 ${await mediaCount(page)}`)
  const after = await readCard(page, 'c-del')
  assert(after === null, '硬删后 card record 应删除')
  return 'media 1→0 eager 清理 ✓;card record 删除 ✓'
})

// ── A1 · JSON 全量往返(导出→清→导入→等价)────────────────────────────────────

await runCase('A1 JSON 全量往返:富卡(v8)+media+canvases 导出→导入等价', async (page) => {
  const canvasId = 'cv-1'
  const card = mkCard({
    id: 'c-full', title: '全字段卡', body: '正文 **md**', type: 'code',
    codeSnippets: [{ language: 'ts', code: 'const a=1\nconst b=2' }, { language: 'py', code: 'print(1)', caption: 'cap' }],
    quotes: [{ text: '引言', attribution: '作者', sourceUrl: 'https://s.com' }],
    links: [{ url: 'https://example.com', title: '示例', fetchedAt: '2026-01-10T00:00:00.000Z' }],
    tags: [{ value: 'alpha', color: 'var(--color-red)' }, { value: 'foo;bar', color: 'var(--color-blue)' }],
    media: [{ assetId: 'ma-1', order: 0, kind: 'image' }],
    canvasPosition: { canvasId, x: 10, y: 20, w: 100, h: 80, z: 0 },
  })
  const media = { assets: { 'ma-1': { id: 'ma-1', kind: 'image', mimeType: 'image/png',
    dataUrl: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
    byteSize: 70, createdAt: '2026-01-10T00:00:00.000Z', checksum: 's1' } } }
  const canvases = { snapshot: { canvases: [{ id: canvasId, workspaceId: 'ws', name: '画布一',
    view: { zoom: 1, pan: { x: 0, y: 0 }, gridMode: 'snap', gridSize: 8 },
    createdAt: '2026-06-01T00:00:00.000Z', updatedAt: '2026-06-01T00:00:00.000Z' }], activeCanvasId: canvasId } }
  const settings = { locale: 'zh', theme: 'system',
    captureShortcut: { modKey: 'meta', shift: true, code: 'KeyE' }, export: { includeDeleted: true } }
  await page.evaluate(seed({ cards: [card], settings, media, canvases }))

  // ── 导出:CDP 抓 Blob 下载文件 ──
  await go(page, '/settings')
  const dlDir = '/tmp/cys-e2e-export'
  fs.rmSync(dlDir, { recursive: true, force: true })
  fs.mkdirSync(dlDir, { recursive: true })
  const cdp = await page.target().createCDPSession()
  await cdp.send('Page.setDownloadBehavior', { behavior: 'allow', downloadPath: dlDir })
  const expBtn = await page.$('.set__export-btn')
  assert(expBtn, '/settings 应有导出按钮 .set__export-btn')
  await expBtn.click()
  await sleep(3500)
  const files = fs.readdirSync(dlDir).filter((f) => f.startsWith('cys-stift-export-') && f.endsWith('.json'))
  assert(files.length === 1, `应导出 1 个 JSON,实际 ${files.length}:${JSON.stringify(files)}`)

  // 断言导出结构
  const payload = JSON.parse(fs.readFileSync(`${dlDir}/${files[0]}`, 'utf8'))
  assert(payload.version === 1, `导出 version 应=1,实际 ${payload.version}`)
  assert(payload.app === "cy's Stift", `导出 app 应=cy's Stift,实际 ${payload.app}`)
  const ec = payload.cards.find((c) => c.id === 'c-full')
  assert(ec, '导出 cards 应含 c-full')
  assert(ec.codeSnippets.length === 2 && ec.quotes.length === 1 && ec.links.length === 1,
    `导出卡 v8 富字段应全在(code=${ec.codeSnippets?.length}/quote=${ec.quotes?.length}/link=${ec.links?.length})`)
  assert(ec.canvasPosition?.canvasId === canvasId, '导出卡 canvasPosition 应在')
  assert(payload.mediaAssets?.['ma-1'], '导出 mediaAssets 应含 ma-1')

  // ── 清 localStorage → 导入同一文件 ──
  await page.evaluate(() => localStorage.clear())
  await go(page, '/settings')
  const input = await page.$('input.set__file')
  assert(input, '/settings 应有导入 input.set__file')
  await input.uploadFile(`${dlDir}/${files[0]}`)
  await sleep(1800) // dryRun + Modal
  const modalOk = await page.$$eval('.set__confirm-actions button, [role="dialog"] button', (bs) => {
    const b = bs.find((x) => /导入 JSON|Import JSON/.test((x.textContent ?? '').trim()) && !x.disabled)
    if (b) { b.click(); return true }
    return false
  })
  assert(modalOk, '应能点导入确认按钮(Modal primary)')
  await sleep(2200) // importFromJson 两阶段事务写完

  // ── 断言往返等价 ──
  const after = await readCard(page, 'c-full')
  assert(after, '导入后卡 c-full 应在 localStorage')
  assert(after.codeSnippets.length === 2 && after.codeSnippets[0].language === 'ts' && after.codeSnippets[1].caption === 'cap',
    `导入后 codeSnippets 应 2 块往返,实际 ${after.codeSnippets?.length}`)
  assert(after.quotes.length === 1 && after.quotes[0].attribution === '作者' && after.quotes[0].sourceUrl === 'https://s.com',
    `导入后 quotes 往返,实际 ${JSON.stringify(after.quotes)}`)
  assert(after.links.length === 1 && after.links[0].url === 'https://example.com', `导入后 links url 往返`)
  assert(after.tags.length === 2 && after.tags[1].value === 'foo;bar', `导入后 tags 往返(含 ; 编码碰撞)`)
  assert(after.canvasPosition?.canvasId === canvasId, `导入后 canvasPosition 往返(canvases 同导)`)
  assert(await mediaCount(page) === 1, `导入后 media asset 在(=1),实际 ${await mediaCount(page)}`)
  const cp = await page.evaluate(() => !!localStorage.getItem('cys-stift.import-checkpoint.v1'))
  assert(cp, '导入后 checkpoint key 应存在(默认 checkpoint:true)')
  return `导出 ${files[0]} → 导入;v8 字段 + media + canvasPosition + checkpoint 全往返 ✓`
})

// ── A4 · 导入校验:坏数据 reject + 本地不污染(事务回滚)────────────────────────

await runCase('A4 导入校验:坏 capturedAt → reject,本地 cards 字节不变(事务回滚)', async (page) => {
  const goodCard = mkCard({ id: 'c-keep', title: '保留卡', body: '好数据' })
  await page.evaluate(seed({ cards: [goodCard], settings: {} }))
  await go(page, '/settings')
  // 构造坏 payload(capturedAt 不可解析 → importFromJson 校验 reject 整个导入)
  const badPayload = {
    version: 1, exportedAt: '2026-08-10T00:00:00.000Z', app: "cy's Stift",
    cards: [{ id: 'c-bad', title: '坏卡', body: 'x', type: 'note', media: [], links: [], codeSnippets: [], quotes: [], tags: [], pinned: false, archived: false, source: { kind: 'manual' }, capturedAt: '不是日期', createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' }],
    mediaAssets: {},
  }
  const badFile = '/tmp/cys-e2e-bad.json'
  fs.writeFileSync(badFile, JSON.stringify(badPayload, null, 2))
  const before = await page.evaluate(() => localStorage.getItem('cys-stift.cards.v1'))
  // uploadFile 坏文件 → dryRun 应 reject(不弹确认 Modal)
  const input = await page.$('input.set__file')
  assert(input, '/settings 应有导入 input.set__file')
  await input.uploadFile(badFile)
  await sleep(2200) // dryRun 校验
  // 断言:本地数据完全不变(reject + 两阶段事务回滚)
  const after = await page.evaluate(() => localStorage.getItem('cys-stift.cards.v1'))
  assert(after === before, '坏导入应被 reject,cards.v1 应字节不变(事务回滚)')
  const snap = await page.evaluate(() => JSON.parse(localStorage.getItem('cys-stift.cards.v1') ?? '{"cards":[]}'))
  assert(!snap.cards.find((c) => c.id === 'c-bad'), '坏卡 c-bad 不应进 localStorage')
  assert(snap.cards.find((c) => c.id === 'c-keep'), '原好卡 c-keep 应保留(reject 不污染)')
  return '坏 capturedAt → dryRun reject ✓;cards.v1 字节不变,无坏卡,c-keep 保留'
})

// ── B1 · 编辑器合并:dirty 门控(改 body 不 clobber 富字段)─────────────────────

await runCase('B1 编辑器合并:改 body 不 clobber codeSnippets/quotes/links(dirty 门控)', async (page) => {
  const card = mkCard({
    id: 'c-rich', title: '富字段卡', body: '原 body',
    codeSnippets: [{ language: 'ts', code: 'const a=1' }, { language: 'py', code: 'b=2' }],
    quotes: [{ text: '引言一', attribution: '作者' }],
    links: [{ url: 'https://example.com', title: '示例站', description: 'desc', ogImageUrl: 'og.png', fetchedAt: '2026-01-10T00:00:00.000Z' }],
    tags: [{ value: 'alpha', color: 'var(--color-red)' }],
  })
  await page.evaluate(seed({ cards: [card], settings: {} }))
  await go(page, '/inbox')

  // 开详情(点卡 —— 用 button/a 精确,div/li 容器 click 不触发 React onClick)
  const opened = await page.evaluate(() => {
    const t = [...document.querySelectorAll('button,a')].find((e) => (e.textContent ?? '').includes('富字段卡'))
    if (t) { t.click(); return true }
    return false
  })
  assert(opened, '应能点击「富字段卡」开详情')
  await sleep(900)

  // 进编辑态
  await page.evaluate(() => {
    const b = [...document.querySelectorAll('button')].find((e) => { const t = (e.textContent ?? '').trim(); return t === '编辑' || t === 'Edit' })
    if (b) b.click()
  })
  await sleep(700)

  const ta = await page.$('textarea.md-editor__textarea')
  assert(ta, '编辑态 body 应有 textarea.md-editor__textarea')
  await ta.click({ clickCount: 3 })
  await ta.type('改后的 body')
  await sleep(300)

  // 保存
  await page.evaluate(() => {
    const b = [...document.querySelectorAll('button')].find((e) => { const t = (e.textContent ?? '').trim(); return t === '保存' || t === 'Save' })
    if (b) b.click()
  })
  await sleep(900)

  // 断言:body 改了,但 codeSnippets/quotes/links 富字段深相等存活(dirty 门控:未编辑字段不进 patch)
  const after = await readCard(page, 'c-rich')
  assert(after, '保存后卡应在 localStorage')
  assert(after.body === '改后的 body', `body 应改为「改后的 body」,实际「${after.body}」`)
  assert(after.codeSnippets.length === 2 && after.codeSnippets[0].language === 'ts' && after.codeSnippets[1].language === 'py',
    `codeSnippets 应 2 块往返不丢,实际 ${after.codeSnippets?.length} 块`)
  assert(after.quotes.length === 1 && after.quotes[0].text === '引言一' && after.quotes[0].attribution === '作者',
    `quotes 应往返,实际 ${JSON.stringify(after.quotes)}`)
  assert(after.links.length === 1 && after.links[0].title === '示例站',
    `links 富字段 title 应保留(dirty 门控:未编辑 links 不进 patch),实际 title=${after.links[0]?.title}`)
  return 'body 改 ✓;codeSnippets(2)/quotes(1)/links(title) 全保留 — dirty 门控生效'
})

// ── 汇总 ────────────────────────────────────────────────────────────────────

await browser.close()
if (_staticServer) _staticServer.server.close()
let pass = 0
for (const r of results) {
  const tag = r.pass ? '✅ PASS' : '❌ FAIL'
  console.log(`[${tag}] ${r.name}`)
  if (!r.pass && r.detail) console.log(`        ${r.detail}`)
  if (r.errs?.length) for (const e of r.errs) console.log(`        ${e}`)
  if (r.pass) pass++
}
const total = results.length
console.log(`\n${pass}/${total} 通过`)
if (pass !== total) {
  console.log(`截图目录: ${SHOT_DIR.pathname}`)
  process.exit(1)
}
process.exit(0)
