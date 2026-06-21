import { describe, it, expect, vi } from 'vitest'
import { consumeStream } from '../providers/stream-reader'

/** Build a fake ReadableStreamDefaultReader from a list of chunks. */
function fakeReader(chunks: Uint8Array[], neverEnd = false) {
  let i = 0
  return {
    read: async () => {
      if (i < chunks.length) return { done: false, value: chunks[i++] }
      if (neverEnd) {
        // Simulate a misbehaving proxy: never resolves to done, keeps
        // dripping empty-ish bytes forever. We drip null-byte chunks.
        return { done: false, value: new Uint8Array([0x0a]) }
      }
      return { done: true, value: undefined }
    },
    cancel: vi.fn().mockResolvedValue(undefined),
  } as unknown as Parameters<typeof consumeStream>[0]
}

function enc(s: string) {
  return new TextEncoder().encode(s)
}

describe('consumeStream (v0.37.0 provider hardening)', () => {
  it('feeds all chunks to the callback and resolves on done', async () => {
    const fed: string[] = []
    await consumeStream(
      fakeReader([enc('hello '), enc('world')]),
      new TextDecoder(),
      (c) => fed.push(c),
    )
    expect(fed.join('')).toBe('hello world')
  })

  it('preserves partial work and returns cleanly on abort', async () => {
    // Abort before the loop starts: should return without reading, no throw.
    const reader = fakeReader([enc('partial')])
    const controller = new AbortController()
    controller.abort()
    const fed: string[] = []
    await expect(
      consumeStream(reader, new TextDecoder(), (c) => fed.push(c), controller.signal),
    ).resolves.toBeUndefined()
    expect(fed).toEqual([])
  })

  it('stops cleanly mid-stream when the signal aborts during read', async () => {
    const controller = new AbortController()
    let reads = 0
    const reader = {
      read: async () => {
        reads++
        if (reads === 3) controller.abort()
        return { done: reads > 5, value: enc(`chunk${reads} `) }
      },
      cancel: vi.fn().mockResolvedValue(undefined),
    } as unknown as Parameters<typeof consumeStream>[0]
    const fed: string[] = []
    // read() here never rejects (our fake doesn't honour signal), but the
    // pre-read abort check returns after the next iteration.
    await consumeStream(reader, new TextDecoder(), (c) => fed.push(c), controller.signal)
    // Should have stopped early (aborted check fires at the top of the loop).
    expect(fed.length).toBeLessThan(5)
  })

  it('does NOT swallow a real (non-abort) read error', async () => {
    const reader = {
      read: async () => {
        throw new TypeError('network gone')
      },
      cancel: vi.fn(),
    } as unknown as Parameters<typeof consumeStream>[0]
    await expect(
      consumeStream(reader, new TextDecoder(), () => {}),
    ).rejects.toThrow('network gone')
  })
})
