import type { AIFinishReason } from '../types'
import { AIProviderHttpError } from '../types'

export type StructuredFailure = 'auth' | 'quota' | 'rate-limit' | 'offline' | 'network' | 'timeout' | 'abort' | 'refusal' | 'content-filter' | 'truncated' | 'invalid'
export interface StructuredGeneration { content: string; finishReason?: AIFinishReason; refusal?: string }
export type StructuredRetryResult<T> = { ok: true; value: T; attempts: number } | { ok: false; failure: StructuredFailure; attempts: number }

function classifyFailure(error: unknown): StructuredFailure {
  if (error instanceof AIProviderHttpError) {
    if (error.status === 401 || error.status === 403) return 'auth'
    if (error.status === 429) return 'rate-limit'
  }
  if (error && typeof error === 'object') {
    const name = (error as { name?: unknown }).name
    if (name === 'AbortError') return 'abort'
    if (name === 'TimeoutError') return 'timeout'
  }
  const text = error instanceof Error ? `${error.name} ${error.message}`.toLowerCase() : String(error).toLowerCase()
  if (text.includes('401') || text.includes('403') || text.includes('unauthorized') || text.includes('authentication')) return 'auth'
  if (text.includes('429') || text.includes('rate limit') || text.includes('too many requests')) return 'rate-limit'
  if (text.includes('quota') || text.includes('insufficient credits')) return 'quota'
  if (text.includes('offline') || text.includes('failed to fetch') || text.includes('networkerror')) return 'offline'
  return 'network'
}

function abortError(signal?: AbortSignal): DOMException {
  return signal?.reason instanceof DOMException ? signal.reason : new DOMException('Cancelled', 'AbortError')
}

function waitForRetry(ms: number, signal?: AbortSignal): Promise<void> {
  if (signal?.aborted) return Promise.reject(abortError(signal))
  return new Promise((resolve, reject) => {
    const timer = setTimeout(resolve, ms)
    const abort = () => { clearTimeout(timer); reject(abortError(signal)) }
    signal?.addEventListener('abort', abort, { once: true })
  })
}

/** One targeted correction at most. Terminal responses never get retried. */
export async function retryStructured<T>(
  produce: (correction?: string) => Promise<StructuredGeneration>,
  decode: (text: string) => { ok: true; value: T } | { ok: false; errors: string[] },
  options?: { signal?: AbortSignal; sleep?: (ms: number, signal?: AbortSignal) => Promise<void> },
): Promise<StructuredRetryResult<T>> {
  let correction: string | undefined
  let correctionAttempted = false
  let rateLimitRetried = false
  let attempts = 0
  while (attempts < 3) {
    attempts++
    let result: StructuredGeneration
    try { result = await produce(correction) }
    catch (error) {
      const failure = classifyFailure(error)
      if (failure === 'rate-limit' && error instanceof AIProviderHttpError && error.retryAfterMs !== undefined && !rateLimitRetried && !options?.signal?.aborted) {
        rateLimitRetried = true
        try { await (options?.sleep ?? waitForRetry)(error.retryAfterMs, options?.signal) }
        catch { return { ok: false, failure: 'abort', attempts } }
        continue
      }
      return { ok: false, failure, attempts }
    }
    if (result.refusal || result.finishReason === 'refusal') return { ok: false, failure: 'refusal', attempts }
    if (result.finishReason === 'content_filter') return { ok: false, failure: 'content-filter', attempts }
    if (result.finishReason === 'length') return { ok: false, failure: 'truncated', attempts }
    const parsed = decode(result.content)
    if (parsed.ok) return { ok: true, value: parsed.value, attempts }
    if (correctionAttempted) return { ok: false, failure: 'invalid', attempts }
    correctionAttempted = true
    correction = `Return JSON only. Correct these bounded validation paths: ${parsed.errors.slice(0, 8).join(', ') || '$'}.`
  }
  return { ok: false, failure: 'invalid', attempts }
}
