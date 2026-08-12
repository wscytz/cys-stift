'use client'

/**
 * Storage usage meter — F1 follow-up (v0.26.3).
 *
 * Scans every `cys-stift.*` key in localStorage and reports total bytes
 * used, percent of the localStorage budget, and a per-key breakdown so the
 * user can see what's eating space (the canvas snapshot is the big one
 * once you draw hand-draw paths). Above 60% we surface an "export + clear"
 * warning — losing the canvas to a silent QuotaExceeded is exactly the
 * failure mode this exists to prevent.
 *
 * R16:percent/warning 按 localStorage 实际预算(~5MB,写失败真正抛 QuotaExceeded
 * 的上限)校准,而非 navigator.storage.estimate().quota(浏览器磁盘桶配额,常为
 * 数百 MB~GB)。此前用 estimate 的配额 → 4.8MB 实际占用只显示 0%,近满警告几乎
 * 从不触发("存满了却不知道")。estimate().usage 仅作为次要的"全部浏览器存储"显示。
 *
 * SSR-safe (returns zeros server-side).
 */
import { useEffect, useState } from 'react'

export type StorageWarning = null | 'warn' | 'critical'

export interface StorageUsage {
  used: number
  total: number
  percent: number
  warning: StorageWarning
  byKey: Array<{ key: string; bytes: number; category: string }>
}

/** localStorage 每个 origin 的硬上限(写失败抛 QuotaExceededError 的真实预算)。 */
export const LOCAL_STORAGE_BUDGET_BYTES = 5 * 1024 * 1024

const CYS_PREFIX = 'cys-stift.'

const CATEGORY_LABEL: Record<string, string> = {
  cards: 'cards',
  media: 'media',
  canvas: 'canvas (snapshots)',
  other: 'other',
}

function categorise(key: string): string {
  if (key.startsWith(CYS_PREFIX + 'cards')) return 'cards'
  if (key.startsWith(CYS_PREFIX + 'media')) return 'media'
  if (key.startsWith(CYS_PREFIX + 'canvas.')) return 'canvas'
  return 'other'
}

function warnFor(percent: number): StorageWarning {
  if (percent >= 80) return 'critical'
  if (percent >= 60) return 'warn'
  return null
}

export async function scanStorageUsage(): Promise<StorageUsage> {
  if (typeof window === 'undefined') {
    return { used: 0, total: 0, percent: 0, warning: null, byKey: [] }
  }
  const byKey: StorageUsage['byKey'] = []
  let lsBytes = 0
  for (let i = 0; i < window.localStorage.length; i++) {
    const key = window.localStorage.key(i)
    if (!key || !key.startsWith(CYS_PREFIX)) continue
    const raw = window.localStorage.getItem(key) ?? ''
    // Byte-accurate size (UTF-8). Review fix (v0.37.0): `raw.length` counts
    // UTF-16 code units — a zh-default app with CJK card bodies + base64
    // media data URLs undercounts by ~2x, so the 80% quota warning (the
    // safety net against silent QuotaExceeded) fires too late.
    const bytes = new Blob([raw]).size
    lsBytes += bytes
    byKey.push({ key, bytes, category: categorise(key) })
  }
  byKey.sort((a, b) => b.bytes - a.bytes)

  // R16:percent/warning 以 localStorage 实际占用对 5MB 预算算 —— 这才是写失败
  // 的真实边界。estimate().usage 只作为"全部浏览器存储"的次要展示(含 OPFS 几何,
  // 供参考,不参与近满判断)。
  const used = lsBytes
  const total = LOCAL_STORAGE_BUDGET_BYTES
  const percent = total > 0 ? Math.min(100, Math.round((used / total) * 100)) : 0
  return { used, total, percent, warning: warnFor(percent), byKey }
}

/**
 * Reactive wrapper: polls every 5s so the meter updates after cards /
 * snapshots / media land. Cheap (one localStorage walk).
 */
export function useStorageUsage(intervalMs = 5000): StorageUsage {
  const [usage, setUsage] = useState<StorageUsage>({
    used: 0,
    total: 0,
    percent: 0,
    warning: null,
    byKey: [],
  })
  useEffect(() => {
    let cancelled = false
    const tick = () => {
      scanStorageUsage().then((u) => {
        if (!cancelled) setUsage(u)
      })
    }
    tick()
    const id = window.setInterval(tick, intervalMs)
    return () => {
      cancelled = true
      window.clearInterval(id)
    }
  }, [intervalMs])
  return usage
}
