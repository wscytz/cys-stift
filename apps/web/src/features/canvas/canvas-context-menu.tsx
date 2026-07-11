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
  open, x, y, initialCreating, onClose, onCreateHere, onPasteDsl, onFitView,
}: {
  open: boolean
  x: number
  y: number
  /** 打开即直入「建卡」输入模式(双击空白建卡复用此组件,跳过三选项菜单)。 */
  initialCreating?: boolean
  onClose: () => void
  onCreateHere: (title: string) => void
  onPasteDsl: () => void
  onFitView: () => void
}) {
  const { t } = useI18n()
  const [creating, setCreating] = useState(false)
  const [title, setTitle] = useState('')
  const inputRef = useRef<HTMLInputElement | null>(null)
  // committedRef 防 onBlur 误触发:点 backdrop 取消时 input blur 先于 backdrop click 触发,
  // 原 onBlur={submit} 会建卡(用户意图是取消)。Escape 同理(卸载时 blur)。首次结束标记,
  // 后续 blur 检测已 committed 则 no-op(同 self-canvas commitEdit 范式)。
  const committedRef = useRef(false)

  useEffect(() => {
    if (creating) inputRef.current?.focus()
  }, [creating])

  useEffect(() => {
    if (!open) { setCreating(false); setTitle(''); committedRef.current = false }
    else if (initialCreating) setCreating(true) // 双击空白建卡:打开即直入输入模式
  }, [open, initialCreating])

  if (!open || typeof document === 'undefined') return null

  const finish = (submitNow: boolean) => {
    if (committedRef.current) return
    committedRef.current = true
    if (submitNow) {
      const v = title.trim()
      if (v) onCreateHere(v)
    }
    onClose()
  }

  return createPortal(
    <>
      <div className="cv-ctx-backdrop" onClick={() => finish(false)} aria-hidden="true" />
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
            if (e.key === 'Enter') finish(true)
            else if (e.key === 'Escape') finish(false)
          }}
          onBlur={() => finish(true)}
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
