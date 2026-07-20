import type { TransmissionManifestV1, WorkingSetSourceRecordV1 } from './working-set-types'

export const DEFAULT_WORKING_SET_CHAR_BUDGET = 120_000

export interface WorkingSetBudgetResult {
  records: WorkingSetSourceRecordV1[]
  manifest: Pick<TransmissionManifestV1, 'includedRefIds' | 'omitted' | 'truncated' | 'chars' | 'estimatedTokens' | 'budgetPolicy'>
}

/** Budgets are applied per whole source record. We never send a partial card
 * body and then imply that an audit covered the full card. */
export function applyWorkingSetBudget(
  records: WorkingSetSourceRecordV1[],
  maxChars = DEFAULT_WORKING_SET_CHAR_BUDGET,
): WorkingSetBudgetResult {
  const included: WorkingSetSourceRecordV1[] = []
  const omitted: TransmissionManifestV1['omitted'] = []
  let chars = 0
  for (const record of records) {
    if (chars + record.text.length > maxChars) {
      omitted.push({ entityId: record.ref.entityId, reason: 'budget' })
      continue
    }
    included.push(record)
    chars += record.text.length
  }
  return {
    records: included,
    manifest: {
      includedRefIds: included.map((record) => record.ref.refId),
      omitted,
      truncated: omitted.length > 0,
      chars,
      // A transparent estimate, not a provider-token claim.
      estimatedTokens: Math.ceil(chars / 4),
      budgetPolicy: `complete-source-records; maxChars=${maxChars}`,
    },
  }
}
