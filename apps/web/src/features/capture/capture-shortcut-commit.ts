import {
  settingsStore,
  type CaptureShortcut,
} from '@/lib/settings-store'

export type NativeShortcutInvoke = <T>(
  command: string,
  args?: Record<string, unknown>,
) => Promise<T>

export type ShortcutRegistrationResult =
  | { status: 'applied' | 'unsupported' | 'stale' }
  | { status: 'failed'; error: unknown }

export interface ShortcutRegistrationClient {
  register(
    shortcut: CaptureShortcut,
    fallback?: CaptureShortcut,
  ): Promise<ShortcutRegistrationResult>
}

export type ShortcutCommitResult =
  | { status: 'committed'; shortcut: CaptureShortcut }
  | { status: 'failed'; shortcut: CaptureShortcut; error: unknown }
  | { status: 'stale' }

export function captureShortcutToAccelerator(
  shortcut: CaptureShortcut,
): string {
  const parts = [shortcut.modKey === 'meta' ? 'CmdOrCtrl' : 'Ctrl']
  if (shortcut.shift) parts.push('Shift')
  let key = shortcut.code
  if (key.startsWith('Key')) key = key.slice(3)
  else if (key.startsWith('Digit')) key = key.slice(5)
  parts.push(key)
  return parts.join('+')
}

function getGlobalTauriInvoke(): NativeShortcutInvoke | null {
  if (typeof window === 'undefined') return null
  type TauriGlobal = { core?: { invoke?: NativeShortcutInvoke } }
  const tauri = (window as unknown as { __TAURI__?: TauriGlobal }).__TAURI__
  return tauri?.core?.invoke ?? null
}

/**
 * Creates one ordered native-registration session per webview. Rust assigns
 * the session generation; request IDs make the latest user choice win even
 * when two Tauri IPC calls are dispatched or resolved out of order.
 */
export function createNativeShortcutRegistrationClient(
  resolveInvoke: () => NativeShortcutInvoke | null = getGlobalTauriInvoke,
): ShortcutRegistrationClient {
  let sessionPromise: Promise<number> | undefined
  let nextRequestId = 0
  let latestRequestId = 0

  const beginSession = (invoke: NativeShortcutInvoke): Promise<number> => {
    if (!sessionPromise) {
      sessionPromise = invoke<number>('begin_shortcut_session').catch((error) => {
        sessionPromise = undefined
        throw error
      })
    }
    return sessionPromise
  }

  return {
    async register(shortcut, fallback = shortcut): Promise<ShortcutRegistrationResult> {
      const invoke = resolveInvoke()
      if (!invoke) return { status: 'unsupported' }

      const requestId = ++nextRequestId
      latestRequestId = requestId
      try {
        const sessionId = await beginSession(invoke)
        const accepted = await invoke<boolean>('update_shortcut', {
          accelerator: captureShortcutToAccelerator(shortcut),
          fallbackAccelerator: captureShortcutToAccelerator(fallback),
          sessionId,
          requestId,
        })
        if (requestId !== latestRequestId || !accepted) {
          return { status: 'stale' }
        }
        return { status: 'applied' }
      } catch (error) {
        if (requestId !== latestRequestId) return { status: 'stale' }
        return { status: 'failed', error }
      }
    },
  }
}

export function createCaptureShortcutCommitCoordinator({
  register,
  persist,
  getConfirmed,
}: {
  register: ShortcutRegistrationClient['register']
  persist: (shortcut: CaptureShortcut) => boolean
  getConfirmed: () => CaptureShortcut
}) {
  let latestCommitId = 0

  return {
    async commit(candidate: CaptureShortcut): Promise<ShortcutCommitResult> {
      const commitId = ++latestCommitId
      const confirmed = getConfirmed()
      const registration = await register(candidate, confirmed)
      if (commitId !== latestCommitId) return { status: 'stale' }

      if (registration.status === 'failed') {
        return {
          status: 'failed',
          shortcut: confirmed,
          error: registration.error,
        }
      }
      if (registration.status === 'stale') {
        return {
          status: 'failed',
          shortcut: confirmed,
          error: new Error('shortcut registration was superseded'),
        }
      }

      if (persist(candidate)) {
        return { status: 'committed', shortcut: candidate }
      }

      // Native is already on the candidate. Restore the last durable value
      // so a localStorage/quota failure cannot split native from the store.
      const rollback = await register(confirmed, confirmed)
      if (commitId !== latestCommitId) return { status: 'stale' }
      return {
        status: 'failed',
        shortcut: confirmed,
        error:
          rollback.status === 'failed'
            ? rollback.error
            : new Error('shortcut settings could not be persisted'),
      }
    },

    synchronize(shortcut: CaptureShortcut): Promise<ShortcutRegistrationResult> {
      return register(shortcut, shortcut)
    },
  }
}

const nativeRegistrationClient = createNativeShortcutRegistrationClient()

export const captureShortcutCommitCoordinator =
  createCaptureShortcutCommitCoordinator({
    register: (shortcut, fallback) =>
      nativeRegistrationClient.register(shortcut, fallback),
    persist: (shortcut) => settingsStore.updateCaptureShortcut(shortcut),
    getConfirmed: () => settingsStore.get().captureShortcut,
  })
