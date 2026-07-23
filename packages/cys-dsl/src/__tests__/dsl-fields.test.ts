import { describe, expect, it } from 'vitest'
import type { CanvasElement } from '@cys-stift/canvas-engine'
import { parseDsl, parseDslStrictWithDiagnostics, type DslCardOp } from '../dsl-parser'
import { serializeCanvas } from '../canvas-dsl'
import { sanitizeDslOps } from '../dsl-sanitize'
import {
  DSL_MAX_CONTENT_LEN,
  DSL_MAX_TAG_COUNT,
  DSL_MAX_LINK_COUNT,
  DSL_MAX_CODE_BLOCKS,
  DSL_MAX_QUOTES,
} from '../dsl-grammar'

/**
 * v8 卡片结构化字段专项:@type/@tags/@links/@code/@quote(media 排除)。
 * 覆盖 parse(各字段 + 转义 + URL 编解码 + 上限 + 兼容)、serialize→parse round-trip(带 resolve,
 * 含多块/多引文 cornerstone)、strict 模式(@code/@quote 可重复豁免,@tags 重复报错)、sanitize 二次防线。
 */

const card = (rest: string) => `[card #c1] @pos(10,20) @size(100,80) ${rest}`.trim()
const first = (ops: ReturnType<typeof parseDsl>) => ops[0] as DslCardOp

describe('cys-dsl v8 @type', () => {
  it('parses a valid card type', () => {
    for (const t of ['note', 'image', 'link', 'code', 'quote']) {
      expect(first(parseDsl(card(`@type(${t})`))).cardType).toBe(t)
    }
  })

  it('rejects an invalid type → undefined (does not silently become note)', () => {
    expect(first(parseDsl(card('@type(green)'))).cardType).toBeUndefined()
    expect(first(parseDsl(card('@type()'))).cardType).toBeUndefined()
  })
})

describe('cys-dsl v8 @tags', () => {
  it('parses a semicolon list of tag values', () => {
    expect(first(parseDsl(card('@tags(a;b;c)'))).tags).toEqual(['a', 'b', 'c'])
  })

  it('URL-decodes each tag value (serializer encodes to dodge ";" collisions)', () => {
    // "foo;bar" is one tag whose value contains a semicolon → encoded as foo%3Bbar
    expect(first(parseDsl(card('@tags(foo%3Bbar;baz)'))).tags).toEqual(['foo;bar', 'baz'])
  })

  it('dedupes (preserving order) and drops empties', () => {
    expect(first(parseDsl(card('@tags(a;;a;b)'))).tags).toEqual(['a', 'b'])
  })

  it('truncates to DSL_MAX_TAG_COUNT', () => {
    const many = Array.from({ length: DSL_MAX_TAG_COUNT + 5 }, (_, i) => `t${i}`).join(';')
    expect(first(parseDsl(card(`@tags(${many})`))).tags).toHaveLength(DSL_MAX_TAG_COUNT)
  })
})

describe('cys-dsl v8 @links', () => {
  it('parses URL-encoded links back to plain URLs', () => {
    const enc = encodeURIComponent('https://x.com/p?q=1&r=2')
    expect(first(parseDsl(card(`@links(${enc})`))).links).toEqual(['https://x.com/p?q=1&r=2'])
  })

  it('parses multiple links and dedupes', () => {
    const a = encodeURIComponent('https://a.com')
    const b = encodeURIComponent('https://b.com')
    expect(first(parseDsl(card(`@links(${a};${b};${a})`))).links).toEqual(['https://a.com', 'https://b.com'])
  })

  it('truncates to DSL_MAX_LINK_COUNT', () => {
    const many = Array.from({ length: DSL_MAX_LINK_COUNT + 3 }, (_, i) => encodeURIComponent(`https://x.com/${i}`)).join(';')
    expect(first(parseDsl(card(`@links(${many})`))).links).toHaveLength(DSL_MAX_LINK_COUNT)
  })
})

describe('cys-dsl v8 @code', () => {
  it('parses a 2-arg code block (lang, code)', () => {
    const op = first(parseDsl(card('@code(ts,"const a = 1")')))
    expect(op.code).toEqual([{ language: 'ts', code: 'const a = 1' }])
  })

  it('parses a 3-arg code block (lang, code, caption)', () => {
    const op = first(parseDsl(card('@code(py,"print(1)","my cap")')))
    expect(op.code).toEqual([{ language: 'py', code: 'print(1)', caption: 'my cap' }])
  })

  it('allows an empty language', () => {
    expect(first(parseDsl(card('@code(,"plain")'))).code).toEqual([{ language: '', code: 'plain' }])
  })

  it('accumulates MULTIPLE @code directives into one array (cornerstone: multi-block round-trip)', () => {
    const op = first(parseDsl(card('@code(ts,"a") @code(js,"b") @code(py,"c")')))
    expect(op.code).toEqual([
      { language: 'ts', code: 'a' },
      { language: 'js', code: 'b' },
      { language: 'py', code: 'c' },
    ])
  })

  it('decodes \\n and escaped quotes/backticks inside code', () => {
    const op = first(parseDsl(card('@code(ts,"line1\\nline2 \\"q\\" \\`bt\\`")')))
    expect(op.code?.[0]?.code).toBe('line1\nline2 "q" `bt`')
  })

  it('truncates code body to DSL_MAX_CONTENT_LEN and block count to DSL_MAX_CODE_BLOCKS', () => {
    const longCode = 'x'.repeat(DSL_MAX_CONTENT_LEN + 100)
    const op = first(parseDsl(card(`@code(ts,"${longCode}")`)))
    expect(op.code?.[0]?.code).toHaveLength(DSL_MAX_CONTENT_LEN)

    const blocks = Array.from({ length: DSL_MAX_CODE_BLOCKS + 4 }, (_, i) => `@code(ts,"b${i}")`).join(' ')
    expect(first(parseDsl(card(blocks))).code).toHaveLength(DSL_MAX_CODE_BLOCKS)
  })
})

describe('cys-dsl v8 @quote', () => {
  it('parses 1/2/3-arg quotes', () => {
    expect(first(parseDsl(card('@quote("just text")'))).quotes).toEqual([{ text: 'just text' }])
    expect(first(parseDsl(card('@quote("txt","by me")'))).quotes).toEqual([{ text: 'txt', attribution: 'by me' }])
    expect(first(parseDsl(card('@quote("txt","by me","https://s.com")'))).quotes).toEqual([
      { text: 'txt', attribution: 'by me', sourceUrl: 'https://s.com' },
    ])
  })

  it('treats an empty attribution placeholder as absent (serializer emits "" when only sourceUrl set)', () => {
    expect(first(parseDsl(card('@quote("txt","","https://s.com")'))).quotes).toEqual([
      { text: 'txt', sourceUrl: 'https://s.com' },
    ])
  })

  it('accumulates MULTIPLE @quote directives', () => {
    const op = first(parseDsl(card('@quote("a") @quote("b","x")')))
    expect(op.quotes).toEqual([{ text: 'a' }, { text: 'b', attribution: 'x' }])
  })

  it('truncates quote text and count', () => {
    const long = 'y'.repeat(DSL_MAX_CONTENT_LEN + 50)
    expect(first(parseDsl(card(`@quote("${long}")`))).quotes?.[0]?.text).toHaveLength(DSL_MAX_CONTENT_LEN)
    const many = Array.from({ length: DSL_MAX_QUOTES + 3 }, (_, i) => `@quote("q${i}")`).join(' ')
    expect(first(parseDsl(card(many))).quotes).toHaveLength(DSL_MAX_QUOTES)
  })
})

describe('cys-dsl v8 backward compat', () => {
  it('a v7 card (no v8 directives) parses with all v8 fields undefined', () => {
    const op = first(parseDsl('[card #c1] @pos(0,0) @size(10,10) @title("t") @group("g")'))
    expect(op.cardType).toBeUndefined()
    expect(op.tags).toBeUndefined()
    expect(op.links).toBeUndefined()
    expect(op.code).toBeUndefined()
    expect(op.quotes).toBeUndefined()
    expect(op.title).toBe('t')
    expect(op.group).toBe('g')
  })
})

describe('cys-dsl v8 round-trip (serialize → parse, with resolve)', () => {
  const el: CanvasElement = { id: 'c1', kind: 'card', x: 10, y: 20, w: 100, h: 80, rotation: 0, color: 'blue' }

  it('byte-equal round-trips a fully-loaded card (type/tags/links/code×N/quote×N)', () => {
    const resolve = () => ({
      title: 'My Card',
      content: 'body **md**',
      type: 'code' as const,
      tags: [{ value: 'alpha', color: 'var(--color-red)' as const }, { value: 'foo;bar', color: 'var(--color-blue)' as const }],
      links: [{ url: 'https://x.com/p?q=1&r=2', fetchedAt: new Date() }],
      codeSnippets: [
        { language: 'ts', code: 'const a = `x`\nlet b = "y"' },
        { language: 'py', code: 'print(1)', caption: 'cap' },
      ],
      quotes: [
        { text: 'q1' },
        { text: 'q2', attribution: 'by', sourceUrl: 'https://s.com' },
      ],
    })
    const text = serializeCanvas([el], resolve)
    const op = first(parseDsl(text))
    expect(op.cardType).toBe('code')
    expect(op.tags).toEqual(['alpha', 'foo;bar'])
    expect(op.links).toEqual(['https://x.com/p?q=1&r=2'])
    expect(op.code).toEqual([
      { language: 'ts', code: 'const a = `x`\nlet b = "y"' },
      { language: 'py', code: 'print(1)', caption: 'cap' },
    ])
    expect(op.quotes).toEqual([
      { text: 'q1' },
      { text: 'q2', attribution: 'by', sourceUrl: 'https://s.com' },
    ])
    // serialize is deterministic → re-serializing the parsed op's source card is identical
    expect(serializeCanvas([el], resolve)).toBe(text)
  })

  it('media is NOT serialized (an image card round-trips type only, no binary)', () => {
    const resolve = () => ({ type: 'image' as const })
    const text = serializeCanvas([el], resolve)
    expect(text).toContain('@type(image)')
    expect(text).not.toContain('media')
    expect(text).not.toContain('dataUrl')
  })

  it('empty tags/links/code/quotes emit nothing (no bare directive)', () => {
    const resolve = () => ({ type: 'note' as const, tags: [], links: [], codeSnippets: [], quotes: [] })
    const text = serializeCanvas([el], resolve)
    expect(text).not.toContain('@tags')
    expect(text).not.toContain('@links')
    expect(text).not.toContain('@code')
    expect(text).not.toContain('@quote')
    expect(text).toContain('@type(note)')
  })
})

describe('cys-dsl v8 strict mode', () => {
  it('allows REPEATED @code / @quote (repeatable directives, not duplicates)', () => {
    const { ops, errors } = parseDslStrictWithDiagnostics('[card #c1] @pos(0,0) @size(10,10) @code(ts,"a") @code(js,"b") @quote("x") @quote("y")')
    expect(errors).toEqual([])
    const op = ops[0] as DslCardOp
    expect(op.code).toHaveLength(2)
    expect(op.quotes).toHaveLength(2)
  })

  it('still rejects a duplicated single-list directive (@tags)', () => {
    const { errors } = parseDslStrictWithDiagnostics('[card #c1] @pos(0,0) @size(10,10) @tags(a) @tags(b)')
    expect(errors.some((e) => e.message.includes('duplicate tags'))).toBe(true)
  })

  it('accepts all v8 directives together on one line with no residual', () => {
    const line = `[card #c1] @pos(0,0) @size(10,10) @type(link) @tags(a;b) @links(${encodeURIComponent('https://x.com')}) @code(ts,"z") @quote("q")`
    const { ops, errors } = parseDslStrictWithDiagnostics(line)
    expect(errors).toEqual([])
    expect(ops).toHaveLength(1)
  })
})

describe('cys-dsl v8 sanitize (second line of defense)', () => {
  it('truncates over-long tag/link/code/quote counts on programmatically-built ops', () => {
    const op = {
      type: 'card',
      cardId: 'c1',
      x: 0,
      y: 0,
      tags: Array.from({ length: DSL_MAX_TAG_COUNT + 5 }, (_, i) => `t${i}`),
      links: Array.from({ length: DSL_MAX_LINK_COUNT + 5 }, (_, i) => `https://x.com/${i}`),
      code: Array.from({ length: DSL_MAX_CODE_BLOCKS + 5 }, (_, i) => ({ language: 'ts', code: `c${i}` })),
      quotes: Array.from({ length: DSL_MAX_QUOTES + 5 }, (_, i) => ({ text: `q${i}` })),
    } as never
    const { ops } = sanitizeDslOps([op])
    const out = ops[0] as DslCardOp
    expect(out.tags).toHaveLength(DSL_MAX_TAG_COUNT)
    expect(out.links).toHaveLength(DSL_MAX_LINK_COUNT)
    expect(out.code).toHaveLength(DSL_MAX_CODE_BLOCKS)
    expect(out.quotes).toHaveLength(DSL_MAX_QUOTES)
  })

  it('drops an invalid card type on a programmatically-built op', () => {
    const op = { type: 'card', cardId: 'c1', x: 0, y: 0, cardType: 'bogus' } as never
    const { ops } = sanitizeDslOps([op])
    expect((ops[0] as DslCardOp).cardType).toBeUndefined()
  })

  it('is reference-stable on compliant input (no needless copy)', () => {
    const code = [{ language: 'ts', code: 'ok' }]
    const op = { type: 'card', cardId: 'c1', x: 0, y: 0, cardType: 'code', tags: ['a'], code } as never
    const { ops } = sanitizeDslOps([op])
    expect(ops[0]).toBe(op) // 完全合规 → 同一引用
  })
})
