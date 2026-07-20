import type { WorkingSetGeometryV1, WorkingSetRelationIssueV1, WorkingSetRelationV1, WorkingSetRevisionV1 } from './working-set-types'

function canonicalize(value: unknown): string {
  if (value === undefined) return 'null'
  if (value instanceof Date) return JSON.stringify(value.toISOString())
  if (value === null || typeof value === 'boolean' || typeof value === 'number') return JSON.stringify(value)
  if (typeof value === 'string') return JSON.stringify(value)
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(',')}]`
  if (typeof value === 'object') {
    const record = value as Record<string, unknown>
    return `{${Object.keys(record).filter((key) => record[key] !== undefined).sort().map((key) => `${JSON.stringify(key)}:${canonicalize(record[key])}`).join(',')}}`
  }
  throw new Error(`Unsupported canonical value: ${typeof value}`)
}

/** Stable JSON bytes used for every Working Set digest. */
export function canonicalJson(value: unknown): string {
  return canonicalize(value)
}

/** SHA-256 only. A missing Web Crypto implementation is a hard failure: a
 * weaker fallback could falsely permit an old proposal to apply. */
export async function sha256Hex(value: string): Promise<string> {
  if (!globalThis.crypto?.subtle) throw new Error('Web Crypto SHA-256 is unavailable')
  const digest = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('')
}

export async function buildWorkingSetRevisions(
  content: Array<{ entityId: string; field: string; text: string }>,
  relations: Array<WorkingSetRelationV1 | WorkingSetRelationIssueV1>,
  geometry: WorkingSetGeometryV1[],
): Promise<WorkingSetRevisionV1> {
  const sortedContent = [...content].sort((a, b) =>
    `${a.entityId}\u0000${a.field}`.localeCompare(`${b.entityId}\u0000${b.field}`),
  )
  const sortedRelations = [...relations].sort((a, b) => a.arrowId.localeCompare(b.arrowId))
  const sortedGeometry = [...geometry].sort((a, b) => a.id.localeCompare(b.id))
  return {
    content: await sha256Hex(canonicalJson(sortedContent)),
    relations: await sha256Hex(canonicalJson(sortedRelations)),
    geometry: await sha256Hex(canonicalJson(sortedGeometry)),
  }
}
