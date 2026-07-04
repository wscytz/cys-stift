/**
 * use-platform tests — SSR-safe 平台检测 hooks(useIsMac/useIsMobile/useIsDesktop)。
 *
 * 核心断言:首帧 render(pre-effect)必须返回 SSG 默认值(isMac=false / isMobile=false
 * / isDesktop=true),与 prerendered HTML 一致 → 无 hydration mismatch;effect 跑完
 * 纠正到真实平台值。
 *
 * codebase policy:react-dom/client + `act`(React 19 内置)。样板照 use-match-media.test.tsx。
 * 用 renders[] 追踪每次 render 的值:renders[0]=pre-effect(SSG 默认),renders[1]=post-effect。
 *
 * vi.mock 整个 @/lib/platform:① 隔离 hook 单元(不测 platform.ts 的 regex,那是另一层);
 * ② 绕开 platform.ts 的模块级 _cached 缓存(否则首测 false 缓存后,改 mock 也不纠偏)。
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true

// 可变 mock 状态:vi.mock 工厂 hoisted,故用 vi.hoisted 持有可变引用。
const { platform } = vi.hoisted(() => {
  const platform = { isMac: () => false, isMobile: () => false }
  return { platform }
})
vi.mock('@/lib/platform', () => ({
  isMac: () => platform.isMac(),
  isMobile: () => platform.isMobile(),
}))

import { useIsMac } from '../use-platform'
import { useIsMobile } from '../use-platform'
import { useIsDesktop } from '../use-platform'

/** 渲染 hook 并追踪每次 render 的值(pre-effect + post-effect)。 */
function renderHookTrace<T>(hookFn: () => T): { values: T[]; unmount: () => void } {
  const values: T[] = []
  function Probe() {
    values.push(hookFn())
    return null
  }
  const host = document.createElement('div')
  document.body.appendChild(host)
  const root = createRoot(host)
  act(() => {
    root.render(<Probe />)
  })
  return {
    values,
    unmount() {
      act(() => {
        root.unmount()
      })
      host.remove()
    },
  }
}

describe('useIsMac', () => {
  beforeEach(() => {
    platform.isMac = () => false
    platform.isMobile = () => false
  })

  it('first render = false (SSR default); effect corrects to platform value', () => {
    platform.isMac = () => true
    const { values, unmount } = renderHookTrace(() => useIsMac())
    // pre-effect(首帧)= false,匹配 SSG → 无 hydration mismatch
    expect(values[0]).toBe(false)
    // post-effect = 真实平台值(mac=true)
    expect(values[values.length - 1]).toBe(true)
    unmount()
  })

  it('stays false on non-mac platform', () => {
    platform.isMac = () => false
    const { values, unmount } = renderHookTrace(() => useIsMac())
    expect(values[0]).toBe(false)
    expect(values[values.length - 1]).toBe(false)
    unmount()
  })
})

describe('useIsMobile', () => {
  beforeEach(() => {
    platform.isMac = () => false
    platform.isMobile = () => false
  })

  it('first render = false (SSR default); effect corrects on mobile', () => {
    platform.isMobile = () => true
    const { values, unmount } = renderHookTrace(() => useIsMobile())
    expect(values[0]).toBe(false)
    expect(values[values.length - 1]).toBe(true)
    unmount()
  })

  it('stays false on desktop', () => {
    platform.isMobile = () => false
    const { values, unmount } = renderHookTrace(() => useIsMobile())
    expect(values[0]).toBe(false)
    expect(values[values.length - 1]).toBe(false)
    unmount()
  })
})

describe('useIsDesktop', () => {
  beforeEach(() => {
    platform.isMac = () => false
    platform.isMobile = () => false
  })

  it('first render = true (SSR default isDesktop=true); flips to false on mobile', () => {
    platform.isMobile = () => true
    const { values, unmount } = renderHookTrace(() => useIsDesktop())
    // pre-effect = !false = true,匹配 SSG isDesktop=true
    expect(values[0]).toBe(true)
    // post-effect = !isMobile() = !true = false(移动端)
    expect(values[values.length - 1]).toBe(false)
    unmount()
  })

  it('stays true on desktop', () => {
    platform.isMobile = () => false
    const { values, unmount } = renderHookTrace(() => useIsDesktop())
    expect(values[0]).toBe(true)
    expect(values[values.length - 1]).toBe(true)
    unmount()
  })
})
