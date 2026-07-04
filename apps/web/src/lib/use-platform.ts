'use client'

import { useEffect, useState } from 'react'
import { isMac, isMobile } from '@/lib/platform'

/**
 * use-platform — 平台检测的 SSR-safe React hooks(`isMac`/`isMobile`/`isDesktop`
 * 的渲染安全版)。
 *
 * 为什么需要:平台检测函数(`lib/platform.ts`)在 `typeof window === 'undefined'`
 * 时返回固定默认(isMac=false / isMobile=false / isDesktop=true)—— 这是 SSG
 * 构建期的值。但**客户端首帧**直接调 `isMac()` 会读到真实 navigator → 值与 SSG
 * 不同 → hydration mismatch(mac 客户端 isMac=true vs SSG false;安卓 isMobile=true
 * vs SSG false)。本 hook 用 useState(initial=SSG 默认)+ useEffect 纠正的模式,
 * 保证首帧 client render 与 prerendered HTML 完全一致,effect 跑完再翻到真实值。
 *
 * 与 `useMatchMedia` 区别:平台会话内不变(无需订阅 change),用一次性 useEffect
 * 即可;`useMatchMedia` 要订阅断点变化才用 useSyncExternalStore。
 *
 * **逻辑层(键盘事件)永远 `metaKey || ctrlKey` 双兼容,不依赖平台判断**;这里只
 * 解决"显示给用户看的快捷键提示"和"桌面/移动专属 UI 门控"。
 */

/** 是否 macOS(显示用)。pre-mount=false(匹配 SSG);mount 后纠正。 */
export function useIsMac(): boolean {
  const [mac, setMac] = useState(false)
  useEffect(() => {
    setMac(isMac())
  }, [])
  return mac
}

/**
 * 是否移动端 WebView(安卓/iOS)。pre-mount=false(匹配 SSG);mount 后纠正。
 * 用于隐藏桌面专属 UI(全局热键提示、⌘/^ 修饰键符号等 —— 安卓无系统全局热键)。
 */
export function useIsMobile(): boolean {
  const [mobile, setMobile] = useState(false)
  useEffect(() => {
    setMobile(isMobile())
  }, [])
  return mobile
}

/**
 * 是否桌面端(非移动)。pre-mount=true(匹配 SSG isDesktop=true);mount 后纠正。
 * = !useIsMobile() —— 派生,但 pre-mount 默认要对(!false=true ✓ 匹配 SSG)。
 */
export function useIsDesktop(): boolean {
  return !useIsMobile()
}
