'use client'

type JsonObject = Record<string, unknown>

function isObject(value: unknown): value is JsonObject {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function normalizeProfileBaseUrl(value: unknown): string | null {
  if (typeof value !== 'string') return null
  // Keep path casing intact: custom provider routes may be case-sensitive.
  // Only a trailing slash is syntactic noise for the profile identity.
  return value.trim().replace(/\/+$/, '')
}

/** Clone an export/archive boundary value while replacing every API key. */
export function redactExportSecrets<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map((item) => redactExportSecrets(item)) as T
  }
  // Archive callers may provide in-memory Date values even though the normal
  // JSON export path has already serialized them. Preserve the value so the
  // subsequent JSON.stringify still emits its ISO representation.
  if (value instanceof Date) return value
  if (!isObject(value)) return value

  const redacted: JsonObject = {}
  for (const [key, child] of Object.entries(value)) {
    redacted[key] = key.toLowerCase() === 'apikey' ? '' : redactExportSecrets(child)
  }
  return redacted as T
}

/**
 * Exported profiles intentionally contain an empty API key. When the target
 * device already has the same profile, keep its local secret during import.
 */
export function restoreDeviceProfileSecrets(
  imported: JsonObject,
  current: JsonObject | undefined,
): JsonObject {
  if (!Array.isArray(imported.profiles)) return { ...imported }

  const currentProfiles = Array.isArray(current?.profiles) ? current.profiles : []
  const currentById = new Map<string, JsonObject>()
  for (const candidate of currentProfiles) {
    if (!isObject(candidate) || typeof candidate.id !== 'string') continue
    currentById.set(candidate.id, candidate)
  }

  return {
    ...imported,
    profiles: imported.profiles.map((candidate) => {
      if (!isObject(candidate) || typeof candidate.id !== 'string') return candidate
      if (typeof candidate.apiKey === 'string' && candidate.apiKey.length > 0) {
        return { ...candidate }
      }
      const localProfile = currentById.get(candidate.id)
      // A profile id is user-facing and can be reused across imports. Only
      // carry a local secret forward when the credential's routing identity is
      // unchanged; otherwise an OpenAI key could be sent to a newly imported
      // Anthropic/custom endpoint that happens to reuse the same id.
      const sameProvider =
        typeof candidate.provider === 'string' &&
        candidate.provider === localProfile?.provider
      const importedBaseUrl = normalizeProfileBaseUrl(candidate.baseUrl)
      const localBaseUrl = normalizeProfileBaseUrl(localProfile?.baseUrl)
      const sameBaseUrl =
        importedBaseUrl !== null && importedBaseUrl === localBaseUrl
      const localKey = sameProvider && sameBaseUrl ? localProfile?.apiKey : undefined
      return {
        ...candidate,
        apiKey: typeof localKey === 'string' ? localKey : '',
      }
    }),
  }
}
