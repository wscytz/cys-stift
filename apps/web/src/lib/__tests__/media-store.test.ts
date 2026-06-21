import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mediaStore, type MediaAssetData } from '../media-store'

beforeEach(() => {
  window.localStorage.clear()
})

function fakeAsset(id: string) {
  return {
    id: `ma-${id}` as never,
    kind: 'image' as const,
    mimeType: 'image/png',
    dataUrl: 'data:image/png;base64,aGVsbG8=',
    byteSize: 100,
    createdAt: '2026-01-01T00:00:00.000Z',
    checksum: 'abc123',
  }
}

function injectAsset(a: MediaAssetData) {
  window.localStorage.setItem(
    'cys-stift.media.v1',
    JSON.stringify({ assets: { [a.id]: a } }),
  )
}

describe('mediaStore.getAsset', () => {
  it('returns null for unknown id', () => {
    expect(mediaStore.getAsset('ma-nonexistent' as never)).toBeNull()
  })
  it('returns stored asset', () => {
    const a = fakeAsset('test')
    injectAsset(a)
    const found = mediaStore.getAsset(a.id)
    expect(found).not.toBeNull()
    expect(found?.dataUrl).toBe('data:image/png;base64,aGVsbG8=')
    expect(found?.checksum).toBe('abc123')
  })
})

describe('mediaStore.remove', () => {
  it('removes a stored asset and returns null after', () => {
    const a = fakeAsset('rm')
    injectAsset(a)
    expect(mediaStore.getAsset(a.id)).not.toBeNull()
    mediaStore.remove(a.id)
    // remove() is async-enqueued — wait a tick for the write to land.
    return new Promise<void>((resolve) => setTimeout(() => resolve(), 20)).then(
      () => {
        expect(mediaStore.getAsset(a.id)).toBeNull()
      },
    )
  })
  it('does not throw for missing id', () => {
    expect(() => mediaStore.remove('ma-ghost' as never)).not.toThrow()
  })
})

describe('mediaStore — corrupt localStorage', () => {
  it('survives corrupt JSON gracefully', () => {
    window.localStorage.setItem('cys-stift.media.v1', 'not json {{{')
    expect(mediaStore.getAsset('ma-x' as never)).toBeNull()
    expect(() => mediaStore.remove('ma-x' as never)).not.toThrow()
  })
})

describe('mediaStore.attach — crypto.subtle integration', () => {
  it('creates a MediaRef with a checksum from crypto.subtle.digest', async () => {
    // jsdom does not ship crypto.subtle — stub the whole crypto global
    // via vi.stubGlobal (assignable, unlike the getter-only `crypto.subtle`).
    vi.stubGlobal('crypto', {
      subtle: {
        digest: (_algo: string, _buf: Uint8Array) =>
          Promise.resolve(new Uint8Array([0xde, 0xad, 0xbe, 0xef]).buffer as ArrayBuffer),
      },
      randomUUID: () => '00000000-0000-0000-0000-000000000000',
      getRandomValues: (arr: Uint8Array) => arr,
    })

    const file = new File(['hello'], 'hello.txt', { type: 'text/plain' })
    const ref = await mediaStore.attach(file)
    expect(ref.assetId).toEqual(expect.stringMatching(/^ma-/))
    // Verify the asset landed in localStorage.
    const asset = mediaStore.getAsset(ref.assetId)
    expect(asset).not.toBeNull()
    // The fake digest produces 4 bytes → "deadbeef" hex.
    expect(asset?.checksum).toBe('deadbeef')
    expect(asset?.kind).toBe('file')
    expect(asset?.mimeType).toBe('text/plain')
  })
})
