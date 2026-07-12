'use client'
import { useLayoutEffect, useRef, useState } from 'react'

export interface PanelPos {
  left: number
  top: number
}

/**
 * 可拖动浮窗位置 hook(抽自 minimap-component 的 proven 逻辑)。
 * - pos null = 用默认定位(调用方决定默认 right/bottom or left/top)
 * - pos 非 null = 用持久 left/top
 * - onPointerDown 挂标题栏:button 0 + clamp 到 container(= ref.parentElement)
 * - justDraggedRef:拖完 pointerup 短暂 true,防误触折叠按钮(minimap 范式)
 * - localStorage 持久(storageKey):
 *    - 初始读(useState lazy)有 try/catch(忽略隐私模式 / 损坏 JSON)
 *    - 写仅 pointerup 时一次(不在每次 pointermove 写,避免 60Hz 主线程 IO)
 *    - 写有 try/catch(配额满 / 隐私模式 → console.warn,不抛)
 * - mount 时 clamp 持久 pos 到 container(useLayoutEffect,防小视口下面板跑屏外不可达)
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

  /** 持久化 pos 到 localStorage(try/catch:配额满 / 隐私模式 → warn 不抛)。 */
  const persistPos = (p: PanelPos) => {
    try {
      window.localStorage.setItem(storageKey, JSON.stringify(p))
    } catch (e) {
      // QuotaExceededError / SecurityError(隐私模式)—— 吞,warn。
      console.warn(`[useDraggablePanelPos] persist failed for "${storageKey}" (quota?)`, e)
    }
  }

  /**
   * Fix 2:mount 时 clamp 持久 pos 到 container 边界。
   * 防小视口陷阱:用户拖过存了 pos,后窗口缩小 / 换小屏 → 旧 pos 超新 container
   * → 面板 render 在屏外不可达。此处读 container 实际尺寸,把超界 pos 拉回。
   * 用 useLayoutEffect(非 useEffect)避免首帧闪在屏外。
   * container 0×0 时跳过(jsdom 默认 / 未挂完);真实浏览器 container 有尺寸时生效。
   */
  useLayoutEffect(() => {
    const el = containerRef.current
    const container = el?.parentElement
    if (!el || !container || !pos) return
    const contRect = container.getBoundingClientRect()
    if (contRect.width === 0 && contRect.height === 0) return // 未布局(jsdom / 隐藏)
    const box = el.getBoundingClientRect()
    const maxLeft = Math.max(0, contRect.width - box.width - 4)
    const maxTop = Math.max(0, contRect.height - box.height)
    const clampedLeft = Math.min(Math.max(0, pos.left), maxLeft)
    const clampedTop = Math.min(Math.max(0, pos.top), maxTop)
    if (clampedLeft !== pos.left || clampedTop !== pos.top) {
      const next = { left: clampedLeft, top: clampedTop }
      setPos(next)
      persistPos(next)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

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
    let lastPos: PanelPos | null = null
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
      const next = { left: newLeft, top: newTop }
      lastPos = next
      setPos(next)
    }
    const onUp = () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', onUp)
      // Fix 1:拖完 pointerup 时存一次(不在每次 pointermove 写,避免 60Hz IO)。
      if (moved && lastPos) persistPos(lastPos)
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', onUp)
  }

  return { pos, onPointerDown, positioned: pos !== null, justDraggedRef }
}
