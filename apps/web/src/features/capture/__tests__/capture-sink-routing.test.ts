/**
 * Capture data-loss regression suite (H1 + H2).
 *
 * H1: dropped/pasted files used `source.kind` 'drag-drop' / 'paste', but no
 * sink was registered for those kinds → captureSinkRegistry fell through to
 * the fallback `service.fromCapture`, which reads `input.title` (undefined)
 * and IGNORES `input.file` → every file became an empty untitled card with a
 * success toast. FileCaptureSink must be registered for both kinds so the
 * file payload is honoured (one card per file with media/body).
 *
 * H2: capture submit was fire-and-forget; `cardRepo.insert` rolled back on
 * quota but did NOT throw, so the sink resolved successfully and the MiniInput
 * cleared the draft → the user's typed text was irrecoverable. `insert` now
 * throws `StorageQuotaError`, which propagates as a rejected promise through
 * CaptureSink.submit so the caller can keep the draft + toast.
 *
 * The registry is a module singleton, so we isolate each test by clearing the
 * sinks + fallback it registers and asserting the routing contract directly.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import {
  captureSinkRegistry,
  WebCaptureSink,
  type CaptureSink,
} from '../capture-sink'
import type { CardId, CaptureInput } from '@cys-stift/domain'

// A recording sink: captures every submit so the test can assert which sink
// handled the input (and with what payload).
function recordingSink(name: string): CaptureSink & { calls: CaptureInput[] } {
  const calls: CaptureInput[] = []
  return {
    calls,
    submit(input: CaptureInput) {
      calls.push(input)
      return Promise.resolve({ cardId: 'fake-id' as CardId })
    },
  } as unknown as CaptureSink & { calls: CaptureInput[] }
}

beforeEach(() => {
  // Start each test from a clean registry (no sinks, no fallback).
  captureSinkRegistry.unregister('drag-drop')
  captureSinkRegistry.unregister('paste')
  captureSinkRegistry.unregister('shortcut')
  captureSinkRegistry.unregister('menubar')
  captureSinkRegistry.unregister('manual')
  captureSinkRegistry.setFallbackService(null as never)
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('captureSinkRegistry routing — H1 (file capture fell through to fallback)', () => {
  it('routes a drag-drop input to the drag-drop sink (not the fallback)', async () => {
    const dropSink = recordingSink('drag-drop')
    const fallback = recordingSink('fallback')
    captureSinkRegistry.register('drag-drop', dropSink)
    captureSinkRegistry.setFallbackService({
      fromCapture: () => fallback.calls.push({} as CaptureInput) || ({} as never),
    } as never)

    await captureSinkRegistry.submit({
      source: { kind: 'drag-drop', deviceId: 'dev', fileCount: 1 },
      file: new File(['x'], 'a.png', { type: 'image/png' }),
    } as never)

    expect(dropSink.calls).toHaveLength(1)
    // The file payload must reach the sink — that's the whole point of H1.
    expect((dropSink.calls[0] as unknown as { file?: File }).file).toBeTruthy()
    expect(fallback.calls).toHaveLength(0)
  })

  it('routes a paste input to the paste sink (not the fallback)', async () => {
    const pasteSink = recordingSink('paste')
    captureSinkRegistry.register('paste', pasteSink)

    await captureSinkRegistry.submit({
      source: { kind: 'paste', deviceId: 'dev' },
      file: new File(['x'], 'a.txt', { type: 'text/plain' }),
    } as never)

    expect(pasteSink.calls).toHaveLength(1)
    expect((pasteSink.calls[0] as unknown as { file?: File }).file).toBeTruthy()
  })

  it('a single FileCaptureSink instance can serve both drag-drop and paste', async () => {
    // Mirrors FileDropHandler's mount effect: one sink, two registrations.
    const shared = recordingSink('shared')
    captureSinkRegistry.register('drag-drop', shared)
    captureSinkRegistry.register('paste', shared)

    await captureSinkRegistry.submit({
      source: { kind: 'drag-drop', deviceId: 'dev', fileCount: 1 },
      file: new File(['x'], 'a.png', { type: 'image/png' }),
    } as never)
    await captureSinkRegistry.submit({
      source: { kind: 'paste', deviceId: 'dev' },
      file: new File(['y'], 'b.txt', { type: 'text/plain' }),
    } as never)

    expect(shared.calls).toHaveLength(2)
  })
})

describe('WebCaptureSink + registry — H2 (quota failure must reject, not resolve)', () => {
  it('registry.submit rejects when the sink throws synchronously (quota)', async () => {
    // Mirrors the real failure: cardRepo.insert throws StorageQuotaError on
    // quota → service.fromCapture (sync) → WebCaptureSink.submit (sync throw).
    // The registry converts the sync throw into a rejected promise so the
    // CaptureHost .then().catch() chain observes the failure and keeps the
    // draft. A sync throw that escaped would NEVER reach .catch → silent loss.
    const throwingSink = new WebCaptureSink({
      fromCapture() {
        throw new Error('storage quota exceeded — card not persisted')
      },
    } as never)
    captureSinkRegistry.register('shortcut', throwingSink)

    await expect(
      captureSinkRegistry.submit({
        title: 'doomed',
        source: { kind: 'shortcut', shortcutId: 'x', deviceId: 'dev' },
      }),
    ).rejects.toThrow(/quota/i)
  })

  it('registry.submit rejects when the sink returns a rejected promise', async () => {
    // FileCaptureSink is async; its rejections must also surface as a rejected
    // registry.submit (the .catch path depends on this for file drops too).
    captureSinkRegistry.register('shortcut', {
      submit() {
        return Promise.reject(new Error('storage quota exceeded'))
      },
    })

    await expect(
      captureSinkRegistry.submit({
        title: 'doomed',
        source: { kind: 'shortcut', shortcutId: 'x', deviceId: 'dev' },
      }),
    ).rejects.toThrow(/quota/i)
  })

  it('registry.submit resolves with a cardId on the happy path', async () => {
    captureSinkRegistry.register('shortcut', new WebCaptureSink({
      fromCapture() {
        return { id: 'c-happy' as CardId }
      },
    } as never))

    await expect(
      captureSinkRegistry.submit({
        title: 'fine',
        source: { kind: 'shortcut', shortcutId: 'x', deviceId: 'dev' },
      }),
    ).resolves.toEqual({ cardId: 'c-happy' })
  })
})
