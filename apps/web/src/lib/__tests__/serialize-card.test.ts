import { describe, it, expect, beforeEach, vi } from 'vitest'
import type { Card, CardId, MediaAssetId } from '@cys-stift/domain'

// serialize-card pulls `mediaStore` from '@/lib/media-store' and calls
// mediaStore.getAsset(assetId) to resolve each MediaRef. We mock that module
// so the test owns the asset map without touching localStorage or the real
// media-store's write queue. We do NOT mock isSafeImageDataUrl — that guard
// is part of the security contract the serializer relies on, so we let it run
// for real and feed it realistic data URLs.

const assetMap = new Map<string, unknown>()

vi.mock('@/lib/media-store', () => ({
  mediaStore: {
    getAsset: (id: MediaAssetId) => assetMap.get(String(id)) ?? null,
  },
}))

let serializeCard: typeof import('../serialize-card').serializeCard

beforeEach(async () => {
  vi.resetModules()
  assetMap.clear()
  // Re-import after resetModules so the mock wires into the module closure.
  serializeCard = (await import('../serialize-card')).serializeCard
})

// ── Fixtures ────────────────────────────────────────────────────────────────

function makeCard(overrides: Partial<Card> = {}): Card {
  return {
    id: 'card-1' as unknown as CardId,
    title: 'My Card',
    body: 'hello world',
    type: 'note',
    media: [],
    links: [],
    codeSnippets: [],
    quotes: [],
    source: { kind: 'manual', deviceId: 'dev-1' },
    capturedAt: new Date('2026-06-20T08:30:00.000Z'),
    createdAt: new Date('2026-06-20T08:30:00.000Z'),
    updatedAt: new Date('2026-06-21T08:30:00.000Z'),
    tags: [],
    pinned: false,
    archived: false,
    ...overrides,
  }
}

function putImageAsset(id: string, opts: { dataUrl?: string; mimeType?: string; byteSize?: number } = {}) {
  assetMap.set(id, {
    id,
    kind: 'image',
    mimeType: opts.mimeType ?? 'image/png',
    dataUrl: opts.dataUrl ?? 'data:image/png;base64,aGVsbG8=',
    byteSize: opts.byteSize ?? 100,
    createdAt: '2026-06-20T00:00:00.000Z',
    checksum: 'abc',
  })
}

// ── Frontmatter ─────────────────────────────────────────────────────────────

describe('serializeCard — frontmatter', () => {
  it('emits the id/type/title/capturedAt/source lines fenced by ---', () => {
    const md = serializeCard(makeCard())
    expect(md).toContain('---')
    expect(md).toContain('id: card-1')
    expect(md).toContain('type: note')
    expect(md).toContain('capturedAt: 2026-06-20T08:30:00.000Z')
    expect(md).toContain('source: manual')
  })

  it('JSON-encodes the title (quotes preserved) in frontmatter', () => {
    const md = serializeCard(makeCard({ title: 'He said "hi"' }))
    expect(md).toContain('title: "He said \\"hi\\""')
  })

  it('emits `pinned: true` only when pinned', () => {
    expect(serializeCard(makeCard({ pinned: false }))).not.toContain('pinned:')
    expect(serializeCard(makeCard({ pinned: true }))).toContain('pinned: true')
  })

  it('emits `color: <token>` only when color is set', () => {
    expect(serializeCard(makeCard())).not.toMatch(/^color:/m)
    expect(serializeCard(makeCard({ color: 'red' }))).toContain('color: red')
  })
})

// ── Title heading + body ────────────────────────────────────────────────────

describe('serializeCard — title heading + body', () => {
  it('emits an H1 with the title', () => {
    const md = serializeCard(makeCard({ title: 'Title' }))
    expect(md).toContain('# Title')
  })

  it('falls back to "(无标题)" H1 when the title is empty', () => {
    const md = serializeCard(makeCard({ title: '' }))
    expect(md).toContain('# (无标题)')
  })

  it('includes the body verbatim when present', () => {
    const md = serializeCard(makeCard({ body: 'some\nmultiline\nbody' }))
    expect(md).toContain('some\nmultiline\nbody')
  })

  it('omits the body block when body is empty', () => {
    const md = serializeCard(makeCard({ body: '' }))
    // After the H1 there should be no stray body text — just the trailing
    // section boundary (no media/links/etc on this fixture).
    expect(md).not.toMatch(/# My Card\n\nsome body/)
  })
})

// ── Media section ───────────────────────────────────────────────────────────

describe('serializeCard — media section', () => {
  it('inlines a safe image data URL as a markdown image by default', () => {
    putImageAsset('ma-1')
    const card = makeCard({
      media: [{ assetId: 'ma-1' as unknown as MediaAssetId, order: 0, caption: 'a pic' }],
    })
    const md = serializeCard(card)
    expect(md).toContain('## 媒体')
    expect(md).toContain('![a pic](data:image/png;base64,aGVsbG8=)')
  })

  it('uses the asset mimeType as alt text when caption is absent', () => {
    putImageAsset('ma-1', { mimeType: 'image/jpeg' })
    const card = makeCard({
      media: [{ assetId: 'ma-1' as unknown as MediaAssetId, order: 0 }],
    })
    const md = serializeCard(card)
    expect(md).toContain('![image/jpeg](data:image/png;base64,aGVsbG8=)')
  })

  it('degrades to a text bullet when inlineImages is false', () => {
    putImageAsset('ma-1', { byteSize: 1234 })
    const card = makeCard({
      media: [{ assetId: 'ma-1' as unknown as MediaAssetId, order: 0, caption: 'cap' }],
    })
    const md = serializeCard(card, { inlineImages: false })
    expect(md).not.toMatch(/!\[/)
    expect(md).toContain('- (image/png, 1234 bytes): cap')
  })

  it('degrades to a text bullet when the data URL is unsafe (e.g. SVG)', () => {
    // SVG data URLs are rejected by isSafeImageDataUrl (XSS vector), so the
    // serializer must collapse them to a description, never inline them.
    assetMap.set('ma-svg', {
      id: 'ma-svg',
      kind: 'image',
      mimeType: 'image/svg+xml',
      dataUrl: 'data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=',
      byteSize: 50,
      createdAt: '2026-06-20T00:00:00.000Z',
      checksum: '',
    })
    const card = makeCard({
      media: [{ assetId: 'ma-svg' as unknown as MediaAssetId, order: 0, caption: 'logo' }],
    })
    const md = serializeCard(card)
    expect(md).not.toContain('data:image/svg+xml')
    expect(md).toContain('- (image/svg+xml, 50 bytes): logo')
  })

  it('degrades to a text bullet when the asset exceeds maxInlineImageBytes', () => {
    putImageAsset('ma-big', { byteSize: 999999 })
    const card = makeCard({
      media: [{ assetId: 'ma-big' as unknown as MediaAssetId, order: 0, caption: 'big' }],
    })
    // Tiny cap → the safe image guard returns false → text bullet.
    const md = serializeCard(card, { maxInlineImageBytes: 10 })
    expect(md).not.toMatch(/!\[/)
    expect(md).toContain('- (image/png, 999999 bytes): big')
  })

  it('omits the media section entirely when all refs point at missing assets', () => {
    // Bug fix: previously the serializer emitted `## 媒体` whenever
    // card.media.length > 0, THEN skipped missing assets via `continue`,
    // leaving a misleading empty `## 媒体` heading with no content. A
    // cleaned-storage export (orphan refs) must not produce a phantom
    // section. Now we collect assets first and only emit the heading when
    // at least one asset resolves.
    const card = makeCard({
      media: [
        { assetId: 'ma-missing-1' as unknown as MediaAssetId, order: 0 },
        { assetId: 'ma-missing-2' as unknown as MediaAssetId, order: 1 },
      ],
    })
    const md = serializeCard(card)
    expect(md).not.toContain('## 媒体')
    expect(md).not.toMatch(/^-\s/m) // no media bullet line
    expect(md).not.toContain('data:image')
  })

  it('emits the media heading + content when at least one asset resolves', () => {
    // Mixed: one missing ref, one present asset → the section is emitted
    // with only the present asset's bullet/image (existing behaviour,
    // must not regress).
    putImageAsset('ma-present')
    const card = makeCard({
      media: [
        { assetId: 'ma-missing' as unknown as MediaAssetId, order: 0 },
        { assetId: 'ma-present' as unknown as MediaAssetId, order: 1, caption: 'cap' },
      ],
    })
    const md = serializeCard(card)
    expect(md).toContain('## 媒体')
    expect(md).toContain('![cap](data:image/png;base64,aGVsbG8=)')
  })

  it('omits the media section entirely when the card has no media', () => {
    expect(serializeCard(makeCard())).not.toContain('## 媒体')
  })
})

// ── Links / code / quotes sections ─────────────────────────────────────────

describe('serializeCard — links section', () => {
  it('renders each link as a markdown bullet with optional description', () => {
    const card = makeCard({
      links: [
        { url: 'https://e.com/a', title: 'A', description: 'desc-a', fetchedAt: new Date('2026-06-01T00:00:00.000Z') },
        { url: 'https://e.com/b', fetchedAt: new Date('2026-06-01T00:00:00.000Z') },
      ],
    })
    const md = serializeCard(card)
    expect(md).toContain('## 链接')
    expect(md).toContain('- [A](https://e.com/a) — desc-a')
    expect(md).toContain('- [https://e.com/b](https://e.com/b)')
  })

  it('omits the links section when there are no links', () => {
    expect(serializeCard(makeCard())).not.toContain('## 链接')
  })
})

describe('serializeCard — code section', () => {
  it('fences code blocks with language and optional caption', () => {
    const card = makeCard({
      codeSnippets: [
        { language: 'ts', code: 'const x = 1', caption: 'example' },
        { language: '', code: 'plain' },
      ],
    })
    const md = serializeCard(card)
    expect(md).toContain('## 代码')
    expect(md).toContain('```ts')
    expect(md).toContain('const x = 1')
    expect(md).toContain('*example*')
    // Empty language still produces a fence (bare ```).
    expect(md).toContain('```\nplain\n```')
  })

  it('omits the code section when there are no snippets', () => {
    expect(serializeCard(makeCard())).not.toContain('## 代码')
  })
})

describe('serializeCard — quotes section', () => {
  it('renders quotes as blockquotes with attribution + sourceUrl', () => {
    const card = makeCard({
      quotes: [{ text: 'line one', attribution: 'me', sourceUrl: 'https://e.com/q' }],
    })
    const md = serializeCard(card)
    expect(md).toContain('## 引用')
    expect(md).toContain('> line one')
    expect(md).toContain('> — me')
    expect(md).toContain('> (https://e.com/q)')
  })

  it('prefixes each line of a multi-line quote with >', () => {
    const card = makeCard({ quotes: [{ text: 'a\nb\nc' }] })
    const md = serializeCard(card)
    expect(md).toContain('> a\n> b\n> c')
  })

  it('omits the quotes section when there are no quotes', () => {
    expect(serializeCard(makeCard())).not.toContain('## 引用')
  })
})

// ── Full-card integration smoke ─────────────────────────────────────────────

describe('serializeCard — integration', () => {
  it('emits all sections in order for a fully-populated card', () => {
    putImageAsset('ma-1')
    const card = makeCard({
      pinned: true,
      color: 'blue',
      media: [{ assetId: 'ma-1' as unknown as MediaAssetId, order: 0, caption: 'pic' }],
      links: [{ url: 'https://e.com', title: 'E', fetchedAt: new Date('2026-06-01T00:00:00.000Z') }],
      codeSnippets: [{ language: 'ts', code: '1+1' }],
      quotes: [{ text: 'q' }],
    })
    const md = serializeCard(card)

    const fmEnd = md.indexOf('---\n', md.indexOf('---\n') + 4) // second fence
    const mediaIdx = md.indexOf('## 媒体')
    const linksIdx = md.indexOf('## 链接')
    const codeIdx = md.indexOf('## 代码')
    const quotesIdx = md.indexOf('## 引用')

    // Sections appear in the documented order after the frontmatter.
    expect(fmEnd).toBeGreaterThan(-1)
    expect(mediaIdx).toBeGreaterThan(fmEnd)
    expect(linksIdx).toBeGreaterThan(mediaIdx)
    expect(codeIdx).toBeGreaterThan(linksIdx)
    expect(quotesIdx).toBeGreaterThan(codeIdx)
  })
})
