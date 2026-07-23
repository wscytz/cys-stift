'use client'

/**
 * useGlobalEdges — 异步聚合所有画布的 freeform arrow → GraphEdge[]。
 * 从 /graph page 提升(Phase 2a),供图谱 + 详情页 backlinks 共用。
 *
 * 复用 aggregateEdges(Phase 1):遍历 canvasFreeformStore 所有画布的 arrow。
 * 触发重聚合的信号有两个:① canvas 列表变化(增删改画布,useCanvases snapshot);
 * ② freeform 内容变化(关系箭头加/删等,canvasFreeformStore.save/remove → notifyChange)。
 *
 * ② 是 2026-07-01 补的:此前只订阅 canvas 列表,relation-builder 写关系箭头后图谱/backlinks
 * 不刷新,要切页面重挂载才聚合(同删卡灰屏类的「读取方未订阅写入方」缺订阅 bug)。
 * 轻量 debounce 120ms 合并突发(relation-builder 连点 / 画布绘制 debounced save)。
 */
import { useEffect, useState, useSyncExternalStore } from 'react'
import { useCanvases } from '@/lib/canvas-store'
import {
  canvasFreeformStore,
  subscribeFreeformChanges,
  getFreeformVersion,
} from '@/lib/canvas-freeform-store'
import { aggregateEdges, aggregateHrefs, type GraphEdge } from './aggregate-edges'

export function useGlobalEdges(): { edges: GraphEdge[]; hrefMap: Map<string, string[]>; loaded: boolean } {
  const { snapshot } = useCanvases()
  // 订阅 freeform 内容变更:save/remove 触发 notifyChange → version++ → 重渲染 → effect 重聚合。
  const freeformVersion = useSyncExternalStore(
    subscribeFreeformChanges,
    getFreeformVersion,
    getFreeformVersion,
  )
  const [edges, setEdges] = useState<GraphEdge[]>([])
  const [hrefMap, setHrefMap] = useState<Map<string, string[]>>(new Map())
  const [loaded, setLoaded] = useState(false)
  useEffect(() => {
    let cancelled = false
    let timer: ReturnType<typeof setTimeout> | null = null
    // debounce 120ms:合并突发写入(relation-builder 连加 / 画布 save 已 debounced 但保个底),
    // 免遍历所有画布 load 的高频抖动。edges + hrefs 并行聚合(同源画布)。
    timer = setTimeout(() => {
      Promise.all([
        aggregateEdges(snapshot.canvases, (id) => canvasFreeformStore.load(id)),
        aggregateHrefs(snapshot.canvases, (id) => canvasFreeformStore.load(id)),
      ]).then(([es, hm]) => {
        if (cancelled) return
        setEdges(es)
        setHrefMap(hm)
        setLoaded(true)
      })
    }, 120)
    return () => {
      cancelled = true
      if (timer) clearTimeout(timer)
    }
  }, [snapshot.canvases, freeformVersion])
  return { edges, hrefMap, loaded }
}
