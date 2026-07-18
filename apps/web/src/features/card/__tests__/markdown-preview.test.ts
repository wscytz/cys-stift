import { describe, expect, it } from 'vitest'
import { markdownPreview } from '../markdown-preview'

describe('markdownPreview', () => {
  it('removes markdown markers while preserving readable paragraph spacing', () => {
    expect(markdownPreview('### Heading\n\n- **First**\n- [Second](https://example.com)')).toBe('Heading\nFirst\nSecond')
  })

  it('turns code fences into their useful text instead of exposing fence syntax', () => {
    expect(markdownPreview('```ts\nconst ready = true\n```')).toBe('const ready = true')
  })

  it('truncates with a single ellipsis', () => {
    expect(markdownPreview('A long piece of text', 8)).toBe('A long…')
  })
})
