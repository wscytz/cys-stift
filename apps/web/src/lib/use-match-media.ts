'use client'

import { useCallback, useSyncExternalStore } from 'react'

/**
 * useMatchMedia — SSR-safe `window.matchMedia` hook(响应式断点判断用)。
 *
 * 用 `useSyncExternalStore`(React 18+ 专为外部订阅设计)而非 useState+effect:
 * React 自动管理快照一致性 + act flush,订阅 matchMedia `change` 事件更稳。
 *
 * 返回 `boolean`:
 *  - client:query 当前是否匹配。
 *  - SSR / 无 matchMedia:`false`(默认桌面态;client hydration 后纠正)。
 *
 * 注:CSS `@media` 不能用 `var()`(`packages/ui/src/tokens.css` 顶部断点注释说明),
 * JS 侧用本 hook 读断点(如 `useMatchMedia('(max-width: 1023px)')` 判平板态),CSS
 * 侧仍用约定数字。两侧用同一断点值保持一致。
 */
export function useMatchMedia(query: string): boolean {
  const subscribe = useCallback(
    (onChange: () => void) => {
      if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
        return () => {}
      }
      const mql = window.matchMedia(query)
      const handler = () => onChange()
      if (typeof mql.addEventListener === 'function') {
        mql.addEventListener('change', handler)
      } else if (typeof mql.addListener === 'function') {
        // Safari <14 老 API
        mql.addListener(handler)
      }
      return () => {
        if (typeof mql.removeEventListener === 'function') {
          mql.removeEventListener('change', handler)
        } else if (typeof mql.removeListener === 'function') {
          mql.removeListener(handler)
        }
      }
    },
    [query],
  )
  const getSnapshot = useCallback(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
      return false
    }
    return window.matchMedia(query).matches
  }, [query])
  return useSyncExternalStore(subscribe, getSnapshot, () => false)
}
