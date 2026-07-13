'use client'

import { useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { BauhausMotif, Card as UICard, Tag, Toolbar } from '@cys-stift/ui'
import type { CardId, TagRef } from '@cys-stift/domain'
import { useDb } from '@/lib/db-client'
import { useI18n } from '@/lib/i18n'
import { useWorkbench, workbenchStore } from '@/lib/workbench-store'
import { PageLoading } from '@/components/page-loading'
import { WorkbenchBrowser } from '@/features/workbench/workbench-browser'
import { WorkbenchPanel } from '@/features/canvas/workbench-panel'

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
  const router = useRouter()
  const { cardId } = useWorkbench()
  void snap

  const cards = useMemo(
    () => service.listAll().filter((c) => !c.deletedAt),
    [service, snap],
  )

  const card = cardId ? service.get(cardId as CardId) : undefined
  const active = card && !card.deletedAt ? card : undefined

  const wbSave = (patch: { title: string; body: string; tags: TagRef[] }) => {
    if (!cardId) return
    service.update(cardId as CardId, patch)
  }

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
          onClick={() => router.push('/canvas')}
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
            <div className="wb-page__lib">
              <WorkbenchBrowser cards={cards} />
            </div>
            {active ? (
              <WorkbenchPanel
                card={active}
                onSave={wbSave}
                onClose={() => workbenchStore.close()}
              />
            ) : (
              <div className="wb-page__empty">{t('workbench.selectHint')}</div>
            )}
          </div>
        )}
      </div>

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
.wb-page {
  display: grid;
  grid-template-columns: clamp(220px, 22vw, 280px) minmax(0, 1fr);
  gap: var(--space-2);
  height: calc(100vh - 180px);
}
.wb-page__lib { overflow: auto; min-height: 0; }
.wb-page__empty {
  display: grid; place-items: center;
  border: var(--border-thick); background: var(--color-white-soft);
  color: var(--color-gray); font-style: italic;
  padding: var(--space-4);
}
@media (max-width: 1023px) {
  .wb-page { grid-template-columns: minmax(0, 1fr); height: auto; }
}
`
