import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { CaptureShortcut } from '@/lib/settings-store'
import {
  captureShortcutToAccelerator,
  createCaptureShortcutCommitCoordinator,
  createNativeShortcutRegistrationClient,
  type NativeShortcutInvoke,
} from '../capture-shortcut-commit'

const DEFAULT: CaptureShortcut = {
  modKey: 'meta',
  shift: true,
  code: 'KeyE',
}

const NEXT: CaptureShortcut = {
  modKey: 'ctrl',
  shift: false,
  code: 'KeyC',
}

describe('captureShortcutToAccelerator', () => {
  it('normalizes web shortcut codes for Tauri', () => {
    expect(captureShortcutToAccelerator(DEFAULT)).toBe('CmdOrCtrl+Shift+E')
    expect(captureShortcutToAccelerator(NEXT)).toBe('Ctrl+C')
    expect(
      captureShortcutToAccelerator({ modKey: 'meta', shift: false, code: 'Digit1' }),
    ).toBe('CmdOrCtrl+1')
  })
})

describe('capture shortcut two-phase commit', () => {
  let stored: CaptureShortcut
  let localStorageValue: CaptureShortcut
  let nativeActive: string

  beforeEach(() => {
    stored = { ...DEFAULT }
    localStorageValue = { ...DEFAULT }
    nativeActive = captureShortcutToAccelerator(DEFAULT)
  })

  function persist(next: CaptureShortcut): boolean {
    stored = { ...next }
    localStorageValue = { ...next }
    return true
  }

  it('keeps UI/store/localStorage/native on the confirmed value when registration conflicts', async () => {
    const coordinator = createCaptureShortcutCommitCoordinator({
      register: async () => ({ status: 'failed', error: new Error('shortcut occupied') }),
      persist,
      getConfirmed: () => stored,
    })

    const result = await coordinator.commit(NEXT)

    expect(result).toEqual({
      status: 'failed',
      shortcut: DEFAULT,
      error: expect.any(Error),
    })
    expect(stored).toEqual(DEFAULT)
    expect(localStorageValue).toEqual(DEFAULT)
    expect(nativeActive).toBe(captureShortcutToAccelerator(DEFAULT))
  })

  it('commits UI/store/localStorage only after native registration succeeds', async () => {
    const coordinator = createCaptureShortcutCommitCoordinator({
      register: async (shortcut) => {
        nativeActive = captureShortcutToAccelerator(shortcut)
        return { status: 'applied' }
      },
      persist,
      getConfirmed: () => stored,
    })

    const result = await coordinator.commit(NEXT)

    expect(result).toEqual({ status: 'committed', shortcut: NEXT })
    expect(stored).toEqual(NEXT)
    expect(localStorageValue).toEqual(NEXT)
    expect(nativeActive).toBe(captureShortcutToAccelerator(NEXT))
  })

  it('restores native when local persistence fails after registration', async () => {
    const registrations: string[] = []
    const coordinator = createCaptureShortcutCommitCoordinator({
      register: async (shortcut) => {
        nativeActive = captureShortcutToAccelerator(shortcut)
        registrations.push(nativeActive)
        return { status: 'applied' }
      },
      persist: () => false,
      getConfirmed: () => stored,
    })

    const result = await coordinator.commit(NEXT)

    expect(result.status).toBe('failed')
    expect(result).toMatchObject({ shortcut: DEFAULT })
    expect(registrations).toEqual([
      captureShortcutToAccelerator(NEXT),
      captureShortcutToAccelerator(DEFAULT),
    ])
    expect(nativeActive).toBe(captureShortcutToAccelerator(DEFAULT))
  })

  it('restores the durable shortcut when a newer request fails after an older candidate applied', async () => {
    const pending: Array<{
      shortcut: CaptureShortcut
      fallback: CaptureShortcut
      resolve: (result: { status: 'applied' } | { status: 'failed'; error: Error }) => void
    }> = []
    const coordinator = createCaptureShortcutCommitCoordinator({
      register: (shortcut, fallback = shortcut) =>
        new Promise((resolve) => pending.push({ shortcut, fallback, resolve })),
      persist,
      getConfirmed: () => stored,
    })

    const olderCandidate = { ...DEFAULT, code: 'KeyC' }
    const latestCandidate = { ...DEFAULT, code: 'KeyN' }
    const older = coordinator.commit(olderCandidate)
    const latest = coordinator.commit(latestCandidate)

    nativeActive = captureShortcutToAccelerator(olderCandidate)
    pending[0]?.resolve({ status: 'applied' })
    await expect(older).resolves.toEqual({ status: 'stale' })

    nativeActive = captureShortcutToAccelerator(pending[1]!.fallback)
    pending[1]?.resolve({ status: 'failed', error: new Error('shortcut occupied') })
    await expect(latest).resolves.toMatchObject({
      status: 'failed',
      shortcut: DEFAULT,
    })

    expect(stored).toEqual(DEFAULT)
    expect(localStorageValue).toEqual(DEFAULT)
    expect(nativeActive).toBe(captureShortcutToAccelerator(DEFAULT))
  })

  it('synchronizes a hydrated value to native on restart without persisting again', async () => {
    const persistSpy = vi.fn(() => true)
    const coordinator = createCaptureShortcutCommitCoordinator({
      register: async (shortcut) => {
        nativeActive = captureShortcutToAccelerator(shortcut)
        return { status: 'applied' }
      },
      persist: persistSpy,
      getConfirmed: () => stored,
    })

    stored = { ...NEXT }
    localStorageValue = { ...NEXT }
    const result = await coordinator.synchronize(stored)

    expect(result).toEqual({ status: 'applied' })
    expect(nativeActive).toBe(captureShortcutToAccelerator(NEXT))
    expect(persistSpy).not.toHaveBeenCalled()
    expect(localStorageValue).toEqual(NEXT)
  })
})

describe('native shortcut request ordering', () => {
  it('rejects an older response that arrives after the latest request', async () => {
    let generation = 0
    let latestRequestId = 0
    let nativeActive = captureShortcutToAccelerator(DEFAULT)
    const pending = new Map<
      number,
      { accelerator: string; resolve: (accepted: boolean) => void }
    >()

    const invoke: NativeShortcutInvoke = async <T>(
      command: string,
      args?: Record<string, unknown>,
    ): Promise<T> => {
      if (command === 'begin_shortcut_session') {
        generation += 1
        latestRequestId = 0
        return generation as T
      }
      const requestId = args?.requestId as number
      const sessionId = args?.sessionId as number
      const accelerator = args?.accelerator as string
      return new Promise<boolean>((resolve) => {
        pending.set(requestId, {
          accelerator,
          resolve: (accepted) => {
            if (
              accepted &&
              sessionId === generation &&
              requestId > latestRequestId
            ) {
              latestRequestId = requestId
              nativeActive = accelerator
              resolve(true)
              return
            }
            resolve(false)
          },
        })
      }) as Promise<T>
    }

    const client = createNativeShortcutRegistrationClient(() => invoke)
    const older = client.register({ ...DEFAULT, code: 'KeyC' })
    const latest = client.register({ ...DEFAULT, code: 'KeyN' })
    await vi.waitFor(() => expect(pending.size).toBe(2))

    pending.get(2)?.resolve(true)
    await expect(latest).resolves.toEqual({ status: 'applied' })
    pending.get(1)?.resolve(true)
    await expect(older).resolves.toEqual({ status: 'stale' })

    expect(nativeActive).toBe('CmdOrCtrl+Shift+N')
  })
})
