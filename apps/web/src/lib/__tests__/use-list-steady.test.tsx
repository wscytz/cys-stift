/**
 * useListSteady — 列表入场只播一次守卫的时序契约。
 *
 * 动效二轮(2026-08-24):.tile/.row 的 tile-in 挂载即播,筛选/搜索会按按键
 * 重放;守卫在页面挂载 entranceMs 后置 steady,配合 CSS .list-steady 关动画。
 * 这里钉住两态边界:窗口内 false(允许播)、到点 true(关);缺省窗 = 700ms
 * (覆盖 tile-in 300ms + 最大 320ms nth-child 延迟)。
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import React, { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { useListSteady } from '@/lib/use-list-steady'

;(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true

let root: Root | null = null
let container: HTMLElement | null = null

afterEach(() => {
  vi.useRealTimers()
  if (root) act(() => root!.unmount())
  root = null
  container?.remove()
  container = null
})

function mountSteady(entranceMs?: number): HTMLElement {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  function Probe() {
    const steady = useListSteady(entranceMs)
    return <div data-steady={String(steady)} />
  }
  act(() => root!.render(<Probe />))
  return container.firstElementChild as HTMLElement
}

const steadyOf = (el: HTMLElement) => el.getAttribute('data-steady')

describe('useListSteady', () => {
  it('挂载初期 steady=false(入场窗口允许 tile-in)', () => {
    const el = mountSteady()
    expect(steadyOf(el)).toBe('false')
  })

  it('700ms 缺省窗到点置 steady=true(关重放)', () => {
    vi.useFakeTimers()
    const el = mountSteady()
    act(() => vi.advanceTimersByTime(699))
    expect(steadyOf(el)).toBe('false')
    act(() => vi.advanceTimersByTime(1))
    expect(steadyOf(el)).toBe('true')
  })

  it('自定义窗口与缺省解耦', () => {
    vi.useFakeTimers()
    const el = mountSteady(100)
    act(() => vi.advanceTimersByTime(100))
    expect(steadyOf(el)).toBe('true')
  })
})
