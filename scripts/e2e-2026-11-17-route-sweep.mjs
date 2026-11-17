#!/usr/bin/env node
// 路由扫雷:静态 serve out/,逐路由访问,收 console error / pageerror / 失败请求。
// 用法: node scripts/e2e-2026-11-17-route-sweep.mjs
import { createServer } from 'node:http'
import { readFileSync, existsSync, statSync } from 'node:fs'
import { join, extname } from 'node:path'
import puppeteer from 'puppeteer-core'

const OUT = join(import.meta.dirname, '../apps/web/out')
const PORT = 4499
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml', '.json': 'application/json', '.woff2': 'font/woff2', '.txt': 'text/plain' }

const server = createServer((req, res) => {
  let p = decodeURIComponent(new URL(req.url, 'http://x').pathname)
  let f = join(OUT, p)
  if (existsSync(f) && statSync(f).isDirectory()) f = join(f, 'index.html')
  if (!existsSync(f) && !extname(p)) f = join(OUT, p + '.html') // 静态导出的 .html 路由
  if (!existsSync(f)) f = join(OUT, '404.html')
  if (!existsSync(f)) { res.writeHead(404); res.end(); return }
  res.writeHead(200, { 'content-type': MIME[extname(f)] || 'application/octet-stream' })
  res.end(readFileSync(f))
})
await new Promise(r => server.listen(PORT, r))

const routes = ['/', '/inbox', '/canvas', '/workbench', '/archive', '/trash', '/search', '/tags', '/timeline', '/graph', '/settings', '/ask']
const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true })
const page = await browser.newPage()
await page.setViewport({ width: 1440, height: 900 })

let fail = 0
for (const route of routes) {
  const errors = []
  const onConsole = m => { if (m.type() === 'error') errors.push('console: ' + m.text().slice(0, 200)) }
  const onPageError = e => errors.push('pageerror: ' + String(e).slice(0, 200))
  const onRequestFailed = r => { if (!r.url().includes('favicon')) errors.push('reqfail: ' + r.url().slice(0, 120)) }
  page.on('console', onConsole); page.on('pageerror', onPageError); page.on('requestfailed', onRequestFailed)
  try {
    await page.goto(`http://localhost:${PORT}${route}`, { waitUntil: 'networkidle2', timeout: 20000 })
    await new Promise(r => setTimeout(r, 1200)) // 留水合时间
    const bodyLen = await page.evaluate(() => document.body.innerText.length)
    const status = errors.length === 0 ? '✓' : '✗'
    if (errors.length) fail++
    console.log(`${status} ${route}  文本${bodyLen}字符${errors.length ? '\n    ' + errors.slice(0, 4).join('\n    ') : ''}`)
  } catch (e) {
    fail++
    console.log(`✗ ${route}  导航失败: ${String(e).slice(0, 120)}`)
  }
  page.off('console', onConsole); page.off('pageerror', onPageError); page.off('requestfailed', onRequestFailed)
}
await browser.close()
server.close()
console.log(fail === 0 ? `\n全部 ${routes.length} 路由干净` : `\n${fail} 个路由有错`)
process.exit(fail === 0 ? 0 : 1)
