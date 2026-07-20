'use client'

import { useEffect, useMemo, useState } from 'react'
import { elementCenter, type CanvasElement, type CanvasHost } from '@cys-stift/canvas-engine'
import type { ProposalCommitPlanV1 } from './proposal-transaction'

function endpoints(host: CanvasHost, arrow: CanvasElement): [{ x: number; y: number }, { x: number; y: number }] | null {
  if (arrow.kind !== 'arrow' || !arrow.from || !arrow.to) return null
  const from = host.getElement(arrow.from)
  const to = host.getElement(arrow.to)
  if (!from || !to) return null
  return [elementCenter(from), elementCenter(to)]
}

export function ProposalGhostOverlay({ host, plan }: { host: CanvasHost; plan: ProposalCommitPlanV1 }) {
  const [, redraw] = useState(0)
  useEffect(() => {
    const update = () => redraw((value) => value + 1)
    const offView = host.onViewChange(update)
    const offUser = host.onUserChange(update)
    return () => { offView(); offUser() }
  }, [host])
  const view = host.getView()
  const lines = useMemo(() => plan.elementChanges.flatMap((change) => {
    const arrow = change.next ?? change.expected
    if (!arrow) return []
    const points = endpoints(host, arrow)
    if (!points) return []
    return [{ id: change.id, points, removed: change.next === null, changed: !!change.expected && !!change.next }]
  }), [host, plan, view.panX, view.panY, view.zoom])
  const cards = useMemo(() => plan.elementChanges.flatMap((change) => {
    if (change.next?.kind !== 'card') return []
    return [{ id: change.id, before: change.expected?.kind === 'card' ? change.expected : null, next: change.next }]
  }), [plan])
  const screen = (point: { x: number; y: number }) => ({ x: point.x * view.zoom + view.panX, y: point.y * view.zoom + view.panY })
  return <svg aria-hidden="true" className="cv-proposal-ghost" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none', zIndex: 29, overflow: 'hidden' }}>
    {cards.map((card) => {
      const next = screen({ x: card.next.x, y: card.next.y })
      const before = card.before ? screen({ x: card.before.x + card.before.w / 2, y: card.before.y + card.before.h / 2 }) : null
      const center = screen({ x: card.next.x + card.next.w / 2, y: card.next.y + card.next.h / 2 })
      return <g key={card.id} opacity="0.72">
        {before && <line x1={before.x} y1={before.y} x2={center.x} y2={center.y} stroke="var(--color-blue)" strokeWidth="2" strokeDasharray="6 6" />}
        <rect x={next.x} y={next.y} width={card.next.w * view.zoom} height={card.next.h * view.zoom} fill="var(--color-yellow)" fillOpacity="0.2" stroke="var(--color-blue)" strokeWidth="3" strokeDasharray="8 6" />
      </g>
    })}
    {lines.map((line) => {
      const from = screen(line.points[0]); const to = screen(line.points[1])
      return <g key={line.id} opacity="0.82">
        <line x1={from.x} y1={from.y} x2={to.x} y2={to.y} stroke={line.removed ? 'var(--color-red)' : 'var(--color-blue)'} strokeWidth="4" strokeDasharray={line.removed ? '8 8' : line.changed ? '4 6' : undefined} />
        <circle cx={to.x} cy={to.y} r="7" fill="var(--color-yellow)" stroke="var(--color-black)" strokeWidth="2" />
      </g>
    })}
  </svg>
}
