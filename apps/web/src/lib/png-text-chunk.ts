'use client'

/**
 * P5.4 — pure PNG `tEXt` chunk writer/reader. Zero deps, unit-tested.
 *
 * This is the engine of the `.cystift.png` roundtrip (drawio P5-7): we stash
 * the full canvas payload (cards + tldraw snapshot + canvas meta) inside a
 * PNG `tEXt` chunk under the keyword `cystift`. Drop the PNG back onto the
 * app → we read the chunk → the canvas + cards are restored. Single-file
 * portable cards, no separate sidecar.
 *
 * PNG layout we touch:
 *   [8-byte signature]
 *   [chunks: 4B length (big-endian) | 4B type | data[len] | 4B CRC32]
 * The `tEXt` chunk data is `keyword \0 text` in Latin-1. We store the payload
 * `encodeURIComponent`-encoded first so any Unicode (CJK in card titles) is
 * ASCII-safe inside the Latin-1 chunk — same trick drawio uses for its XML.
 *
 * Reference: drawio `Editor.writeGraphModelToPng` writes `mxfile` into the
 * `tEXt` chunk; we mirror the technique with keyword `cystift`.
 */

const PNG_SIG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]

// ── CRC32 (table-based, standard PNG polynomial) ────────────────────────────
const CRC_TABLE = (() => {
  const t = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    }
    t[n] = c
  }
  return t
})()

function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff
  for (let i = 0; i < bytes.length; i++) {
    const b = bytes[i]!
    c = (CRC_TABLE[(c ^ b) & 0xff]!) ^ (c >>> 8)
  }
  return (c ^ 0xffffffff) >>> 0
}

function ascii(s: string): Uint8Array {
  const out = new Uint8Array(s.length)
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i) & 0xff
  return out
}

/** Build a PNG chunk: [length][type][data][crc]. */
function chunk(type: string, data: Uint8Array): Uint8Array {
  const typeBytes = ascii(type)
  const crcBytes = new Uint8Array(4)
  const crcInput = new Uint8Array(typeBytes.length + data.length)
  crcInput.set(typeBytes, 0)
  crcInput.set(data, typeBytes.length)
  const crc = crc32(crcInput)
  const dv = new DataView(crcBytes.buffer)
  dv.setUint32(0, crc, false) // big-endian

  const lenBytes = new Uint8Array(4)
  new DataView(lenBytes.buffer).setUint32(0, data.length, false)

  const out = new Uint8Array(12 + data.length)
  out.set(lenBytes, 0)
  out.set(typeBytes, 4)
  out.set(data, 8)
  out.set(crcBytes, 8 + data.length)
  return out
}

/** Find the byte offset of the IEND chunk's length field (chunk start). */
function iendOffset(bytes: Uint8Array): number {
  // IEND type bytes = 49 45 4E 44. Scan for the 4B type; the chunk's length
  // field starts 4 bytes before it. Bound: we need 4 bytes to read the type,
  // so i may run up to length-4.
  for (let i = 8; i <= bytes.length - 4; i++) {
    if (
      bytes[i] === 0x49 &&
      bytes[i + 1] === 0x45 &&
      bytes[i + 2] === 0x4e &&
      bytes[i + 3] === 0x44
    ) {
      return i - 4
    }
  }
  return -1
}

/**
 * Insert a `tEXt` chunk with `keyword`/`text` right before IEND. If a tEXt
 * chunk with the same keyword already exists it is NOT removed (PNG allows
 * duplicates; readers take the first match) — call once per export.
 */
export function writePngTextChunk(
  png: Uint8Array,
  keyword: string,
  text: string,
): Uint8Array {
  const data = ascii(`${keyword}\0${text}`)
  const textChunk = chunk('tEXt', data)
  const at = iendOffset(png)
  if (at < 0) {
    // Malformed — return original untouched rather than corrupting it.
    return png
  }
  const out = new Uint8Array(png.length + textChunk.length)
  out.set(png.subarray(0, at), 0)
  out.set(textChunk, at)
  out.set(png.subarray(at), at + textChunk.length)
  return out
}

/** Read the first `tEXt` chunk matching `keyword`, or null if absent. */
export function readPngTextChunk(png: Uint8Array, keyword: string): string | null {
  // Validate signature.
  for (let i = 0; i < 8; i++) {
    if (png[i] !== PNG_SIG[i]) return null
  }
  let i = 8
  while (i < png.length - 8) {
    const dv = new DataView(png.buffer, png.byteOffset + i, 8)
    const len = dv.getUint32(0, false)
    const type = String.fromCharCode(png[i + 4]!, png[i + 5]!, png[i + 6]!, png[i + 7]!)
    const dataStart = i + 8
    if (type === 'tEXt') {
      const data = png.subarray(dataStart, dataStart + len)
      // data = keyword \0 text (Latin-1)
      const nul = data.indexOf(0)
      if (nul > 0) {
        const key = latin1Decode(data.subarray(0, nul))
        if (key === keyword) {
          return latin1Decode(data.subarray(nul + 1))
        }
      }
    } else if (type === 'IEND') {
      break
    }
    i = dataStart + len + 4 // skip data + 4-byte CRC
  }
  return null
}

function latin1Decode(bytes: Uint8Array): string {
  let s = ''
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]!)
  return s
}

/** Encode a JS value into the ASCII-safe form we store in a tEXt chunk. */
export function encodePayload(value: unknown): string {
  return encodeURIComponent(JSON.stringify(value))
}

/** Decode the ASCII-safe form back into a JS value, or null on failure. */
export function decodePayload<T = unknown>(text: string): T | null {
  try {
    return JSON.parse(decodeURIComponent(text)) as T
  } catch {
    return null
  }
}
