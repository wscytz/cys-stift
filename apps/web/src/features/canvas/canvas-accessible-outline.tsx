'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import type { Card } from '@cys-stift/domain'
import {
  type CanvasElement,
  SelfBuiltAdapter,
} from '@cys-stift/canvas-engine'
import { useI18n } from '@/lib/i18n'
import { buildOutline } from './outline'

export interface AccessibleCanvasObject {
  id: string
  kind: string
  label: string
  x: number
  y: number
  incoming: string[]
  outgoing: string[]
  relation?: string
}

export function buildAccessibleCanvasObjects(
  elements: CanvasElement[],
  getCardTitle: (id: string) => string | undefined,
): AccessibleCanvasObject[] {
  const titles = new Map<string, string>()
  for (const item of buildOutline(elements, getCardTitle, getCardTitle)) {
    titles.set(item.id, item.label)
  }

  return buildOutline(elements, getCardTitle, getCardTitle).map((item) => {
    const element = elements.find((candidate) => candidate.id === item.id)!
    const incoming: string[] = []
    const outgoing: string[] = []
    for (const arrow of elements) {
      if (arrow.kind !== 'arrow') continue
      if (arrow.from === item.id && arrow.to) {
        outgoing.push(titles.get(arrow.to) ?? getCardTitle(arrow.to) ?? arrow.to)
      }
      if (arrow.to === item.id && arrow.from) {
        incoming.push(titles.get(arrow.from) ?? getCardTitle(arrow.from) ?? arrow.from)
      }
    }
    const from = element.from
      ? titles.get(element.from) ?? getCardTitle(element.from) ?? element.from
      : undefined
    const to = element.to
      ? titles.get(element.to) ?? getCardTitle(element.to) ?? element.to
      : undefined
    return {
      id: item.id,
      kind: item.kind,
      label: item.label,
      x: Math.round(element.x),
      y: Math.round(element.y),
      incoming,
      outgoing,
      relation: from && to ? `${from} -> ${to}` : undefined,
    }
  })
}

export function CanvasAccessibleOutline({
  host,
  getCard,
  onOpenCard,
}: {
  host: SelfBuiltAdapter | null
  getCard: (id: string) => Card | null | undefined
  onOpenCard: (card: Card) => void
}) {
  const { t } = useI18n()
  const [, forceRender] = useState(0)
  const [activeId, setActiveId] = useState<string | null>(null)
  const [announcement, setAnnouncement] = useState('')
  const optionRefs = useRef(new Map<string, HTMLButtonElement>())
  const focusAfterRenderRef = useRef<string | null>(null)

  useEffect(() => {
    if (!host) return
    const bump = () => forceRender((value) => value + 1)
    const selection = (ids: string[]) => {
      setActiveId(ids[0] ?? null)
      bump()
    }
    const unsubs = [host.onElementsChange(bump), host.onSelectionChange(selection)]
    return () => unsubs.forEach((unsubscribe) => unsubscribe())
  }, [host])

  const elements = host?.getElements() ?? []
  const objects = useMemo(
    () =>
      buildAccessibleCanvasObjects(elements, (id) => getCard(id)?.title),
    [elements, getCard],
  )

  useEffect(() => {
    const id = focusAfterRenderRef.current
    if (!id) return
    focusAfterRenderRef.current = null
    optionRefs.current.get(id)?.focus()
  }, [objects])

  if (!host) return null

  const relationText = (object: AccessibleCanvasObject) => {
    const parts: string[] = []
    if (object.relation) parts.push(object.relation)
    if (object.outgoing.length) {
      parts.push(t('canvas.a11y.outgoing', { labels: object.outgoing.join(', ') }))
    }
    if (object.incoming.length) {
      parts.push(t('canvas.a11y.incoming', { labels: object.incoming.join(', ') }))
    }
    return parts.join('. ') || t('canvas.a11y.noRelations')
  }

  const describe = (object: AccessibleCanvasObject) =>
    t('canvas.a11y.object', {
      kind: t(`canvas.a11y.kind.${object.kind}` as never),
      label: object.label,
      x: object.x,
      y: object.y,
      relations: relationText(object),
    })

  const selectAt = (index: number) => {
    const object = objects[index]
    if (!object) return
    host.executeCommand({ type: 'select', ids: [object.id] })
    setActiveId(object.id)
    setAnnouncement(t('canvas.a11y.selected', { object: describe(object) }))
    optionRefs.current.get(object.id)?.focus()
  }

  const onObjectKeyDown = (
    event: React.KeyboardEvent<HTMLButtonElement>,
    object: AccessibleCanvasObject,
    index: number,
  ) => {
    const last = objects.length - 1
    if (!event.altKey && event.key === 'ArrowDown') {
      event.preventDefault()
      event.stopPropagation()
      selectAt(index === last ? 0 : index + 1)
      return
    }
    if (!event.altKey && event.key === 'ArrowUp') {
      event.preventDefault()
      event.stopPropagation()
      selectAt(index === 0 ? last : index - 1)
      return
    }
    if (event.key === 'Home' || event.key === 'End') {
      event.preventDefault()
      event.stopPropagation()
      selectAt(event.key === 'Home' ? 0 : last)
      return
    }
    if (event.key === 'Enter') {
      const card = getCard(object.id)
      if (!card) return
      event.preventDefault()
      event.stopPropagation()
      onOpenCard(card)
      return
    }
    if (event.altKey && event.key.startsWith('Arrow')) {
      const delta = {
        ArrowLeft: { dx: -1, dy: 0 },
        ArrowRight: { dx: 1, dy: 0 },
        ArrowUp: { dx: 0, dy: -1 },
        ArrowDown: { dx: 0, dy: 1 },
      }[event.key]
      if (!delta) return
      event.preventDefault()
      event.stopPropagation()
      host.executeCommand({
        type: 'nudgeSelection',
        ...delta,
        history: 'single',
      })
      const moved = host.getElement(object.id)
      if (moved) {
        setAnnouncement(
          t('canvas.a11y.moved', {
            label: object.label,
            x: Math.round(moved.x),
            y: Math.round(moved.y),
          }),
        )
      }
      return
    }
    if (event.key === 'Delete' || event.key === 'Backspace') {
      event.preventDefault()
      event.stopPropagation()
      const next = objects[index + 1] ?? objects[index - 1]
      host.executeCommand({ type: 'deleteSelection' })
      setAnnouncement(t('canvas.a11y.deleted', { label: object.label }))
      setActiveId(next?.id ?? null)
      if (next) {
        host.executeCommand({ type: 'select', ids: [next.id] })
        focusAfterRenderRef.current = next.id
      }
      return
    }
    const mod = event.metaKey || event.ctrlKey
    if (mod && event.key.toLowerCase() === 'z') {
      event.preventDefault()
      event.stopPropagation()
      const type = event.shiftKey ? 'redo' : 'undo'
      if (host.executeCommand({ type })) {
        setAnnouncement(
          t(type === 'undo' ? 'canvas.a11y.undone' : 'canvas.a11y.redone'),
        )
      }
    }
  }

  return (
    <section
      className="canvas-a11y-outline"
      aria-label={t('canvas.a11y.objects')}
    >
      <span id="canvas-accessible-summary" className="sr-only">
        {t('canvas.a11y.summary', { count: objects.length })}
      </span>
      <div role="listbox" aria-label={t('canvas.a11y.objects')}>
        {objects.map((object, index) => (
          <button
            key={object.id}
            ref={(node) => {
              if (node) optionRefs.current.set(object.id, node)
              else optionRefs.current.delete(object.id)
            }}
            type="button"
            role="option"
            aria-selected={activeId === object.id}
            aria-label={describe(object)}
            className="canvas-a11y-outline__option"
            onFocus={() => {
              host.executeCommand({ type: 'select', ids: [object.id] })
              setActiveId(object.id)
              setAnnouncement(
                t('canvas.a11y.selected', { object: describe(object) }),
              )
            }}
            onClick={() => selectAt(index)}
            onKeyDown={(event) => onObjectKeyDown(event, object, index)}
          >
            <span>{object.label}</span>
            <span className="canvas-a11y-outline__meta">
              {object.kind} · {object.x}, {object.y}
            </span>
          </button>
        ))}
      </div>
      <div className="sr-only" role="status" aria-live="polite" aria-atomic="true">
        {announcement}
      </div>
    </section>
  )
}
