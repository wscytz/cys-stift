'use client'

/**
 * Safe href allowlist — the single source of truth for which URL schemes may
 * render as a clickable link. Anything else collapses to '#' so an attacker
 * (or a malformed import) can't plant `javascript:` / `data:text/html` /
 * `vbscript:` links that execute on click.
 *
 * Used by both the markdown renderer (inbox/markdown.tsx) and the typed-links
 * section of card-detail (which bypasses markdown and previously rendered
 * card.links[].url verbatim — an XSS hole for imported cards).
 */
const SAFE_HREF_PREFIXES = ['http://', 'https://', 'mailto:', 'tel:', '/']
export const MAX_SAFE_MEDIA_BYTES = 5_000_000

export function safeHref(href: string | undefined | null): string {
  if (typeof href !== 'string') return '#'
  const trimmed = href.trim()
  if (trimmed === '') return '#'
  return SAFE_HREF_PREFIXES.some((p) => trimmed.toLowerCase().startsWith(p))
    ? trimmed
    : '#'
}

/**
 * Validate that a string looks like a safe inline image data URL. We only
 * allow a small raster image MIME set — no SVG (an `<img src>` of an
 * SVG data URL can execute script in some contexts) and certainly no
 * text/html. Returns false for anything that isn't a base64 data: URL of an
 * allowed image type. Used to harden imported media assets.
 */
const SAFE_IMAGE_MIMES = new Set([
  'image/png',
  'image/jpeg',
  'image/jpg',
  'image/gif',
  'image/webp',
])

const SAFE_FILE_MIMES = new Set([
  'text/plain',
  'text/markdown',
  'text/csv',
  'application/pdf',
  'application/msword',
  'application/vnd.ms-excel',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'application/epub+zip',
])

const BASE64_DATA_URL_RE = /^data:([^;,]+);base64,([A-Za-z0-9+/]*={0,2})$/

function parseBase64DataUrl(
  value: unknown,
): { mimeType: string; byteSize: number } | null {
  if (typeof value !== 'string') return null
  const match = BASE64_DATA_URL_RE.exec(value)
  if (!match) return null
  const mimeType = match[1]?.toLowerCase()
  const base64 = match[2]
  if (!mimeType || base64 === undefined || base64.length % 4 !== 0) return null
  const padding = base64.endsWith('==') ? 2 : base64.endsWith('=') ? 1 : 0
  return { mimeType, byteSize: (base64.length * 3) / 4 - padding }
}

export function isSafeImageDataUrl(
  value: unknown,
  maxBytes = MAX_SAFE_MEDIA_BYTES,
): boolean {
  const parsed = parseBase64DataUrl(value)
  return !!parsed && SAFE_IMAGE_MIMES.has(parsed.mimeType) && parsed.byteSize <= maxBytes
}

/**
 * M2.2 — safe file data URL allowlist. Broader than isSafeImageDataUrl:
 * covers text/* + common document MIMEs so FileCaptureSink can attach
 * converted documents and raw .docx/.pdf/.xlsx files. SVG is still excluded
 * (XSS vector). 5MB hard cap (same as image — single attachment shouldn't
 * blow the localStorage budget on its own).
 */
export function isSafeFileDataUrl(
  value: unknown,
  maxBytes = MAX_SAFE_MEDIA_BYTES,
): boolean {
  const parsed = parseBase64DataUrl(value)
  return !!parsed && SAFE_FILE_MIMES.has(parsed.mimeType) && parsed.byteSize <= maxBytes
}

export function isSafeMediaDataUrl(
  value: unknown,
  kind: unknown,
  declaredMimeType: unknown,
  maxBytes = MAX_SAFE_MEDIA_BYTES,
): boolean {
  if (typeof declaredMimeType !== 'string') return false
  const parsed = parseBase64DataUrl(value)
  if (!parsed || parsed.mimeType !== declaredMimeType.toLowerCase()) return false
  if (kind === 'image') return isSafeImageDataUrl(value, maxBytes)
  if (kind === 'file') return isSafeFileDataUrl(value, maxBytes)
  return false
}

/**
 * M3 — AI settings validators. Provider id must be one of the 3 supported
 * names; model id must be a short, conservative token (preventing prompt
 * injection via a user-imported settings file from spreading into the URL
 * path or fetch body); baseUrl must be a parseable http(s) URL. All three
 * return false on non-strings / null / undefined to keep them safe to call
 * on parsed JSON without a separate type guard.
 */
export function isSafeProviderId(
  value: unknown,
): value is 'openai' | 'anthropic' | 'ollama' {
  return value === 'openai' || value === 'anthropic' || value === 'ollama'
}

export function isSafeModelId(value: unknown): boolean {
  return (
    typeof value === 'string' && /^[a-zA-Z0-9._:-]{1,64}$/.test(value)
  )
}

export function isSafeBaseUrl(value: unknown): boolean {
  if (typeof value !== 'string') return false
  try {
    const u = new URL(value)
    return u.protocol === 'https:' || u.protocol === 'http:'
  } catch {
    return false
  }
}
