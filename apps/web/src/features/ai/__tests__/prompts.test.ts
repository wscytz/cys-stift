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
  return { system: PROMPTS[action].system, user: PROMPTS[action].buildUser(card as never) }
}

describe('PROMPTS (privacy lock)', () => {
  // ── Summarize ──
  const sum = buildsFor('summarize', fakeCard())
  it('summarize system is non-empty', () => { expect(sum.system.length).toBeGreaterThan(10) })
  it('summarize user includes the title', () => { expect(sum.user).toContain('Test Title') })
  it('summarize user includes the body', () => { expect(sum.user).toContain('Test body') })
  it('summarize user shows no body text when body is empty', () => {
    const u = PROMPTS.summarize.buildUser(fakeCard({ title: 'X', body: '' }) as never)
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
  it.each<AIAction>(['summarize', 'improveWriting', 'translate'])(
    '%s prompt does NOT contain source.deviceId',
    (action) => {
      const u = PROMPTS[action].buildUser(fakeCard())
      expect(u).not.toContain('secret-device-id')
    },
  )
  it.each<AIAction>(['summarize', 'improveWriting', 'translate'])(
    '%s prompt does NOT contain "apiKey" (the AI config)',
    (action) => {
      const u = PROMPTS[action].buildUser(fakeCard())
      // The prompt templates never reference apiKey at all.
      expect(u).not.toMatch(/apiKey|api.key/i)
    },
  )
})
