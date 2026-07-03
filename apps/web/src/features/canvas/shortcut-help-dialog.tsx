'use client'

/**
 * R3.5:画布快捷键帮助对话框。画布有 ~13 组快捷键但 UI 无任何提示,用户
 * 无法发现。工具栏 ? 按钮触发,Modal 列出键 → 动作两列表(硬编码)。
 * 照 export-dialog/dsl-dialog 结构(Modal + 内联 token 化 style + i18n + Esc)。
 */
import { useEffect } from 'react'
import { Modal } from '@cys-stift/ui'
import { useI18n } from '@/lib/i18n'
import { modSymbol, isMac } from '@/lib/platform'

export function ShortcutHelpDialog({
  open,
  onClose,
}: {
  open: boolean
  onClose: () => void
}) {
  const { t } = useI18n()

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      // 堆叠守卫:别的 dialog 已消费此 Escape 则不重复关。IME 组合态不关。
      if (e.defaultPrevented || e.isComposing) return
      e.preventDefault()
      onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  const mod = modSymbol()
  const groups: { title: string; rows: [string, string][] }[] = [
    {
      title: t('canvas.shortcutsTools'),
      rows: [
        ['v', t('canvas.scToolSelect')],
        ['p', t('canvas.scToolDraw')],
        ['e', t('canvas.scToolEraser')],
        ['t', t('canvas.scToolText')],
        ['c', t('canvas.scToolConnect')],
      ],
    },
    {
      title: t('canvas.shortcutsView'),
      rows: [
        ['+ / =', t('canvas.scZoomIn')],
        ['- / _', t('canvas.scZoomOut')],
        ['0 / 1', t('canvas.scFit')],
        ['g', t('canvas.scSnap')],
      ],
    },
    {
      title: t('canvas.shortcutsEdit'),
      rows: [
        ['Esc', t('canvas.scEscape')],
        ['Delete / ⌫', t('canvas.scDelete')],
        [`${mod}+Z`, t('canvas.scUndo')],
        [`${mod}+Shift+Z${isMac() ? '' : ' / Ctrl+Y'}`, t('canvas.scRedo')],
        [`${mod}+A`, t('canvas.scSelectAll')],
      ],
    },
    {
      title: t('canvas.shortcutsNudge'),
      rows: [
        ['↑ ↓ ← →', t('canvas.scNudge1')],
        [t('canvas.scNudge10Key'), t('canvas.scNudge10')],
      ],
    },
    {
      title: t('canvas.shortcutsGlobal'),
      rows: [[isMac() ? '⌘⇧Space' : 'Ctrl+Shift+Space', t('capture.shortcutHelp')]],
    },
  ]

  return (
    <Modal open={open} onClose={onClose} title={t('canvas.shortcuts')} closeLabel={t('common.close')}>
      <div className="sc-groups">
        {groups.map((g) => (
          <section key={g.title} className="sc-group">
            <h2 className="mono-label mono-label--wide">{g.title}</h2>
            <dl className="sc-rows">
              {g.rows.map(([key, action]) => (
                <div key={key} className="sc-row">
                  <dt className="sc-key">{key}</dt>
                  <dd className="sc-action">{action}</dd>
                </div>
              ))}
            </dl>
          </section>
        ))}
      </div>
      <style>{`
.sc-groups { display: flex; flex-direction: column; gap: var(--space-3); }
.sc-rows { margin: var(--space-1) 0 0; padding: 0; }
.sc-row { display: flex; align-items: baseline; gap: var(--space-3); padding: var(--space-1) 0; }
.sc-key {
  flex-shrink: 0; min-width: 140px;
  font-family: var(--font-mono); font-size: var(--font-size-xs);
  color: var(--color-black); text-transform: uppercase; letter-spacing: 0.08em;
}
.sc-action { margin: 0; font-family: var(--font-body); font-size: var(--font-size-sm); color: var(--color-black-soft); }
`}</style>
    </Modal>
  )
}
