'use client'

/**
 * 画布版本 diff(转义独占)。展示最近一次 undo 步前后的元素级差异:
 * added(蓝)/removed(红)/changed(黄,列出变化字段)。取 host.getHistory() 的
 * 栈顶(before)+ 当前 host.getElements()(after)。
 */
import { useEffect, useMemo } from 'react'
import { Modal } from '@cys-stift/ui'
import type { CanvasHost } from '@cys-stift/canvas-engine'
import { useI18n } from '@/lib/i18n'
import { diffCanvasSnapshots } from './canvas-diff'

export function DiffDialog({
  open,
  onClose,
  host,
}: {
  open: boolean
  onClose: () => void
  host: CanvasHost | null
}) {
  const { t } = useI18n()

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  const diff = useMemo(() => {
    if (!open || !host?.getHistory) return null
    const history = host.getHistory()
    if (history.length === 0) return null
    const before = history[history.length - 1]!
    const after = host.getElements()
    return diffCanvasSnapshots(before, after)
  }, [open, host])

  const isEmpty = diff && diff.added.length === 0 && diff.removed.length === 0 && diff.changed.length === 0

  return (
    <Modal open={open} onClose={onClose} title={t('canvas.diffTitle')} closeLabel={t('common.close')}>
      <p className="diff-lede">{t('canvas.diffLede')}</p>
      {!host?.getHistory ? (
        <p className="diff-empty">{t('canvas.diffUnavailable')}</p>
      ) : !diff ? (
        <p className="diff-empty">{t('canvas.diffNoHistory')}</p>
      ) : isEmpty ? (
        <p className="diff-empty">{t('canvas.diffNoChange')}</p>
      ) : (
        <div className="diff-list">
          {diff.added.length > 0 && (
            <DiffGroup kind="added" title={t('canvas.diffAdded')} items={diff.added.map((e) => e.id)} />
          )}
          {diff.removed.length > 0 && (
            <DiffGroup kind="removed" title={t('canvas.diffRemoved')} items={diff.removed.map((e) => e.id)} />
          )}
          {diff.changed.length > 0 && (
            <DiffGroup kind="changed" title={t('canvas.diffChanged')} items={diff.changed.map((c) => `${c.id} (${c.fields.join(', ')})`)} />
          )}
        </div>
      )}
      <style>{`
.diff-lede { margin: 0 0 var(--space-3); font-family: var(--font-body); font-size: var(--font-size-sm); color: var(--color-black-soft); }
.diff-empty { margin: 0; font-family: var(--font-mono); font-size: var(--font-size-sm); color: var(--color-gray); }
.diff-list { display: flex; flex-direction: column; gap: var(--space-2); }
.diff-group { padding: var(--space-2); border: var(--border-hairline); border-radius: var(--radius-sm); }
.diff-group--added { border-left: var(--space-1) solid var(--color-blue); }
.diff-group--removed { border-left: var(--space-1) solid var(--color-red); }
.diff-group--changed { border-left: var(--space-1) solid var(--color-yellow); }
.diff-group__title { margin: 0 0 var(--space-1); font-family: var(--font-mono); font-size: var(--font-size-xs); text-transform: uppercase; letter-spacing: 0.1em; }
.diff-group__items { margin: 0; padding: 0; list-style: none; }
.diff-group__item { font-family: var(--font-mono); font-size: var(--font-size-xs); color: var(--color-black-soft); padding: var(--space-1) 0; }
`}</style>
    </Modal>
  )
}

function DiffGroup({ kind, title, items }: { kind: 'added' | 'removed' | 'changed'; title: string; items: string[] }) {
  return (
    <section className={`diff-group diff-group--${kind}`}>
      <p className="diff-group__title">{title}</p>
      <ul className="diff-group__items">
        {items.map((it, i) => (
          <li key={i} className="diff-group__item">{it}</li>
        ))}
      </ul>
    </section>
  )
}
