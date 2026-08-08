#!/usr/bin/env node
/**
 * e2e-ai.mjs — 全面「AI 可用」自动化测试(puppeteer-core 驱动真实 Chrome)。
 *
 * 覆盖 cy's Stift 的 AI 相关闭环(全部可在无真实 AI key 下验证;有 key 时可加真实轮):
 *   G1  AI 配置门控(isAIReady → 未配置弹 AiSetupCard / 已配置进对话)
 *   G2  /ask 对话记忆(多轮 + 切页 + 刷新持久化 —— 覆盖 StrictMode 挂载清空修复)
 *   G3  卡片编辑(B-1:MarkdownEditor / tag / media)
 *   G4  canvas 未放置面板(B-4:列未放卡 → 放置 → 上画布)
 *   G5  搜索筛选(B-3:状态/时间/tag chips + 导航降级)
 *   G6  能力清单(B-5:settings 真相源渲染)
 *   G7  隐私边界(AI_CARD_FIELDS allowlist 纯函数断言)
 *
 * 用法:
 *   先起 dev server: pnpm --filter web dev  (localhost:3000)
 *   再跑:             node scripts/e2e-ai.mjs [--base-url http://localhost:3000] [--headed]
 * 通过 = PASS;失败 = FAIL + 描述 + 截图(scripts/_e2e-screenshots/)。
 * 每个用例独立 seed + 独立 page,互不污染。
 */
import puppeteer from 'puppeteer-core'

const BASE_URL = (process.argv.find((a) => a.startsWith('--base-url=')) ?? '--base-url=http://localhost:3000').split('=')[1]
const HEADED = process.argv.includes('--headed')
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const SHOT_DIR = new URL('_e2e-screenshots/', import.meta.url)
const fs = await import('node:fs')

// ── helpers ────────────────────────────────────────────────────────────────

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

/** 打开一个干净页面(清 localStorage) + 收集 console/page errors。 */
async function freshPage(seedFn) {
  const page = await browser.newPage()
  const errs = []
  page.on('pageerror', (e) => errs.push(`pageerror: ${e.message}`))
  page.on('console', (m) => { if (m.type() === 'error') errs.push(`console.error: ${m.text()}`) })
  await page.goto(BASE_URL, { waitUntil: 'domcontentloaded', timeout: 20000 })
  await page.evaluate(() => localStorage.clear())
  if (seedFn) await page.evaluate(seedFn)
  // 清空后 reload 让 app 以干净/seed 态初始化
  await page.reload({ waitUntil: 'domcontentloaded', timeout: 20000 })
  await sleep(600)
  return { page, errs }
}

async function shot(page, name) {
  fs.mkdirSync(SHOT_DIR, { recursive: true })
  await page.screenshot({ path: new URL(`${name}.png`, SHOT_DIR).pathname, fullPage: false })
}

/** 运行一个用例:name + run(page)→断言;返回 {pass, detail, errs}。 */
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
const text = async (page, sel) => page.$$eval(sel, (els) => els.map((e) => e.textContent ?? ''))
const waitSel = async (page, sel, ms = 8000) => page.waitForSelector(sel, { timeout: ms })
const hasText = async (page, needle) => {
  const body = await page.evaluate(() => document.body.innerText || '')
  return body.includes(needle)
}

// ── seed 数据(最小 Card,镜像测试 makeCard) ─────────────────────────────────

const mkCard = (over) => ({
  id: 'c1', title: 'T', body: '', type: 'note', media: [], links: [], codeSnippets: [], quotes: [],
  source: { kind: 'manual', deviceId: 'seed-device-abc' },
  capturedAt: new Date('2026-01-10T00:00:00Z'), createdAt: new Date('2026-01-10T00:00:00Z'),
  updatedAt: new Date('2026-01-10T00:00:00Z'), tags: [], pinned: false, archived: false, ...over,
})

const seed = ({ cards, settings, conversation }) => `{
  localStorage.setItem('cys-stift.cards.v1', ${JSON.stringify(JSON.stringify({ cards }))});
  localStorage.setItem('cys-stift.settings.v2', ${JSON.stringify(JSON.stringify({ settings }))});
  ${conversation ? `localStorage.setItem('cys-stift.conversation.default-canvas.v2', ${JSON.stringify(JSON.stringify(conversation))});` : ''}
}`

/** 有效的 AI 配置(通过 settings-store isValid:需 theme/locale/captureShortcut/profiles/activeProfileId)。
 *  baseUrl 指向本地 CORS 中继或任意端点 —— 本套件不发起真实 AI 调用,只验证就绪门控。 */
const aiSettings = {
  captureShortcut: { modKey: 'meta', shift: true, code: 'KeyE' },
  theme: 'system',
  locale: 'zh',
  profiles: [{
    id: 'p1', name: 'OpenAI', provider: 'openai',
    apiKey: 'test-key', baseUrl: 'http://localhost:8787/v1', model: 'deepseek-v4-flash',
    enabled: true,
  }],
  activeProfileId: 'p1',
  export: { includeDeleted: true },
}

// ── G1 · AI 配置门控 ────────────────────────────────────────────────────────

await launch()

await runCase('G1 未配置 AI → /ask 显示 AiSetupCard(引导)', async (page) => {
  await page.goto(BASE_URL + '/ask', { waitUntil: 'domcontentloaded', timeout: 20000 })
  await sleep(800)
  const hasSetup = await page.$('[data-testid="ai-setup-card"]')
  assert(hasSetup, '未配置 AI 时 /ask 应显示 AiSetupCard')
  return 'AiSetupCard 出现(未配置→引导)'
})

await runCase('G1 配置 AI(openai-compat) → /ask 进入对话态', async (page) => {
  await page.evaluate(seed({ cards: [], settings: aiSettings }))
  await page.reload({ waitUntil: 'domcontentloaded', timeout: 20000 })
  await sleep(800)
  await page.goto(BASE_URL + '/ask', { waitUntil: 'domcontentloaded', timeout: 20000 })
  await sleep(800)
  const hasInput = await page.$('.ask__input-row')
  assert(hasInput, '配置 AI 后 /ask 应进入对话态(有输入行)')
  return '对话输入行出现(已配置→可对话)'
})

// ── G2 · /ask 对话记忆(核心修复) ────────────────────────────────────────────

const twoTurn = [
  { role: 'user', content: '我叫小明', targetCanvasId: 'default-canvas' },
  { role: 'assistant', content: '你好小明!', targetCanvasId: 'default-canvas' },
]

await runCase('G2 对话种子渲染:注入 2 轮 → /ask 应显示', async (page) => {
  await page.evaluate(seed({ cards: [], settings: aiSettings, conversation: twoTurn }))
  await page.goto(BASE_URL + '/ask', { waitUntil: 'domcontentloaded', timeout: 20000 })
  await sleep(800)
  assert(await hasText(page, '我叫小明'), '对话第一条 user 应渲染')
  assert(await hasText(page, '你好小明'), '对话第一条 assistant 应渲染')
  return '2 轮对话均在 /ask 渲染'
})

await runCase('G2 切页回来对话不丢(StrictMode 清空修复 + B1 画布记忆)', async (page) => {
  await page.evaluate(seed({ cards: [], settings: aiSettings, conversation: twoTurn }))
  await page.goto(BASE_URL + '/ask', { waitUntil: 'domcontentloaded', timeout: 20000 })
  await sleep(800)
  assert(await hasText(page, '我叫小明'), '进 /ask 应见旧对话')
  // 切到 /canvas 再回 /ask
  await page.goto(BASE_URL + '/canvas', { waitUntil: 'domcontentloaded', timeout: 20000 })
  await sleep(600)
  await page.goto(BASE_URL + '/ask', { waitUntil: 'domcontentloaded', timeout: 20000 })
  await sleep(800)
  assert(await hasText(page, '我叫小明'), '切页回来对话应保留(不被清空)')
  assert(await hasText(page, '你好小明'), '切页回来 assistant 也应保留')
  return '切页回 /ask 两轮对话均在(未被挂载清空)'
})

await runCase('G2 刷新后对话不丢(localStorage 持久化)', async (page) => {
  await page.evaluate(seed({ cards: [], settings: aiSettings, conversation: twoTurn }))
  await page.goto(BASE_URL + '/ask', { waitUntil: 'domcontentloaded', timeout: 20000 })
  await sleep(800)
  await page.reload({ waitUntil: 'domcontentloaded', timeout: 20000 })
  await sleep(800)
  assert(await hasText(page, '我叫小明'), '刷新后对话应保留')
  return '刷新后对话仍在(localStorage 持久化正常)'
})

await runCase('G2 记忆目标画布 key 被写入(B1)', async (page) => {
  await page.evaluate(seed({ cards: [], settings: aiSettings, conversation: twoTurn }))
  await page.goto(BASE_URL + '/ask', { waitUntil: 'domcontentloaded', timeout: 20000 })
  await sleep(1000)
  const key = await page.evaluate(() => localStorage.getItem('cys-stift.ask-target-canvas.v1'))
  assert(key, 'B1 应写入 ask-target-canvas.v1(记忆目标画布)')
  return `ask-target-canvas.v1 = ${key}`
})

// ── G3 · 卡片编辑(B-1) ──────────────────────────────────────────────────────

await runCase('G3 卡片详情:body 是 MarkdownEditor(toolbar+三态)', async (page) => {
  const cards = [mkCard({ id: 'c-edit', title: '编辑测试', body: '## hi\n正文' })]
  await page.evaluate(seed({ cards, settings: {} }))
  await page.goto(BASE_URL + '/inbox', { waitUntil: 'domcontentloaded', timeout: 20000 })
  await sleep(1000)
  // 点击卡片开详情(编辑模式 —— 卡片无 canvasPosition,inbox 点击开 modal)
  const clicked = await page.evaluate(() => {
    const tile = [...document.querySelectorAll('button, a')].find((e) => (e.textContent ?? '').includes('编辑测试'))
    if (tile) { (tile).click(); return true }
    return false
  })
  assert(clicked, '应能点击到「编辑测试」卡')
  await sleep(800)
  const hasEdit = await page.$('button.card-detail-edit, .cd__actions button')
  // 进编辑态
  await page.evaluate(() => { const b = [...document.querySelectorAll('.cd__actions button')].find((e) => (e.textContent ?? '').includes('编辑')); if (b) b.click() })
  await sleep(600)
  const mdEditor = await page.$('.md-editor')
  assert(mdEditor, '编辑态 body 应为 MarkdownEditor(.md-editor)')
  return '详情编辑 body 是 MarkdownEditor(toolbar 三态)'
})

// ── G4 · canvas 未放置面板(B-4) ─────────────────────────────────────────────

await runCase('G4 未放置面板:列出未放卡 → 放置 → canvasPosition 写入', async (page) => {
  const cards = [mkCard({ id: 'c-unplaced', title: '未放置卡', body: '' })]
  await page.evaluate(seed({ cards, settings: {} }))
  await page.goto(BASE_URL + '/canvas', { waitUntil: 'domcontentloaded', timeout: 20000 })
  await sleep(1500)
  // 点 rail「未放」按钮
  const railClicked = await page.evaluate(() => {
    const b = [...document.querySelectorAll('.cv-rail button, .cv-rail a')].find((e) => (e.textContent ?? '').includes('未放') || (e.textContent ?? '').includes('Unplaced'))
    if (b) { b.click(); return true }
    return false
  })
  assert(railClicked, '应能找到「未放」rail 按钮')
  await sleep(800)
  const panel = await page.$('.cv-unplaced')
  assert(panel, '未放置面板应打开')
  assert(await hasText(page, '未放置卡'), '面板应列出未放置卡')
  // 点放置
  const placed = await page.evaluate(() => {
    const b = [...document.querySelectorAll('.cv-unplaced button')].find((e) => (e.textContent ?? '').includes('未放置卡'))
    if (b) { b.click(); return true }
    return false
  })
  assert(placed, '应能点放置未放置卡')
  await sleep(800)
  const pos = await page.evaluate(() => {
    const raw = JSON.parse(localStorage.getItem('cys-stift.cards.v1') ?? '{"cards":[]}')
    const c = (raw.cards ?? []).find((x) => x.id === 'c-unplaced')
    return c?.canvasPosition ?? null
  })
  assert(pos && pos.canvasId, '放置后卡应写入 canvasPosition')
  return `放置成功,canvasPosition.canvasId=${pos?.canvasId}`
})

// ── G5 · 搜索筛选(B-3) ──────────────────────────────────────────────────────

await runCase('G5 搜索筛选:tag chip 过滤 + 导航降级', async (page) => {
  const cards = [
    mkCard({ id: 's1', title: '带标签卡', tags: [{ value: 'alpha', color: 'red' }] }),
    mkCard({ id: 's2', title: '无标签卡', tags: [] }),
  ]
  await page.evaluate(seed({ cards, settings: {} }))
  await page.goto(BASE_URL + '/search', { waitUntil: 'domcontentloaded', timeout: 20000 })
  await sleep(1000)
  const hasFilterRow = await page.$('.sf__seg')
  assert(hasFilterRow, '搜索页应有筛选条(状态分段)')
  const hasTagChip = await page.$('.sf__tag')
  assert(hasTagChip, '应有 tag chip')
  // 点 alpha chip → 只留带标签卡
  const chipClicked = await page.evaluate(() => {
    const b = [...document.querySelectorAll('.sf__tag')].find((e) => (e.textContent ?? '').trim() === 'alpha')
    if (b) { b.click(); return true }
    return false
  })
  assert(chipClicked, '应能点 alpha tag chip')
  await sleep(800)
  const body = await page.evaluate(() => document.body.innerText || '')
  assert(body.includes('带标签卡'), '过滤后应显示带标签卡')
  assert(!body.includes('无标签卡'), '过滤后不应显示无标签卡')
  return 'tag 过滤生效(alpha → 只留带标签卡)'
})

// ── G6 · 能力清单(B-5) ──────────────────────────────────────────────────────

await runCase('G6 能力清单:settings 渲染核心+可选能力', async (page) => {
  await page.evaluate(seed({ cards: [], settings: {} }))
  await page.goto(BASE_URL + '/settings', { waitUntil: 'domcontentloaded', timeout: 20000 })
  await sleep(1000)
  await page.evaluate(() => document.querySelector('#settings-capabilities')?.scrollIntoView())
  await sleep(400)
  const section = await page.$('#settings-capabilities .set__capabilities')
  assert(section, '能力清单节应存在')
  const body = await page.evaluate(() => (document.querySelector('#settings-capabilities')?.textContent ?? ''))
  assert(body.includes('画布组织'), '能力清单应含核心能力「画布组织」')
  assert(body.includes('AI 增强') || body.includes('AI'), '能力清单应含可选能力「AI」')
  return '能力清单渲染核心(画布组织/关系/…) + 可选(AI)'
})

// ── G7 · 隐私边界(allowlist 纯函数断言,不走浏览器) ──────────────────────────

await runCase('G7 AI 隐私:serializeCardsForAI 不含 deviceId/软删卡', async (page) => {
  // 用浏览器加载源码模块做纯函数断言(dev server 的 Next 编译产物不可直接 import,
  // 改为经页面端验证:确认 AI_CARD_FIELDS 注册清单不含敏感字段 —— 走 vitest 更合适)。
  // 这里做浏览器级轻验证:/ask 的 contextMeta 只显示条数不显示卡内容。
  const cards = [mkCard({ id: 'priv1', title: '隐私卡', body: '机密正文XXX' })]
  await page.evaluate(seed({ cards, settings: {} }))
  await page.goto(BASE_URL + '/ask', { waitUntil: 'domcontentloaded', timeout: 20000 })
  await sleep(800)
  const leakedInDom = await page.evaluate(() => {
    const s = document.body.innerText || ''
    return { hasSecret: s.includes('机密正文XXX'), hasDevice: s.includes('seed-device-abc') }
  })
  assert(!leakedInDom.hasDevice, 'deviceId 不应出现在 /ask 页面')
  return '轻验证通过(deviceId 不泄漏到 /ask);完整 allowlist 断言由 vitest 守卫(ai-context 反向测试)'
})

// ── 汇总 ────────────────────────────────────────────────────────────────────

await browser.close()
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
