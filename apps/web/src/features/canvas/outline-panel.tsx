'use client'

/**
 * OutlinePanel (大纲视图) — a floating structural overview of the canvas.
 *
 * This is the **structural** complement to the minimap's **spatial** overview:
 * a table-of-contents / layers list of every element on the canvas. Clicking an
 * item centers the canvas on that element and selects it — turning the
 * 转义(画布↔文字)core selling point into a concrete browsing/navigation affordance.
 *
 * Read-only v1: no inline editing, no drag-reorder (that lives in the DSL modal,
 * the editable interchange format). The outline is local-render only — it is
 * never sent to AI and never leaves the device (R2: freedraw shows only a
 * '(sketch)' label, never its point sequence).
 *
 * Chrome mirrors the minimap (Bauhaus white bg + 2px black border + 4px hard
 * shadow + role="group" + i18n'd collapse labels). It floats on the LEFT side
 * to avoid colliding with the right-side rail + bottom-right minimap. z-index 30
 * sits with the other floating panels, below modals (100).
 */
import { useCallback, useEffect, useState } from 'react'
import type { CanvasHost } from '@cys-stift/canvas-engine'
import { elementCenter } from '@cys-stift/canvas-engine'
import { useI18n } from '@/lib/i18n'
import { buildOutline, type OutlineItem } from './outline'

const PANEL_WIDTH = 220
/** Cap the list height so a huge canvas doesn't push the panel off-screen;
 *  the body scrolls internally. Leaves room for the title bar + bottom gap. */
const BODY_MAX_HEIGHT = 360

// #19 折叠态持久化(reload 后保留用户折叠/展开)。
const COLLAPSED_KEY = 'cys-stift.outline-collapsed.v1'
function loadCollapsed(): boolean {
  if (typeof window === 'undefined') return false
  return window.localStorage.getItem(COLLAPSED_KEY) === '1'
}

export function OutlinePanel({
  host,
  canvasEl,
  getCardTitle,
  getEndpointTitle,
}: {
  host: CanvasHost | null
  /** Main canvas element (reads CSS size for the centering math). null → hide. */
  canvasEl: HTMLCanvasElement | null
  getCardTitle: (id: string) => string | undefined
  getEndpointTitle: (id: string) => string | undefined
}) {
  const { t } = useI18n()
  const [collapsed, setCollapsed] = useState(loadCollapsed)
  // Re-render on host changes — mirrors RelationPanel's subscription pattern
  // (debt 收口 2026-06-23, replaces polling). user change covers add/remove/edit
  // of elements; selection change keeps the highlighted row in sync; view change
  // is harmless here but cheap, and keeping it means a pan/zoom won't leave the
  // list visually stale if we later derive anything from the view.
  const [, force] = useState(0)

  useEffect(() => {
    if (!host) return
    const bump = () => force((n) => n + 1)
    const unsubs = [
      host.onUserChange(bump),
      host.onSelectionChange(bump),
    ]
    return () => {
      for (const u of unsubs) u()
    }
  }, [host])

  const items: OutlineItem[] =
    host && !collapsed ? buildOutline(host.getElements(), getCardTitle, getEndpointTitle) : []

  const selectedIds = host ? new Set(host.getSelectedIds()) : new Set<string>()

  /** Center the canvas on an element's page-coord center, then select it.
   *  Same math as the minimap's centerOnMiniPoint, but we already have the page
   *  coord via elementCenter — no inverse projection needed. */
  const focusItem = useCallback(
    (itemId: string) => {
      if (!host || !canvasEl) return
      const el = host.getElement(itemId)
      if (!el) return
      const c = elementCenter(el)
      const view = host.getView()
      const zoom = view.zoom || 1
      const cx = canvasEl.clientWidth / 2
      const cy = canvasEl.clientHeight / 2
      host.setView({
        ...view,
        panX: cx - c.x * zoom,
        panY: cy - c.y * zoom,
      })
      host.setSelectedIds([itemId])
    },
    [host, canvasEl],
  )

  if (!host) return null

  const title = t('canvas.outline')
  const collapseLabel = collapsed ? t('canvas.outline.expand') : t('canvas.outline.collapse')

  return (
    <div
      className="cv-outline"
      role="group"
      aria-label={title}
      style={{
        position: 'absolute',
        left: 'var(--space-1)',
        top: 'calc(var(--app-menu-height) + 3px)',
        width: PANEL_WIDTH,
        zIndex: 30,
        background: 'var(--color-white)',
        border: '2px solid var(--color-black)',
        boxShadow: '4px 4px 0 0 var(--color-black)',
        borderRadius: 'var(--radius-sm)',
      }}
    >
      {/* Title bar: mono small-caps title + collapse toggle (mirrors minimap). */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: 'var(--space-1)',
          borderBottom: collapsed ? 'none' : 'var(--border-hairline)',
        }}
      >
        <span
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 'var(--font-size-xs)',
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
            color: 'var(--color-black)',
          }}
        >
          {title}
        </span>
        <button
          type="button"
          onClick={() => {
            const next = !collapsed
            setCollapsed(next)
            try { window.localStorage.setItem(COLLAPSED_KEY, next ? '1' : '0') } catch { /* quota */ }
          }}
          aria-label={collapseLabel}
          aria-expanded={!collapsed}
          title={collapseLabel}
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 'var(--font-size-xs)',
            lineHeight: 1,
            padding: '0 var(--space-1)',
            background: 'transparent',
            color: 'var(--color-black)',
            border: 'none',
            cursor: 'pointer',
          }}
        >
          {collapsed ? '▸' : '▾'}
        </button>
      </div>

      {!collapsed && (
        <div
          className="cv-outline__body"
          style={{
            maxHeight: BODY_MAX_HEIGHT,
            overflowY: 'auto',
            padding: 'var(--space-1)',
          }}
        >
          {items.length === 0 ? (
            <p
              style={{
                margin: 0,
                padding: 'var(--space-1)',
                fontFamily: 'var(--font-mono)',
                fontSize: 'var(--font-size-xs)',
                color: 'var(--color-gray)',
              }}
            >
              {t('canvas.outline.empty')}
            </p>
          ) : (
            <ul
              className="cv-outline__list"
              style={{
                listStyle: 'none',
                margin: 0,
                padding: 0,
                display: 'flex',
                flexDirection: 'column',
                gap: 2,
              }}
            >
              {items.map((item) => {
                const selected = selectedIds.has(item.id)
                const ariaParts = item.sublabel
                  ? `${item.label} ${item.sublabel}`
                  : item.label
                return (
                  <li key={item.id} style={{ margin: 0, padding: 0 }}>
                    <button
                      type="button"
                      className={`cv-outline__item${selected ? ' cv-outline__item--active' : ''}`}
                      onClick={() => focusItem(item.id)}
                      aria-label={ariaParts}
                      aria-pressed={selected}
                      style={{
                        width: '100%',
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'flex-start',
                        gap: 2,
                        padding: '4px var(--space-1)',
                        textAlign: 'left',
                        background: selected ? 'var(--color-yellow)' : 'transparent',
                        color: 'var(--color-black)',
                        border: `1px solid ${selected ? 'var(--color-black)' : 'transparent'}`,
                        borderRadius: 'var(--radius-sm)',
                        cursor: 'pointer',
                        fontFamily: 'var(--font-mono)',
                        fontSize: 'var(--font-size-xs)',
                        lineHeight: 1.3,
                      }}
                    >
                      <span
                        className="cv-outline__label"
                        style={{
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                          maxWidth: '100%',
                        }}
                      >
                        {item.label}
                      </span>
                      {item.sublabel && (
                        <span
                          className="cv-outline__sub"
                          style={{
                            // Slightly smaller than the label; no extra font-size token assumed.
                            fontSize: 'calc(var(--font-size-xs) - 2px)',
                            opacity: selected ? 0.8 : 0.7,
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                            maxWidth: '100%',
                          }}
                        >
                          {item.sublabel}
                        </span>
                      )}
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      )}

      <style>{styles}</style>
    </div>
  )
}

const styles = `
.cv-outline__item:hover:not(.cv-outline__item--active) {
  background: var(--color-gray-soft);
}
.cv-outline__item:focus-visible {
  outline: 2px solid var(--color-red);
  outline-offset: 2px;
}
.cv-outline__body::-webkit-scrollbar { width: 6px; }
.cv-outline__body::-webkit-scrollbar-thumb { background: var(--color-gray); border-radius: 3px; }
`
