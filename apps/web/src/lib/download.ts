/**
 * download — 分平台文件下载 helper。
 *
 * 背景:Android WebView 不处理 `<a download>` 的 Blob URL(静默失败,不报错也
 * 不生成文件)。桌面 WebView2/macOS WKWebView 正常处理。此前所有导出点
 * (md/svg/png/dsl/json/archive/sample/全量备份/单卡 md)都走
 * `new Blob + URL.createObjectURL + a.click()` → Android 全部静默失败。
 *
 * 方案:
 * - 桌面(`!isTauriAndroid()`):Blob + a.click(原逻辑,行为不变)。
 * - Android(`isTauriAndroid()`):Tauri `dialog.save()`(Storage Access Framework
 *   picker,用户选位置,绕 scoped storage 限制)+ `fs.writeFile` 写字节。
 *   plugin 走 dynamic import —— 仅 Android 路径才加载,不进桌面/web 主 bundle,
 *   且 `@tauri-apps/plugin-dialog`/`plugin-fs` 在普通浏览器环境(无 `__TAURI__`)
 *   永不 import,避免 ReferenceError。
 *
 * Tauri 检测用 `__TAURI_INTERNALS__`(Tauri v2 webview 永远注入的 IPC 通道,
 * 比 `__TAURI__` 更可靠 —— 后者依赖 `withGlobalTauri: true`)。移动判断复用
 * `platform.ts` 的 `isMobile()`(userAgent 检测,SSR 安全),不重复造。
 */

import { isMobile } from './platform'

/**
 * 是否运行在 Android/iOS 的 Tauri WebView 里(需要走 SAF picker 下载)。
 *
 * - `__TAURI_INTERNALS__` 存在 → 在 Tauri v2 webview 里(桌面或移动)。
 * - `isMobile()` → userAgent 含 android/iphone/ipad/ipod。
 * - 两者都真 → 移动 Tauri(即 Android,本项目移动端唯一目标)。
 *
 * SSR(`typeof window === 'undefined'`)直接 false —— 与 `isMobile()` SSR 行为
 * 对齐,且下载本身在 SSR 早退。
 */
export function isTauriAndroid(): boolean {
  if (typeof window === 'undefined') return false
  const internals = (window as unknown as { __TAURI_INTERNALS__?: unknown })
    .__TAURI_INTERNALS__
  return !!internals && isMobile()
}

/**
 * 触发文件下载,分平台:
 * - Android Tauri:dialog.save(SAF)+ fs.writeFile。
 * - 其它(桌面 Tauri / 普通浏览器):Blob + a.click。
 *
 * Android 路径里任何步骤抛错(save 对话框失败 / 写文件失败)都会冒泡给调用方;
 * 调用方已有 try/catch + toast 反馈(见各导出点)。用户取消 save(`path === null`)
 * 静默返回,不视作错误。
 */
export async function downloadFile(name: string, blob: Blob): Promise<void> {
  if (isTauriAndroid()) {
    // dynamic import:仅 Android 路径才加载 plugin(JS bytes 不进桌面/web 主
    // bundle);普通浏览器环境 `isTauriAndroid()` 永远 false,不会走到这里,
    // 因此 plugin 在无 `__TAURI_INTERNALS__` 的环境里不会被 import。
    const { save } = await import('@tauri-apps/plugin-dialog')
    const { writeFile } = await import('@tauri-apps/plugin-fs')
    const path = await save({ defaultPath: name })
    if (!path) return // 用户取消 SAF picker —— 不算错误
    const bytes = new Uint8Array(await blob.arrayBuffer())
    await writeFile(path, bytes)
    return
  }
  // 桌面/web:Blob + a.click(原内联逻辑,行为不变 —— 桌面 WebView2/WKWebView
  // 正常处理 Blob download,普通浏览器也正常)。
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = name
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  // 给浏览器一个 tick 启动下载再 revoke(原各处一致的做法)。
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
