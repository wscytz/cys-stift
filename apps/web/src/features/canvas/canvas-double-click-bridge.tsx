'use client'

/**
 * T4 + v0.31.0 (P1.3): DoubleClickBridge — closes review #4 for
 * double-click handling. Extracted from canvas-editor.tsx as part of the
 * file-split refactor.
 *
 * Previously `wireDoubleClick()` was called from inside `onMount` and
 * `addEventListener`'d on `editor.getContainer()` with no matching
 * `removeEventListener`. It worked in practice because tldraw tears down the
 * container with the editor, but it relied on that implicit lifetime — a
 * brittle assumption.
 *
 * Now `useEffect([editor, ...])` adds the listener and the cleanup function
 * removes it. When the page unmounts (or the editor handle changes) the
 * listener is gone before the editor is dropped, so no phantom dblclick on
 * a stale container.
 *
 * The callback is stored in a ref so the effect doesn't depend on a fresh
 * `onOpenCard` identity every render — page-side `onOpenCard={(card) =>
 * setDetail({card})}` would otherwise re-subscribe on every render.
 */
import { useEffect, useRef } from 'react'
import type { Editor } from '@tldraw/tldraw'
import type { CanvasId, Card, CardService } from '@cys-stift/domain'
import { addCardShape, cardIdFromShapeId } from './canvas-binding'
import { captureSinkRegistry } from '@/features/capture/capture-sink'
import { getDeviceId } from '@/lib/device-id'

const DEVICE_ID = getDeviceId()
const DEFAULT_CARD_W = 240
const DEFAULT_CARD_H = 120

export function DoubleClickBridge({
  editor,
  canvasId,
  service,
  onOpenCard,
}: {
  editor: Editor | null
  canvasId: CanvasId
  service: CardService
  onOpenCard: (card: Card) => void
}) {
  const cbRef = useRef(onOpenCard)
  cbRef.current = onOpenCard
  const serviceRef = useRef(service)
  serviceRef.current = service

  useEffect(() => {
    if (!editor) return
    const container = editor.getContainer()
    // C3 (v0.23.3): captureSinkRegistry.submit() resolves on a microtask,
    // so a rapid second dblclick on the same blank spot hits the handler
    // again before the first card's shape is added to the editor. Without
    // this guard the second dblclick sees no shape at the point and
    // creates a duplicate card. We hold the flag from the create call
    // until the shape lands (or the promise rejects).
    let creating = false
    const onDbl = (e: MouseEvent) => {
      const pagePoint = editor.screenToPage({ x: e.clientX, y: e.clientY })
      const hit = editor.getShapeAtPoint(pagePoint)
      if (hit && hit.type === 'card') {
        const card = serviceRef.current.get(cardIdFromShapeId(String(hit.id)))
        if (card) cbRef.current(card)
        return
      }
      if (creating) return
      // Blank dblclick → create via captureSinkRegistry (Phase plan:
      // unify all entry-points through the registry — manual sink
      // registered on inbox mount, registry falls back to
      // fallbackService when the sink isn't ready yet, so card is
      // never lost). We reuse `manual` source kind (same path as
      // the inbox form); the canvasPosition disambiguates the
      // resulting card from inbox-only manual creates.
      creating = true
      void captureSinkRegistry
        .submit({
          title: '',
          source: { kind: 'manual', deviceId: DEVICE_ID },
          canvasPosition: {
            canvasId,
            x: Math.round(pagePoint.x),
            y: Math.round(pagePoint.y),
            w: DEFAULT_CARD_W,
            h: DEFAULT_CARD_H,
            z: Date.now(),
          },
        })
        .then(({ cardId }) => {
          const card = serviceRef.current.get(cardId)
          if (card) {
            addCardShape(editor, card)
            cbRef.current(card)
          }
        })
        .catch((err: unknown) => {
          // surface in dev console; the registry itself only rejects
          // when neither a matching sink nor a fallback service is set,
          // which would be a wiring bug (CaptureHost / inbox mount
          // both set fallback).
          console.error('[canvas-editor] dblclick create failed', err)
        })
        .finally(() => {
          creating = false
        })
    }
    container.addEventListener('dblclick', onDbl)
    return () => container.removeEventListener('dblclick', onDbl)
  }, [editor, canvasId])
  return null
}