import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  SAMPLES_KEY,
  loadSamples,
  addSample,
  clearSamples,
  getSampleCount,
  genSampleId,
  type Sample,
  type DslSample,
  type QaSample,
} from '../sample-store'
import { DSL_VERSION } from '@cys-stift/dsl'

beforeEach(() => {
  window.localStorage.clear()
})

const dsl: Sample = {
  id: 's1',
  ts: 1000,
  source: 'ask',
  question: '整理画布',
  context: '[RAG block]',
  aiOutput: '```cys-dsl\n[card #a]\n```',
  outcome: 'applied',
  kind: 'dsl',
  targetCanvasId: 'cv-1',
}

/** retry 耗尽仍 parse 失败的样本(c2 失败采集):坏输出 + 尝试数 + 错误。 */
const dslFailed: Sample = {
  id: 'sf1',
  ts: 2000,
  source: 'ask',
  question: '把所有卡排成思维导图',
  context: '[RAG block]',
  aiOutput: '```cys-dsl\n[crad #a]\n```', // 坏 DSL(拼写错 kind)
  outcome: 'parse_failed',
  kind: 'dsl',
  attempts: 3,
  parseErrors: [{ line: 1, text: '[crad #a]', message: 'unrecognized element kind' }],
  targetCanvasId: 'cv-1',
}

describe('SAMPLES_KEY', () => {
  it('is the versioned samples key', () => {
    expect(SAMPLES_KEY).toBe('cys-stift.ai-samples.v1')
  })
})

describe('loadSamples', () => {
  it('returns empty array when key missing', () => {
    expect(loadSamples()).toEqual([])
  })
  it('round-trips samples added by addSample', () => {
    addSample(dsl, true)
    expect(loadSamples()).toEqual([{ ...dsl, dslVersion: DSL_VERSION }])
  })
  it('round-trips parse_failed 样本(attempts + parseErrors 保留 + 盖 dslVersion)', () => {
    addSample(dslFailed, true)
    const got = loadSamples()
    expect(got).toHaveLength(1)
    expect(got[0]!.kind).toBe('dsl')
    expect(got[0]!.outcome).toBe('parse_failed')
    expect((got[0] as DslSample).attempts).toBe(3)
    expect((got[0] as DslSample).parseErrors).toEqual([
      { line: 1, text: '[crad #a]', message: 'unrecognized element kind' },
    ])
    expect(got[0]!.dslVersion).toBe(DSL_VERSION)
  })
  it('returns empty on corrupt JSON', () => {
    window.localStorage.setItem(SAMPLES_KEY, '{not json')
    expect(loadSamples()).toEqual([])
  })
  it('drops non-array stored value', () => {
    window.localStorage.setItem(SAMPLES_KEY, JSON.stringify({ a: 1 }))
    expect(loadSamples()).toEqual([])
  })
})

describe('addSample', () => {
  it('returns false and does not write when enabled=false (switch off)', () => {
    expect(addSample(dsl, false)).toBe(false)
    expect(loadSamples()).toEqual([])
  })
  it('writes when enabled=true', () => {
    expect(addSample(dsl, true)).toBe(true)
    expect(getSampleCount()).toBe(1)
  })
  it('does not write before explicit consent', () => {
    expect(addSample(dsl, undefined)).toBe(false)
    expect(getSampleCount()).toBe(0)
  })
  it('caps to most recent 500', () => {
    for (let i = 0; i < 520; i++) {
      addSample({ ...dsl, id: 's' + i, ts: i }, true)
    }
    const stored = loadSamples()
    expect(stored).toHaveLength(500)
    expect(stored[0]!.id).toBe('s20') // 丢最早 20
    expect(stored[499]!.id).toBe('s519')
  })
  it('returns false (no throw) on QuotaExceededError', () => {
    const real = window.localStorage
    const stub = {
      getItem: real.getItem.bind(real),
      setItem: () => { throw new DOMException('quota', 'QuotaExceededError') },
      removeItem: real.removeItem.bind(real),
      clear: real.clear.bind(real),
      key: real.key.bind(real),
      get length() { return real.length },
    }
    Object.defineProperty(window, 'localStorage', { value: stub, configurable: true })
    try {
      expect(() => addSample(dsl, true)).not.toThrow()
      expect(addSample(dsl, true)).toBe(false)
    } finally {
      Object.defineProperty(window, 'localStorage', { value: real, configurable: true })
    }
  })
})

describe('clearSamples / getSampleCount', () => {
  it('clears the key', () => {
    addSample(dsl, true)
    expect(getSampleCount()).toBe(1)
    clearSamples()
    expect(getSampleCount()).toBe(0)
    expect(loadSamples()).toEqual([])
  })
  it('getSampleCount does not throw when absent', () => {
    expect(getSampleCount()).toBe(0)
  })
})

describe('genSampleId', () => {
  it('produces unique-ish ids', () => {
    const a = genSampleId()
    const b = genSampleId()
    expect(a).toBeTruthy()
    expect(a).not.toBe(b)
  })
})

describe('sample-store dslVersion', () => {
  it('addSample stamps dslVersion = DSL_VERSION', () => {
    const s: DslSample = {
      id: 's1', ts: 1000, source: 'ask', kind: 'dsl', outcome: 'applied',
      context: 'ctx', aiOutput: '[card #a]',
    }
    expect(addSample(s, true)).toBe(true)
    const loaded = loadSamples()
    expect(loaded[0]?.dslVersion).toBe(DSL_VERSION)
  })

  it('old sample without dslVersion loads as undefined (no backfill)', () => {
    const oldQa: QaSample = {
      id: 'old', ts: 1, source: 'ask', kind: 'qa', outcome: 'answered',
      context: 'c', aiOutput: 'a',
    }
    window.localStorage.setItem(SAMPLES_KEY, JSON.stringify([oldQa]))
    const loaded = loadSamples()
    expect(loaded[0]?.dslVersion).toBeUndefined()
  })
})

// Task 6 quota:addSample 配额失败 → notifyQuota(AppMenu toast 订阅源)
describe('sampleStore — quota (Task 6)', () => {
  let onQuotaExceeded: typeof import('../sample-store').onQuotaExceeded
  let addSample: typeof import('../sample-store').addSample
  beforeEach(async () => {
    vi.resetModules()
    window.localStorage.clear()
    onQuotaExceeded = (await import('../sample-store')).onQuotaExceeded
    addSample = (await import('../sample-store')).addSample
  })
  function simulateQuota() {
    const orig = Object.getOwnPropertyDescriptor(Storage.prototype, 'setItem')
    Object.defineProperty(Storage.prototype, 'setItem', {
      configurable: true,
      value: () => { throw new DOMException('quota', 'QuotaExceededError') },
    })
    return () => { if (orig) Object.defineProperty(Storage.prototype, 'setItem', orig) }
  }
  it('addSample 配额失败 → notifyQuota + 返 false', () => {
    const restore = simulateQuota()
    try {
      let fired = false
      const unsub = onQuotaExceeded(() => { fired = true })
      const ok = addSample(
        { id: 's1', ts: 1, kind: 'dsl', source: 'ask', context: 'c', aiOutput: 'o', outcome: 'applied' },
        true,
      )
      unsub()
      expect(ok).toBe(false)
      expect(fired).toBe(true)
    } finally {
      restore()
    }
  })
})
