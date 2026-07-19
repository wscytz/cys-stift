import { describe, expect, it } from 'vitest'
import { readableBodySnippet } from '../search-result'

describe('readableBodySnippet', () => {
  it('preserves source case and strips block Markdown from global-search excerpts', () => {
    const snippet = readableBodySnippet(
      { body: '### API Design\n\n- Keep OriginalCase\n- [x] Ship It' },
      'originalcase',
    )

    expect(snippet).toContain('API Design')
    expect(snippet).toContain('OriginalCase')
    expect(snippet).not.toContain('###')
    expect(snippet).not.toContain('- ')
    expect(snippet).not.toContain('[x]')
  })

  it('returns null when the body has no matching reader-visible text', () => {
    expect(readableBodySnippet({ body: '### Heading' }, 'missing')).toBeNull()
  })
})
