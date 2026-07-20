import type { ProposalValidationContext, ProposalValidationResult } from './proposal-validation'
import { validateProposalPayload } from './proposal-validation'

/** Decode once, then run the same strict validation used for structured output.
 * No markdown fences or prose extraction is accepted at this trust boundary. */
export function decodeProposalJson(text: string, context: ProposalValidationContext): ProposalValidationResult {
  let input: unknown
  try {
    input = JSON.parse(text)
  } catch (error) {
    return {
      ok: false,
      diagnostics: [{ code: 'INVALID_JSON', message: (error as Error).message, path: '$' }],
    }
  }
  return validateProposalPayload(input, context)
}
