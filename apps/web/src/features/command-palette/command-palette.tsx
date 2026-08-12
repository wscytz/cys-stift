'use client'

/**
 * CommandPalette (P3-T1) — ⌘K / ⌘/ 全局面板。
 *
 * 一个 Modal,内置输入框。输入框空:只显示跳转项(NAV 数组)。有输入:
 * 跳转项按 includes 过滤 + 卡片搜索前 8(searchCards)。点搜索结果开
 * 共享 CardDetailModal。
 *
 * open state 由外层 search-shortcut 管理(它也绑定快捷键),这里只负责
 * 受控渲染。样式 cmd__ 前缀自给,走 token,不写死颜色/像素。
 */
import { useMemo, useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { Modal } from '@cys-stift/ui'
import type { Card } from '@cys-stift/domain'
import { searchCards } from '@cys-stift/domain'
import { useDb } from '@/lib/db-client'
import { useI18n } from '@/lib/i18n'
import { CardDetailModal } from '@/features/card/card-detail'
import { readableBodySnippet } from '@/app/search/search-result'
import type { MessageKey } from '@/lib/i18n/messages'

interface CommandPaletteProps {
  open: boolean
  onClose: () => void
}

interface NavItem {
  href: string
  labelKey: MessageKey
}

// 跳转项。/tags 现在还没建(P3-T2 会建),先列上让面板认得这个路径。
const NAV: NavItem[] = [
  { href: '/', labelKey: 'common.home' },
  { href: '/inbox', labelKey: 'nav.inbox' },
  { href: '/canvas', labelKey: 'nav.canvas' },
  { href: '/graph', labelKey: 'nav.graph' },
  { href: '/archive', labelKey: 'nav.archive' },
  { href: '/timeline', labelKey: 'nav.timeline' },
  { href: '/tags', labelKey: 'nav.tags' },
  { href: '/search', labelKey: 'nav.search' },
  { href: '/trash', labelKey: 'nav.trash' },
  { href: '/settings', labelKey: 'nav.settings' },
]

const MAX_CARDS = 8

export function CommandPalette({ open, onClose }: CommandPaletteProps) {
  const { t } = useI18n()
  const { snap, service, ready } = useDb()
  const router = useRouter()
  const [query, setQuery] = useState('')
  const [detail, setDetail] = useState<Card | null>(null)
  const [activeIndex, setActiveIndex] = useState(0)
  const inputRef = useRef<HTMLInputElement | null>(null)

  // 开/关时重置输入 + 详情。打开时聚焦输入框。
  useEffect(() => {
    if (open) {
      setQuery('')
      setDetail(null)
      // 聚焦:Modal 也会 move focus,但 Modal 把焦点放到 frame;输入框是首
      // 个可聚焦元素,已够用。这里补一刀保证输入框拿焦点。
      const id = window.setTimeout(() => inputRef.current?.focus(), 0)
      return () => window.clearTimeout(id)
    }
    setQuery('')
    setDetail(null)
  }, [open])

  // Esc 在面板内关面板(CardDetailModal 打开时由它自己处理 Esc)。
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !detail) {
        e.preventDefault()
        onClose()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, detail, onClose])

  const liveCards = useMemo(
    () => service.listAll().filter((c) => !c.deletedAt),
    // snap 是 useSyncExternalStore 快照,数据变化才重新分配。
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [snap, service],
  )

  const q = query.trim()
  const navMatches = useMemo(
    () =>
      q === ''
        ? NAV
        : NAV.filter((n) => {
            const label = t(n.labelKey)
            return (
              label.toLowerCase().includes(q.toLowerCase()) ||
              n.href.toLowerCase().includes(q.toLowerCase())
            )
          }),
    [q, t],
  )

  const cardMatches = useMemo(() => {
    if (q === '') return []
    // searchCards 空 query 会返回全部,这里 query 必非空才进。
    const hits = searchCards(liveCards, query)
    return hits.slice(0, MAX_CARDS)
  }, [q, query, liveCards])

  // B1 — 最近编辑:空 query 时显示,按 updatedAt 倒序取前 8。点卡走 openCard
  // (有 canvasPosition 跳画布定位,否则开详情)。
  const recentCards = useMemo(() => {
    if (q !== '') return []
    return [...liveCards]
      .sort((a, b) => +b.updatedAt - +a.updatedAt)
      .slice(0, MAX_CARDS)
  }, [q, liveCards])

  // B1 — 智能开卡:在画布 → 跳 /canvas/?card=ID(canvas 页读 query 居中+开详情);
  // 不在画布(inbox)→ 开详情 Modal(与现有搜索结果一致)。
  const openCard = (card: Card) => {
    if (card.canvasPosition) {
      onClose()
      // 用 location 而非 router.push:静态导出下 search params 浏览器原生处理,
      // 且若已在 /canvas 需触发挂载 effect 重新读 query(push 同页不重挂载)。
      window.location.href = '/canvas/?card=' + encodeURIComponent(String(card.id))
    } else {
      setDetail(card)
    }
  }

  const go = (href: string) => {
    onClose()
    router.push(href)
  }

  const hasNothing =
    navMatches.length === 0 && cardMatches.length === 0 && recentCards.length === 0

  // R12:统一键盘导航选项(导航项 + 最近卡 + 搜索结果),ArrowUp/Down 移动、
  // Enter 打开。此前 ⌘K 只支持 Esc,键盘流在输入后断裂(↓ 选不中/Enter 无反应)。
  type CmdOption = { key: string; label: string; hint?: string; activate: () => void }
  const options: CmdOption[] = useMemo(() => {
    const list: CmdOption[] = []
    for (const n of navMatches) {
      const href = n.href
      list.push({ key: `nav:${href}`, label: t(n.labelKey), hint: href, activate: () => go(href) })
    }
    for (const c of recentCards) {
      list.push({
        key: `recent:${String(c.id)}`,
        label: c.title || t('card.untitled'),
        hint: c.canvasPosition ? t('cmd.onCanvas') : t('cmd.inInbox'),
        activate: () => openCard(c),
      })
    }
    for (const r of cardMatches) {
      list.push({ key: `card:${String(r.card.id)}`, label: r.card.title || t('card.untitled'), activate: () => openCard(r.card) })
    }
    return list
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [navMatches, recentCards, cardMatches, t])

  // query 变化重置键盘位置到首项。
  useEffect(() => {
    setActiveIndex(0)
  }, [query])

  // CardDetailModal 打开时,面板主体藏掉避免视觉重叠(详情 modal 覆盖在上)。
  const showDetail = Boolean(detail)

  return (
    <>
      <Modal open={open && !showDetail} onClose={onClose} title={t('cmd.title')} closeLabel={t('common.close')}>
        <div className="cmd">
          <input
            ref={inputRef}
            className="cmd__input"
            type="text"
            placeholder={t('cmd.placeholder')}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            disabled={!ready}
            aria-label={t('cmd.placeholder')}
            // R12:⌘K 键盘导航(ArrowUp/Down 移动高亮,Enter 打开,Esc 关闭)。
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown' && options.length > 0) {
                e.preventDefault()
                setActiveIndex((i) => (i + 1) % options.length)
              } else if (e.key === 'ArrowUp' && options.length > 0) {
                e.preventDefault()
                setActiveIndex((i) => (i - 1 + options.length) % options.length)
              } else if (e.key === 'Enter') {
                const opt = options[activeIndex]
                if (opt) {
                  e.preventDefault()
                  opt.activate()
                }
              }
            }}
          />

          {!ready ? null : hasNothing ? (
            <p className="cmd__empty">{t('cmd.empty')}</p>
          ) : (
            <div className="cmd__list">
              {navMatches.length > 0 && (
                <div className="cmd__group">
                  <p className="cmd__group-label">{t('cmd.group.navigate')}</p>
                  <ul className="cmd__items">
                    {navMatches.map((n, i) => (
                      <li key={n.href}>
                        <button
                          type="button"
                          className={`cmd__item${i === activeIndex ? ' cmd__item--active' : ''}`}
                          onMouseEnter={() => setActiveIndex(i)}
                          onClick={() => go(n.href)}
                        >
                          <span className="cmd__item-label">{t(n.labelKey)}</span>
                          <span className="cmd__item-hint">{n.href}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {recentCards.length > 0 && (
                <div className="cmd__group">
                  <p className="cmd__group-label">{t('cmd.group.recent')}</p>
                  <ul className="cmd__items">
                    {recentCards.map((c, i) => {
                      const idx = navMatches.length + i
                      return (
                        <li key={c.id}>
                          <button
                            type="button"
                            className={`cmd__item${idx === activeIndex ? ' cmd__item--active' : ''}`}
                            onMouseEnter={() => setActiveIndex(idx)}
                            onClick={() => openCard(c)}
                          >
                            <span className="cmd__item-label">
                              {c.title || t('card.untitled')}
                            </span>
                            <span className="cmd__item-hint">
                              {c.canvasPosition ? t('cmd.onCanvas') : t('cmd.inInbox')}
                            </span>
                          </button>
                        </li>
                      )
                    })}
                  </ul>
                </div>
              )}

              {cardMatches.length > 0 && (
                <div className="cmd__group">
                  <p className="cmd__group-label">{t('cmd.group.cards')}</p>
                  <ul className="cmd__items">
                    {cardMatches.map((r, i) => {
                      const idx = navMatches.length + recentCards.length + i
                      return (
                        <li key={r.card.id}>
                          <button
                            type="button"
                            className={`cmd__item${idx === activeIndex ? ' cmd__item--active' : ''}`}
                            onMouseEnter={() => setActiveIndex(idx)}
                            onClick={() => openCard(r.card)}
                          >
                            <span className="cmd__item-label">
                              {r.card.title || t('card.untitled')}
                            </span>
                            {/* R12:⌘K 卡片结果也带正文片段(纯正文命中的卡/未命名卡可分辨) */}
                            <span className="cmd__item-snippet">
                              {readableBodySnippet(r.card, q) ?? ''}
                            </span>
                          </button>
                        </li>
                      )
                    })}
                  </ul>
                  {/* R12:⌘K 只显示前 8 条,加「在搜索页查看全部」入口(带 query 预填)。 */}
                  <button
                    type="button"
                    className="cmd__see-all"
                    onClick={() => go(`/search?q=${encodeURIComponent(q)}`)}
                  >
                    {t('cmd.seeAll')}
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        <style>{styles}</style>
      </Modal>

      {/* 详情 modal 独立挂在面板外:面板 close 时它仍可停留到用户关它。 */}
      {detail && (
        <CardDetailModal
          card={detail}
          actions={['archive', 'softDelete', 'sendToCanvas', 'pin']}
          onClose={() => setDetail(null)}
          onSave={(patch) => {
            const updated = service.update(detail.id, patch)
            if (updated) setDetail(updated)
            return updated != null
          }}
          onTogglePin={() => {
            const updated = service.update(detail.id, { pinned: !detail.pinned })
            if (updated) setDetail(updated)
          }}
          onConfirmDelete={() => {
            service.softDelete(detail.id)
            setDetail(null)
            onClose()
          }}
        />
      )}
    </>
  )
}

const styles = `
.cmd { display: flex; flex-direction: column; gap: var(--space-2); }
.cmd__input {
  width: 100%; height: 40px; padding: 0 var(--space-2);
  font-family: var(--font-body); font-size: var(--font-size-base);
  border: var(--border-hairline); border-radius: var(--radius-sm);
  background: var(--color-white); color: var(--color-black);
  outline: none;
}
.cmd__input:focus { border-color: var(--color-black); border-width: 2px; padding: 0 calc(var(--space-2) - 1px); }
.cmd__list {
  max-height: 360px; overflow-y: auto;
  display: flex; flex-direction: column; gap: var(--space-2);
}
.cmd__group { display: flex; flex-direction: column; gap: var(--space-1); }
.cmd__group-label {
  margin: 0; font-family: var(--font-mono);
  font-size: var(--font-size-xs); color: var(--color-gray);
  text-transform: uppercase; letter-spacing: 0.05em;
}
.cmd__items { list-style: none; margin: 0; padding: 0; }
.cmd__item {
  width: 100%; display: flex; justify-content: space-between; align-items: baseline;
  gap: var(--space-2); padding: var(--space-1) var(--space-2);
  background: var(--color-white); color: var(--color-black);
  border: none; border-bottom: var(--border-hairline);
  font-family: var(--font-body); font-size: var(--font-size-sm);
  text-align: left; cursor: pointer;
}
.cmd__item:hover, .cmd__item:focus-visible {
  background: var(--color-black); color: var(--color-white);
  outline: none;
}
.cmd__item-hint {
  font-family: var(--font-mono); font-size: var(--font-size-xs);
  opacity: 0.7; flex-shrink: 0;
}
.cmd__empty {
  margin: 0; padding: var(--space-2); font-family: var(--font-mono);
  font-size: var(--font-size-sm); color: var(--color-gray);
}
`
