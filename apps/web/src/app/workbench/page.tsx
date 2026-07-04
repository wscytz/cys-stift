'use client'

import { useMemo } from 'react'
import { BauhausMotif, Card as UICard, Tag, Toolbar } from '@cys-stift/ui'
import { useDb } from '@/lib/db-client'
import { useI18n } from '@/lib/i18n'
import { PageLoading } from '@/components/page-loading'
import { WorkbenchBrowser } from '@/features/workbench/workbench-browser'

/**
 * 工作台库页 /workbench — D4 卡片库(形态 (ii):另开入口)。
 *
 * 窄 dock 单卡编辑器(D2)保留;库侧栏独立成全屏页。库 = 浏览/整理面;
 * 点卡 → workbenchStore.open + 跳 /canvas,dock 接管编辑该卡(库本身不编辑)。
 *
 * 分类模式(画布 default / 类型 / 标签)+ 已固定置顶区 + 搜索;分区 A 折叠/C 展开手风琴。
 */
export default function WorkbenchPage() {
  const { t } = useI18n()
  const { snap, service, ready } = useDb()
  void snap

  const cards = useMemo(
    () => service.listAll().filter((c) => !c.deletedAt),
    [service, snap],
  )

  return (
    <main id="main" tabIndex={-1} className="page">
      <Toolbar region="archive">
        <span className="crumb">{t('brand.name')}</span>
        <span className="crumb-sep">/</span>
        <h1 className="crumb crumb--here">{t('workbench.title')}</h1>
        <span className="crumb-spacer" />
        <Tag color="blue">{t('workbench.count', { n: String(cards.length) })}</Tag>
      </Toolbar>

      <div className="page-content page-content--wide">
        {!ready ? (
          <PageLoading />
        ) : cards.length === 0 ? (
          <EmptyState />
        ) : (
          <WorkbenchBrowser cards={cards} />
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
`
