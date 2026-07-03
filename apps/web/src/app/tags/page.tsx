'use client'

import { useMemo } from 'react'
import Link from 'next/link'
import { BauhausMotif, Card as UICard, Tag, Toolbar } from '@cys-stift/ui'
import { useDb } from '@/lib/db-client'
import { useI18n } from '@/lib/i18n'
import { PageLoading } from '@/components/page-loading'
import { TagCloud } from '@/features/tags/tag-cloud'

/**
 * 标签墙 /tags(P3-T2)— 按 tag 聚合浏览卡片。
 *
 * 纯展示:聚合全部非删除卡上的 tags → TagCloud(chip 字号随 count +
 * 点选展开该 tag 的卡网格)。无批量操作、无详情编辑(第一版只展示)。
 *
 * snap 引用保证数据变化时 re-render(与 archive / timeline 一致)。
 */
export default function TagsPage() {
  const { t } = useI18n()
  const { snap, service, ready } = useDb()
  void snap // 订阅快照,数据变化时 re-render

  // 全部非删除卡,updatedAt 倒序(给选中后的网格一个稳定可读序)。
  const cards = useMemo(
    () =>
      service
        .listAll()
        .filter((c) => !c.deletedAt)
        .sort((a, b) => +b.updatedAt - +a.updatedAt),
    [service, snap],
  )

  const hasTags = cards.some((c) => (c.tags ?? []).length > 0)

  return (
    <main id="main" tabIndex={-1} className="page">
      <Toolbar region="archive">
        <span className="crumb">{t('brand.name')}</span>
        <span className="crumb-sep">/</span>
        <h1 className="crumb crumb--here">{t('tags.title')}</h1>
        <span className="crumb-spacer" />
        <Tag color="blue">
          {t('tags.count', { n: countTaggedCards(cards) })}
        </Tag>
      </Toolbar>

      <div className="page-content page-content--wide">
        {!ready ? (
          <PageLoading />
        ) : !hasTags ? (
          <EmptyState />
        ) : (
          <TagCloud cards={cards} />
        )}

        <p className="footnote">
          <Link href="/" className="footnote__link">← {t('common.home')}</Link>
        </p>
      </div>

      <style>{styles}</style>
    </main>
  )
}

/** 统计带至少一个 tag 的卡数(Toolbar 计数用,不复用聚合避免双重遍历意图)。 */
function countTaggedCards(cards: { tags?: { value: string }[] }[]): number {
  return cards.reduce((n, c) => ((c.tags ?? []).length > 0 ? n + 1 : n), 0)
}

function EmptyState() {
  const { t } = useI18n()
  return (
    <UICard>
      <div className="page-empty">
        <BauhausMotif variant="overlap" size={160} />
        <p className="eyebrow">{t('tags.title')}</p>
        <h2 className="display-title display-title--lg">{t('tags.empty')}</h2>
      </div>
    </UICard>
  )
}

const styles = `
.page { min-height: 100vh; background: var(--color-white); color: var(--color-black); }
`
