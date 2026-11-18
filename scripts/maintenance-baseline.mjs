import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { readFile, readdir, realpath, stat, writeFile } from 'node:fs/promises'
import { createServer } from 'node:http'
import os from 'node:os'
import path from 'node:path'
import { performance } from 'node:perf_hooks'
import { fileURLToPath } from 'node:url'
import { gzipSync } from 'node:zlib'
import puppeteer from 'puppeteer-core'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const usage = `Offline maintenance baseline (no timing pass/fail thresholds).

Run from the repository root, using the existing DSL package's tsx:
  pnpm --filter @wscytz/dsl exec tsx ../../scripts/maintenance-baseline.mjs [options]

Options:
  --output PATH          JSON artifact (default /tmp/cys-maintenance-baseline.json)
  --out-dir PATH         Existing static web export (default apps/web/out)
  --chrome PATH          Chrome/Chromium executable (or CHROME_PATH)
  --repetitions N        CPU samples per fixture, 5..10000 (default 200)
  --warmup N             Discarded CPU iterations, 0..1000 (default 30)
  --browser-repetitions N  Fresh-context navigations, 1..30 (default 7)
  --browser-warmup N     Discarded browser navigations, 0..10 (default 1)
  --timeout-ms N         Per-navigation/browser operation limit, 1000..120000 (default 30000)
  --max-runtime-ms N     Overall deadline, 1000..900000 (default 180000)
  --help                 Show this help without launching a browser

Fixtures are generated deterministically and embedded/hashed in the JSON:
500 physical DSL card lines; 10 mutating Intent IR operations on 20 cards;
1000 browser cards on a 40-column grid, viewport 1440x900, DPR 1, zoom 1.
The browser uses an ephemeral profile/context and a loopback-only static server.
Sandbox stays enabled. Page requests outside this server are blocked; Chrome
background traffic uses a dead loopback proxy. No API keys or network APIs.

Timing: CPU operation only (validation outside the timer), nearest-rank P50/P95.
Browser navigation-start -> first seeded card fillText, then two animation-frame
callbacks with all 1000 cards in the engine's accessible outline. This is an
observable frame opportunity, NOT FCP or proof of physical screen presentation.
Load-event timing is separate. Offscreen cards are normally viewport-culled.
Fresh contexts disable HTTP cache/service workers; OS/browser-process caches may
remain warm. Static route JS bytes/gzip cover unique HTML script-src references,
not Next's build-reported First Load JS or dynamically imported chunks. Gzip is
level 9 per file, not the uncompressed server's wire transfer size. Rebuild web
first for final evidence; build/source correspondence cannot be inferred from git.
No dependencies are installed, no build is started, no timing budget is enforced.
Small browser sample counts provide coarse percentiles; compare like environments.
`

function optionsFromArgs() {
  const options = {
    output: '/tmp/cys-maintenance-baseline.json',
    outDir: path.join(root, 'apps/web/out'),
    chrome: process.env.CHROME_PATH,
    repetitions: 200,
    warmup: 30,
    browserRepetitions: 7,
    browserWarmup: 1,
    timeoutMs: 30000,
    maxRuntimeMs: 180000,
  }
  const numeric = {
    '--repetitions': ['repetitions', 5, 10000],
    '--warmup': ['warmup', 0, 1000],
    '--browser-repetitions': ['browserRepetitions', 1, 30],
    '--browser-warmup': ['browserWarmup', 0, 10],
    '--timeout-ms': ['timeoutMs', 1000, 120000],
    '--max-runtime-ms': ['maxRuntimeMs', 1000, 900000],
  }
  const strings = { '--output': 'output', '--out-dir': 'outDir', '--chrome': 'chrome' }
  const args = process.argv.slice(2)
  for (let index = 0; index < args.length; index += 1) {
    const option = args[index]
    const value = args[index + 1]
    assert(value !== undefined && !value.startsWith('--'), `Missing value for ${option}`)
    if (numeric[option]) {
      const [key, minimum, maximum] = numeric[option]
      const number = Number(value)
      assert(
        Number.isInteger(number) && number >= minimum && number <= maximum,
        `${option}: expected integer ${minimum}..${maximum}`,
      )
      options[key] = number
    } else {
      assert(strings[option], `Unknown option ${option}; use --help`)
      options[strings[option]] = path.resolve(value)
    }
    index += 1
  }
  return options
}

const sha256 = (value) => createHash('sha256').update(value).digest('hex')
const git = (...args) =>
  execFileSync('git', ['-C', root, ...args], { encoding: 'utf8', timeout: 5000 }).trim()

function sourceState() {
  const status = git('status', '--porcelain=v1', '--untracked-files=normal')
  return {
    commit: git('rev-parse', 'HEAD'),
    dirty: status.length > 0,
    status: status ? status.split('\n') : [],
    trackedDiffSha256: sha256(git('diff', 'HEAD', '--binary')),
    note: 'Git describes current sources, not necessarily the existing export. Untracked file contents are not in trackedDiffSha256.',
  }
}

function summary(samplesMs) {
  assert(samplesMs.length > 0 && samplesMs.every((value) => Number.isFinite(value) && value >= 0))
  const sorted = [...samplesMs].sort((first, second) => first - second)
  const percentile = (fraction) => sorted[Math.ceil(sorted.length * fraction) - 1]
  return {
    unit: 'ms',
    percentileMethod: 'nearest-rank',
    repetitions: samplesMs.length,
    p50: percentile(0.5),
    p95: percentile(0.95),
    min: sorted[0],
    max: sorted.at(-1),
    samplesMs,
  }
}

function measure(options, checkDeadline, operation, validate) {
  const samples = []
  for (let iteration = 0; iteration < options.warmup + options.repetitions; iteration += 1) {
    checkDeadline()
    const start = performance.now()
    const result = operation()
    const duration = performance.now() - start
    validate(result)
    if (iteration >= options.warmup) samples.push(duration)
  }
  return {
    ...summary(samples),
    warmup: options.warmup,
    validation: 'Every warmup and measured result validated outside the timer.',
  }
}

function makeFixtures() {
  const dsl = Array.from(
    { length: 500 },
    (unused, index) =>
      `[card #baseline-${index}] @pos(${(index % 25) * 280},${Math.floor(index / 25) * 180}) @size(240,120) @color(blue) @title("Baseline ${index}") @content("Deterministic offline card ${index}")`,
  ).join('\n')
  const snapshot = {
    revision: 'maintenance-baseline-v1',
    elements: Array.from({ length: 20 }, (unused, index) => ({
      id: `card:baseline-${index}`,
      kind: 'card',
      x: index * 400,
      y: 0,
      w: 200,
      h: 120,
      color: 'white',
    })),
  }
  const intent = {
    kind: 'cys-intent',
    version: 1,
    baseRevision: snapshot.revision,
    mode: 'edit',
    ops: Array.from({ length: 10 }, (unused, index) =>
      index % 2 === 0
        ? { op: 'update', target: `card:baseline-${index}`, patch: { color: 'blue', width: 220 } }
        : {
            op: 'place',
            target: `card:baseline-${index}`,
            relation: 'below',
            anchor: `card:baseline-${index - 1}`,
            gap: 48,
            align: 'start',
          },
    ),
  }
  const timestamp = '2026-01-01T00:00:00.000Z'
  const canvasId = 'maintenance-baseline-canvas'
  const cards = Array.from({ length: 1000 }, (unused, index) => ({
    id: `maintenance-card-${index}`,
    title: `B${String(index).padStart(4, '0')}`,
    body: 'Offline benchmark card',
    type: 'note',
    media: [],
    links: [],
    codeSnippets: [],
    quotes: [],
    tags: [],
    pinned: false,
    archived: false,
    deletedAt: null,
    source: { kind: 'manual', deviceId: 'maintenance-fixture' },
    capturedAt: timestamp,
    createdAt: timestamp,
    updatedAt: timestamp,
    canvasPosition: {
      canvasId,
      x: 32 + (index % 40) * 260,
      y: 32 + Math.floor(index / 40) * 140,
      w: 220,
      h: 96,
      z: index,
    },
  }))
  return { dsl, snapshot, intent, cards, canvasId, timestamp }
}

async function storageContract() {
  const files = {
    cards: 'db-client.ts',
    canvases: 'canvas-store.ts',
    views: 'canvas-view-store.ts',
  }
  const keys = {}
  for (const [name, filename] of Object.entries(files)) {
    const source = await readFile(path.join(root, 'apps/web/src/lib', filename), 'utf8')
    const match = source.match(/const STORAGE_KEY = '([^']+)'/)
    assert(match, `Cannot derive localStorage key from ${filename}`)
    keys[name] = {
      key: match[1],
      source: `apps/web/src/lib/${filename}`,
      sourceSha256: sha256(source),
    }
  }
  return keys
}

async function listFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true })
  const nested = await Promise.all(
    entries.map((entry) => {
      const filename = path.join(directory, entry.name)
      return entry.isDirectory() ? listFiles(filename) : entry.isFile() ? [filename] : []
    }),
  )
  return nested.flat().sort()
}

async function bundleBaseline(outDir, checkDeadline) {
  const files = await listFiles(outDir)
  const javascript = new Map()
  const digest = createHash('sha256')
  const routes = []
  let latestMtimeMs = 0
  for (const filename of files.filter((entry) => /\.(?:html|js)$/.test(entry))) {
    checkDeadline()
    const bytes = await readFile(filename)
    const name = path.relative(outDir, filename).split(path.sep).join('/')
    digest.update(`${name}\0${sha256(bytes)}\n`)
    latestMtimeMs = Math.max(latestMtimeMs, (await stat(filename)).mtimeMs)
    if (filename.endsWith('.js'))
      javascript.set(name, {
        file: name,
        bytes: bytes.length,
        gzipBytes: gzipSync(bytes, { level: 9 }).length,
        sha256: sha256(bytes),
      })
  }
  for (const filename of files.filter((entry) => entry.endsWith('.html'))) {
    checkDeadline()
    const html = await readFile(filename, 'utf8')
    const name = path.relative(outDir, filename).split(path.sep).join('/')
    const route = name === 'index.html' ? '/' : `/${name.replace(/index\.html$/, '')}`
    const references = [...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)]
    const sources = [
      ...new Set(
        references.flatMap((match) => {
          const source = match[1].match(/\bsrc=["']([^"']+)["']/i)?.[1]
          if (!source) return []
          const url = new URL(source.replaceAll('&amp;', '&'), `http://127.0.0.1${route}`)
          assert.equal(url.origin, 'http://127.0.0.1', `External script in ${name}`)
          return [decodeURIComponent(url.pathname).replace(/^\//, '')]
        }),
      ),
    ].sort()
    const assets = sources.map((source) => {
      assert(
        javascript.has(source),
        `Missing exported JS ${source} in ${name}; use a root-basePath export`,
      )
      return javascript.get(source)
    })
    const inline = references
      .filter(
        (match) =>
          !/\bsrc\s*=/i.test(match[1]) &&
          !/\btype=["']application\/(?:ld\+)?json["']/i.test(match[1]),
      )
      .map((match) => match[2])
    routes.push({
      route,
      html: name,
      assets,
      externalJsBytes: assets.reduce((total, asset) => total + asset.bytes, 0),
      externalJsGzipBytes: assets.reduce((total, asset) => total + asset.gzipBytes, 0),
      inlineJsBytes: inline.reduce((total, script) => total + Buffer.byteLength(script), 0),
      inlineJsGzipBytes: inline.reduce(
        (total, script) => total + gzipSync(script, { level: 9 }).length,
        0,
      ),
    })
  }
  assert(
    routes.some((route) => route.route === '/canvas/'),
    'Missing /canvas/ static export',
  )
  return {
    metric:
      'Per-route unique HTML script-src static JS bytes and sum of per-file gzip level 9 bytes; inline scripts reported separately.',
    notEquivalentTo:
      'Next build First Load JS; excludes dynamic imports, CSS, fonts and RSC payloads; includes referenced nomodule scripts.',
    timingGate: null,
    outDir,
    htmlAndJsSha256: digest.digest('hex'),
    latestHtmlOrJsMtime: new Date(latestMtimeMs).toISOString(),
    buildProvenance:
      'Existing export, not rebuilt by this script. Timestamp/hash identify artifacts but do not establish source commit.',
    allExportedJs: {
      files: javascript.size,
      bytes: [...javascript.values()].reduce((total, asset) => total + asset.bytes, 0),
      gzipBytes: [...javascript.values()].reduce((total, asset) => total + asset.gzipBytes, 0),
    },
    routes,
  }
}

async function staticServer(outDir) {
  const directory = await realpath(outDir)
  const mime = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.css': 'text/css',
    '.json': 'application/json',
    '.txt': 'text/plain',
    '.woff2': 'font/woff2',
    '.png': 'image/png',
    '.svg': 'image/svg+xml',
    '.wasm': 'application/wasm',
  }
  const failures = []
  const server = createServer(async (request, response) => {
    try {
      if (request.method !== 'GET' && request.method !== 'HEAD') {
        response.writeHead(405).end()
        return
      }
      const pathname = decodeURIComponent(new URL(request.url, 'http://127.0.0.1').pathname)
      let filename = path.resolve(directory, `.${pathname}`)
      assert(filename.startsWith(`${directory}${path.sep}`) || filename === directory)
      if ((await stat(filename)).isDirectory()) filename = path.join(filename, 'index.html')
      filename = await realpath(filename)
      assert(filename.startsWith(`${directory}${path.sep}`))
      const bytes = await readFile(filename)
      response.writeHead(200, {
        'Content-Type': mime[path.extname(filename)] ?? 'application/octet-stream',
        'Content-Length': bytes.length,
        'Cache-Control': 'no-store',
      })
      response.end(request.method === 'HEAD' ? undefined : bytes)
    } catch {
      failures.push(request.url)
      response.writeHead(404).end()
    }
  })
  await new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', resolve)
  })
  return { server, failures, origin: `http://127.0.0.1:${server.address().port}` }
}

function installBrowserProbe(payload) {
  const probe = {
    seedStartedMs: performance.now(),
    firstCardDrawMs: null,
    frameOpportunityMs: null,
    seedError: null,
  }
  window.__maintenanceBaseline = probe
  try {
    for (const [key, value] of Object.entries(payload.storage))
      localStorage.setItem(key, JSON.stringify(value))
  } catch (error) {
    probe.seedError = String(error)
  }
  probe.seedCompletedMs = performance.now()
  const original = CanvasRenderingContext2D.prototype.fillText
  CanvasRenderingContext2D.prototype.fillText = function (...args) {
    const result = original.apply(this, args)
    if (
      probe.firstCardDrawMs === null &&
      args[0] === 'B0000' &&
      this.canvas.matches('canvas[aria-describedby="canvas-accessible-summary"]')
    ) {
      probe.firstCardDrawMs = performance.now()
      const context = this
      const point = new DOMPoint(args[1], args[2]).matrixTransform(context.getTransform())
      const inspectFrame = () => {
        if (document.querySelectorAll('.canvas-a11y-outline [role="option"]').length !== 1000) {
          requestAnimationFrame(inspectFrame)
          return
        }
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            probe.frameOpportunityMs = performance.now()
            const canvas = context.canvas
            const rect = canvas.getBoundingClientRect()
            const pixels = context.getImageData(
              Math.floor(point.x),
              Math.floor(point.y),
              90,
              20,
            ).data
            let minimum = 255
            let maximum = 0
            let opaquePixels = 0
            for (let offset = 0; offset < pixels.length; offset += 4) {
              minimum = Math.min(minimum, pixels[offset], pixels[offset + 1], pixels[offset + 2])
              maximum = Math.max(maximum, pixels[offset], pixels[offset + 1], pixels[offset + 2])
              if (pixels[offset + 3] > 0) opaquePixels += 1
            }
            probe.validation = {
              engineOutlineCards: document.querySelectorAll('.canvas-a11y-outline [role="option"]')
                .length,
              canvasWidth: canvas.width,
              canvasHeight: canvas.height,
              cssWidth: rect.width,
              cssHeight: rect.height,
              firstTitlePixelRegion: {
                x: point.x,
                y: point.y,
                width: 90,
                height: 20,
                minimum,
                maximum,
                opaquePixels,
              },
            }
          })
        })
      }
      requestAnimationFrame(inspectFrame)
      CanvasRenderingContext2D.prototype.fillText = original
    }
    return result
  }
}

async function browserBaseline(options, fixture, contract, local, checkDeadline, setBrowser) {
  const candidates = options.chrome
    ? [options.chrome]
    : [
        '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
        '/usr/bin/google-chrome',
        '/usr/bin/chromium',
        '/usr/bin/chromium-browser',
      ]
  const executablePath = candidates.find((candidate) => existsSync(candidate))
  assert(
    executablePath,
    'Chrome not found; pass --chrome PATH or CHROME_PATH. No browser is downloaded.',
  )
  const browser = await puppeteer.launch({
    executablePath,
    headless: true,
    timeout: options.timeoutMs,
    protocolTimeout: options.timeoutMs,
    defaultViewport: { width: 1440, height: 900, deviceScaleFactor: 1 },
    args: [
      '--disable-background-networking',
      '--disable-component-update',
      '--disable-sync',
      '--no-default-browser-check',
      '--disable-extensions',
      '--disable-domain-reliability',
      '--metrics-recording-only',
      '--proxy-server=http://127.0.0.1:9',
      '--proxy-bypass-list=127.0.0.1;localhost;[::1]',
      '--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1',
    ],
  })
  setBrowser(browser)
  assert(
    !browser
      .process()
      .spawnargs.some((argument) => /--(?:no-sandbox|disable-setuid-sandbox)/.test(argument)),
  )
  const view = { zoom: 1, panX: 0, panY: 0, gridMode: 'free', gridSize: 8 }
  const storage = {
    [contract.cards.key]: { cards: fixture.cards },
    [contract.canvases.key]: {
      snapshot: {
        activeCanvasId: fixture.canvasId,
        canvases: [
          {
            id: fixture.canvasId,
            workspaceId: 'default',
            name: 'Maintenance baseline',
            view: { zoom: 1, pan: { x: 0, y: 0 }, gridMode: 'free', gridSize: 8 },
            createdAt: fixture.timestamp,
            updatedAt: fixture.timestamp,
          },
        ],
      },
    },
    [contract.views.key]: { views: { [fixture.canvasId]: view } },
  }
  const samples = []
  const discardedWarmup = []
  for (
    let iteration = 0;
    iteration < options.browserWarmup + options.browserRepetitions;
    iteration += 1
  ) {
    checkDeadline()
    const context = await browser.createBrowserContext()
    try {
      const page = await context.newPage()
      page.setDefaultTimeout(options.timeoutMs)
      page.setDefaultNavigationTimeout(options.timeoutMs)
      await page.setCacheEnabled(false)
      await page.setBypassServiceWorker(true)
      await page.setRequestInterception(true)
      const blockedRequests = []
      const pageErrors = []
      page.on('request', (request) => {
        const url = new URL(request.url())
        if (url.origin === local.origin || ['data:', 'blob:'].includes(url.protocol))
          void request.continue()
        else {
          blockedRequests.push(request.url())
          void request.abort('blockedbyclient')
        }
      })
      page.on('pageerror', (error) => pageErrors.push(error.message))
      await page.evaluateOnNewDocument(installBrowserProbe, { storage })
      const response = await page.goto(`${local.origin}/canvas/`, { waitUntil: 'load' })
      assert.equal(response.status(), 200)
      await page.waitForFunction(
        () =>
          window.__maintenanceBaseline?.frameOpportunityMs !== null &&
          window.__maintenanceBaseline?.validation,
      )
      const result = await page.evaluate((cardsKey) => {
        const probe = window.__maintenanceBaseline
        const navigation = performance.getEntriesByType('navigation')[0]
        const stored = JSON.parse(localStorage.getItem(cardsKey))
        const labels = [
          ...document.querySelectorAll('.canvas-a11y-outline [role="option"] > span:first-child'),
        ].map((element) => element.textContent)
        return {
          ...probe,
          loadEventEndMs: navigation.loadEventEnd,
          navigationStart: navigation.startTime,
          storedCardCount: stored.cards.length,
          uniqueStoredIds: new Set(stored.cards.map((card) => card.id)).size,
          labels,
          devicePixelRatio,
        }
      }, contract.cards.key)
      assert.equal(result.seedError, null)
      assert.equal(result.navigationStart, 0)
      assert.equal(result.devicePixelRatio, 1)
      assert.equal(result.storedCardCount, 1000)
      assert.equal(result.uniqueStoredIds, 1000)
      assert.equal(result.validation.engineOutlineCards, 1000)
      assert.deepEqual([...result.labels].sort(), fixture.cards.map((card) => card.title).sort())
      assert(
        result.validation.canvasWidth > 0 &&
          result.validation.canvasHeight > 0 &&
          result.validation.cssWidth > 0 &&
          result.validation.cssHeight > 0,
      )
      const pixels = result.validation.firstTitlePixelRegion
      assert(
        pixels.opaquePixels > 0 && pixels.maximum - pixels.minimum > 30,
        'Expected nonuniform rendered title pixels, not just a blank canvas',
      )
      assert(
        result.firstCardDrawMs > 0 &&
          result.frameOpportunityMs > result.firstCardDrawMs &&
          result.loadEventEndMs > 0,
      )
      assert.deepEqual(pageErrors, [], 'Browser runtime errors')
      assert.deepEqual(blockedRequests, [], 'Application attempted non-loopback requests')
      delete result.labels
      result.pageErrors = pageErrors
      result.blockedRequests = blockedRequests
      if (iteration < options.browserWarmup) discardedWarmup.push(result)
      else samples.push(result)
    } finally {
      await context.close()
    }
  }
  return {
    browserVersion: await browser.version(),
    executablePath,
    sandbox: 'enabled (Chromium defaults; no sandbox-disabling flags)',
    launchArguments: browser.process().spawnargs,
    metric:
      'Navigation start to first seeded-card Canvas2D fillText; frame opportunity after two requestAnimationFrame callbacks once the engine outline contains all 1000 cards. Validated nonuniform title pixels. Not FCP or a hardware presentation timestamp.',
    viewport: { width: 1440, height: 900, deviceScaleFactor: 1 },
    cache:
      'Fresh incognito context per navigation, HTTP cache disabled, service workers bypassed; shared browser process and OS caches may be warm.',
    firstSeededCardDraw: summary(samples.map((sample) => sample.firstCardDrawMs)),
    firstValidatedFrameOpportunity: summary(samples.map((sample) => sample.frameOpportunityMs)),
    loadEventEnd: summary(samples.map((sample) => sample.loadEventEndMs)),
    warmup: options.browserWarmup,
    discardedWarmup,
    samples,
  }
}

async function main() {
  if (process.argv.includes('--help')) {
    console.log(usage)
    return
  }
  const options = optionsFromArgs()
  const startedAt = new Date().toISOString()
  const started = performance.now()
  const checkDeadline = () =>
    assert(performance.now() - started < options.maxRuntimeMs, 'Overall runtime limit exceeded')
  let browser
  let local
  const watchdog = setTimeout(() => {
    process.stderr.write('Overall runtime limit exceeded; closing browser and server.\n')
    void browser?.close()
    local?.server.closeAllConnections()
    local?.server.close()
  }, options.maxRuntimeMs)
  try {
    const { parseDslWithDiagnostics } = await import('../packages/cys-dsl/src/dsl-parser.ts')
    const { compileIntent } = await import('../apps/web/src/features/ai/intent-compiler.ts')
    const fixture = makeFixtures()
    const source = sourceState()
    const sourceFiles = [
      'scripts/maintenance-baseline.mjs',
      'packages/cys-dsl/src/dsl-parser.ts',
      'packages/cys-dsl/src/dsl-parser.gen.js',
      'packages/cys-dsl/src/dsl-grammar.ts',
      'apps/web/src/features/ai/intent-compiler.ts',
      'apps/web/src/features/ai/intent-ir.ts',
      'apps/web/src/features/ai/intent-validation.ts',
      'apps/web/src/features/ai/intent-resolver.ts',
      'apps/web/src/features/ai/intent-solver.ts',
      'apps/web/src/features/ai/apply-plan.ts',
    ]
    const hashes = async () =>
      Object.fromEntries(
        await Promise.all(
          sourceFiles.map(async (filename) => [
            filename,
            sha256(await readFile(path.join(root, filename))),
          ]),
        ),
      )
    const sourceHashes = await hashes()
    const contract = await storageContract()
    const bundle = await bundleBaseline(options.outDir, checkDeadline)
    const dsl = measure(
      options,
      checkDeadline,
      () => parseDslWithDiagnostics(fixture.dsl),
      (result) => {
        assert.deepEqual(result.errors, [])
        assert.deepEqual(result.warnings, [])
        assert.equal(result.ops.length, 500)
        result.ops.forEach((operation, index) => {
          assert.equal(operation.type, 'card')
          assert.equal(operation.cardId, `baseline-${index}`)
          assert.equal(operation.x, (index % 25) * 280)
          assert.equal(operation.y, Math.floor(index / 25) * 180)
          assert.equal(operation.w, 240)
          assert.equal(operation.h, 120)
          assert.equal(operation.color, 'blue')
          assert.equal(operation.title, `Baseline ${index}`)
          assert.equal(operation.content, `Deterministic offline card ${index}`)
        })
      },
    )
    const initialSnapshot = JSON.stringify(fixture.snapshot)
    let planHash
    const intent = measure(
      options,
      checkDeadline,
      () => compileIntent(fixture.intent, fixture.snapshot),
      (result) => {
        assert(result.ok, JSON.stringify(result.diagnostics))
        assert.deepEqual(result.diagnostics, [])
        assert.equal(result.plan.ops.length, 10)
        assert(Object.isFrozen(result.plan))
        result.plan.ops.forEach((operation, index) => {
          assert.equal(operation.status, 'ready')
          assert.equal(operation.actions.length, 1)
          const action = operation.actions[0]
          const expected = fixture.snapshot.elements[index]
          assert.deepEqual(action.expected, expected)
          assert.equal(action.elementId, expected.id)
          assert.notDeepEqual(action.next, action.expected)
          assert.deepEqual(
            action.next,
            index % 2 === 0
              ? { ...expected, color: 'blue', w: 220 }
              : { ...expected, x: fixture.snapshot.elements[index - 1].x, y: 168 },
          )
        })
        assert.equal(JSON.stringify(fixture.snapshot), initialSnapshot)
        if (planHash !== undefined) assert.equal(result.plan.planHash, planHash)
        planHash = result.plan.planHash
      },
    )
    local = await staticServer(options.outDir)
    const browserResult = await browserBaseline(
      options,
      fixture,
      contract,
      local,
      checkDeadline,
      (launched) => {
        browser = launched
      },
    )
    assert.deepEqual(local.failures, [], 'Static server resource failures')
    const finalBundle = await bundleBaseline(options.outDir, checkDeadline)
    assert.equal(
      finalBundle.htmlAndJsSha256,
      bundle.htmlAndJsSha256,
      'Static export changed during benchmark; rerun after build completes',
    )
    assert.deepEqual(
      await hashes(),
      sourceHashes,
      'Benchmark/compiler/parser sources changed during measurement; rerun',
    )
    checkDeadline()
    const report = {
      schemaVersion: 1,
      status: 'ok',
      startedAt,
      completedAt: new Date().toISOString(),
      elapsedMs: performance.now() - started,
      command: 'pnpm --filter @wscytz/dsl exec tsx ../../scripts/maintenance-baseline.mjs',
      options,
      environment: {
        node: process.version,
        versions: process.versions,
        os: { platform: os.platform(), release: os.release(), arch: os.arch() },
        cpu: { model: os.cpus()[0]?.model, logicalCores: os.cpus().length },
        totalMemoryBytes: os.totalmem(),
        freeMemoryBytes: os.freemem(),
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      },
      source: { ...source, sourceHashes, end: sourceState() },
      fixtures: {
        dsl: {
          description:
            '500 physical lines, 500 positioned cards with title/body/color/size; no blank lines or comments.',
          lines: fixture.dsl.split('\n').length,
          bytes: Buffer.byteLength(fixture.dsl),
          sha256: sha256(fixture.dsl),
          text: fixture.dsl,
        },
        intent: {
          description:
            '10 mutating operations: five size/color updates and five relative placements on 20 nonoverlapping cards; exactly one changed action per operation.',
          snapshot: fixture.snapshot,
          input: fixture.intent,
          sha256: sha256(JSON.stringify({ snapshot: fixture.snapshot, input: fixture.intent })),
          validatedPlanHash: planHash,
        },
        browser: {
          description:
            '1000 note cards, 40 columns, origin (32,32), spacing (260,140), card size (220,96), zoom 1; normal viewport culling, not 1000 simultaneously visible cards.',
          count: fixture.cards.length,
          cardsSha256: sha256(JSON.stringify(fixture.cards)),
          cards: fixture.cards,
          canvasId: fixture.canvasId,
          timestamp: fixture.timestamp,
          storageContract: contract,
        },
      },
      benchmarks: {
        dslParse500Lines: dsl,
        compileIntent10MutatingOps: intent,
        canvas1000Cards: browserResult,
      },
      bundle,
      limits: {
        offline:
          'No APIs; loopback server only, external page requests aborted, background Chrome traffic routed to dead loopback proxy, DNS resolution blocked except loopback.',
        timeoutMs: options.timeoutMs,
        maxRuntimeMs: options.maxRuntimeMs,
        fixtureSizesFixed: true,
        timingThresholds: null,
        limitations: [
          'Baseline only, not an optimization or a timing gate.',
          'Browser frame opportunity is not FCP or a compositor/hardware presentation timestamp; instrumentation and validation add overhead.',
          'CPU timing excludes validation, fixture generation and module import; JIT/GC and concurrent machine load remain uncontrolled.',
          'Cold HTTP cache does not imply cold OS/browser caches; browser percentiles are coarse with few samples.',
          'Existing export may be stale relative to git; rebuild before final evidence. HTML/JS fingerprint checked unchanged across run.',
          'Static JS metric is not Next build First Load JS and omits lazy chunks from per-route totals. No universal all-route size target.',
          'Browser headless desktop fixture does not represent Tauri, mobile, physical device rendering or rich-media cards.',
        ],
      },
    }
    await writeFile(options.output, `${JSON.stringify(report, null, 2)}\n`)
    console.log(
      JSON.stringify(
        {
          artifact: options.output,
          dsl: { p50: dsl.p50, p95: dsl.p95 },
          intent: { p50: intent.p50, p95: intent.p95 },
          browser: {
            frame: browserResult.firstValidatedFrameOpportunity,
            load: browserResult.loadEventEnd,
          },
          routes: bundle.routes.map(({ route, externalJsBytes, externalJsGzipBytes }) => ({
            route,
            externalJsBytes,
            externalJsGzipBytes,
          })),
        },
        null,
        2,
      ),
    )
  } finally {
    clearTimeout(watchdog)
    try {
      await browser?.close()
    } finally {
      if (local) {
        local.server.closeAllConnections()
        await new Promise((resolve) => local.server.close(resolve))
      }
    }
  }
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
