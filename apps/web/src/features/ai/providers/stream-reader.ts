'use client'

/**
 * Shared streaming-body consumer for the AI providers (v0.37.0).
 *
 * All three providers (openai / anthropic / ollama) previously had the same
 * hand-rolled `while (true) { reader.read() }` loop with two robustness gaps
 * a review surfaced:
 *   1. On `signal.abort`, `reader.read()` rejects with AbortError and the
 *      partial `content` accumulated so far was thrown away — the caller got
 *      nothing back for a half-streamed summary.
 *   2. A misbehaving proxy / captive portal that returns a 200 with a
 *      non-SSE body that never closes (HTML, a keep-alive drip, …) made the
 *      loop spin forever, hanging the popover.
 *
 * This helper closes both: abort returns cleanly (so the provider keeps its
 * partial work), and a generous iteration cap throws instead of looping
 * forever. Per-line parsing stays in each provider (the SSE/NDJSON formats
 * differ); this only owns the read loop + teardown.
 */

const MAX_STREAM_ITERATIONS = 100_000
// Backstop only — a real 1024-token streamed response is a few hundred
// chunks. This only fires on a genuinely broken never-ending stream.

export async function consumeStream(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  decoder: TextDecoder,
  feed: (chunk: string) => void,
  signal?: AbortSignal,
): Promise<void> {
  let iterations = 0
  try {
    while (true) {
      // Check abort BEFORE reading so a cancel between chunks returns
      // promptly without discarding the work already fed upstream.
      if (signal?.aborted) return
      const { done, value } = await reader.read()
      if (done) break
      feed(decoder.decode(value, { stream: true }))
      if (++iterations > MAX_STREAM_ITERATIONS) {
        throw new Error(
          'stream exceeded max iterations — possible non-SSE/NDJSON response (check baseUrl / proxy)',
        )
      }
    }
  } catch (e) {
    // AbortError (user cancelled, navigated away, or timed out): return
    // cleanly so the provider can return the partial content accumulated
    // in its closure. Anything else is a real error — rethrow.
    const isAbort =
      signal?.aborted || (e instanceof Error && e.name === 'AbortError')
    if (isAbort) {
      try {
        await reader.cancel()
      } catch {
        /* reader already gone */
      }
      return
    }
    throw e
  }
}
