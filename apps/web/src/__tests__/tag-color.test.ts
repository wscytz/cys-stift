/**
 * Tag 文字色 a11y 守卫(纯函数测,无 DOM)。
 * 防 bug 2 回归:Tag color="black" 曾给黑字(#0a0a0a)on black-soft(#2b2b2b)= ~1.5:1 不可读。
 * 守卫锁住:black → 白字。注释里的对比声明必须有测(见 comment-claims-need-tests 规范)。
 */
import { describe, it, expect } from 'vitest'
import { tagTextColor } from '@cys-stift/ui'

describe('tagTextColor a11y 守卫', () => {
  it('black → 白字(黑底 black-soft #2b2b2b 上,#0a0a0a 不可读 → 必须 #fafafa 白)', () => {
    expect(tagTextColor('black')).toBe('var(--color-white)')
  })

  it('yellow → 黑字(yellow #ffce00 on yellow-soft #fff8dc = 1.34:1 不可读)', () => {
    expect(tagTextColor('yellow')).toBe('var(--color-black)')
  })

  it('gray → black-soft(gray #666 on gray-soft #d9d9d9 = 4.14:1 < 4.5 AA 小字)', () => {
    expect(tagTextColor('gray')).toBe('var(--color-black-soft)')
  })

  it('red/blue 原色 pass-as-is(对比足,不需覆盖)', () => {
    expect(tagTextColor('red')).toBe('var(--color-red)')
    expect(tagTextColor('blue')).toBe('var(--color-blue)')
  })
})
