'use client'

/**
 * 画布版本 diff(转义独占)。展示最近一次 undo 步前后的元素级差异:
 * added(蓝)/removed(红)/changed(黄,列出变化字段)。取 host.getHistory() 的
 * 栈顶(before)+ 当前 host.getElements()(after)。
 */
import { useEffect, useMemo } from 'react'
import { Modal } from '@cys-stift/ui'
import type { CardId, CardService } from '@cys-stift/domain'
import type { CanvasElement, CanvasHost } from '@cys-stift/canvas-engine'
import { useI18n } from '@/lib/i18n'
import type { MessageKey } from '@/lib/i18n/messages'
import { diffCanvasSnapshots } from './canvas-diff'

export function DiffDialog({
  open,
  onClose,
  host,
  service,
}: {
  open: boolean
  onClose: () => void
  host: CanvasHost | null
  /** 可选:card 元素用它解析真实标题(缺省回退到元素类型标签)。 */
  service?: CardService
}) {
  const { t, locale } = useI18n()

  // 元素标签:card 用真实卡标题,其余用元素类型的人话名(不再显示裸 id)。
  const elementLabel = (element: CanvasElement): string => {
    if (element.kind === 'card') {
      const title = service?.get(element.id as CardId)?.title
      return t('canvas.diffElementCard', { title: title || t('card.untitled') })
    }
    return t(`canvas.kind.${element.kind}` as MessageKey)
  }

  // 字段名映射;未知字段回退原字段名。
  const fieldLabel = (field: string): string => {
    const key = `canvas.diffField.${field}` as MessageKey
    const label = t(key)
    return label === key ? field : label
  }

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
            <DiffGroup kind="added" title={t('canvas.diffAdded')} items={diff.added.map((e) => elementLabel(e))} />
          )}
          {diff.removed.length > 0 && (
            <DiffGroup kind="removed" title={t('canvas.diffRemoved')} items={diff.removed.map((e) => elementLabel(e))} />
          )}
          {diff.changed.length > 0 && (
            <DiffGroup
              kind="changed"
              title={t('canvas.diffChanged')}
              items={diff.changed.map(
                (c) =>
                  `${elementLabel(c.after)} (${c.fields.map((field) => fieldLabel(field)).join(locale === 'en' ? ', ' : '、')})`,
              )}
            />
          )}
        </div>
      )}
      <style>{`
.diff-lede { margin: 0 0 var(--space-3); font-family: var(--font-body); font-size: var(--font-size-sm); color: var(--color-black-soft); }
.diff-empty { margin: 0; font-family: var(--font-mono); font-size: var(--font-size-sm); color: var(--color-gray); }
.diff-list { display: flex; flex-direction: column; gap: var(--space-2); }
.diff-group { padding: var(--space-2); border: var(--border-hairline); border-radius: var(--radius-sm); }
.diff-group--added .diff-group__title { color: var(--color-blue); }
.diff-group--removed .diff-group__title { color: var(--color-red); }
.diff-group--changed .diff-group__title { color: var(--color-yellow); }
.diff-group__title { margin: 0 0 var(--space-1); font-family: var(--font-display); font-size: var(--font-size-xs); text-transform: uppercase; letter-spacing: 0.08em; font-weight: 600; }
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
