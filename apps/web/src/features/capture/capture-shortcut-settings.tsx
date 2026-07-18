'use client'

import { useEffect, useRef, useState } from 'react'
import { useI18n } from '@/lib/i18n'
import {
  settingsStore,
  type CaptureShortcut,
} from '@/lib/settings-store'
import { captureShortcutCommitCoordinator } from './capture-shortcut-commit'

export function CaptureShortcutSettings({
  shortcut,
  ready,
}: {
  shortcut: CaptureShortcut
  ready: boolean
}) {
  const { t } = useI18n()
  const [candidate, setCandidate] = useState(shortcut)
  const candidateRef = useRef(shortcut)
  const requestRef = useRef(0)
  const pendingRef = useRef(false)
  const mountedRef = useRef(true)

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
    }
  }, [])

  useEffect(() => {
    if (pendingRef.current) return
    candidateRef.current = shortcut
    setCandidate(shortcut)
  }, [shortcut])

  const commit = (patch: Partial<CaptureShortcut>) => {
    const next = { ...candidateRef.current, ...patch }
    const requestId = ++requestRef.current
    pendingRef.current = true
    candidateRef.current = next
    setCandidate(next)

    void captureShortcutCommitCoordinator
      .commit(next)
      .then((result) => {
        if (!mountedRef.current || requestId !== requestRef.current) return
        pendingRef.current = false
        const displayed =
          result.status === 'committed'
            ? result.shortcut
            : settingsStore.get().captureShortcut
        candidateRef.current = displayed
        setCandidate(displayed)
      })
  }

  const labelFor = (code: string) => {
    if (code === 'Space') return t('settings.key.space')
    if (code === 'Comma') return t('settings.key.comma')
    if (code === 'Period') return t('settings.key.period')
    if (code.startsWith('Key')) return code.slice(3)
    if (code.startsWith('Digit')) return code.slice(5)
    return code
  }

  return (
    <section className="section" aria-busy={pendingRef.current}>
      <h2 className="section__h">{t('settings.captureShortcut')}</h2>
      <p className="section__lede">{t('settings.captureShortcutLede')}</p>
      <div className="field-row">
        <label className="mono-label" htmlFor="set-mod">
          {t('settings.modifier')}
        </label>
        <select
          id="set-mod"
          className="set__select"
          value={candidate.modKey}
          onChange={(event) =>
            commit({ modKey: event.target.value as 'meta' | 'ctrl' })
          }
        >
          <option value="meta">{t('settings.modifierMeta')}</option>
          <option value="ctrl">{t('settings.modifierCtrl')}</option>
        </select>
      </div>
      <div className="field-row">
        <label className="mono-label" htmlFor="set-shift">
          {t('settings.shift')}
        </label>
        <input
          id="set-shift"
          type="checkbox"
          checked={candidate.shift}
          onChange={(event) => commit({ shift: event.target.checked })}
        />
      </div>
      <div className="field-row">
        <label className="mono-label" htmlFor="set-key">
          {t('settings.key')}
        </label>
        <select
          id="set-key"
          className="set__select"
          value={candidate.code}
          onChange={(event) => commit({ code: event.target.value })}
        >
          {['KeyE', 'KeyC', 'KeyN', 'KeyI', 'Comma', 'Period'].map((code) => (
            <option key={code} value={code}>
              {labelFor(code)}
            </option>
          ))}
        </select>
      </div>
      <p className="mono">
        {t('settings.current')}:{' '}
        <code className="set__current-code">
          {(candidate.modKey === 'meta' ? '⌘' : 'Ctrl') +
            (candidate.shift ? '+⇧' : '') +
            '+' +
            labelFor(candidate.code)}
        </code>{' '}
        {ready ? '' : t('settings.currentSuffix')}
      </p>
      <p className="mono mono--xs">{t('settings.captureHint')}</p>
    </section>
  )
}
