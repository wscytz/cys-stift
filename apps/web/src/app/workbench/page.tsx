'use client'

import { useEffect, useMemo, useState, useSyncExternalStore } from 'react'
import { useRouter } from 'next/navigation'
import { BauhausMotif, Card as UICard, Modal, Tag, Toolbar, Button } from '@cys-stift/ui'
import type { Card, CardId, TagRef } from '@cys-stift/domain'
import type { CanvasHost } from '@cys-stift/canvas-engine'
import { useDb } from '@/lib/db-client'
import { useI18n } from '@/lib/i18n'
import { useWorkbench, workbenchStore } from '@/lib/workbench-store'
import { PageLoading } from '@/components/page-loading'
import { WorkbenchBrowser } from '@/features/workbench/workbench-browser'
import { WorkbenchPanel } from '@/features/canvas/workbench-panel'
import { MinimapPreview } from '@/features/canvas/minimap-preview'
import { buildCanvasHostForCanvas } from '@/features/canvas/canvas-host-builder'
import { getFreeformVersion, subscribeFreeformChanges } from '@/lib/canvas-freeform-store'

/**
 * 工作台页 /workbench — 左库(找/切卡)+ 右编辑器(就地编辑)。
 *
 * 编辑只在工作台:任何入口点卡 → workbenchStore.open → 本页右栏编辑。
 * 画布退为空间组织;顶栏「›画布」回画布(画布页自读 activeCanvasId)。
 * 跨页画布形状/wikilink 箭头实时同步不做(spec 接受);写库后画布下次渲染读最新。
 */
export default function WorkbenchPage() {
  const { t } = useI18n()
  const { snap, service, ready } = useDb()
  const freeformVersion = useSyncExternalStore(
    subscribeFreeformChanges,
    getFreeformVersion,
    getFreeformVersion,
  )
  const router = useRouter()
  const { cardId, origin } = useWorkbench()
  // Entries that already selected a card (home recent items, canvas cards)
  // should land in the editor. Entering /workbench itself still opens the library.
  const [mobileLibrary, setMobileLibrary] = useState(() => cardId === null)
  const [editorDirty, setEditorDirty] = useState(false)
  const [pendingCardId, setPendingCardId] = useState<string | null>(null)
  const [canvasPreviewHost, setCanvasPreviewHost] = useState<CanvasHost | null>(null)

  const cards = useMemo(
    () => service.listAll().filter((c) => !c.deletedAt),
    [service, snap],
  )

  const card = cardId ? service.get(cardId as CardId) : undefined
  const active = card && !card.deletedAt ? card : undefined
  const previewCanvasId = active?.canvasPosition?.canvasId

  useEffect(() => {
    let stale = false
    setCanvasPreviewHost(null)
    if (!previewCanvasId) return () => { stale = true }
    void buildCanvasHostForCanvas(previewCanvasId, service)
      .then(({ host }) => {
        if (!stale) setCanvasPreviewHost(host)
      })
      .catch(() => {
        if (!stale) setCanvasPreviewHost(null)
      })
    return () => { stale = true }
  }, [previewCanvasId, service, snap, freeformVersion])

  const wbSave = (id: CardId | string, patch: { title: string; body: string; tags: TagRef[] }) => {
    return service.update(id as CardId, patch) !== null
  }

  const openCard = (nextCard: Card) => {
    const id = nextCard.id
    if (active && editorDirty && active.id !== id) {
      setPendingCardId(id)
      return
    }
    workbenchStore.open(id, origin ?? '/canvas')
    setMobileLibrary(false)
    setEditorDirty(false)
    requestAnimationFrame(() => window.scrollTo({ top: 0, behavior: 'auto' }))
  }

  const confirmSwitch = () => {
    if (!pendingCardId) return
    workbenchStore.open(pendingCardId, origin ?? '/canvas')
    setPendingCardId(null)
    setMobileLibrary(false)
    setEditorDirty(false)
    requestAnimationFrame(() => window.scrollTo({ top: 0, behavior: 'auto' }))
  }

  const returnTarget = origin && origin.startsWith('/') ? origin : '/canvas'

  return (
    <main id="main" tabIndex={-1} className="page">
      <Toolbar region="archive">
        <span className="crumb">{t('brand.name')}</span>
        <span className="crumb-sep">/</span>
        <h1 className="crumb crumb--here">{t('workbench.title')}</h1>
        <span className="crumb-spacer" />
        <button
          type="button"
          className="crumb-link"
          onClick={() => router.push(returnTarget)}
          aria-label={t('workbench.backToCanvas')}
        >
          {t('workbench.backToCanvas')}
        </button>
        <Tag color="blue">{t('workbench.count', { n: String(cards.length) })}</Tag>
      </Toolbar>

      <div className="page-content page-content--wide">
        {!ready ? (
          <PageLoading />
        ) : cards.length === 0 ? (
          <EmptyState />
        ) : (
          <div className="wb-page">
            <div className={`wb-page__lib${!mobileLibrary && active ? ' wb-page__lib--mobile-hidden' : ''}`}>
              <WorkbenchBrowser cards={cards} onOpenCard={openCard} />
            </div>
            {active ? (
              <div className={`wb-page__editor${mobileLibrary ? ' wb-page__editor--mobile-hidden' : ''}`}>
                <WorkbenchPanel
                  card={active}
                  onSave={wbSave}
                  onDirtyChange={setEditorDirty}
                  onClose={() => { workbenchStore.close(); setMobileLibrary(true); setEditorDirty(false) }}
                  onBackToList={() => {
                    setMobileLibrary(true)
                    requestAnimationFrame(() => window.scrollTo({ top: 0, behavior: 'auto' }))
                  }}
                />
                <MinimapPreview host={canvasPreviewHost} activeElementId={String(active.id)} />
              </div>
            ) : (
              <div className="wb-page__empty">{t('workbench.selectHint')}</div>
            )}
          </div>
        )}
      </div>

      <Modal open={pendingCardId !== null} onClose={() => setPendingCardId(null)} title={t('workbench.unsavedTitle')} closeLabel={t('common.close')}>
        <p>{t('workbench.unsavedBody')}</p>
        <div className="wb-page__confirm-actions">
          <Button variant="ghost" onClick={() => setPendingCardId(null)}>{t('common.cancel')}</Button>
          <Button variant="primary" onClick={confirmSwitch}>{t('workbench.switchCard')}</Button>
        </div>
      </Modal>

      <style>{styles}</style>
    </main>
  )
}

function EmptyState() {
  const { t } = useI18n()
  return (
    <UICard>
      <div className="page-empty">
        <BauhausMotif variant="overlap" size={160} />
        <p className="eyebrow">{t('workbench.title')}</p>
        <h2 className="display-title display-title--lg">{t('workbench.empty')}</h2>
      </div>
    </UICard>
  )
}

const styles = `
.page { min-height: 100vh; background: var(--color-white); color: var(--color-black); }
.crumb-link {
  display: inline-flex;
  align-items: center;
  min-height: 44px;
  padding: 0 var(--space-1);
  border: 0;
  background: transparent;
  color: var(--color-blue);
  font: inherit;
  text-decoration: underline;
  text-underline-offset: 2px;
  cursor: pointer;
}
.crumb-link:focus-visible { outline: 2px solid var(--color-red); outline-offset: 2px; }
.wb-page {
  display: grid;
  grid-template-columns: clamp(220px, 22vw, 280px) minmax(0, 1fr);
  gap: var(--space-2);
  height: calc(100vh - 180px);
}
.wb-page__lib { overflow: auto; min-height: 0; }
.wb-page__editor { position: relative; min-width: 0; min-height: 0; overflow: hidden; }
.wb-page__confirm-actions { display: flex; justify-content: flex-end; gap: var(--space-2); margin-top: var(--space-3); }
.wb-page__empty {
  display: grid; place-items: center;
  border: var(--border-thick); background: var(--color-white-soft);
  color: var(--color-gray); font-style: italic;
  padding: var(--space-4);
}
@media (max-width: 1023px) {
  .wb-page { grid-template-columns: minmax(0, 1fr); height: auto; }
  .wb-page__lib--mobile-hidden, .wb-page__editor--mobile-hidden { display: none; }
}
`
