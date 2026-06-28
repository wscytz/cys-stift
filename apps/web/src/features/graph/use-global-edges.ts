'use client'

/**
 * useGlobalEdges — 异步聚合所有画布的 freeform arrow → GraphEdge[]。
 * 从 /graph page 提升(Phase 2a),供图谱 + 详情页 backlinks 共用。
 *
 * 复用 aggregateEdges(Phase 1):遍历 canvasFreeformStore 所有画布的 arrow。
 * can画布列表变化时重聚合;loaded 标志聚合完成。
 */
import { useEffect, useState } from 'react'
import { useCanvases } from '@/lib/canvas-store'
import { canvasFreeformStore } from '@/lib/canvas-freeform-store'
import { aggregateEdges, type GraphEdge } from './aggregate-edges'

export function useGlobalEdges(): { edges: GraphEdge[]; loaded: boolean } {
  const { snapshot } = useCanvases()
  const [edges, setEdges] = useState<GraphEdge[]>([])
  const [loaded, setLoaded] = useState(false)
  useEffect(() => {
    let cancelled = false
    setLoaded(false)
    aggregateEdges(snapshot.canvases, (id) => canvasFreeformStore.load(id)).then((es) => {
      if (cancelled) return
      setEdges(es)
      setLoaded(true)
    })
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [snapshot.canvases])
  return { edges, loaded }
}
