import { describe, it, expect, beforeEach } from 'vitest'
import { scanStorageUsage } from '../storage-usage'

beforeEach(() => {
  window.localStorage.clear()
})

describe('scanStorageUsage — byte-accurate sizing (v0.37.0)', () => {
  it('counts CJK content as more bytes than its string length', async () => {
    // 6 CJK chars: string length 6, but UTF-8 = 18 bytes (3 each).
    // Pre-fix the meter used raw.length and reported 6; must report 18.
    window.localStorage.setItem('cys-stift.cards', '灵感画布测试')
    const usage = await scanStorageUsage()
    const cards = usage.byKey.find((k) => k.key === 'cys-stift.cards')
    expect(cards).toBeDefined()
    expect(cards!.bytes).toBeGreaterThan(6)
    expect(cards!.bytes).toBe(18)
    expect(usage.used).toBe(18)
  })

  it('counts base64 media data URLs at full byte length', async () => {
    // A base64 PNG-ish payload — every char is 1 UTF-8 byte, so bytes === length.
    const payload = 'data:image/png;base64,' + 'A'.repeat(1000)
    window.localStorage.setItem('cys-stift.media.x', payload)
    const usage = await scanStorageUsage()
    const media = usage.byKey.find((k) => k.key === 'cys-stift.media.x')
    expect(media!.bytes).toBe(payload.length)
  })

  it('ignores keys outside the cys-stift prefix', async () => {
    window.localStorage.setItem('some-other-app', 'x'.repeat(500))
    window.localStorage.setItem('cys-stift.cards', 'abc')
    const usage = await scanStorageUsage()
    expect(usage.byKey).toHaveLength(1)
    expect(usage.byKey[0]!.key).toBe('cys-stift.cards')
  })

  it('categorises keys by prefix', async () => {
    window.localStorage.setItem('cys-stift.cards', 'a')
    window.localStorage.setItem('cys-stift.media.x', 'b')
    window.localStorage.setItem('cys-stift.canvas.xyz', 'c')
    const usage = await scanStorageUsage()
    const cats = usage.byKey.map((k) => k.category).sort()
    expect(cats).toEqual(['canvas', 'cards', 'media'])
  })
})
