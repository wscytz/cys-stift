import { describe, it, expect } from 'vitest'
import { splitEmbeds } from '../markdown'

describe('splitEmbeds', () => {
  it('splits text and embed segments', () => {
    expect(splitEmbeds('before ((嵌入)) after')).toEqual([
      { type: 'text', value: 'before ' },
      { type: 'embed', value: '嵌入' },
      { type: 'text', value: ' after' },
    ])
  })
  it('handles embed at start/end', () => {
    expect(splitEmbeds('((a)) end')).toEqual([
      { type: 'embed', value: 'a' },
      { type: 'text', value: ' end' },
    ])
  })
  it('no embeds = single text', () => {
    expect(splitEmbeds('plain')).toEqual([{ type: 'text', value: 'plain' }])
  })
  it('empty string = empty array', () => {
    expect(splitEmbeds('')).toEqual([])
  })
})
