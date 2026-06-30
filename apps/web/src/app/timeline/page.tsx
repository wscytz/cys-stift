'use client'

import { useState, useMemo } from 'react'
import Link from 'next/link'
import { BauhausMotif, Card as UICard, Tag, Toolbar } from '@cys-stift/ui'
import type { Card, CardId } from '@cys-stift/domain'
import { useDb } from '@/lib/db-client'
import { useCanvases } from '@/lib/canvas-store'
import { useI18n } from '@/lib/i18n'
import { PageLoading } from '@/components/page-loading'
import { ArchiveCardTile } from '@/features/archive/archive-card-tile'
import { CardDetailModal } from '@/features/card/card-detail'
import { DEFAULT_CANVAS_ID } from '@/features/canvas/default-canvas'
import { captureSinkRegistry } from '@/features/capture/capture-sink'
import { getDeviceId } from '@/lib/device-id'
import { pushToast } from '@/lib/toast-store'
import { groupCardsByDay } from '@/lib/group-by-day'

const DEVICE_ID = getDeviceId()

/**
 * 全局时间线视图(P10)— 跨 inbox / canvas / archive 的全部非删除卡片,
 * 按 capturedAt(想法诞生时刻)倒序、按捕获日分组。核心增值:每张卡显示
 * 它「现在在哪」(收件箱 / 在画布 X / 已归档),因为全局视图的卡是混合
 * 状态——这是它区别于 archive timeline(单一已归档状态)的点。
 *
 * 纯本地、无 AI、无 R2 隐私面。复用 ArchiveCardTile(row + badge slot)+
 * CardDetailModal(动作全套)。spec:
 * docs/superpowers/specs/2026-06-25-timeline-view-design.md
 */
export default function TimelinePage() {
  const { t } = useI18n()
  const { snap, service, ready } = useDb()
  void snap // 订阅快照,数据变化时 re-render
  const { snapshot: canvasesSnap } = useCanvases()
  const [detail, setDetail] = useState<Card | null>(null)

  // canvasId → name,给「在画布 X」徽标用。
  const canvasNameById = useMemo(() => {
    const m = new Map<string, string>()
    for (const c of canvasesSnap.canvases) m.set(c.id, c.name)
    return m
  }, [canvasesSnap.canvases])

  // 全部非删除卡,capturedAt 倒序。日分组由 groupCardsByDay 保输入序。
  const sorted = useMemo(
    () =>
      service
        .listAll()
        .filter((c) => !c.deletedAt)
        .sort((a, b) => b.capturedAt.getTime() - a.capturedAt.getTime()),
    [service, snap],
  )
  const groups = useMemo(
    () => groupCardsByDay(sorted, (c) => c.capturedAt),
    [sorted],
  )

  // 状态徽标:archived > 在画布 > inbox。
  const stateBadgeOf = (c: Card) => {
    if (c.archived) return <Tag color="blue">{t('timeline.state.archived')}</Tag>
    if (c.canvasPosition) {
      const name = canvasNameById.get(c.canvasPosition.canvasId)
      // 孤儿卡(canvas 已删但卡仍引用)→ 退化通用「画布」标签,不报错。
      return (
        <Tag color="gray">
          {name
            ? t('timeline.state.canvas', { name })
            : t('nav.canvas')}
        </Tag>
      )
    }
    return <Tag color="red">{t('timeline.state.inbox')}</Tag>
  }

  // Bug B fix: derive the LIVE card from the store by id during render.
  // The page re-renders on any store change (useDb subscription), but the
  // modal used to keep showing the STALE `detail` object captured at open
  // time — including a ghost card since soft-deleted / archived / edited
  // elsewhere (another tab, a batch action). service.get returns soft-deleted
  // cards too, so we filter on !deletedAt: when the card is gone (or
  // soft-deleted) effectiveDetail becomes null and the modal unmounts.
  // Edited-elsewhere cards show fresh data. Action callbacks read
  // effectiveDetail.id / .pinned (guaranteed non-null while modal is open).
  const liveDetail = detail ? (service.get(detail.id) ?? null) : null
  const effectiveDetail =
    liveDetail && !liveDetail.deletedAt ? liveDetail : null

  return (
    <main id="main" tabIndex={-1} className="page">
      <Toolbar region="timeline">
        <span className="crumb">{t('brand.name')}</span>
        <span className="crumb-sep">/</span>
        <h1 className="crumb crumb--here">{t('timeline.crumb')}</h1>
        <span className="crumb-spacer" />
        <Tag color="red">{sorted.length}</Tag>
      </Toolbar>

      <div className="page-content page-content--wide">
        {!ready ? (
          <PageLoading />
        ) : sorted.length === 0 ? (
          <UICard>
            <div className="empty">
              <BauhausMotif />
              <p className="eyebrow">{t('timeline.crumb')}</p>
              <h2 className="display-title display-title--lg">
                {t('timeline.empty.title')}
              </h2>
              <p className="empty__lede">{t('timeline.empty.lede')}</p>
            </div>
          </UICard>
        ) : (
          <p className="lede">{t('timeline.lede')}</p>
        )}

        {ready && sorted.length > 0 && (
          <div className="tl">
            {[...groups.entries()].map(([day, dayCards]) => (
              <section className="tl__day" key={day}>
                <h3 className="tl__day-label">{day}</h3>
                <ul className="tl__list">
                  {/* 日内 pinned 稳定分区置顶(不全局置顶,保时间脉络)。 */}
                  {pinFirst(dayCards).map((c) => (
                    <li key={c.id}>
                      <ArchiveCardTile
                        card={c}
                        variant="row"
                        badge={stateBadgeOf(c)}
                        onClick={() => setDetail(c)}
                      />
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>
        )}

        <p className="footnote">
          <Link href="/" className="footnote__link">← {t('common.home')}</Link>
        </p>
      </div>

      {effectiveDetail && (
        <CardDetailModal
          card={effectiveDetail}
          actions={['archive', 'unarchive', 'sendToCanvas', 'softDelete', 'pin', 'export', 'rewrite', 'summarize', 'translate']}
          onClose={() => setDetail(null)}
          onSave={(patch) => {
            const updated = service.update(effectiveDetail.id, patch)
            if (updated) setDetail(updated)
          }}
          onTogglePin={() => {
            const updated = service.update(effectiveDetail.id, { pinned: !effectiveDetail.pinned })
            if (updated) setDetail(updated)
          }}
          onArchive={() => {
            service.archive(effectiveDetail.id)
            setDetail(null)
          }}
          onUnarchive={() => {
            service.unarchive(effectiveDetail.id)
            setDetail(null)
          }}
          onSendToCanvas={() => {
            const targetCanvasId = canvasesSnap.activeCanvasId ?? DEFAULT_CANVAS_ID
            const existing = service.listOnCanvas(targetCanvasId)
            const nextZ = existing.length === 0
              ? 0
              : Math.max(...existing.map((c) => c.canvasPosition?.z ?? 0)) + 1
            service.moveToCanvas(effectiveDetail.id, {
              canvasId: targetCanvasId,
              x: 100 + (nextZ % 5) * 40,
              y: 100 + (nextZ % 5) * 40,
              w: 200,
              h: 80,
              z: nextZ,
            })
            const updated = service.get(effectiveDetail.id)
            if (updated) setDetail(updated)
          }}
          onConfirmDelete={() => {
            service.softDelete(effectiveDetail.id)
            setDetail(null)
          }}
          onAIAppendNew={(c) => {
            // submit() ALWAYS returns a Promise (converts sync throws →
            // rejections), so a try/catch is dead — we .catch the rejection
            // instead (H2 fix: was an unhandled rejection + silent loss on
            // quota failure). The popover already showed an optimistic toast.
            void captureSinkRegistry
              .submit({
                source: { kind: 'manual', deviceId: DEVICE_ID },
                title: c.title,
                body: c.body,
              })
              .catch((e: unknown) => {
                const msg = e instanceof Error ? e.message : String(e)
                pushToast({
                  kind: 'error',
                  message: t('capture.persistFailed', { error: msg }),
                })
              })
          }}
        />
      )}

      <style>{styles}</style>
    </main>
  )
}

const styles = `
.page { min-height: 100vh; background: var(--color-white); color: var(--color-black); }
.lede { margin: 0 0 var(--space-4); color: var(--color-black-soft); font-family: var(--font-content); font-size: var(--font-size-lg); line-height: 1.5; max-width: 60ch; }

.tl { display: flex; flex-direction: column; gap: var(--space-4); }
.tl__day { display: flex; flex-direction: column; gap: var(--space-2); }
.tl__day-label {
  margin: 0;
  font-family: var(--font-mono);
  font-size: var(--font-size-xs);
  text-transform: uppercase;
  letter-spacing: 0.16em;
  color: var(--color-gray);
}
.tl__list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: var(--space-2); }

.empty { display: flex; flex-direction: column; align-items: flex-start; gap: var(--space-2); padding: var(--space-3) 0; }
`

/** 日内 pinned 稳定分区置顶(保捕获序,和 inbox pinFirst / archive G2 一致)。 */
function pinFirst<T extends { pinned: boolean }>(cards: T[]): T[] {
  return [...cards.filter((c) => c.pinned), ...cards.filter((c) => !c.pinned)]
}
