import { describe, it, expect } from 'vitest'
import {
  writePngTextChunk,
  readPngTextChunk,
  encodePayload,
  decodePayload,
} from '../png-text-chunk'

/** Build a structurally minimal PNG: signature + IEND. Our reader validates
 *  only the signature; our writer inserts before IEND. No IHDR/IDAT needed
 *  to exercise the tEXt logic (a real decoder would reject this, but we're
 *  testing OUR chunk code, not a PNG decoder). */
function minimalPng(): Uint8Array {
  // PNG signature
  const sig = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]
  // IEND chunk: length=0, type="IEND", CRC=crc32("IEND")=0xAE426082
  const iend = [
    0x00, 0x00, 0x00, 0x00, // length 0
    0x49, 0x45, 0x4e, 0x44, // "IEND"
    0xae, 0x42, 0x60, 0x82, // CRC
  ]
  return new Uint8Array([...sig, ...iend])
}

describe('png-text-chunk roundtrip', () => {
  it('write then read preserves keyword + text', () => {
    const png = writePngTextChunk(minimalPng(), 'cystift', 'hello-world')
    expect(readPngTextChunk(png, 'cystift')).toBe('hello-world')
  })

  it('returns null when the keyword is absent', () => {
    const png = writePngTextChunk(minimalPng(), 'cystift', 'data')
    expect(readPngTextChunk(png, 'other')).toBeNull()
  })

  it('returns null for bytes that are not a PNG', () => {
    expect(readPngTextChunk(new Uint8Array([1, 2, 3, 4]), 'cystift')).toBeNull()
  })

  it('returns null when no tEXt chunk exists', () => {
    expect(readPngTextChunk(minimalPng(), 'cystift')).toBeNull()
  })

  it('the inserted chunk sits before IEND (PNG stays well-formed)', () => {
    const png = writePngTextChunk(minimalPng(), 'cystift', 'x')
    // The file grew by one chunk (12-byte header + data).
    expect(png.length).toBeGreaterThan(minimalPng().length)
    // IEND type bytes still present at the tail (last 8 bytes: type+CRC,
    // preceded by 4-byte zero length).
    const tail = png.subarray(png.length - 8)
    expect(String.fromCharCode(tail[0], tail[1], tail[2], tail[3])).toBe('IEND')
  })
})

describe('payload encode/decode (Unicode-safe via the tEXt chunk)', () => {
  it('round-trips an object with CJK characters', () => {
    const payload = { title: '灵感画布', n: 3, nested: { ok: true } }
    const encoded = encodePayload(payload)
    // Encoded form is ASCII-safe (safe inside a Latin-1 tEXt chunk).
    expect(() => encodeURIComponent(encoded)).not.toThrow()
    const png = writePngTextChunk(minimalPng(), 'cystift', encoded)
    const back = decodePayload(readPngTextChunk(png, 'cystift'))
    expect(back).toEqual(payload)
  })

  it('decodePayload returns null on garbage', () => {
    expect(decodePayload('%%%not valid%%%')).toBeNull()
  })

  it('survives a full PNG roundtrip with a large-ish payload', () => {
    const payload = { cards: Array.from({ length: 50 }, (_, i) => ({ id: i, t: `卡${i}` })) }
    const png = writePngTextChunk(minimalPng(), 'cystift', encodePayload(payload))
    const back = decodePayload<{ cards: { id: number }[] }>(
      readPngTextChunk(png, 'cystift') ?? '',
    )
    expect(back?.cards.length).toBe(50)
    expect(back?.cards[49].id).toBe(49)
  })
})
