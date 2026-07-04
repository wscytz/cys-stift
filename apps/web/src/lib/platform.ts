/**
 * platform — 平台检测(显示用,非逻辑用)。
 *
 * 逻辑层(键盘事件)永远用 `metaKey || ctrlKey` 双兼容,不依赖平台判断。
 * 这里只解决"显示给用户看的快捷键提示"该画 ⌘ 还是 Ctrl。
 *
 * navigator.platform 已废弃,且在某些 webview 返回值不稳。优先用
 * userAgentData.platform(现代),回退 userAgent,再回退 navigator.platform。
 * SSR 安全(typeof window 守卫)。
 */

function detectIsMac(): boolean {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') return false
  // 现代标准(Chromium 系 webview,Tauri WebView2/WebKit 都支持)。
  const ua = navigator as Navigator & { userAgentData?: { platform?: string } }
  if (ua.userAgentData?.platform) {
    return /mac|iphone|ipad|ipod/i.test(ua.userAgentData.platform)
  }
  // 回退 1:userAgent(最稳,所有浏览器都有)。
  if (navigator.userAgent) {
    return /mac|iphone|ipad|ipod/i.test(navigator.userAgent)
  }
  // 回退 2:废弃的 platform(老 webview 兜底)。
  return /mac/i.test(navigator.platform ?? '')
}

let _cached: boolean | null = null
/** 是否 macOS(显示用)。首次调用缓存,平台运行期不变。SSR 返回 false。 */
export function isMac(): boolean {
  if (_cached === null) _cached = detectIsMac()
  return _cached
}

/**
 * 是否移动端 WebView(安卓/iOS)。用于隐藏桌面专属 UI(系统全局快捷键配置、
 * ⌘/^ 提示等 —— 安卓无系统全局热键概念)。userAgent 检测(显示/gating 用,
 * 非键盘逻辑用);SSR 返回 false。首次调用缓存(平台运行期不变)。
 */
function detectIsMobile(): boolean {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') return false
  return /android|iphone|ipad|ipod/i.test(navigator.userAgent || '')
}

let _cachedMobile: boolean | null = null
/** 是否移动端(安卓/iOS WebView)。显示/gating 用。SSR 返回 false。 */
export function isMobile(): boolean {
  if (_cachedMobile === null) _cachedMobile = detectIsMobile()
  return _cachedMobile
}

/** 是否桌面端(非移动)。= !isMobile()。隐藏桌面专属 UI 用。SSR 返回 true。 */
export function isDesktop(): boolean {
  return !isMobile()
}
