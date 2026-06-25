'use client'

import { useEffect } from 'react'

/**
 * 全局错误捕获:把 unhandled error + unhandledrejection 的 message+stack
 * 存 localStorage,便于用户复现崩溃后反馈(dev/prod 都留)。error.tsx boundary
 * 只捕 React 渲染期错误;这个捕 boundary 之外的(事件回调、Promise)。
 */
const KEY = 'cys-stift.last-error.v1'

export function ErrorTrace() {
  useEffect(() => {
    const capture = (source: string) => (e: unknown) => {
      const err = e instanceof Error ? e : new Error(String(e))
      try {
        localStorage.setItem(KEY, JSON.stringify({
          source, message: err.message, stack: err.stack ?? '',
          at: new Date().toISOString(),
        }))
      } catch {
        // ignore
      }
    }
    const onError = capture('window.error')
    const onRej = capture('unhandledrejection')
    window.addEventListener('error', onError as EventListener)
    window.addEventListener('unhandledrejection', onRej as EventListener)
    return () => {
      window.removeEventListener('error', onError as EventListener)
      window.removeEventListener('unhandledrejection', onRej as EventListener)
    }
  }, [])
  return null
}
