import type { CaptureShortcut } from './settings-store'

/** 平台化捕获快捷键文案(⌘/Ctrl + 用户自定义键)。
 *  抽成共用函数,避免各页面各写一份、Windows 上继续显示 ⌘。 */
export function formatCaptureCombo(isMac: boolean, shortcut?: CaptureShortcut): string {
  const mod = isMac ? '⌘' : 'Ctrl'
  const key =
    shortcut?.code === 'Space' ? 'Space'
    : shortcut?.code === 'Comma' ? ','
    : shortcut?.code === 'Period' ? '.'
    : shortcut?.code?.startsWith('Key') ? shortcut.code.slice(3)
    : shortcut?.code ?? 'E'
  return `${mod}${shortcut?.shift ? '+⇧' : ''}+${key}`
}
