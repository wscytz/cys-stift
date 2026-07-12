'use client'
import { useEffect, useRef, useState } from 'react'

export interface PanelPos {
  left: number
  top: number
}

/**
 * 可拖动浮窗位置 hook（抽自 minimap-component 的 proven 逻辑）。
 * - pos null = 用默认定位（调用方决定默认 right/bottom or left/top）
 * - pos 非 null = 用持久 left/top
 * - onPointerDown 挂标题栏：button 0 + clamp 到 container（= ref.parentElement）
 * - justDraggedRef：拖完 pointerup 短暂 true，防误触折叠按钮（minimap 范式）
 * - localStorage 持久（storageKey），pos 变化时存（初始化那帧不存）。
 */
export function useDraggablePanelPos(
  containerRef: React.RefObject<HTMLElement | null>,
  storageKey: string,
): {
  pos: PanelPos | null
  onPointerDown: (e: React.PointerEvent) => void
  positioned: boolean
  justDraggedRef: React.MutableRefObject<boolean>
} {
  const [pos, setPos] = useState<PanelPos | null>(() => {
    if (typeof window === 'undefined') return null
    try {
      const raw = window.localStorage.getItem(storageKey)
      if (!raw) return null
      const p = JSON.parse(raw) as { left?: number; top?: number }
      if (typeof p.left === 'number' && typeof p.top === 'number') {
        return { left: p.left, top: p.top }
      }
    } catch {
      /* ignore */
    }
    return null
  })
  const justDraggedRef = useRef(false)
  const wroteInitialRef = useRef(false)

  useEffect(() => {
    if (!wroteInitialRef.current) {
      wroteInitialRef.current = true
      return
    }
    if (pos) window.localStorage.setItem(storageKey, JSON.stringify(pos))
  }, [pos, storageKey])

  const onPointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0) return
    const el = containerRef.current
    const container = el?.parentElement
    if (!el || !container) return
    const startClientX = e.clientX
    const startClientY = e.clientY
    const box = el.getBoundingClientRect()
    const startLeft = box.left
    const startTop = box.top
    let moved = false
    const onMove = (ev: PointerEvent) => {
      const dx = ev.clientX - startClientX
      const dy = ev.clientY - startClientY
      if (!moved && Math.abs(dx) < 3 && Math.abs(dy) < 3) return
      moved = true
      justDraggedRef.current = true
      const contRect = container.getBoundingClientRect()
      const maxLeft = Math.max(0, contRect.width - box.width - 4)
      const maxTop = Math.max(0, contRect.height - box.height)
      const curLeft = pos?.left ?? startLeft - contRect.left
      const curTop = pos?.top ?? startTop - contRect.top
      const newLeft = Math.min(Math.max(0, curLeft + dx), maxLeft)
      const newTop = Math.min(Math.max(0, curTop + dy), maxTop)
      setPos({ left: newLeft, top: newTop })
    }
    const onUp = () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', onUp)
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', onUp)
  }

  return { pos, onPointerDown, positioned: pos !== null, justDraggedRef }
}
