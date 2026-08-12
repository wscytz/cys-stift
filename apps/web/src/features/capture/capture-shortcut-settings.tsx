'use client'

import { useEffect, useRef, useState } from 'react'
import { useI18n } from '@/lib/i18n'
import { pushToast } from '@/lib/toast-store'
import {
  settingsStore,
  type CaptureShortcut,
} from '@/lib/settings-store'
import { captureShortcutCommitCoordinator } from './capture-shortcut-commit'

/** 浏览器/系统通用快捷键:shift-off 时若绑为捕获键会劫持全局行为,一律拒绝。 */
const BROWSER_UNIVERSAL_KEYS = new Set([
  'KeyC', 'KeyV', 'KeyX', 'KeyA', 'KeyZ', // 复制/粘贴/剪切/全选/撤销
  'KeyN', 'KeyI', 'KeyT', 'KeyF', 'KeyW', // 新建/斜体/新标签/查找/关闭
  'Comma', 'Period', // 系统偏好设置 / 取消（macOS）
])

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
    // R6:浏览器/系统通用快捷键(C/V/X/A/Z/N/I/T/F/W + 逗号/句号)在 shift-off 时会被
    // 全局捕获 handler 劫持,破坏复制粘贴/新建/查找等系统行为(也撞画布 ⌘. focus-mode)。
    // 对齐 Space 迁移守卫:拒绝这类组合,保留原值并提示,而非让用户踩坑。
    if (!next.shift && BROWSER_UNIVERSAL_KEYS.has(next.code)) {
      setCandidate(candidateRef.current)
      pushToast({ kind: 'info', message: t('settings.captureShortcutConflict') })
      return
    }
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
