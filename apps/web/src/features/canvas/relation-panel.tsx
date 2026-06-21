'use client'

/**
 * RelationPanel (M1) — floats above the canvas when exactly one arrow is
 * selected. Clicking a relation type rewrites the arrow's native style props
 * (color/dash/arrowheadEnd/labelColor) via applyRelationType. The active
 * type is reverse-inferred from the arrow's current props, so re-selecting
 * the same arrow shows the right highlight even after reload (state lives in
 * the arrow record, not React).
 *
 * M2.3 — when the arrow has no type yet (text prop empty), run keyword
 * inference on the bound source/target cards. If a non-null type is
 * returned, auto-apply it so the new arrow already shows the right
 * visual signature. The user can override by clicking a different type.
 *
 * Reads selection reactively via useValue; the panel unmounts (returns null)
 * when nothing or something-other-than-an-arrow is selected.
 *
 * v0.31.0 (P1.2 debt cleanup): Card lookup now goes through
 * `useCardService()` (the existing CardServiceContext) instead of reading
 * the `window.__cardService` global. The panel is a child of
 * `<CardServiceContext.Provider>` inside CanvasEditor, so the hook resolves.
 */
import { useEffect, useRef, type RefObject } from 'react'
import { useValue, type Editor, type TLShapeId } from '@tldraw/tldraw'
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

export function RelationPanel({ editor }: { editor: Editor | null }) {
  const { t } = useI18n()
  // v0.31.0 (P1.2): read the service via context, mirror it into a ref so
  // the useValue callbacks below can read the latest value without re-running
  // the hook tree (useValue's fn isn't a hook context).
  const cardService = useCardService()
  const serviceRef = useRef(cardService)
  serviceRef.current = cardService
  // The selected arrow id, reactive. Returns null until exactly one arrow is
  // selected; useValue re-runs whenever the instance page-state changes.
  const selectedArrowId = useValue(
    'relation selected arrow',
    () => {
      if (!editor) return null
      const sel = editor.getSelectedShapes()
      if (sel.length !== 1) return null
      const s = sel[0]
      if (!s || s.type !== 'arrow') return null
      return s.id as string
    },
    [editor],
  )

  // The active relation type, inferred from the arrow's current props so the
  // highlight survives reload (no React state to restore).
  const activeType = useValue(
    'relation active type',
    () => {
      if (!selectedArrowId || !editor) return null
      const shape = editor.getShape(selectedArrowId as TLShapeId) as
        | { props?: { color?: string; dash?: string; arrowheadEnd?: string; labelColor?: string } }
        | undefined
      if (!shape?.props) return null
      return inferRelationType(shape.props)
    },
    [editor, selectedArrowId],
  )

  // M2.3 — keyword inference. Reads the two cards bound to the arrow (one
  // per terminal), looks them up in CardService, returns the best
  // keyword-matched relation type. Only used when the arrow has no
  // user-set type yet.
  const inferredType = useValue(
    'relation inferred type',
    () => {
      if (!editor || !selectedArrowId) return null
      // Skip inference if the user already set a type (text prop non-empty).
      const arrow = editor.getShape(selectedArrowId as TLShapeId) as
        | { props?: { text?: string } }
        | undefined
      if (arrow?.props?.text) return null
      const bindings = editor.getBindingsToShape(
        selectedArrowId as TLShapeId,
        'arrow',
      )
      const cardIds: string[] = []
      for (const b of bindings) {
        const shape = editor.getShape(b.toId)
        if (shape?.type === 'card') {
          cardIds.push(String(shape.id).replace(/^shape:/, ''))
        }
      }
      if (cardIds.length < 2) return null
      const sourceId = cardIds[0]
      const targetId = cardIds[1]
      if (!sourceId || !targetId) return null
      const svc = serviceRef.current
      if (!svc) return null
      const source = svc.get(sourceId as CardId)
      const target = svc.get(targetId as CardId)
      return inferRelationTypeFromContext(
        source,
        target,
      )
    },
    [editor, selectedArrowId],
  )

  // M2.3 — auto-apply the inferred type on panel open. We only write ONCE
  // per (arrowId, inferredType) pair so the user can still override by
  // clicking a different button after.
  const applied = useRef<string | null>(null)
  useEffect(() => {
    if (!editor || !selectedArrowId || !inferredType || activeType) return
    const key = `${selectedArrowId}:${inferredType.id}`
    if (applied.current === key) return
    applied.current = key
    applyRelationType(
      editor,
      selectedArrowId as TLShapeId,
      inferredType,
      t(inferredType.labelKey),
    )
  }, [editor, selectedArrowId, inferredType, activeType, t])

  // M2.4 — panel position. Floats above the arrow's page-space bounding
  // box, translated to screen coords via the tldraw container offset.
  const position = useValue(
    'relation panel position',
    () => {
      if (!editor || !selectedArrowId) return null
      const b = editor.getShapePageBounds(selectedArrowId as TLShapeId)
      if (!b) return null
      const container = editor.getContainer()
      const rect = container?.getBoundingClientRect()
      const offX = rect?.left ?? 0
      const offY = rect?.top ?? 0
      // Anchor above-center of arrow bounds; panel height ≈ 44px, gap 12px.
      return {
        left: b.x + b.w / 2 - offX,
        top: b.y - offY - 56,
      }
    },
    [editor, selectedArrowId],
  )

  if (!selectedArrowId || !editor) return null

  // Display type: prefer the arrow's own active type, fall back to inferred
  // (so the user sees a highlight even before the auto-apply effect runs).
  const displayType: RelationType | null = activeType ?? inferredType

  const panelStyle = position
    ? {
        position: 'fixed' as const,
        left: `${position.left}px`,
        top: `${position.top}px`,
        transform: 'translateX(-50%)',
      }
    : { display: 'none' }

  return (
    <div
      className="cv-relation"
      role="group"
      aria-label={t('relation.title')}
      style={panelStyle}
    >
      <span className="cv-relation__eyebrow" aria-hidden="true">
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
            onClick={() => applyRelationType(editor, selectedArrowId as never, rt, t(rt.labelKey))}
            aria-pressed={isActive}
            title={t(rt.labelKey)}
          >
            <span
              className="cv-relation__swatch"
              style={{ background: rt.swatch }}
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
.cv-relation__eyebrow {
  padding: 0 var(--space-2);
  font-size: var(--font-size-xs);
  letter-spacing: 0.16em;
  text-transform: uppercase;
  color: var(--color-gray);
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
  width: 10px;
  height: 10px;
  border: 1px solid var(--color-black);
  border-radius: 2px;
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
  /* invert swatch border in active state so the dot reads as inset rather
   * than disappearing into the dark background */
  border-color: var(--color-white);
}
.cv-relation__btn:focus-visible {
  outline: 2px solid var(--color-red);
  outline-offset: 2px;
}
`
