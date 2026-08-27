'use client'

import { useEffect } from 'react'

/**
 * 同文档路由 View Transitions(渐进增强;globals.css 动效注释的另一半)。
 *
 * Next App Router 的 <Link>/router.push 是客户端导航(走 history.pushState),
 * 不触发 @view-transition(navigation:auto) 的跨文档 VT。本组件在 pushState /
 * popstate 外包一层 document.startViewTransition,应用内路由切换获得编辑式
 * VT(globals.css 的 ::view-transition-old/new(root) 节奏);启动前置位
 * data-vt-nav 关掉 page-enter,避免双段。
 *
 * 不支持 startViewTransition 的引擎(Firefox/旧 WebKit)全程 no-op,
 * page-enter 继续兜底。layout 常驻;cleanup 仍会还原补丁 —— reactStrictMode
 * 开着,dev 挂载双调用若不还原,pushState 会被双层包裹(导航时嵌套 VT 被浏览器
 * skip、回调不执行,原生 pushState 永远不会被调,URL 不更新)。
 *
 * 已知取舍(记录在案,不视为 bug):
 * - settle 用双 rAF 等 React 提交;路由 chunk 晚到时 VT 会多等一两帧旧画面
 *   (静态导出 + prefetch 下不可感)。
 * - popstate(back/forward)的 DOM 变更由 Next 异步处理,settle 可能先于提交
 *   解析 —— 退化成无 VT 的直切,不破坏任何东西。
 * - 只包 pushState(replaceState 多为 hash/滚动恢复类内部调用,包上会产生
 *   莫名其妙的整页 crossfade)。
 */
export function RouteViewTransitions() {
  useEffect(() => {
    type StartVT = (cb: () => void | Promise<void>) => { finished: Promise<void> }
    const svt = (document as Document & { startViewTransition?: StartVT }).startViewTransition
    if (typeof svt !== 'function') return

    let active = false
    // settle:双 rAF 等 React 提交,但加 300ms 兜底帽 —— 重载页(画布/图谱的
    // 高频 rAF 循环)可能饿死 rAF 回调,不设帽时 VT 会被浏览器按 4s 超时中止
    // 并抛 "Transition was aborted because of timeout in DOM update"。
    const settle = () =>
      new Promise<void>((resolve) => {
        let frames = 0
        let done = false
        const finish = () => {
          if (done) return
          done = true
          clearTimeout(cap)
          resolve()
        }
        const cap = setTimeout(finish, 300)
        const step = () => {
          if (done) return
          if (++frames >= 2) finish()
          else requestAnimationFrame(step)
        }
        requestAnimationFrame(step)
      })
    const begin = (apply: () => void) => {
      // 已有 VT 进行中或页面不可见(rAF 全停)时直落:不叠加、不在后台页硬等。
      if (active || document.visibilityState !== 'visible') {
        apply()
        return
      }
      active = true
      // 置位必须先于 startViewTransition:新 main 在 VT 内挂载,带着
      // animation:none 挂载,不会被"先挂载再关闭"重启成第二段。
      document.documentElement.setAttribute('data-vt-nav', '')
      let vt: ReturnType<StartVT>
      try {
        vt = svt.call(document, () => {
          apply()
          return settle()
        })
      } catch {
        // 同步抛错(引擎内部状态非法等):active 若不复位,后续导航会永久
        // 走直落分支、静默降级无 VT。回滚标记位并直落应用变更。
        active = false
        document.documentElement.removeAttribute('data-vt-nav')
        apply()
        return
      }
      // finished 在 VT 被中止(超时/打断)时 reject —— 必须接住,否则
      // unhandledrejection 冒泡成页面错误。
      vt.finished
        .catch(() => {})
        .finally(() => {
          active = false
        })
    }

    const orig = history.pushState.bind(history)
    const wrapped: History['pushState'] = (data, unused, url) =>
      begin(() => orig(data, unused, url))
    history.pushState = wrapped

    const onPop = () => {
      if (!active) begin(() => {})
    }
    window.addEventListener('popstate', onPop, true)

    // 还原补丁(严格模式重挂载/真实卸载都会走这里)。只在补丁仍归本 effect
    // 实例时还原,不得撕掉后来者的补丁;删实例自有属性即回落原型上的原生方法。
    return () => {
      window.removeEventListener('popstate', onPop, true)
      if (history.pushState === wrapped) {
        delete (history as { pushState?: History['pushState'] }).pushState
      }
    }
  }, [])
  return null
}
