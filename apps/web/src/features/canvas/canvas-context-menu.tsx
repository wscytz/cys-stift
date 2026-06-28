'use client'

import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useI18n } from '@/lib/i18n'

/**
 * 画布右键菜单。三项:在此处建卡 / 粘贴 DSL / 适配视图。
 * 「在此处建卡」点开后在右键坐标弹内联小输入框(只标题),Enter 提交 → onCreateHere(title)。
 * portal 到 body,复用 cv-rail__menu 视觉。
 */
export function CanvasContextMenu({
  open, x, y, onClose, onCreateHere, onPasteDsl, onFitView,
}: {
  open: boolean
  x: number
  y: number
  onClose: () => void
  onCreateHere: (title: string) => void
  onPasteDsl: () => void
  onFitView: () => void
}) {
  const { t } = useI18n()
  const [creating, setCreating] = useState(false)
  const [title, setTitle] = useState('')
  const inputRef = useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    if (creating) inputRef.current?.focus()
  }, [creating])

  useEffect(() => {
    if (!open) { setCreating(false); setTitle('') }
  }, [open])

  if (!open || typeof document === 'undefined') return null

  const submit = () => {
    const v = title.trim()
    if (v) onCreateHere(v)
    onClose()
  }

  return createPortal(
    <>
      <div className="cv-ctx-backdrop" onClick={onClose} aria-hidden="true" />
      {creating ? (
        <input
          ref={inputRef}
          className="cinput cv-ctx-input"
          style={{ left: x, top: y }}
          value={title}
          autoFocus
          placeholder={t('canvas.ctx.createPlaceholder')}
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') submit()
            else if (e.key === 'Escape') onClose()
          }}
          onBlur={submit}
        />
      ) : (
        <div className="cv-rail__menu cv-ctx-menu" role="menu" style={{ left: x, top: y }}>
          <button type="button" role="menuitem" className="cv-rail__menu-item"
            onClick={() => setCreating(true)}>{t('canvas.ctx.createHere')}</button>
          <button type="button" role="menuitem" className="cv-rail__menu-item"
            onClick={() => { onPasteDsl(); onClose() }}>{t('canvas.ctx.pasteDsl')}</button>
          <button type="button" role="menuitem" className="cv-rail__menu-item"
            onClick={() => { onFitView(); onClose() }}>{t('canvas.ctx.fitView')}</button>
        </div>
      )}
    </>,
    document.body,
  )
}
