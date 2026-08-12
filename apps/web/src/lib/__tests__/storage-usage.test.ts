import { describe, it, expect, beforeEach } from 'vitest'
import { scanStorageUsage, LOCAL_STORAGE_BUDGET_BYTES } from '../storage-usage'

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

// ── R16:percent/warning 按 localStorage 实际预算校准(5MB,写失败真正抛
// QuotaExceeded 的上限),而非 estimate().quota(浏览器磁盘桶,常数百 MB~GB)。
// 此前 4.8MB 实际占用只显示 0%,近满警告从不触发("存满了却不知道")。
describe('scanStorageUsage — localStorage 预算校准 (R16)', () => {
  it('percent 按 5MB 预算算:>80% → critical 警告(此前按 estimate 配额显示 0%)', async () => {
    // jsdom localStorage 同样限 5MB,用 4.2MB(84%)避开真实配额崩溃。
    const payload = 'x'.repeat(Math.round(0.84 * LOCAL_STORAGE_BUDGET_BYTES))
    window.localStorage.setItem('cys-stift.cards.v1', payload)
    const u = await scanStorageUsage()
    expect(u.total).toBe(LOCAL_STORAGE_BUDGET_BYTES)
    expect(u.percent).toBeGreaterThanOrEqual(80)
    expect(u.warning).toBe('critical')
  })

  it('60% → warn,30% → null(警告阈值按真实预算)', async () => {
    const at60 = 'x'.repeat(Math.round(0.6 * LOCAL_STORAGE_BUDGET_BYTES))
    window.localStorage.setItem('cys-stift.cards.v1', at60)
    expect((await scanStorageUsage()).warning).toBe('warn')

    window.localStorage.clear()
    const at30 = 'x'.repeat(Math.round(0.3 * LOCAL_STORAGE_BUDGET_BYTES))
    window.localStorage.setItem('cys-stift.cards.v1', at30)
    expect((await scanStorageUsage()).warning).toBeNull()
  })

  it('estimate 不可用不影响本地计量(percent 恒按预算,不再回退 total=0)', async () => {
    const oneMb = 'x'.repeat(1024 * 1024)
    window.localStorage.setItem('cys-stift.cards.v1', oneMb)
    // 不 stub navigator.storage —— 新实现不依赖 estimate,直接算。
    const u = await scanStorageUsage()
    expect(u.used).toBe(1024 * 1024)
    expect(u.total).toBe(LOCAL_STORAGE_BUDGET_BYTES)
    expect(u.percent).toBe(20)
  })
})
