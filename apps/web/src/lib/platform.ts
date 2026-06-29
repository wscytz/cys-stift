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

/** 修饰键符号:macOS = ⌘,其他 = Ctrl。显示用。 */
export function modSymbol(): string {
  return isMac() ? '⌘' : 'Ctrl'
}
