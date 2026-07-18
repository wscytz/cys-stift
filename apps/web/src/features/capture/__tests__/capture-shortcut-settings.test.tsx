import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { CaptureShortcut } from '@/lib/settings-store'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const mocks = vi.hoisted(() => ({
  commit: vi.fn(),
  confirmed: {
    modKey: 'meta',
    shift: true,
    code: 'KeyE',
  } as CaptureShortcut,
}))

vi.mock('@/lib/i18n', () => ({
  useI18n: () => ({ t: (key: string) => key }),
}))

vi.mock('@/lib/settings-store', () => ({
  settingsStore: {
    get: () => ({ captureShortcut: mocks.confirmed }),
  },
}))

vi.mock('../capture-shortcut-commit', () => ({
  captureShortcutCommitCoordinator: { commit: mocks.commit },
}))

import { CaptureShortcutSettings } from '../capture-shortcut-settings'

const DEFAULT: CaptureShortcut = {
  modKey: 'meta',
  shift: true,
  code: 'KeyE',
}

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((done) => {
    resolve = done
  })
  return { promise, resolve }
}

function mount(shortcut: CaptureShortcut = DEFAULT): {
  host: HTMLDivElement
  root: Root
} {
  const host = document.createElement('div')
  document.body.appendChild(host)
  const root = createRoot(host)
  act(() => {
    root.render(<CaptureShortcutSettings shortcut={shortcut} ready />)
  })
  return { host, root }
}

function changeKey(host: HTMLElement, code: string) {
  const select = host.querySelector<HTMLSelectElement>('#set-key')
  if (!select) throw new Error('missing shortcut key select')
  act(() => {
    select.value = code
    select.dispatchEvent(new Event('change', { bubbles: true }))
  })
}

beforeEach(() => {
  document.body.innerHTML = ''
  mocks.commit.mockReset()
  mocks.confirmed = { ...DEFAULT }
})

describe('CaptureShortcutSettings two-phase UI', () => {
  it('shows the candidate while pending and restores the confirmed value on conflict', async () => {
    const registration = deferred<{
      status: 'failed'
      shortcut: CaptureShortcut
      error: Error
    }>()
    mocks.commit.mockReturnValue(registration.promise)
    const { host, root } = mount()

    changeKey(host, 'KeyC')
    expect(host.querySelector<HTMLSelectElement>('#set-key')?.value).toBe('KeyC')

    await act(async () => {
      registration.resolve({
        status: 'failed',
        shortcut: DEFAULT,
        error: new Error('shortcut occupied'),
      })
      await registration.promise
    })

    expect(host.querySelector<HTMLSelectElement>('#set-key')?.value).toBe('KeyE')
    act(() => root.unmount())
  })

  it('keeps the latest candidate when two responses arrive out of order', async () => {
    const older = deferred<{ status: 'stale' }>()
    const latest = deferred<{
      status: 'committed'
      shortcut: CaptureShortcut
    }>()
    mocks.commit
      .mockReturnValueOnce(older.promise)
      .mockReturnValueOnce(latest.promise)
    const { host, root } = mount()

    changeKey(host, 'KeyC')
    changeKey(host, 'KeyN')

    const newest = { ...DEFAULT, code: 'KeyN' }
    await act(async () => {
      latest.resolve({ status: 'committed', shortcut: newest })
      await latest.promise
    })
    expect(host.querySelector<HTMLSelectElement>('#set-key')?.value).toBe('KeyN')

    await act(async () => {
      older.resolve({ status: 'stale' })
      await older.promise
    })
    expect(host.querySelector<HTMLSelectElement>('#set-key')?.value).toBe('KeyN')
    act(() => root.unmount())
  })
})
