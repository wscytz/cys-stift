import { describe, it, expect, beforeEach } from 'vitest'
import {
  SAMPLES_KEY,
  loadSamples,
  addSample,
  clearSamples,
  getSampleCount,
  genSampleId,
  type Sample,
} from '../sample-store'

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
    expect(loadSamples()).toEqual([dsl])
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
  it('writes when enabled=undefined (default on)', () => {
    expect(addSample(dsl, undefined)).toBe(true)
    expect(getSampleCount()).toBe(1)
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
