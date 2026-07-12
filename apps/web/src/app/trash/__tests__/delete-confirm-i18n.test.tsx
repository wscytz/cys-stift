/**
 * P2 fix: delete confirmation is locale-aware (zh='删除' / en='delete').
 * Verifies the hard-delete confirm in /trash honours the current locale —
 * the red button only enables when the typed word matches the locale word,
 * so Chinese users no longer face an English spelling test.
 *
 * react-dom/client + act (codebase policy; no @testing-library/react).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import type { Card } from '@cys-stift/domain'
import type { Locale } from '@/lib/i18n/messages'
import { messages } from '@/lib/i18n/messages'

// --- Controllable locale (tests switch between zh and en) ---
let testLocale: Locale = 'zh'

vi.mock('@/lib/i18n', () => ({
  useI18n: () => ({
    locale: testLocale,
    t: (key: string) => {
      const entry = (messages as Record<string, { zh: string; en: string }>)[key]
      return entry?.[testLocale] ?? key
    },
    setLocale: () => {},
  }),
}))

// --- Mock DB: one soft-deleted card so the list is non-empty ---
const hardDeleteMock = vi.fn()
vi.mock('@/lib/db-client', () => ({
  useDb: () => ({
    snap: { cards: [] },
    service: {
      listAll: () => [trashedCard],
      hardDelete: (id: string) => hardDeleteMock(id),
      restore: () => {},
    },
    ready: true,
  }),
}))

vi.mock('next/link', () => ({
  __esModule: true,
  default: ({ children, ...rest }: { children?: React.ReactNode } & Record<string, unknown>) =>
    React.createElement('a', rest, children),
}))

vi.mock('@cys-stift/ui', () => ({
  BauhausMotif: () => null,
  Card: ({ children }: { children?: React.ReactNode }) =>
    React.createElement('div', null, children),
  Tag: () => null,
  Toolbar: ({ children }: { children?: React.ReactNode }) =>
    React.createElement('div', null, children),
  // Modal: render children only when open (mirror real Modal's `if (!open) return null`)
  Modal: ({ open, children }: { open: boolean; children?: React.ReactNode }) =>
    open ? React.createElement('div', { role: 'dialog' }, children) : null,
  Button: ({
    children,
    onClick,
    disabled,
    variant,
  }: {
    children?: React.ReactNode
    onClick?: () => void
    disabled?: boolean
    variant?: string
  }) =>
    React.createElement(
      'button',
      {
        onClick,
        disabled,
        type: 'button',
        'data-variant': variant,
      },
      children,
    ),
}))

vi.mock('@/components/page-loading', () => ({ PageLoading: () => null }))
vi.mock('@/features/archive/archive-card-tile', () => ({
  ArchiveCardTile: () => React.createElement('div', { 'data-testid': 'tile' }),
}))

import TrashPage from '../page'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const trashedCard = {
  id: 'c1',
  title: '测试卡片',
  body: '',
  type: 'note',
  capturedAt: new Date(),
  createdAt: new Date(),
  updatedAt: new Date(),
  tags: [],
  pinned: false,
  archived: false,
  deletedAt: new Date('2026-07-10'),
} as unknown as Card

function render(el: React.ReactElement): { host: HTMLElement; unmount: () => void } {
  const host = document.createElement('div')
  document.body.appendChild(host)
  const root = createRoot(host)
  act(() => {
    root.render(el)
  })
  return { host, unmount: () => act(() => root.unmount()) }
}

/** Find a button by exact text content within host. */
function findButton(host: HTMLElement, text: string): HTMLButtonElement | undefined {
  return [...host.querySelectorAll('button')].find(
    (b) => (b.textContent ?? '').trim() === text,
  ) as HTMLButtonElement | undefined
}

/** Find the confirmation input (the one inside the modal dialog). */
function findConfirmInput(host: HTMLElement): HTMLInputElement | undefined {
  const dialog = host.querySelector('[role="dialog"]')
  return dialog?.querySelector('input.confirm__type') as HTMLInputElement | undefined
}

/** Set input value react-style + dispatch input event so React onChange fires. */
function setInputValue(input: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!
  setter.call(input, value)
  input.dispatchEvent(new Event('input', { bubbles: true }))
}

beforeEach(() => {
  testLocale = 'zh'
  hardDeleteMock.mockClear()
})

describe('/trash delete-confirm — locale-aware word (P2 i18n fix)', () => {
  it('zh: typing "删除" enables the red button; "delete" does NOT', () => {
    testLocale = 'zh'
    const { host, unmount } = render(<TrashPage />)

    // Open the hard-delete modal by clicking the per-card "Delete forever" button.
    const deleteBtn = findButton(host, '永久删除')
    expect(deleteBtn, 'per-card delete-forever button should render').toBeTruthy()
    act(() => deleteBtn!.click())

    // Modal open: the confirm input should be visible.
    const input = findConfirmInput(host)
    expect(input, 'confirm input should be in the modal').toBeTruthy()
    // Placeholder should be the locale word.
    expect(input!.placeholder).toBe('删除')

    // The danger button inside the modal: initially disabled (empty input).
    const modalDeleteBtn = host.querySelector(
      '[role="dialog"] button[data-variant="danger"]',
    ) as HTMLButtonElement
    expect(modalDeleteBtn, 'danger button should exist in modal').toBeTruthy()
    expect(modalDeleteBtn.disabled, 'should start disabled').toBe(true)

    // Type the wrong-language word → still disabled.
    act(() => setInputValue(input!, 'delete'))
    expect(modalDeleteBtn.disabled, '"delete" must NOT enable in zh locale').toBe(true)

    // Type the locale word → enabled.
    act(() => setInputValue(input!, '删除'))
    expect(modalDeleteBtn.disabled, '"删除" should enable in zh locale').toBe(false)

    unmount()
  })

  it('en: typing "delete" enables the red button; "删除" does NOT', () => {
    testLocale = 'en'
    const { host, unmount } = render(<TrashPage />)

    // Open modal: button label is English in en locale.
    const deleteBtn = findButton(host, 'Delete forever')
    expect(deleteBtn, 'per-card delete-forever button should render').toBeTruthy()
    act(() => deleteBtn!.click())

    const input = findConfirmInput(host)
    expect(input, 'confirm input should be in the modal').toBeTruthy()
    // Placeholder should be the locale word.
    expect(input!.placeholder).toBe('delete')

    const modalDeleteBtn = host.querySelector(
      '[role="dialog"] button[data-variant="danger"]',
    ) as HTMLButtonElement
    expect(modalDeleteBtn, 'danger button should exist in modal').toBeTruthy()
    expect(modalDeleteBtn.disabled, 'should start disabled').toBe(true)

    // Type the wrong-language word → still disabled.
    act(() => setInputValue(input!, '删除'))
    expect(modalDeleteBtn.disabled, '"删除" must NOT enable in en locale').toBe(true)

    // Type the locale word → enabled.
    act(() => setInputValue(input!, 'delete'))
    expect(modalDeleteBtn.disabled, '"delete" should enable in en locale').toBe(false)

    unmount()
  })

  it('zh: clicking enabled danger button calls hardDelete', () => {
    testLocale = 'zh'
    const { host, unmount } = render(<TrashPage />)

    const deleteBtn = findButton(host, '永久删除')
    act(() => deleteBtn!.click())

    const input = findConfirmInput(host)!
    act(() => setInputValue(input, '删除'))

    const modalDeleteBtn = host.querySelector(
      '[role="dialog"] button[data-variant="danger"]',
    ) as HTMLButtonElement
    act(() => modalDeleteBtn.click())

    expect(hardDeleteMock, 'hardDelete should be called with card id').toHaveBeenCalledWith('c1')
    unmount()
  })
})
