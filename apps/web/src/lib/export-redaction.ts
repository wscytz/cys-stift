'use client'

type JsonObject = Record<string, unknown>

function isObject(value: unknown): value is JsonObject {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

/** Clone an export/archive boundary value while replacing every API key. */
export function redactExportSecrets<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map((item) => redactExportSecrets(item)) as T
  }
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
      const localKey = currentById.get(candidate.id)?.apiKey
      return {
        ...candidate,
        apiKey: typeof localKey === 'string' ? localKey : '',
      }
    }),
  }
}
