'use client'

/**
 * RelationPanel (M1, v0.32.0 Phase 2 子4) — floats above the canvas when
 * exactly one arrow is selected. Clicking a relation type rewrites the
 * arrow's color + text label via applyRelationType (host.upsert). The active
 * type is reverse-inferred from the arrow's current color+text, so
 * re-selecting the same arrow shows the right highlight even after reload
 * (state lives in the arrow element, not React).
 *
 * M2.3 — when the arrow has no type yet (text empty), run keyword inference
 * on the bound source/target cards (arrow.from / arrow.to). If a non-null
 * type is returned, auto-apply it so the new arrow already shows the right
 * visual signature. The user can override by clicking a different type.
 *
 * v0.32.0 (Phase 2 子4): migrated off tldraw. Selection is read from
 * `host.getSelectedIds()` + `host.getElement()`. Re-render is driven by host
 * events (debt 收口 2026-06-23, 替原 200ms 轮询):onSelectionChange(选区变)
 * + onViewChange(pan/zoom 改面板位置)+ onUserChange(applyRelationType 改 arrow
 * 颜色/label)。Panel position is computed from the arrow's from/to element
 * bboxes (page coords) translated to screen coords via the canvas element's
 * rect + the host view.
 *
 * The panel unmounts (returns null) when nothing or something-other-than-
 * an-arrow is selected.
 */
import { useEffect, useRef, useState } from 'react'
import type { Card, CardId } from '@cys-stift/domain'
import { useI18n } from '@/lib/i18n'
import {
  RELATION_TYPES,
  inferRelationType,
  applyRelationType,
  type RelationType,
} from './relation-types'
import { inferRelationTypeFromContext } from './relation-inference'
import { useCardService } from './card-service-context'
import type { CanvasHost, CanvasElement } from '@cys-stift/canvas-engine'

export function RelationPanel({
  host,
  canvasEl,
}: {
  host: CanvasHost | null
  canvasEl: HTMLCanvasElement | null
}) {
  const { t } = useI18n()
  const cardService = useCardService()
  // Re-render on host events instead of polling (替原 200ms 轮询):
  // selection change(显隐/换 arrow)+ view change(pan/zoom 改位置)+
  // user change(applyRelationType 改 arrow 颜色/label 后刷新高亮)。
  const [, force] = useState(0)
  useEffect(() => {
    if (!host) return
    const bump = () => force((n) => n + 1)
    const unsubs = [
      host.onSelectionChange(bump),
      host.onViewChange(bump),
      host.onUserChange(bump),
    ]
    return () => unsubs.forEach((u) => u())
  }, [host])

  if (!host) return null
  const sel = host.getSelectedIds()
  if (sel.length !== 1) return null
  const arrowId = sel[0]!
  const arrow = host.getElement(arrowId)
  if (!arrow || arrow.kind !== 'arrow') return null

  const activeType = inferRelationType(arrow)

  // Keyword inference when the arrow has no type yet.
  let inferred: RelationType | null = null
  if (!activeType && arrow.from && arrow.to) {
    const a = cardService?.get(arrow.from as CardId)
    const b = cardService?.get(arrow.to as CardId)
    if (a && b) inferred = inferRelationTypeFromContext(a as Card, b as Card)
  }

  // Auto-apply inferred type once per (arrowId, inferredType) pair.
  const appliedKey = useRef<string | null>(null)
  useEffect(() => {
    if (!inferred || activeType) return
    const key = `${arrow.id}:${inferred.id}`
    if (appliedKey.current === key) return
    appliedKey.current = key
    applyRelationType(host, arrow.id, inferred, inferred.id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [arrow.id, inferred?.id, activeType?.id, host])

  const displayType: RelationType | null = activeType ?? inferred

  const position = computePanelPosition(arrow, host, canvasEl)
  const panelStyle = position
    ? {
        position: 'fixed' as const,
        left: `${position.left}px`,
        top: `${position.top}px`,
        transform: 'translateX(-50%)',
      }
    : { display: 'none' as const }

  return (
    <div
      className="cv-relation"
      role="group"
      aria-label={t('relation.title')}
      style={panelStyle}
    >
      <span className="eyebrow" aria-hidden="true">
        {t('relation.title')}
      </span>
      <span className="cv-relation__sep" aria-hidden="true" />
      {RELATION_TYPES.map((rt) => {
        const isActive = displayType?.id === rt.id
        return (
          <button
            key={rt.id}
            type="button"
            data-relation-id={rt.id}
            className={`cv-relation__btn ${isActive ? 'cv-relation__btn--active' : ''}`}
            onClick={() => applyRelationType(host, arrow.id, rt, rt.id)}
            aria-pressed={isActive}
            title={t(rt.labelKey)}
          >
            <span
              className="cv-relation__swatch"
              style={{
                // 线型预览:用 border-top 的样式体现 solid/dashed/dotted,颜色=关系色。
                // 这样 swatch 一眼读出「颜色 + 线型」两维签名(箭头形在画布上看)。
                borderTopStyle:
                  rt.dash === 'dashed' ? 'dashed' : rt.dash === 'dotted' ? 'dotted' : 'solid',
                borderTopColor: rt.swatch,
              }}
              aria-hidden="true"
            />
            <span className="cv-relation__label">{t(rt.labelKey)}</span>
          </button>
        )
      })}
      <style>{styles}</style>
    </div>
  )
}

/**
 * Panel position: midpoint between the arrow's from/to element centers (page
 * coords), translated to screen coords via the canvas rect + host view
 * (pan/zoom). Anchored above-center of that midpoint; panel height ≈ 44px,
 * gap 12px. Returns null when the from/to elements can't be resolved or the
 * canvas rect is unavailable.
 */
function computePanelPosition(
  arrow: CanvasElement,
  host: CanvasHost,
  canvasEl: HTMLCanvasElement | null,
): { left: number; top: number } | null {
  if (!arrow.from || !arrow.to || !canvasEl) return null
  const fromEl = host.getElement(arrow.from)
  const toEl = host.getElement(arrow.to)
  if (!fromEl || !toEl) return null
  const view = host.getView()
  const rect = canvasEl.getBoundingClientRect()
  const cx = (fromEl.x + fromEl.w / 2 + toEl.x + toEl.w / 2) / 2
  const cy = (fromEl.y + fromEl.h / 2 + toEl.y + toEl.h / 2) / 2
  const screenX = rect.left + view.panX + cx * view.zoom
  const screenY = rect.top + view.panY + cy * view.zoom
  return {
    left: screenX,
    top: screenY - 56,
  }
}

const styles = `
.cv-relation {
  z-index: 25;
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 6px 8px;
  background: var(--color-white);
  border: 2px solid var(--color-black);
  border-radius: 2px;
  box-shadow: 4px 4px 0 0 var(--color-black);
  font-family: var(--font-mono);
  white-space: nowrap;
}
.cv-relation__sep {
  width: 1px;
  height: 18px;
  background: var(--color-gray-soft);
  margin: 0 2px;
}
.cv-relation__btn {
  height: 30px;
  padding: 0 var(--space-2);
  display: inline-flex;
  align-items: center;
  gap: 6px;
  background: transparent;
  border: 1px solid transparent;
  border-radius: 2px;
  color: var(--color-black);
  font-family: var(--font-mono);
  font-size: var(--font-size-xs);
  letter-spacing: 0.12em;
  text-transform: uppercase;
  cursor: pointer;
  transition: background 80ms ease-out, color 80ms ease-out, border-color 80ms ease-out;
}
.cv-relation__swatch {
  display: inline-block;
  width: 16px;
  height: 0;
  /* 线型预览:3px 顶边,样式/颜色由 inline style 按关系类型设置(solid/dashed/dotted)。 */
  border-top: 3px solid var(--color-black);
  flex: 0 0 auto;
}
.cv-relation__label {
  line-height: 1;
}
.cv-relation__btn:hover:not(.cv-relation__btn--active) {
  background: var(--color-gray-soft);
}
.cv-relation__btn--active {
  background: var(--color-black);
  color: var(--color-white);
  border-color: var(--color-black);
}
.cv-relation__btn--active .cv-relation__swatch {
  /* active 态深底:线型颜色由 inline borderTopColor(关系色)决定,已能在深底读出;
   * 此处不再强制改色(旧填充方块的反色规则已不适用线型预览)。 */
}
.cv-relation__btn:focus-visible {
  outline: 2px solid var(--color-red);
  outline-offset: 2px;
}
`
