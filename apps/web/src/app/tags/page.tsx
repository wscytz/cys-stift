'use client'

import { useMemo } from 'react'
import Link from 'next/link'
import { BauhausMotif, Card as UICard, Tag, Toolbar } from '@cys-stift/ui'
import type { CardId } from '@cys-stift/domain'
import { useDb } from '@/lib/db-client'
import { useI18n } from '@/lib/i18n'
import { PageLoading } from '@/components/page-loading'
import { TagManagement } from '@/features/tags/tag-management'
import type { TagChange } from '@/features/tags/tag-ops'

/**
 * 标签页 /tags — P3-T2 标签墙于 D5（2026-07-04）升级为管理页。
 *
 * 管理表（TagManagement）：改名 / 改色（10 色 popover）/ 删（去标）/ 合并（勾 ≥2 →
 * 选 target → 多源一次性合）。变更经 service.update 落库（{tags} 偏更新），snap 反应式刷新。
 */
export default function TagsPage() {
  const { t } = useI18n()
  const { snap, service, ready } = useDb()
  void snap // 订阅快照,数据变化时 re-render

  // 全部非删除卡(给 TagManagement 算聚合 + 应用变更)。
  const cards = useMemo(
    () =>
      service
        .listAll()
        .filter((c) => !c.deletedAt),
    [service, snap],
  )

  const hasTags = cards.some((c) => (c.tags ?? []).length > 0)

  // TagManagement 算出的变更 → 落库。{tags} 偏更新(UpdateCardPatch)。
  const applyTagChanges = (changes: TagChange[]) => {
    for (const c of changes) service.update(c.id as CardId, { tags: c.tags })
  }

  return (
    <main id="main" tabIndex={-1} className="page">
      <Toolbar region="archive">
        <span className="crumb">{t('brand.name')}</span>
        <span className="crumb-sep">/</span>
        <h1 className="crumb crumb--here">{t('tags.title')}</h1>
        <span className="crumb-spacer" />
        <Tag color="blue">{t('tags.count', { n: String(countTaggedCards(cards)) })}</Tag>
      </Toolbar>

      <div className="page-content page-content--wide">
        {!ready ? (
          <PageLoading />
        ) : !hasTags ? (
          <EmptyState />
        ) : (
          <TagManagement cards={cards} onApplyChanges={applyTagChanges} />
        )}

        <p className="footnote">
          <Link href="/" className="footnote__link">← {t('common.home')}</Link>
        </p>
      </div>

      <style>{styles}</style>
    </main>
  )
}

/** 统计带至少一个 tag 的卡数(Toolbar 计数用)。 */
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
