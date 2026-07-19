'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import type { Card } from '@cys-stift/domain'
import { Search, X } from 'lucide-react'
import { markdownPreview } from '@/features/card/markdown-preview'
import { useI18n } from '@/lib/i18n'

export interface CanvasSearchResult {
  card: Card
  match: 'title' | 'body'
  snippet: string
}

/** Search only the cards supplied by the active canvas. Pure and bounded so it
 * can be reused by the panel and a future command-palette integration. */
export function searchCanvasCards(
  cards: readonly Card[],
  query: string,
  limit = 20,
): CanvasSearchResult[] {
  const needle = query.trim().toLocaleLowerCase()
  if (!needle) return []
  const out: CanvasSearchResult[] = []
  for (const card of cards) {
    if (card.deletedAt || card.archived) continue
    const title = card.title ?? ''
    const body = markdownPreview(card.body ?? '', 500)
    const titleMatch = title.toLocaleLowerCase().includes(needle)
    const bodyMatch = !titleMatch && body.toLocaleLowerCase().includes(needle)
    if (!titleMatch && !bodyMatch) continue
    out.push({
      card,
      match: titleMatch ? 'title' : 'body',
      snippet: titleMatch ? body : body || title,
    })
    if (out.length >= limit) break
  }
  return out
}

export function CanvasSearchPanel({
  open,
  cards,
  onClose,
  onLocate,
}: {
  open: boolean
  cards: readonly Card[]
  onClose: () => void
  onLocate: (card: Card) => void
}) {
  const { t } = useI18n()
  const inputRef = useRef<HTMLInputElement | null>(null)
  const [query, setQuery] = useState('')
  const [activeIndex, setActiveIndex] = useState(0)
  const results = useMemo(() => searchCanvasCards(cards, query), [cards, query])

  useEffect(() => {
    if (!open) return
    setQuery('')
    setActiveIndex(0)
    requestAnimationFrame(() => inputRef.current?.focus())
  }, [open])

  if (!open) return null

  const locate = (result: CanvasSearchResult | undefined) => {
    if (!result) return
    onLocate(result.card)
    onClose()
  }

  return (
    <section className="cv-search" role="dialog" aria-label={t('canvas.search.title')}>
      <style>{styles}</style>
      <div className="cv-search__head">
        <label className="cv-search__input-wrap">
          <Search size={16} aria-hidden="true" />
          <input
            ref={inputRef}
            value={query}
            onChange={(event) => {
              setQuery(event.target.value)
              setActiveIndex(0)
            }}
            onKeyDown={(event) => {
              if (event.key === 'Escape') {
                event.preventDefault()
                onClose()
              } else if (event.key === 'ArrowDown' && results.length > 0) {
                event.preventDefault()
                setActiveIndex((index) => (index + 1) % results.length)
              } else if (event.key === 'ArrowUp' && results.length > 0) {
                event.preventDefault()
                setActiveIndex((index) => (index - 1 + results.length) % results.length)
              } else if (event.key === 'Enter') {
                event.preventDefault()
                locate(results[activeIndex])
              }
            }}
            placeholder={t('canvas.search.placeholder')}
            aria-label={t('canvas.search.placeholder')}
            autoComplete="off"
          />
        </label>
        <button type="button" className="cv-search__close" onClick={onClose} aria-label={t('canvas.search.close')} title={t('canvas.search.close')}>
          <X size={16} aria-hidden="true" />
        </button>
      </div>
      {query.trim() && (
        <div className="cv-search__status" role="status">
          {results.length > 0 ? t('canvas.search.count', { n: String(results.length) }) : t('canvas.search.empty')}
        </div>
      )}
      {results.length > 0 && (
        <div className="cv-search__results" role="listbox" aria-label={t('canvas.search.results')}>
          {results.map((result, index) => (
            <button
              key={String(result.card.id)}
              type="button"
              role="option"
              aria-selected={index === activeIndex}
              className={`cv-search__result${index === activeIndex ? ' cv-search__result--active' : ''}`}
              onMouseEnter={() => setActiveIndex(index)}
              onClick={() => locate(result)}
            >
              <strong>{result.card.title || t('card.untitled')}</strong>
              {result.snippet && <span>{result.snippet}</span>}
            </button>
          ))}
        </div>
      )}
    </section>
  )
}

const styles = `
.cv-search {
  position: absolute;
  z-index: 60;
  top: var(--space-2);
  right: calc(var(--space-2) + 48px);
  width: min(360px, calc(100vw - 96px));
  background: var(--color-white);
  border: var(--border-thick);
  box-shadow: var(--shadow-md);
  color: var(--color-black);
}
.cv-search__head { display: flex; align-items: center; gap: var(--space-1); padding: var(--space-1); border-bottom: var(--border-hairline); }
.cv-search__input-wrap { display: flex; align-items: center; gap: var(--space-1); flex: 1; min-width: 0; padding: 0 var(--space-1); color: var(--color-gray); }
.cv-search__input-wrap input { width: 100%; min-height: 40px; border: 0; outline: 0; background: transparent; color: var(--color-black); font: inherit; }
.cv-search__input-wrap:focus-within { outline: 2px solid var(--color-red); outline-offset: 1px; }
.cv-search__close { width: 40px; height: 40px; display: grid; place-items: center; border: 0; background: transparent; color: var(--color-gray); cursor: pointer; }
.cv-search__close:hover { color: var(--color-red); background: var(--color-red-soft); }
.cv-search__close:focus-visible, .cv-search__result:focus-visible { outline: 2px solid var(--color-red); outline-offset: -2px; }
.cv-search__status { padding: var(--space-1) var(--space-2); border-bottom: var(--border-hairline); color: var(--color-gray); font-family: var(--font-mono); font-size: var(--font-size-xs); }
.cv-search__results { max-height: min(50vh, 360px); overflow: auto; padding: var(--space-1); display: grid; gap: 2px; }
.cv-search__result { display: grid; gap: 2px; width: 100%; padding: var(--space-1) var(--space-2); border: 1px solid transparent; background: transparent; color: var(--color-black); text-align: left; cursor: pointer; }
.cv-search__result:hover, .cv-search__result--active { background: var(--color-yellow-soft); border-color: var(--color-yellow); }
.cv-search__result strong { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: var(--font-size-sm); }
.cv-search__result span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--color-gray); font-size: var(--font-size-xs); }
@media (max-width: 640px) { .cv-search { right: var(--space-2); left: var(--space-2); width: auto; } }
`
