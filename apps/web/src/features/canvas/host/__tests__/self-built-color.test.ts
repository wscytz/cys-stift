import { describe, it, expect, beforeEach, vi } from 'vitest'
import { colorOf } from '../self-built-render'

/**
 * colorOf 规范契约:把关系/DSL 的 color 名映射到 Bauhaus 设计 token。
 *
 * 铁律(packages/ui):6 原色 red/yellow/blue/black/white/gray,不引第七色。
 * 故这里**断言没有 green**(曾误映射,违反约束)+ grey/gray 都映射到 --color-gray
 * (修 related-to 灰色被回退成黑色的 bug)。
 *
 * 用 stub 让 readToken 直接回显 token 名(无 jsdom CSS 上下文),这样断言映射本身。
 */
beforeEach(() => {
  // getComputedStyle().getPropertyValue 回显「name 本身」,以便断言映射到哪个 token。
  vi.stubGlobal('getComputedStyle', () => ({
    getPropertyValue: (name: string) => name,
  }))
})

describe('colorOf — Bauhaus token 映射规范', () => {
  it('映射 6 原色里的 red/blue/black/gray', () => {
    expect(colorOf('red')).toBe('--color-red')
    expect(colorOf('blue')).toBe('--color-blue')
    expect(colorOf('black')).toBe('--color-black')
    expect(colorOf('gray')).toBe('--color-gray')
  })

  it('grey(英式拼写)也映射到 --color-gray(修 related-to 撞黑色 bug)', () => {
    expect(colorOf('grey')).toBe('--color-gray')
  })

  it('NOT 映射 green —— 第七色,违反 6 原色铁律,回退黑色 token', () => {
    // green 没有专属 token;映射表不含它 → 回退 --color-black。
    expect(colorOf('green')).toBe('--color-black')
  })

  it('未知颜色 / undefined 回退 --color-black', () => {
    expect(colorOf(undefined)).toBe('--color-black')
    expect(colorOf('chartreuse')).toBe('--color-black')
  })
})
