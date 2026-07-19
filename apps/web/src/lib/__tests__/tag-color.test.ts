import { describe, expect, it } from 'vitest'
import { solidTagBarColor, solidTagChipStyle, solidTagTextColor } from '../tag-color'

describe('tag color presentation', () => {
  it('uses white text only on dark canonical surfaces', () => {
    expect(solidTagTextColor('var(--color-red)')).toBe('var(--color-white)')
    expect(solidTagTextColor('var(--color-blue)')).toBe('var(--color-white)')
    expect(solidTagTextColor('var(--color-black)')).toBe('var(--color-white)')
    expect(solidTagTextColor('var(--color-yellow)')).toBe('var(--color-black)')
    expect(solidTagTextColor('var(--color-white)')).toBe('var(--color-black)')
    expect(solidTagTextColor('var(--color-gray)')).toBe('var(--color-white)')
  })

  it('normalizes legacy vars before returning inline chip styles', () => {
    expect(solidTagChipStyle('var(--color-purple)')).toEqual({
      background: 'var(--color-blue)',
      color: 'var(--color-white)',
    })
    expect(solidTagChipStyle('var(--color-orange)')).toEqual({
      background: 'var(--color-yellow)',
      color: 'var(--color-black)',
    })
  })

  it('keeps a white tag visible when used as a narrow grouping bar', () => {
    expect(solidTagBarColor('var(--color-white)')).toBe('var(--color-gray)')
    expect(solidTagBarColor('var(--color-teal)')).toBe('var(--color-blue)')
  })
})
