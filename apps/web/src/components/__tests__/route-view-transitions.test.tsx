/**
 * RouteViewTransitions — 同文档路由 VT 触发器的四条契约。
 *
 * 动效二轮(2026-08-24):Next <Link> 客户端导航不触发跨文档 VT,本组件在
 * pushState 外包 document.startViewTransition。钉住:
 *  1) 无 startViewTransition 的引擎(Firefox/旧 WebKit)全程 no-op —— 不置
 *     data-vt-nav、不包 pushState,page-enter 继续兜底;
 *  2) 支持时:pushState → VT 启动,启动前置位 data-vt-nav(新 main 带着
 *     animation:none 挂载),原生 pushState 只在 VT 回调内执行;
 *  3) settle 落定(rAF×2 或 300ms 帽)—— 回调 promise 必须能 resolve,
 *     否则浏览器按 4s 超时中止 VT;
 *  4) finished 拒绝(VT 被中止)不产生 unhandledrejection;页面隐藏直落。
 *  5) 卸载还原:删实例自有 pushState(回落原型)、移除 popstate 监听;
 *  6) 严格模式重挂载(挂载→卸载→再挂载)后仍单层包裹 —— reactStrictMode 开着,
 *     无 cleanup 时 pushState 双层包裹,导航时嵌套 startViewTransition 被浏览器
 *     skip、回调不执行,原生 pushState 永远不会被调(dev 下 URL 不更新)。
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import React, { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { RouteViewTransitions } from '@/components/route-view-transitions'

;(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true

type StartVTCallback = () => void | Promise<void>
interface FakeVT {
  callback: StartVTCallback
  finished: Promise<void>
}

let root: Root | null = null
let container: HTMLElement | null = null
const nativePushState = history.pushState.bind(history)

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
  // 组件 cleanup 会还原 pushState;这里兜底再还原一次全局面(测试可能提前抛错)。
  history.pushState = nativePushState
  delete (document as unknown as Record<string, unknown>).startViewTransition
  document.documentElement.removeAttribute('data-vt-nav')
  Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true })
  history.pushState({}, '', '/')
  if (root) act(() => root!.unmount())
  root = null
  container?.remove()
  container = null
})

function mountComponent() {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  act(() => root!.render(<RouteViewTransitions />))
}

function stubStartViewTransition(finished: Promise<void> = Promise.resolve()) {
  const started: FakeVT[] = []
  ;(document as unknown as { startViewTransition: (cb: StartVTCallback) => unknown })
    .startViewTransition = (cb: StartVTCallback) => {
    const vt: FakeVT = { callback: cb, finished }
    started.push(vt)
    return vt
  }
  return started
}

describe('RouteViewTransitions', () => {
  it('无 startViewTransition:全程 no-op(pushState 原生,data-vt-nav 不置)', () => {
    mountComponent()
    act(() => history.pushState({}, '', '/no-vt'))
    expect(document.documentElement.hasAttribute('data-vt-nav')).toBe(false)
    expect(location.pathname).toBe('/no-vt')
  })

  it('支持 VT:pushState 触发 VT,回调内才执行原生 pushState,启动前置位标记', () => {
    const started = stubStartViewTransition()
    mountComponent()
    act(() => history.pushState({}, '', '/inbox'))
    const vt = started[0]
    expect(vt).toBeTruthy()
    // 置位先于 VT 启动(新 main 带着关停的 page-enter 挂载)
    expect(document.documentElement.hasAttribute('data-vt-nav')).toBe(true)
    // 原生 pushState 在 VT 回调内才执行:回调未跑,URL 不变
    expect(location.pathname).toBe('/')
    act(() => {
      void vt!.callback()
    })
    expect(location.pathname).toBe('/inbox')
  })

  it('settle 有 300ms 帽:回调 promise 必然落定(防 4s 超时中止)', async () => {
    vi.useFakeTimers({
      toFake: ['setTimeout', 'clearTimeout', 'requestAnimationFrame', 'cancelAnimationFrame'],
    })
    const started = stubStartViewTransition()
    mountComponent()
    act(() => history.pushState({}, '', '/archive'))
    let settled = false
    // rAF 被饿死(不 advance rAF,只跑 setTimeout 帽)也要落定
    const p = Promise.resolve(started[0]!.callback()).then(() => {
      settled = true
    })
    await act(async () => {
      await vi.advanceTimersByTimeAsync(320)
    })
    await p
    expect(settled).toBe(true)
  })

  it('finished 拒绝(VT 中止)无 unhandledrejection;隐藏页直落不启动 VT', async () => {
    const onUnhandled = vi.fn()
    process.on('unhandledRejection', onUnhandled)
    // 4) 隐藏页:直落(原生 pushState 即刻执行,不启 VT)
    const started = stubStartViewTransition(Promise.reject(new Error('aborted')))
    Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true })
    mountComponent()
    act(() => history.pushState({}, '', '/hidden-nav'))
    expect(started.length).toBe(0)
    expect(location.pathname).toBe('/hidden-nav')
    // 5) 可见页 + finished 拒绝:置位/推进照常,且拒绝被接住
    Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true })
    act(() => history.pushState({}, '', '/aborted-nav'))
    await act(() => {
      void started[0]!.callback()
    })
    await new Promise((r) => setTimeout(r, 20))
    expect(onUnhandled).not.toHaveBeenCalled()
    process.off('unhandledRejection', onUnhandled)
  })

  it('卸载还原:自有 pushState 回落原型方法,popstate 监听移除', () => {
    const started = stubStartViewTransition()
    mountComponent()
    expect(history.pushState).not.toBe(History.prototype.pushState)
    act(() => root!.unmount())
    root = null
    // 实例自有属性被删,回落到原型上的原生方法
    expect(history.pushState).toBe(History.prototype.pushState)
    // popstate 监听已移除:再派发不启动 VT
    window.dispatchEvent(new PopStateEvent('popstate'))
    expect(started.length).toBe(0)
  })

  it('严格模式重挂载后单层包裹:一次导航只启动一个 VT,回调内 URL 照常推进', () => {
    const started = stubStartViewTransition()
    mountComponent()
    act(() => root!.unmount())
    root = null
    mountComponent()
    act(() => history.pushState({}, '', '/strict-remount'))
    // 双层包裹的回归指纹:一次 pushState 启动两个 VT(内层在真浏览器会被 skip,
    // 真原生 pushState 永远不执行 —— dev 下应用内导航 URL 不更新)
    expect(started.length).toBe(1)
    act(() => {
      void started[0]!.callback()
    })
    expect(location.pathname).toBe('/strict-remount')
  })
})
