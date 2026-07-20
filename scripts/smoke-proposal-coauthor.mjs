import puppeteer from 'puppeteer-core'

const baseUrl = process.env.CYS_STIFT_BASE_URL ?? 'http://127.0.0.1:3012'
const executablePath = process.env.CHROME_PATH ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'

function card(id, title, x, z) {
  const time = '2026-07-20T00:00:00.000Z'
  return {
    id, title, body: `${title} body`, type: 'note', media: [], links: [], codeSnippets: [], quotes: [],
    source: { kind: 'manual', deviceId: 'browser-smoke' }, capturedAt: time, createdAt: time, updatedAt: time,
    canvasPosition: { canvasId: 'default-canvas', x, y: 80, w: 240, h: 120, z }, tags: [], pinned: false, archived: false,
  }
}

const settings = {
  settings: {
    captureShortcut: { modKey: 'meta', shift: true, code: 'KeyE' }, theme: 'system', locale: 'zh',
    profiles: [{ id: 'proposal-smoke', name: 'Proposal smoke', provider: 'openai', apiKey: 'local-smoke', baseUrl: 'http://127.0.0.1:65534/v1', model: 'fixture', enabled: true }],
    activeProfileId: 'proposal-smoke', seenCaptureHint: true, export: { includeDeleted: true },
    labs: { proposalCoauthorLab: true },
  },
}

function providerPayload(requestBody) {
  const user = requestBody.messages?.find((message) => message.role === 'user')?.content ?? ''
  const match = user.match(/<untrusted-source-records>([\s\S]*?)<\/untrusted-source-records>/)
  const records = match ? JSON.parse(match[1]) : []
  const byEntity = new Map(records.map((record) => [record.entityId, record]))
  const ids = [...byEntity.keys()].sort()
  const first = byEntity.get(ids[0])
  const second = byEntity.get(ids[1])
  if (!first || !second) throw new Error('Provider smoke could not read two bounded source records')
  return {
    kind: 'cys-proposal-payload', version: 1, task: 'plan-structure-audit', summary: 'Browser-smoke proposal.', findings: [],
    items: [
      { itemId: 'logic', lane: 'semantic', evidence: [{ refId: first.refId, role: 'targets' }], dependsOn: [], conflictsWith: [], reason: 'Connect the selected steps.', action: { type: 'relation.add', from: first.entityId, to: second.entityId, relation: 'blocks' } },
      { itemId: 'idea', lane: 'idea', evidence: [{ refId: first.refId, role: 'inspired-by' }], dependsOn: ['logic'], conflictsWith: [], reason: 'Add a non-factual follow-up.', candidate: { title: 'Verify the handoff', body: 'What evidence marks this handoff complete?', promptedByRefIds: [first.refId] } },
      { itemId: 'layout', lane: 'layout', evidence: [{ refId: first.refId, role: 'targets' }], dependsOn: ['logic'], conflictsWith: [], reason: 'Align the selected steps.', intent: { mode: 'layout', ops: [{ op: 'align', targets: [first.entityId, second.entityId], axis: 'top' }] } },
    ],
  }
}

async function clickButton(page, text) {
  await page.bringToFront()
  let handle
  try {
    handle = await page.waitForFunction((label) => {
      const normalize = (value) => value.replace(/\s+/g, '')
      const expected = normalize(label)
      return [...document.querySelectorAll('button')].find((button) => (
        normalize(button.textContent ?? '').includes(expected) || normalize(button.getAttribute('aria-label') ?? '').includes(expected)
      ) && !button.disabled)
    }, { timeout: 8_000 }, text)
  } catch (error) {
    const state = await page.evaluate(() => ({
      body: document.body.innerText.replace(/\s+/g, ' ').slice(-4_000),
      buttons: [...document.querySelectorAll('button')].map((button) => ({ text: (button.textContent ?? '').trim(), label: button.getAttribute('aria-label'), disabled: button.disabled })).filter((button) => button.text || button.label),
    }))
    throw new Error(`Button not available: ${text}. State: ${JSON.stringify(state)}`, { cause: error })
  }
  const element = handle.asElement()
  if (!element) throw new Error(`Button not found: ${text}`)
  await element.click()
  await handle.dispose()
}

async function waitForText(page, text) {
  try {
    await page.waitForFunction((value) => document.body.textContent?.includes(value), { timeout: 15_000 }, text)
  } catch {
    const body = await page.evaluate(() => document.body.innerText.replace(/\s+/g, ' ').slice(-4_000))
    throw new Error(`Missing page text "${text}". Current body: ${body}`)
  }
}

async function waitForAcceptedDecision(page, lane) {
  await page.bringToFront()
  await clickButton(page, lane)
  const deadline = Date.now() + 15_000
  while (Date.now() < deadline) {
    const accepted = await page.evaluate(() => [...document.querySelectorAll('.cv-proposal-review [role="tabpanel"] span')].some((node) => node.textContent?.trim() === 'accepted'))
    if (accepted) return
    await new Promise((resolve) => setTimeout(resolve, 100))
  }
  const debug = await page.evaluate(() => ({
    review: document.querySelector('.cv-proposal-review')?.innerHTML.slice(-3_000),
    spans: [...document.querySelectorAll('span')].map((node) => node.textContent?.trim()).filter(Boolean).slice(-30),
  }))
  throw new Error(`Accepted decision did not sync: ${JSON.stringify(debug)}`)
}

async function runJourney(browser, viewport) {
  console.log(`smoke: journey ${viewport.width}x${viewport.height} start`)
  const page = await browser.newPage()
  await page.setViewport(viewport)
  const errors = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.setRequestInterception(true)
  page.on('request', async (request) => {
    if (!request.url().startsWith('http://127.0.0.1:65534/')) return request.continue()
    if (request.method() === 'OPTIONS') {
      return request.respond({
        status: 204,
        headers: {
          'access-control-allow-origin': '*',
          'access-control-allow-methods': 'POST, OPTIONS',
          'access-control-allow-headers': 'authorization, content-type',
        },
      })
    }
    try {
      const payload = providerPayload(JSON.parse(request.postData() ?? '{}'))
      const chunks = [
        `data: ${JSON.stringify({ choices: [{ delta: { content: JSON.stringify(payload) }, finish_reason: null }] })}\n\n`,
        `data: ${JSON.stringify({ choices: [{ delta: {}, finish_reason: 'stop' }] })}\n\n`,
        'data: [DONE]\n\n',
      ].join('')
      await request.respond({ status: 200, contentType: 'text/event-stream', headers: { 'access-control-allow-origin': '*' }, body: chunks })
    } catch (error) {
      await request.respond({ status: 500, contentType: 'text/plain', body: String(error) })
    }
  })

  await page.goto(`${baseUrl}/canvas/`, { waitUntil: 'networkidle0' })
  await page.evaluate((seed) => {
    localStorage.clear()
    localStorage.setItem('cys-stift.settings.v2', JSON.stringify(seed.settings))
    localStorage.setItem('cys-stift.cards.v1', JSON.stringify(seed.cards))
  }, { settings, cards: { cards: [card('smoke-a', 'Define scope', 48, 1), card('smoke-b', 'Verify release', 336, 2)] } })
  await page.reload({ waitUntil: 'networkidle0' })
  await page.waitForSelector('canvas[aria-label]')
  await page.waitForFunction(() => document.querySelectorAll('.canvas-a11y-outline__option').length === 2)

  await page.focus('canvas[aria-label]')
  await page.keyboard.down(process.platform === 'darwin' ? 'Meta' : 'Control')
  await page.keyboard.press('a')
  await page.keyboard.up(process.platform === 'darwin' ? 'Meta' : 'Control')
  await clickButton(page, 'AI 工作流')
  await clickButton(page, '审计计划结构')
  await waitForText(page, '确认审计范围')
  await clickButton(page, '生成审计提议')
  await waitForText(page, '审计发现')
  await waitForText(page, 'Orphan step')

  await clickButton(page, '接受')
  await clickButton(page, '想法')
  await clickButton(page, '接受')
  await clickButton(page, '布局')
  await clickButton(page, '接受')
  await clickButton(page, '预览已接受项')
  await waitForText(page, '预览将更改')
  const originalCards = await page.evaluate(() => localStorage.getItem('cys-stift.cards.v1'))
  await page.evaluate(() => {
    const parsed = JSON.parse(localStorage.getItem('cys-stift.cards.v1') ?? '{"cards":[]}')
    for (const item of parsed.cards) { item.title = `${item.title} changed`; item.body = `${item.body} changed` }
    const next = JSON.stringify(parsed)
    const oldValue = localStorage.getItem('cys-stift.cards.v1')
    localStorage.setItem('cys-stift.cards.v1', next)
    window.dispatchEvent(new StorageEvent('storage', { key: 'cys-stift.cards.v1', oldValue, newValue: next }))
  })
  await new Promise((resolve) => setTimeout(resolve, 100))
  await clickButton(page, '应用此预览')
  await waitForText(page, 'Accepted evidence changed')
  await page.evaluate((raw) => {
    if (!raw) return
    const oldValue = localStorage.getItem('cys-stift.cards.v1')
    localStorage.setItem('cys-stift.cards.v1', raw)
    window.dispatchEvent(new StorageEvent('storage', { key: 'cys-stift.cards.v1', oldValue, newValue: raw }))
  }, originalCards)
  await new Promise((resolve) => setTimeout(resolve, 100))
  await clickButton(page, '应用此预览')
  await waitForText(page, '提交凭据')

  const committed = await page.evaluate(() => ({
    cards: JSON.parse(localStorage.getItem('cys-stift.cards.v1') ?? '{"cards":[]}').cards.length,
    receipts: Object.keys(localStorage).filter((key) => key.startsWith('cys-stift.proposal-receipt.')).length,
  }))
  if (committed.cards !== 3 || committed.receipts !== 1) throw new Error(`Unexpected committed state: ${JSON.stringify(committed)}`)
  await clickButton(page, '撤销本次提议')
  await page.waitForFunction(() => !document.body.textContent?.includes('提交凭据'))
  const undoneCards = await page.evaluate(() => JSON.parse(localStorage.getItem('cys-stift.cards.v1') ?? '{"cards":[]}').cards.length)
  if (undoneCards !== 2) throw new Error(`Undo left ${undoneCards} cards instead of 2`)
  if (errors.length) throw new Error(`Browser console page errors: ${errors.join(' | ')}`)
  await page.close()
  console.log(`smoke: journey ${viewport.width}x${viewport.height} passed`)
}

async function runCrossTabJourney(browser) {
  console.log('smoke: cross-tab journey start')
  const first = await browser.newPage()
  const second = await browser.newPage()
  const errors = []
  for (const page of [first, second]) {
    page.on('pageerror', (error) => errors.push(error.message))
    await page.setRequestInterception(true)
    page.on('request', async (request) => {
      if (!request.url().startsWith('http://127.0.0.1:65534/')) return request.continue()
      if (request.method() === 'OPTIONS') return request.respond({ status: 204, headers: { 'access-control-allow-origin': '*', 'access-control-allow-methods': 'POST, OPTIONS', 'access-control-allow-headers': 'authorization, content-type' } })
      try {
        const payload = providerPayload(JSON.parse(request.postData() ?? '{}'))
        const chunks = [
          `data: ${JSON.stringify({ choices: [{ delta: { content: JSON.stringify(payload) }, finish_reason: null }] })}\n\n`,
          `data: ${JSON.stringify({ choices: [{ delta: {}, finish_reason: 'stop' }] })}\n\n`,
          'data: [DONE]\n\n',
        ].join('')
        await request.respond({ status: 200, contentType: 'text/event-stream', headers: { 'access-control-allow-origin': '*' }, body: chunks })
      } catch (error) { await request.respond({ status: 500, contentType: 'text/plain', body: String(error) }) }
    })
  }

  await first.bringToFront()
  await first.goto(`${baseUrl}/canvas/`, { waitUntil: 'networkidle0' })
  console.log('smoke: cross-tab first page loaded')
  await first.evaluate((seed) => {
    localStorage.clear()
    localStorage.setItem('cys-stift.settings.v2', JSON.stringify(seed.settings))
    localStorage.setItem('cys-stift.cards.v1', JSON.stringify(seed.cards))
  }, { settings, cards: { cards: [card('smoke-a', 'Define scope', 48, 1), card('smoke-b', 'Verify release', 336, 2)] } })
  await first.reload({ waitUntil: 'networkidle0' })
  console.log('smoke: cross-tab first page seeded')
  await first.waitForSelector('canvas[aria-label]')
  console.log('smoke: cross-tab first canvas ready')
  await first.waitForFunction(() => document.querySelectorAll('.canvas-a11y-outline__option').length === 2)
  console.log('smoke: cross-tab first outline ready')
  await first.focus('canvas[aria-label]')
  await first.keyboard.down(process.platform === 'darwin' ? 'Meta' : 'Control')
  await first.keyboard.press('a')
  await first.keyboard.up(process.platform === 'darwin' ? 'Meta' : 'Control')
  console.log('smoke: cross-tab first selection ready')
  await clickButton(first, 'AI 工作流')
  console.log('smoke: cross-tab workflow menu opened')
  await clickButton(first, '审计计划结构')
  console.log('smoke: cross-tab audit scope opened')
  await waitForText(first, '确认审计范围')
  await clickButton(first, '生成审计提议')
  await waitForText(first, '审计发现')
  console.log('smoke: cross-tab first proposal generated')

  // A second real page resumes the persisted review and receives decisions via
  // the storage subscription rather than being reloaded manually.
  await second.bringToFront()
  await second.goto(`${baseUrl}/canvas/`, { waitUntil: 'networkidle0' })
  console.log('smoke: cross-tab second page loaded')
  await second.waitForSelector('canvas[aria-label]')
  console.log('smoke: cross-tab second canvas ready')
  await waitForText(second, '审计发现')
  console.log('smoke: cross-tab review resumed')
  await first.bringToFront()
  await clickButton(first, '接受')
  console.log('smoke: cross-tab first logic accepted')
  await waitForAcceptedDecision(second, '逻辑')
  console.log('smoke: cross-tab second observed logic accepted')
  await second.bringToFront()
  await clickButton(second, '想法')
  await clickButton(second, '接受')
  console.log('smoke: cross-tab second idea accepted')
  await waitForAcceptedDecision(first, '想法')
  console.log('smoke: cross-tab first observed idea accepted')
  await first.bringToFront()
  await clickButton(first, '布局')
  await clickButton(first, '接受')
  console.log('smoke: cross-tab first layout accepted')
  await waitForAcceptedDecision(second, '布局')
  console.log('smoke: cross-tab second observed layout accepted')

  // Both pages compile their own immutable preview from the merged review.
  await clickButton(first, '预览已接受项')
  await second.bringToFront()
  await clickButton(second, '预览已接受项')
  await waitForText(first, '预览将更改')
  await waitForText(second, '预览将更改')
  console.log('smoke: cross-tab previews ready')
  const previewStates = await Promise.all([first, second].map(async (page) => page.evaluate(async () => {
    const index = JSON.parse(localStorage.getItem('cys-stift.proposal.index.v1') ?? '{"entries":[]}')
    const proposalId = index.entries[0]?.proposalId
    let review = null
    try {
      const root = await navigator.storage.getDirectory(); const dir = await root.getDirectoryHandle('cys-stift')
      const file = await dir.getFileHandle(`proposal-payload.${proposalId}.v1`)
      review = JSON.parse(await (await file.getFile()).text()).review
    } catch {}
    const body = document.querySelector('.cv-proposal-review')?.textContent ?? ''
    const previewSummary = [...document.querySelectorAll('.cv-proposal-review p')]
      .find((node) => node.textContent?.includes('预览将更改'))?.textContent ?? null
    return { hasPreview: body.includes('预览将更改'), previewSummary, review, body: body.slice(-500) }
  })))
  console.log('smoke: cross-tab preview states', previewStates)
  if (!previewStates.every((state) => state.hasPreview)) throw new Error('Cross-tab preview disappeared before Apply')
  if (new Set(previewStates.map((state) => state.previewSummary)).size !== 1) {
    throw new Error(`Cross-tab compilers produced different immutable previews: ${JSON.stringify(previewStates.map((state) => state.previewSummary))}`)
  }

  const proposalId = await first.evaluate(() => {
    const index = JSON.parse(localStorage.getItem('cys-stift.proposal.index.v1') ?? '{"entries":[]}')
    return index.entries.find((entry) => entry.state === 'reviewing' || entry.state === 'committing')?.proposalId
  })
  if (!proposalId) throw new Error('Cross-tab smoke could not find proposal id')
  const lockName = `cys-stift.proposal.commit.${proposalId}`
  await first.evaluate((name) => {
    window.__crossTabRelease = null
    window.__crossTabLockHeld = false
    void navigator.locks.request(name, { mode: 'exclusive' }, async () => {
      window.__crossTabLockHeld = true
      await new Promise((resolve) => { window.__crossTabRelease = resolve })
    })
  }, lockName)
  const lockDeadline = Date.now() + 15_000
  while (Date.now() < lockDeadline) {
    if (await first.evaluate(() => window.__crossTabLockHeld === true)) break
    await new Promise((resolve) => setTimeout(resolve, 100))
  }
  if (!await first.evaluate(() => window.__crossTabLockHeld === true)) throw new Error('Cross-tab smoke could not acquire the synthetic commit lock')
  await clickButton(second, '应用此预览')
  await waitForText(second, 'Apply is already running in another tab')
  console.log('smoke: cross-tab commit lock rejected competing Apply')
  await first.evaluate(() => window.__crossTabRelease?.())
  await clickButton(second, '应用此预览')
  await waitForText(second, '提交凭据')
  console.log('smoke: cross-tab Apply committed')
  const committed = await second.evaluate(() => ({
    cards: JSON.parse(localStorage.getItem('cys-stift.cards.v1') ?? '{"cards":[]}').cards.length,
    receipts: Object.keys(localStorage).filter((key) => key.startsWith('cys-stift.proposal-receipt.')).length,
  }))
  if (committed.cards !== 3 || committed.receipts !== 1) throw new Error(`Unexpected cross-tab commit: ${JSON.stringify(committed)}`)
  await clickButton(second, '撤销本次提议')
  await second.waitForFunction(() => !document.body.textContent?.includes('提交凭据'))
  const undone = await second.evaluate(() => JSON.parse(localStorage.getItem('cys-stift.cards.v1') ?? '{"cards":[]}').cards.length)
  if (undone !== 2) throw new Error(`Cross-tab undo left ${undone} cards instead of 2`)
  if (errors.length) throw new Error(`Cross-tab browser page errors: ${errors.join(' | ')}`)
  await first.close()
  await second.close()
  console.log('smoke: cross-tab journey passed')
}

const browser = await puppeteer.launch({ executablePath, headless: true, args: ['--no-sandbox'] })
try {
  const mode = process.env.CYS_STIFT_SMOKE_MODE ?? 'all'
  if (mode !== 'cross-tab') {
    await runJourney(browser, { width: 1440, height: 960, deviceScaleFactor: 1 })
    await runJourney(browser, { width: 390, height: 844, deviceScaleFactor: 1 })
  }
  if (mode !== 'journeys') await runCrossTabJourney(browser)
  console.log(`Proposal coauthor browser smoke passed (${mode}): desktop + 390px, two-tab review lock, Apply + Undo`)
} catch (error) {
  console.error('Proposal coauthor browser smoke failed:', error)
  throw error
} finally {
  let closeTimer
  await Promise.race([
    browser.close(),
    new Promise((resolve) => {
      closeTimer = setTimeout(() => {
        browser.process()?.kill('SIGKILL')
        resolve()
      }, 5_000)
    }),
  ])
  if (closeTimer) clearTimeout(closeTimer)
}
