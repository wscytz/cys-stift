import { describe, it, expect } from 'vitest'
import { PROMPTS, type AIAction } from '../prompts'

// Minimal Card-shaped object — just the fields buildUser reads.
function fakeCard(overrides: { title?: string; body?: string } = {}) {
  const title = overrides.title ?? 'Test Title'
  const body = overrides.body ?? 'Test body content.'
  return {
    title,
    body,
    tags: [] as { value: string; color: string }[],
    // Fields the prompt must NEVER include:
    source: { kind: 'manual' as const, deviceId: 'secret-device-id' },
    id: 'card-1' as string,
    type: 'note' as const,
    capturedAt: new Date('2026-06-21'),
    createdAt: new Date(),
    updatedAt: new Date(),
    pinned: false,
    archived: false,
    media: [] as { assetId: string; order: number; kind?: string }[],
    links: [] as { url: string; title?: string }[],
    codeSnippets: [] as { language: string; code: string }[],
    quotes: [] as { text: string; attribution?: string }[],
    deletedAt: undefined as Date | undefined,
    canvasPosition: undefined as { canvasId: string } | undefined,
    color: undefined as string | undefined,
  }
}

function buildsFor(action: AIAction, card: ReturnType<typeof fakeCard>) {
  return { system: PROMPTS[action].system, user: PROMPTS[action].buildUser(card as never, 'en') }
}

describe('PROMPTS (privacy lock)', () => {
  // ── Summarize ──
  const sum = buildsFor('summarize', fakeCard())
  it('summarize system is non-empty', () => { expect(sum.system.length).toBeGreaterThan(10) })
  it('summarize user includes the title', () => { expect(sum.user).toContain('Test Title') })
  it('summarize user includes the body', () => { expect(sum.user).toContain('Test body') })
  it('summarize user shows no body text when body is empty', () => {
    const u = PROMPTS.summarize.buildUser(fakeCard({ title: 'X', body: '' }) as never, 'en')
    expect(u).toContain('title: X')
    // body is empty so it won't appear or will show empty
    expect(u).not.toContain('Test body')
  })

  // ── Improve writing ──
  const rw = buildsFor('improveWriting', fakeCard())
  it('improveWriting system is non-empty', () => { expect(rw.system.length).toBeGreaterThan(10) })
  it('improveWriting user contains body', () => { expect(rw.user).toContain('Test body') })

  // ── Translate ──
  const tr = buildsFor('translate', fakeCard())
  it('translate user preserves {{LANG}} placeholder', () => {
    expect(tr.user).toContain('{{LANG}}')
  })

  // ── Privacy reverse assertions (must NOT leak sensitive fields) ──
  it.each<AIAction>(['summarize', 'improveWriting', 'translate', 'editWithInstruction'])(
    '%s prompt does NOT contain source.deviceId',
    (action) => {
      const u = PROMPTS[action].buildUser(fakeCard() as never, 'en')
      expect(u).not.toContain('secret-device-id')
    },
  )
  it.each<AIAction>(['summarize', 'improveWriting', 'translate', 'editWithInstruction'])(
    '%s prompt does NOT contain "apiKey" (the AI config)',
    (action) => {
      const u = PROMPTS[action].buildUser(fakeCard() as never, 'en')
      // The prompt templates never reference apiKey at all.
      expect(u).not.toMatch(/apiKey|api.key/i)
    },
  )

  // ── Privacy rule #3: soft-deleted cards never reach the AI ──
  // serializeCardForAI returns '' for deleted cards; the blank-card
  // fallback must NOT then hand-concat the raw title/body. v0.37.0 fix.
  it.each<AIAction>(['summarize', 'improveWriting', 'translate', 'editWithInstruction'])(
    '%s prompt is empty for a soft-deleted card (rule #3)',
    (action) => {
      const deleted = fakeCard({ title: 'Leaked Title', body: 'Leaked body' })
      deleted.deletedAt = new Date('2026-06-21')
      const u = PROMPTS[action].buildUser(deleted as never, 'en')
      expect(u).toBe('')
      expect(u).not.toContain('Leaked Title')
      expect(u).not.toContain('Leaked body')
    },
  )

  // ── Locale-aware output (Task 2) ──
  it('summarize buildUser instructs output in the zh locale', () => {
    const u = PROMPTS.summarize.buildUser(fakeCard() as never, 'zh')
    expect(u.toLowerCase()).toContain('中文')
  })
  it('summarize buildUser instructs output in the en locale', () => {
    const u = PROMPTS.summarize.buildUser(fakeCard() as never, 'en')
    expect(u.toLowerCase()).toContain('english')
  })
  it('improveWriting buildUser instructs output in the zh locale', () => {
    const u = PROMPTS.improveWriting.buildUser(fakeCard() as never, 'zh')
    expect(u.toLowerCase()).toContain('中文')
  })
  it('system prompts no longer ask the model for a "Here is" preamble', () => {
    // The tuned prompts actively forbid preamble boilerplate.
    expect(PROMPTS.summarize.system.toLowerCase()).not.toContain('here is')
    expect(PROMPTS.improveWriting.system.toLowerCase()).not.toContain('here is')
  })

  // ── editWithInstruction (v7:单卡自定义指令编辑)──
  const ewi = buildsFor('editWithInstruction', fakeCard())
  it('editWithInstruction system is non-empty + 要求只应用指令/输出全量正文', () => {
    expect(ewi.system.length).toBeGreaterThan(10)
    expect(ewi.system.toLowerCase()).toContain('instruction')
  })
  it('editWithInstruction user 携带 {{INSTRUCTION}} 占位(ai-actions 运行期替换)', () => {
    expect(ewi.user).toContain('{{INSTRUCTION}}')
  })
  it('editWithInstruction user 携带卡 title + body(经 serializeCardForAI allowlist)', () => {
    expect(ewi.user).toContain('Test Title')
    expect(ewi.user).toContain('Test body')
  })
  it('editWithInstruction 遵循 locale 输出语言', () => {
    const u = PROMPTS.editWithInstruction.buildUser(fakeCard() as never, 'zh')
    expect(u.toLowerCase()).toContain('中文')
  })
})
