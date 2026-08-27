#!/usr/bin/env node
// 动效专项浏览器断言(2026-08-24 动效轮):
// VT 触发器 / list-steady 守卫 / home 快态 / canvas 入场 / 共享元素 VT 名 / press token。
import { createServer } from 'node:http'
import { readFile } from 'node:fs/promises'
import { extname, join, normalize } from 'node:path'
import puppeteer from 'puppeteer-core'

const ROOT = process.cwd()
const OUT = join(ROOT, 'apps/web/out')
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.txt': 'text/plain; charset=utf-8',
  '.webmanifest': 'application/manifest+json',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
}

const server = createServer(async (req, res) => {
  try {
    const url = decodeURIComponent(req.url.split('?')[0])
    let p = join(OUT, url)
    if (url.endsWith('/')) p = join(p, 'index.html')
    else if (!extname(p)) p += '.html'
    if (!normalize(p).startsWith(OUT)) throw new Error('out of root')
    const body = await readFile(p)
    res.writeHead(200, { 'content-type': MIME[extname(p)] ?? 'application/octet-stream' })
    res.end(body)
  } catch {
    res.writeHead(404).end('nf')
  }
})
// 端口 0 = 内核分配临时端口:固定端口在并行跑第二个实例时会自撞
// (EADDRINUSE),审计/CI 并发场景直接红。
await new Promise((r) => server.listen(0, r))
const PORT = server.address().port

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: 'new',
  args: ['--allow-pre-commit-input', '--disable-features=CalculateNativeWinOcclusion'],
})
const page = await browser.newPage()
await page.setViewport({ width: 1440, height: 900 })
const errors = []
page.on('pageerror', (e) => errors.push(String(e)))

const results = []
const check = (name, ok, detail = '') => {
  results.push({ name, ok, detail })
  console.log(`  ${ok ? '✓' : '✗'} ${name}${detail ? ' — ' + detail : ''}`)
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
/** 点导航链接后等:路径就位 + VT 结束(headless 下 settle 会打满 300ms 帽,
 *  VT 总时长可到 ~580ms,固定 sleep 会点进冻结窗口)。 */
const navSettled = async (clickSel) => {
  const target = await page.$eval(clickSel, (a) => new URL(a.href).pathname)
  await page.click(clickSel)
  await page.waitForFunction(
    (t) => location.pathname === t && !document.documentElement.matches(':active-view-transition'),
    { timeout: 5000 },
    target,
  )
  await sleep(120)
}

// 0) 初始 load:page-enter 在无 VT 导航标记时生效(home 自带编排,故意关掉
//    main 级入场,故用 /inbox 验证)
// 初期检查用 DCL 即测(networkidle0 本身常 >700ms,到点已过守卫窗)
await page.goto(`http://localhost:${PORT}/inbox/`, { waitUntil: 'domcontentloaded' })
// DCL 后 body/main 偶发仍未就绪(headless 冷启动竞态,曾在并发/慢机下连崩):
// 探针注入前显式等 DOM,而不是赌 evaluate 时机。
await page.waitForSelector('body main', { timeout: 10000 })
// 挂载初期(<700ms)tile-in 在:合成节点直读(样式随 SSG HTML 就位)
const earlyTile = await page.evaluate(() => {
  const t = document.createElement('div')
  t.className = 'tile'
  document.querySelector('body > main').appendChild(t)
  const anim = getComputedStyle(t).animationName
  t.remove()
  return anim
})
check('挂载初期:tile 入场在(合成节点)', earlyTile === 'tile-in', `animation=${earlyTile}`)
await page.waitForNetworkIdle({ idleTime: 300, timeout: 10000 }).catch(() => {})
await sleep(80)
let v = await page.evaluate(() => {
  const main = document.querySelector('body > main')
  const name = main ? getComputedStyle(main).animationName : 'none'
  return { name, vtAttr: document.documentElement.hasAttribute('data-vt-nav') }
})
check('首次直载:page-enter 生效', v.name === 'page-enter', `animation=${v.name}`)
check('首次直载:无 data-vt-nav(尚无客户端导航)', v.vtAttr === false)

// 1) VT 触发器:点击侧栏 Link 到 /archive(客户端导航)
await page.evaluate(() => (window.__alive = 1))
await navSettled('a[href="/archive/"]')
v = await page.evaluate(() => ({
  alive: window.__alive === 1,
  vtAttr: document.documentElement.hasAttribute('data-vt-nav'),
  path: location.pathname,
  mainAnim: getComputedStyle(document.querySelector('body > main')).animationName,
  svt: typeof document.startViewTransition,
}))
check('Link 导航是客户端的(未重载)', v.alive === true && v.path === '/archive/')
check('VT 触发器置位 data-vt-nav', v.vtAttr === true)
check('VT 引擎:导航后 main 无 page-enter(由 VT 承载)', v.mainAnim === 'none', `animation=${v.mainAnim}`)

// 2) list-steady:700ms 后 main 有 list-steady;数据驱动的重挂载不播 tile-in
await sleep(300)
v = await page.evaluate(() => {
  const main = document.querySelector('body > main')
  return { steady: main.classList.contains('list-steady') }
})
check('列表守卫:list-steady 已挂', v.steady === true)
// 去 /inbox,用合成 .tile 验证守卫两态(空库无真实卡片):
// 挂载初期(<700ms)tile-in 在;steady 之后新挂 tile-in 关。
await navSettled('a[href="/inbox/"]')
v = await page.evaluate(() => ({
  steady: document.querySelector('body > main').classList.contains('list-steady'),
  anim: (() => {
    const t = document.createElement('div')
    t.className = 'tile'
    document.querySelector('body > main').appendChild(t)
    const anim = getComputedStyle(t).animationName
    t.remove()
    return anim
  })(),
}))
check('steady 后:守卫就位且 tile-in 关闭', v.steady === true && v.anim === 'none',
  `steady=${v.steady} animation=${v.anim}`)

// 3) home 快态:完整入场播完后(sessionStorage 标记),再进 home 走 350ms 快态。
//    先完整看一次 home(等 1.2s 落标),再走客户端导航回 home。
await navSettled('a[href="/"]')
await sleep(1400) // 完整入场 + 1.2s 落 session 标记
await navSettled('a[href="/archive/"]')
await navSettled('a[href="/"]')
await sleep(900)
v = await page.evaluate(() => {
  const title = document.querySelector('.home__title')
  return {
    fast: document.querySelector('main.home')?.classList.contains('home--fast'),
    dur: title ? getComputedStyle(title).animationDuration : 'none',
    name: title ? getComputedStyle(title).animationName : 'none',
  }
})
check('home 快态:home--fast 类已挂', v.fast === true)
check('home 快态:标题 350ms 单动画(去字距入场)',
  v.dur === '0.35s' && v.name === 'home-fade-up', `dur=${v.dur} name=${v.name}`)
// breathe 合成器路径 + press token(都在 home 上测)
v = await page.evaluate(() => {
  const dot = document.querySelector('[class*="pulse"]')
  const ring = dot ? getComputedStyle(dot, '::before').animationName : 'missing'
  const cap = document.querySelector('.home__capture')
  const dur = cap ? getComputedStyle(cap).transitionDuration : 'none'
  return { ring, dur }
})
check('breathe ::before 环(纯合成器路径)', v.ring.includes('status-dot-ring'), `got=${v.ring}`)
check('按压 token(--duration-press)生效', v.dur.includes('0.1s'), `durations=${v.dur}`)

// 4) 共享元素 VT 名
v = await page.evaluate(() => {
  const s = document.querySelector('.home__current strong')
  return s ? getComputedStyle(s).viewTransitionName : 'missing'
})
check('共享元素:home 画布名 view-transition-name', v === 'current-canvas', `got=${v}`)

// 5) canvas 入场编排 + 切换器 VT 名
await navSettled('a[href="/canvas/"]')
await sleep(300)
v = await page.evaluate(() => {
  const header = document.querySelector('main.page > header')
  const host = document.querySelector('.cv-host')
  const sel = document.querySelector('.cselect')
  return {
    headerAnim: header ? getComputedStyle(header).animationName : 'none',
    hostAnim: host ? getComputedStyle(host).animationName : 'none',
    vtName: sel ? getComputedStyle(sel).viewTransitionName : 'missing',
  }
})
check('canvas 入场:toolbar cv-chrome-in', v.headerAnim === 'cv-chrome-in', `animation=${v.headerAnim}`)
check('canvas 入场:画布面 cv-surface-in', v.hostAnim === 'cv-surface-in', `animation=${v.hostAnim}`)
check('共享元素:canvas 切换器 view-transition-name', v.vtName === 'current-canvas', `got=${v.vtName}`)

// 7) graph 页无 JS 错误(入场编排不炸渲染循环)
await navSettled('a[href="/graph/"]')
await sleep(1200)
const graphErr = errors.filter((e) => /graph|entrance|alpha/i.test(e)).length
check('graph 入场编排无运行时错误', graphErr === 0, errors.length ? `errors=${errors.slice(0, 2)}` : '')

await browser.close()
server.close()
const failed = results.filter((r) => !r.ok)
console.log(failed.length ? `\n❌ ${failed.length} 项失败` : '\n✅ 全部通过')
process.exit(failed.length ? 1 : 0)
