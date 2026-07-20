import type { SourceFieldV1, SourceKindV1, SourceRefV1 } from './working-set-types'
import { sha256Hex } from './working-set-revision'

export function normalizeSourceText(text: string): string {
  return text.replace(/\r\n?/g, '\n')
}

export async function sourceRevisionFor(sourceKind: SourceKindV1, entityId: string, field: SourceFieldV1, text: string): Promise<string> {
  return sha256Hex(`${sourceKind}\u0000${entityId}\u0000${field}\u0000${normalizeSourceText(text)}`)
}

export async function createSourceRef(
  sourceKind: SourceKindV1,
  entityId: string,
  field: SourceFieldV1,
  text: string,
  path?: string,
): Promise<SourceRefV1> {
  const exact = normalizeSourceText(text)
  const excerptHash = await sha256Hex(exact)
  const sourceRevision = await sourceRevisionFor(sourceKind, entityId, field, exact)
  return {
    refId: `src:${await sha256Hex(`${entityId}\u0000${field}\u0000${excerptHash}`)}`,
    sourceKind,
    entityId,
    field,
    sourceRevision,
    selector: {
      ...(path ? { path } : {}),
      exact,
      start: 0,
      end: exact.length,
      excerptHash,
    },
  }
}
