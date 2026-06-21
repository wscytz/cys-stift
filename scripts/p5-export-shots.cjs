#!/usr/bin/env node
// P5 (v0.33.0) — canvas export + .cystift roundtrip verification.
//   1. /canvas → create a card (dblclick) so there's content to export.
//   2. Open the Export dialog → screenshot.
//   3. Warmup export (tldraw's getSvgString returns undefined on the very
//      first export in a fresh session; one throwaway export primes it).
//   4. Export PNG → read the blob → assert a `tEXt` chunk with keyword
//      `cystift` decodes to { app: 'cys-stift', cards: [≥1] }.
//   5. Export SVG → read the blob → assert `data-cystift` carries the same.
//
// Blobs are read in-page via a URL.createObjectURL override (deterministic;
// CDP's download interception is flaky for the first download in a session).
const puppeteer = require('puppeteer-core')
const fs = require('node:fs')
const path = require('node:path')

const SHOTS = path.join(__dirname, '..', 'docs', 'design', 'screenshots', 'p5-export')
fs.mkdirSync(SHOTS, { recursive: true })

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const URL = process.env.URL || 'http://localhost:3016/canvas'
const wait = (ms) => new Promise((r) => setTimeout(r, ms))

async function shot(page, name) {
  const file = path.join(SHOTS, name)
  await page.screenshot({ path: file })
  console.log(`✓ ${name}  (${(fs.statSync(file).size / 1024).toFixed(1)} kB)`)
}

async function clickByText(page, text) {
  const el = await page.evaluateHandle((t) => {
    const btns = Array.from(document.querySelectorAll('button'))
    return btns.find((b) => b.textContent.trim() === t) || null
  }, text)
  const node = el.asElement()
  if (!node) throw new Error(`button not found: "${text}"`)
  await node.click()
}

// Minimal PNG tEXt reader (mirrors png-text-chunk.ts) for the e2e probe.
function readPngText(buf, keyword) {
  const png = new Uint8Array(buf)
  const sig = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]
  for (let i = 0; i < 8; i++) if (png[i] !== sig[i]) return null
  let i = 8
  while (i + 8 <= png.length) {
    const len = (png[i] << 24) | (png[i + 1] << 16) | (png[i + 2] << 8) | png[i + 3]
    const type = String.fromCharCode(png[i + 4], png[i + 5], png[i + 6], png[i + 7])
    const dataStart = i + 8
    if (type === 'tEXt') {
      const data = png.slice(dataStart, dataStart + len)
      const nul = data.indexOf(0)
      if (nul > 0) {
        const key = Buffer.from(data.slice(0, nul)).toString('latin1')
        if (key === keyword) return Buffer.from(data.slice(nul + 1)).toString('latin1')
      }
    } else if (type === 'IEND') break
    i = dataStart + len + 4
  }
  return null
}

;(async () => {
  const browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: 'new',
    defaultViewport: { width: 1440, height: 900 },
  })
  const page = await browser.newPage()
  const errors = []
  page.on('pageerror', (e) => errors.push(String(e)))
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text())
  })

  const result = { dialogOpened: false, svgCystift: false, pngCystift: false, noErrors: false }
  try {
    // Route real <a download> clicks into a tmp dir so headless Chrome
    // doesn't hang on the download navigation. (We verify via the in-page
    // blob override, not these files, but the download must still resolve.)
    const DL_DIR = '/tmp/p5-dl'
    fs.rmSync(DL_DIR, { recursive: true, force: true })
    fs.mkdirSync(DL_DIR, { recursive: true })
    const client = await page.target().createCDPSession()
    await client.send('Page.setDownloadBehavior', { behavior: 'allow', downloadPath: DL_DIR })

    await page.goto(URL, { waitUntil: 'networkidle0' })
    await wait(2500) // tldraw dynamic import + onMount

    // Capture export blobs in-page (deterministic). SVG → text; PNG → base64.
    await page.evaluate(() => {
      window.__capturedBlobs = []
      const orig = URL.createObjectURL
      URL.createObjectURL = function (b) {
        try {
          if (b instanceof Blob) {
            const kind = b.type
            if (kind.includes('svg')) {
              b.text().then((t) => window.__capturedBlobs.push({ kind, text: t }))
            } else if (kind.includes('png')) {
              b.arrayBuffer().then((buf) => {
                const bytes = new Uint8Array(buf)
                let bin = ''
                for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i])
                window.__capturedBlobs.push({ kind, b64: btoa(bin) })
              })
            }
          }
        } catch {
          /* ignore */
        }
        return orig.call(this, b)
      }
    })

    // Seed a card.
    await page.mouse.click(400, 400, { clickCount: 2 })
    await wait(1500)

    const openDialog = async () => {
      await page.evaluate(() => {
        const t = Array.from(document.querySelectorAll('button')).find((b) =>
          /导出画布|Export canvas/.test(b.textContent),
        )
        if (t) t.click()
      })
      await wait(500)
    }
    const closeDialog = async () => {
      await page.keyboard.press('Escape')
      await wait(300)
    }
    const runExport = async () => {
      await clickByText(page, '导出').catch(() => clickByText(page, 'Export'))
      await wait(2500)
    }

    // Open + screenshot the dialog.
    await openDialog()
    result.dialogOpened = await page.evaluate(
      () =>
        document.body.textContent.includes('携带完整画布') ||
        document.body.textContent.includes('carries full canvas'),
    )
    await shot(page, '01-export-dialog.png')

    // Warmup export (default PNG) to prime tldraw's exporter.
    await runExport()
    await closeDialog()

    // ── PNG ──
    await openDialog()
    await clickByText(page, 'PNG')
    await wait(300)
    await runExport()
    const pngB64 = await page.evaluate(
      () =>
        (window.__capturedBlobs || [])
          .filter((x) => x.kind.includes('png'))
          .pop()?.b64 ?? null,
    )
    if (pngB64) {
      const text = readPngText(Buffer.from(pngB64, 'base64'), 'cystift')
      if (text) {
        try {
          const p = JSON.parse(decodeURIComponent(text))
          result.pngCystift = p.app === 'cys-stift' && Array.isArray(p.cards) && p.cards.length >= 1
          console.log(`[png] app=${p.app} cards=${p.cards.length} cystift=${result.pngCystift}`)
        } catch (e) {
          console.log('✗ png decode failed', String(e))
        }
      } else console.log('✗ png: no cystift tEXt chunk')
    } else console.log('✗ no PNG blob captured')
    await closeDialog()

    // ── SVG ──
    await openDialog()
    await page.evaluate(() => {
      const b = Array.from(document.querySelectorAll('.exp-seg__btn')).find(
        (x) => x.textContent.trim() === 'SVG',
      )
      if (b) b.click()
      else throw new Error('SVG segment not found')
    })
    await wait(300)
    await runExport()
    const svgText = await page.evaluate(
      () =>
        (window.__capturedBlobs || [])
          .filter((x) => x.kind.includes('svg'))
          .pop()?.text ?? null,
    )
    if (svgText) {
      const m = svgText.match(/data-cystift="([^"]*)"/)
      if (m) {
        try {
          const p = JSON.parse(decodeURIComponent(m[1]))
          result.svgCystift = p.app === 'cys-stift' && Array.isArray(p.cards) && p.cards.length >= 1
          console.log(`[svg] app=${p.app} cards=${p.cards.length} cystift=${result.svgCystift}`)
        } catch (e) {
          console.log('✗ svg decode failed', String(e))
        }
      } else console.log('✗ svg: no data-cystift')
    } else console.log('✗ no SVG blob captured')

    await shot(page, '02-after-exports.png')
    result.noErrors = errors.length === 0
  } catch (e) {
    console.log('✗ e2e threw:', String(e))
  } finally {
    console.log('\n── page errors ──')
    console.log(errors.length ? errors.map((e) => '  ' + e).join('\n') : '  none')
    console.log('\n── assertions ──')
    console.log(`  dialogOpened = ${result.dialogOpened}`)
    console.log(`  pngCystift   = ${result.pngCystift}`)
    console.log(`  svgCystift   = ${result.svgCystift}`)
    console.log(`  noErrors     = ${result.noErrors}`)
    const pass = Object.values(result).every(Boolean)
    console.log(`\nresult: ${pass ? 'PASS ✓' : 'FAIL ✗'}`)
    await browser.close()
    process.exit(pass ? 0 : 1)
  }
})()
