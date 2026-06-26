// Runtime render sweep: serve apps/web/out, navigate each route, collect
// pageerror + console.error. Catches bugs build/test miss (e.g. React #310).
// Usage: node scripts/render-sweep.mjs
import { createServer } from 'node:http'
import { readFile, stat } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import path from 'node:path'
import puppeteer from 'puppeteer-core'

const ROOT = path.resolve('apps/web/out')
const PORT = 4455
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript',
  '.mjs': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.wasm': 'application/wasm',
}

const server = createServer(async (req, res) => {
  try {
    let urlPath = decodeURIComponent(req.url.split('?')[0])
    let filePath = path.join(ROOT, urlPath)
    // directory → index.html
    if (existsSync(filePath) && (await stat(filePath)).isDirectory()) {
      filePath = path.join(filePath, 'index.html')
    }
    // no extension and file doesn't exist → try .html (Next static export clean URLs)
    if (!existsSync(filePath) && !path.extname(filePath)) {
      const html = filePath + '.html'
      if (existsSync(html)) filePath = html
    }
    if (!existsSync(filePath)) {
      // fallback to 404.html so SPA-ish routes don't 500
      const f404 = path.join(ROOT, '404.html')
      if (existsSync(f404)) {
        res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8' })
        res.end(await readFile(f404))
        return
      }
      res.writeHead(404)
      res.end('not found')
      return
    }
    const data = await readFile(filePath)
    res.writeHead(200, { 'Content-Type': MIME[path.extname(filePath)] ?? 'application/octet-stream' })
    res.end(data)
  } catch (e) {
    res.writeHead(500)
    res.end(String(e))
  }
})

await new Promise((r) => server.listen(PORT, r))
const base = `http://localhost:${PORT}`

const routes = [
  '/',
  '/inbox',
  '/canvas',
  '/timeline',
  '/archive',
  '/trash',
  '/search',
  '/settings',
  '/design',
  '/dev/db',
  '/dev/min',
  '/dev/canvas-self',
]

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: true,
  args: ['--no-sandbox', '--disable-setuid-sandbox'],
})

let totalErrors = 0
for (const route of routes) {
  const page = await browser.newPage()
  const errors = []
  const consoleErrors = []
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`))
  page.on('console', (m) => {
    if (m.type() === 'error') consoleErrors.push(`console.error: ${m.text()}`)
  })
  page.on('requestfailed', (r) => {
    const u = r.url()
    // ignore favicon / external
    if (!u.includes('favicon')) errors.push(`requestfailed: ${u} — ${r.failure()?.errorText}`)
  })
  try {
    await page.goto(base + route, { waitUntil: 'networkidle0', timeout: 15000 })
    await new Promise((r) => setTimeout(r, 800))
    // detect React error boundary
    const boundaryVisible = await page.evaluate(() => {
      const t = document.body.innerText || ''
      return /Minified React error|#310|渲染出错|这一步崩了/.test(t)
    })
    const all = [...errors, ...consoleErrors]
    totalErrors += all.length + (boundaryVisible ? 1 : 0)
    const tag = all.length === 0 && !boundaryVisible ? 'OK ' : 'ERR'
    console.log(`[${tag}] ${route}${boundaryVisible ? '  ⚠ error-boundary-visible' : ''}`)
    for (const e of all) console.log(`        ${e}`)
  } catch (e) {
    totalErrors++
    console.log(`[ERR] ${route}  navigation-failed: ${e.message}`)
  } finally {
    await page.close()
  }
}

await browser.close()
server.close()
console.log(`\n${totalErrors === 0 ? '✅ ALL CLEAN' : '❌ ' + totalErrors + ' error(s)'} (${routes.length} routes)`)
process.exit(totalErrors === 0 ? 0 : 1)
