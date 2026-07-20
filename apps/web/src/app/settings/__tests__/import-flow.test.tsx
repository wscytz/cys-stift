/**
 * Settings import confirmation flow.
 *
 * The project intentionally does not depend on Testing Library, so these
 * interaction tests mount the real page with react-dom/client + act and mock
 * only unrelated settings sections.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import React, { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const { clearWorkspaceMock, importFromJsonMock, getImportCheckpointMetaMock, restoreImportCheckpointMock } = vi.hoisted(() => ({
  clearWorkspaceMock: vi.fn(),
  importFromJsonMock: vi.fn(),
  getImportCheckpointMetaMock: vi.fn(),
  restoreImportCheckpointMock: vi.fn(),
}))

vi.mock('@/lib/export-service', () => ({
  buildExportPayload: vi.fn(),
  clearWorkspace: clearWorkspaceMock,
  downloadExport: vi.fn(),
  getImportCheckpointMeta: getImportCheckpointMetaMock,
  importFromJson: importFromJsonMock,
  restoreImportCheckpoint: restoreImportCheckpointMock,
}))

vi.mock('@/lib/settings-store', () => ({
  settingsStore: {
    update: vi.fn(),
    updateCardDisplayMode: vi.fn(),
  },
  useSettings: () => ({
    settings: {
      export: { includeDeleted: true },
      captureShortcut: 'CommandOrControl+Shift+E',
      cardDisplayMode: 'compact',
      labs: {},
    },
    ready: true,
  }),
}))

vi.mock('@/lib/i18n', () => ({
  useI18n: () => ({
    t: (key: string, params?: Record<string, string | number>) => {
      if (!params) return key
      return `${key} ${Object.entries(params)
        .map(([name, value]) => `${name}=${String(value)}`)
        .join(' ')}`
    },
    locale: 'zh',
    setLocale: vi.fn(),
  }),
}))

vi.mock('@/lib/use-platform', () => ({ useIsDesktop: () => false }))
vi.mock('@/lib/toast-store', () => ({ pushToast: vi.fn() }))
vi.mock('@/components/storage-meter', () => ({ StorageMeter: () => null }))
vi.mock('@/features/settings/ai-settings-panel', () => ({ AISettingsPanel: () => null }))
vi.mock('@/features/settings/sample-export-panel', () => ({ SampleExportPanel: () => null }))
vi.mock('@/features/ai/lab-toggle', () => ({ LabToggle: () => null }))
vi.mock('@/features/ai/labs-registry', () => ({ LAB_REGISTRY: [] }))
vi.mock('@/features/capture/capture-shortcut-settings', () => ({
  CaptureShortcutSettings: () => null,
}))

vi.mock('next/link', () => ({
  default: ({ children, href, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement>) => (
    <a href={String(href)} {...props}>{children}</a>
  ),
}))

vi.mock('@cys-stift/ui', () => ({
  Toolbar: ({ children }: { children: React.ReactNode }) => <header>{children}</header>,
  Button: ({
    children,
    variant: _variant,
    ...props
  }: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: string }) => (
    <button {...props}>{children}</button>
  ),
  Modal: ({
    open,
    onClose,
    title,
    closeLabel,
    children,
  }: {
    open: boolean
    onClose: () => void
    title: string
    closeLabel: string
    children: React.ReactNode
  }) => open ? (
    <div role="dialog" aria-label={title}>
      <button type="button" aria-label={closeLabel} onClick={onClose} />
      {children}
    </div>
  ) : null,
}))

import SettingsPage from '../page'

const BACKUP_TEXT = '{"version":1,"cards":[{"id":"card-1"}]}'
const PREFLIGHT = {
  ok: true,
  cards: 3,
  mediaAssets: 2,
  canvases: 1,
  freeformCanvases: 0,
}
const IMPORTED = {
  ok: true,
  cards: 3,
  mediaAssets: 2,
  canvases: 1,
  freeformCanvases: 1,
}

let root: Root | null = null
let host: HTMLDivElement | null = null

function renderPage() {
  host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
  act(() => root!.render(<SettingsPage />))
  return host
}

async function chooseBackup(container: HTMLElement) {
  const input = container.querySelector('input[type="file"]') as HTMLInputElement
  const file = {
    name: 'backup.json',
    text: vi.fn().mockResolvedValue(BACKUP_TEXT),
  } as unknown as File
  const files = {
    0: file,
    length: 1,
    item: (index: number) => index === 0 ? file : null,
  } as unknown as FileList

  Object.defineProperty(input, 'files', { configurable: true, value: files })
  await act(async () => {
    input.dispatchEvent(new Event('change', { bubbles: true }))
  })
}

function findButton(container: HTMLElement, text: string) {
  return Array.from(container.querySelectorAll('button')).find(
    (button) => button.textContent?.trim() === text,
  ) as HTMLButtonElement | undefined
}

function spyOnLocationReload() {
  // Location.reload is a non-configurable wrapper in jsdom. Its internal
  // implementation method is configurable and is exactly what the wrapper
  // delegates to, so spying there catches a real window.location.reload().
  const implSymbol = Object.getOwnPropertySymbols(window.location).find(
    (symbol) => symbol.description === 'impl',
  )
  if (!implSymbol) throw new Error('jsdom Location implementation is unavailable')
  const impl = (window.location as unknown as Record<symbol, object>)[implSymbol]
  return vi.spyOn(Object.getPrototypeOf(impl) as { reload: () => void }, 'reload')
    .mockImplementation(() => undefined)
}

describe('SettingsPage import flow', () => {
  beforeEach(() => {
    importFromJsonMock.mockReset()
    importFromJsonMock.mockResolvedValueOnce(PREFLIGHT)
    getImportCheckpointMetaMock.mockReset()
    getImportCheckpointMetaMock.mockReturnValue(null)
    restoreImportCheckpointMock.mockReset()
    clearWorkspaceMock.mockReset()
  })

  afterEach(() => {
    if (root) act(() => root!.unmount())
    host?.remove()
    root = null
    host = null
    vi.restoreAllMocks()
  })

  it('validates a selected JSON file without writing and shows the preflight mode choice', async () => {
    const container = renderPage()
    await chooseBackup(container)

    expect(importFromJsonMock).toHaveBeenCalledTimes(1)
    expect(importFromJsonMock).toHaveBeenCalledWith(BACKUP_TEXT, {
      mode: 'replace',
      dryRun: true,
    })

    const dialog = container.querySelector('[role="dialog"]') as HTMLElement
    expect(dialog).toBeTruthy()
    expect(dialog.textContent).toContain('backup.json')
    expect(dialog.textContent).toContain('3')
    expect(dialog.textContent).toContain('2')
    expect(dialog.textContent).toContain('1')

    const modes = dialog.querySelectorAll('[role="radio"]')
    expect(modes).toHaveLength(2)
    expect(modes[0]?.textContent).toContain('settings.importReplace')
    expect(modes[0]?.getAttribute('aria-checked')).toBe('true')
    expect(modes[1]?.textContent).toContain('settings.importMerge')
    expect(modes[1]?.getAttribute('aria-checked')).toBe('false')
  })

  it('cancels after preflight without committing any data', async () => {
    const container = renderPage()
    await chooseBackup(container)

    const cancel = findButton(container, 'common.cancel')
    expect(cancel).toBeTruthy()
    act(() => cancel!.click())

    expect(container.querySelector('[role="dialog"]')).toBeNull()
    expect(importFromJsonMock).toHaveBeenCalledTimes(1)
    expect(importFromJsonMock.mock.calls[0]?.[1]).toEqual({
      mode: 'replace',
      dryRun: true,
    })
  })

  it('commits the selected mode, keeps the success report on-page, and does not reload', async () => {
    importFromJsonMock.mockResolvedValueOnce(IMPORTED)
    const reloadSpy = spyOnLocationReload()
    const container = renderPage()
    await chooseBackup(container)

    const merge = Array.from(container.querySelectorAll('[role="radio"]')).find(
      (option) => option.textContent?.includes('settings.importMerge'),
    ) as HTMLButtonElement
    act(() => merge.click())
    expect(merge.getAttribute('aria-checked')).toBe('true')

    const confirm = findButton(container, 'settings.importJson')
    expect(confirm).toBeTruthy()
    await act(async () => confirm!.click())

    expect(importFromJsonMock).toHaveBeenCalledTimes(2)
    expect(importFromJsonMock).toHaveBeenLastCalledWith(BACKUP_TEXT, { mode: 'merge' })
    expect(reloadSpy).not.toHaveBeenCalled()
    expect(container.querySelector('[role="dialog"]')).toBeNull()

    const status = container.querySelector('[role="status"]')
    expect(status?.textContent).toContain('settings.importOk')
    expect(status?.textContent).toContain('3')
    expect(status?.textContent).toContain('2')
    expect(status?.textContent).toContain('1')
    expect(container.querySelector('#settings-data')).toBeTruthy()
  })

  it('shows the pre-import recovery entry, confirms restore, and removes it after success', async () => {
    getImportCheckpointMetaMock
      .mockReturnValueOnce({
        version: 1,
        createdAt: '2026-07-19T02:03:04.000Z',
        mode: 'replace',
        cards: 7,
        mediaAssets: 2,
        canvases: 1,
      })
      .mockReturnValue(null)
    restoreImportCheckpointMock.mockResolvedValue({
      ok: true,
      cards: 7,
      mediaAssets: 2,
      canvases: 1,
      checkpointCleared: true,
    })
    const container = renderPage()

    const recovery = container.querySelector('[data-testid="import-recovery"]') as HTMLElement
    expect(recovery).toBeTruthy()
    expect(recovery.textContent).toContain('settings.importCheckpointAvailable')
    expect(recovery.textContent).toContain('7')
    expect(recovery.textContent).toContain('2026')

    const openRestore = findButton(recovery, 'settings.importCheckpointRestore')
    act(() => openRestore!.click())
    const dialog = container.querySelector('[aria-label="settings.importCheckpointConfirmTitle"]') as HTMLElement
    expect(dialog).toBeTruthy()
    expect(dialog.textContent).toContain('settings.importCheckpointConfirmBody')

    const confirmRestore = findButton(dialog, 'settings.importCheckpointRestore')
    await act(async () => confirmRestore!.click())

    expect(restoreImportCheckpointMock).toHaveBeenCalledTimes(1)
    expect(container.querySelector('[data-testid="import-recovery"]')).toBeNull()
    expect(container.querySelector('[aria-label="settings.importCheckpointConfirmTitle"]')).toBeNull()
    expect(container.querySelector('[role="status"]')?.textContent)
      .toContain('settings.importCheckpointRestored')
  })

  it('requires confirmation before clearing the workspace and then exposes recovery', async () => {
    clearWorkspaceMock.mockResolvedValue({
      ok: true,
      cards: 0,
      mediaAssets: 0,
      checkpointCreated: true,
    })
    getImportCheckpointMetaMock
      .mockReturnValueOnce(null)
      .mockReturnValue({
        version: 1,
        createdAt: '2026-07-20T12:00:00.000Z',
        mode: 'replace',
        cards: 9,
        mediaAssets: 1,
        canvases: 2,
      })
    const container = renderPage()

    const openClear = findButton(container, 'settings.clearWorkspace')
    expect(openClear).toBeTruthy()
    act(() => openClear!.click())
    expect(clearWorkspaceMock).not.toHaveBeenCalled()

    const dialog = container.querySelector('[aria-label="settings.clearWorkspaceConfirmTitle"]') as HTMLElement
    expect(dialog).toBeTruthy()
    expect(dialog.textContent).toContain('settings.clearWorkspaceConfirmBody')
    const confirmClear = findButton(dialog, 'settings.clearWorkspace')
    await act(async () => confirmClear!.click())

    expect(clearWorkspaceMock).toHaveBeenCalledTimes(1)
    expect(container.querySelector('[aria-label="settings.clearWorkspaceConfirmTitle"]')).toBeNull()
    expect(container.querySelector('[data-testid="import-recovery"]')).toBeTruthy()
    expect(container.querySelector('[role="status"]')?.textContent)
      .toContain('settings.clearWorkspaceOk')
  })
})
