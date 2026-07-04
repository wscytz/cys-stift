import { describe, it, expect, beforeEach, vi } from 'vitest'
import type { ArchivePayload } from '../archive-store'

// OPFS + localStorage mock(镜像 freeform-store 测试范式)
//
// 注:brief 原始测试代码每个 it 共用顶层 `import { archiveStore }`,
// 但 beforeEach 只 localStorage.clear() 不 vi.resetModules() →
// archive-store 的模块级 _indexCache / _version / _subs 跨 it 泄漏,
// 导致「listMeta 倒序」看到 [4,3,2,1] 而非 [2,1] 等失败。
// 镜像 canvas-freeform-store.test.ts 的范式:每 it 重新 dynamic import,
// 保证 fresh module state。同时 Test 1 直接 mock Date.now 保证严格递增
// (millisecond 粒度下连续两次 Date.now 可能同值,导致 toBeGreaterThan flake)。
function makePayload(tag: string): ArchivePayload {
  return { cards: [], mediaAssets: {}, /* 其余 optional 略 */ } as unknown as ArchivePayload
}

beforeEach(() => {
  vi.resetModules()
  localStorage.clear()
  vi.restoreAllMocks()
})

describe('archive-store CRUD', () => {
  it('append 单调递增 archiveVersion + 返回 meta', async () => {
    const { archiveStore } = await import('../archive-store')
    let now = 1_000_000
    vi.spyOn(Date, 'now').mockImplementation(() => (now += 100))
    const m1 = await archiveStore.append('manual', 'a', makePayload('1'), '0.0.0')
    const m2 = await archiveStore.append('manual', 'b', makePayload('2'), '0.0.0')
    expect(m1.archiveVersion).toBe(1)
    expect(m2.archiveVersion).toBe(2)
    expect(m2.createdAt).toBeGreaterThan(m1.createdAt)
  })

  it('listMeta 倒序(新版在前)', async () => {
    const { archiveStore } = await import('../archive-store')
    await archiveStore.append('manual', 'a', makePayload('1'), '0.0.0')
    await archiveStore.append('manual', 'b', makePayload('2'), '0.0.0')
    const list = archiveStore.listMeta()
    expect(list.map((m) => m.archiveVersion)).toEqual([2, 1])
  })

  it('loadPayload 命中 / 未知 version 返回 null', async () => {
    const { archiveStore } = await import('../archive-store')
    await archiveStore.append('manual', 'a', makePayload('1'), '0.0.0')
    const p = await archiveStore.loadPayload(1)
    expect(p?.cards).toEqual([])
    expect(await archiveStore.loadPayload(999)).toBeNull()
  })

  it('subscribe 在 append 后通知 + getVersion 递增', async () => {
    const { archiveStore } = await import('../archive-store')
    let notified = 0
    const unsub = archiveStore.subscribe(() => { notified++ })
    const v0 = archiveStore.getVersion()
    await archiveStore.append('manual', 'a', makePayload('1'), '0.0.0')
    expect(notified).toBe(1)
    expect(archiveStore.getVersion()).toBeGreaterThan(v0)
    unsub()
  })

  it('SSR 安全:window 未定义时 append/​listMeta/​loadPayload 不炸', async () => {
    // (由 typeof window 守卫覆盖;jsdom 测试环境窗口存在,此条作为契约记录)
    const { archiveStore } = await import('../archive-store')
    expect(typeof archiveStore.listMeta()).toBe('object')
  })
})

describe('archive-store retention', () => {
  it('b 类超 cap FIFO 丢旧(+ 删 payload)', async () => {
    const { archiveStore } = await import('../archive-store')
    for (let i = 0; i < 101; i++) {
      await archiveStore.append('dsl-apply', `op${i}`, makePayload(String(i)), '0.0.0')
    }
    const list = archiveStore.listMeta()
    expect(list.filter((m) => m.trigger === 'dsl-apply')).toHaveLength(100)
    // 最旧的 op0 被丢 → loadPayload(1) === null
    expect(await archiveStore.loadPayload(1)).toBeNull()
    // 最新 op100 在,archiveVersion=101
    expect(list[0]?.archiveVersion).toBe(101)
  })

  it('release / manual 永久(不计入 b cap)', async () => {
    const { archiveStore } = await import('../archive-store')
    await archiveStore.append('release', 'r0', makePayload('r'), '0.0.0')
    for (let i = 0; i < 101; i++) {
      await archiveStore.append('manual', `m${i}`, makePayload(String(i)), '0.0.0')
    }
    const list = archiveStore.listMeta()
    expect(list).toHaveLength(102) // 全留,无清扫
  })

  it('a/c 与 b 混合:只清 b,保留 a/c', async () => {
    const { archiveStore } = await import('../archive-store')
    await archiveStore.append('release', 'r', makePayload('r'), '0.0.0')
    for (let i = 0; i < 101; i++) await archiveStore.append('dsl-apply', `o${i}`, makePayload(String(i)), '0.0.0')
    await archiveStore.append('manual', 'm', makePayload('m'), '0.0.0')
    const list = archiveStore.listMeta()
    expect(list.filter((m) => m.trigger === 'release')).toHaveLength(1)
    expect(list.filter((m) => m.trigger === 'manual')).toHaveLength(1)
    expect(list.filter((m) => m.trigger === 'dsl-apply')).toHaveLength(100)
  })
})

describe('archive-store ensureReleaseRecord', () => {
  // 注:buildPayload 走回调注入 → 测试直接 mock,无需 import build-archive-payload
  function readIndexLastAppVersion(): string | null {
    const raw = window.localStorage.getItem('cys-stift.archive-index.v1')
    if (!raw) return null
    return (JSON.parse(raw) as { lastAppVersion: string | null }).lastAppVersion
  }

  it('首次(prev === null):只记 lastAppVersion,不落档', async () => {
    const { archiveStore } = await import('../archive-store')
    const buildPayload = vi.fn(async () => makePayload('first'))
    await archiveStore.ensureReleaseRecord('1.0.0', buildPayload)
    // 不调 buildPayload(首启不落档,免空 payload 浪费)
    expect(buildPayload).not.toHaveBeenCalled()
    // lastAppVersion 已记
    expect(readIndexLastAppVersion()).toBe('1.0.0')
    // 无 entry
    expect(archiveStore.listMeta()).toEqual([])
  })

  it('版本变化(prev !== cur):调 buildPayload + append release 档', async () => {
    const { archiveStore } = await import('../archive-store')
    // 先用首次调用设 baseline(不打档)
    await archiveStore.ensureReleaseRecord('1.0.0', vi.fn(async () => makePayload('first')))
    // 版本变化触发 release
    const builtPayload = makePayload('release-v2')
    const buildPayload = vi.fn(async () => builtPayload)
    await archiveStore.ensureReleaseRecord('2.0.0', buildPayload)
    expect(buildPayload).toHaveBeenCalledTimes(1)
    const list = archiveStore.listMeta()
    expect(list).toHaveLength(1)
    expect(list[0]?.trigger).toBe('release')
    expect(list[0]?.appVersion).toBe('2.0.0')
    expect(list[0]?.note).toBe('boot 1.0.0→2.0.0')
    // lastAppVersion 已更新
    expect(readIndexLastAppVersion()).toBe('2.0.0')
  })

  it('版本同(no-op):不调 buildPayload,不新增 entry', async () => {
    const { archiveStore } = await import('../archive-store')
    await archiveStore.ensureReleaseRecord('1.0.0', vi.fn(async () => makePayload('first')))
    const before = archiveStore.listMeta().length
    const buildPayload = vi.fn(async () => makePayload('same'))
    await archiveStore.ensureReleaseRecord('1.0.0', buildPayload)
    expect(buildPayload).not.toHaveBeenCalled()
    expect(archiveStore.listMeta().length).toBe(before)
  })
})
