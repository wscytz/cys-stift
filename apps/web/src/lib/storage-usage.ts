'use client'

/**
 * Storage usage meter — F1 follow-up (v0.26.3).
 *
 * Scans every `cys-stift.*` key in localStorage and reports total bytes
 * used, percent of the browser's quota, and a per-key breakdown so the
 * user can see what's eating space (the canvas snapshot is the big one
 * once you draw hand-draw paths). Above 80% we surface a "export + clear"
 * warning — losing the canvas to a silent QuotaExceeded is exactly the
 * failure mode this exists to prevent.
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

async function detectQuota(): Promise<{ quota: number; usage: number }> {
  if (typeof navigator === 'undefined' || !navigator.storage?.estimate) {
    return { quota: 0, usage: 0 }
  }
  try {
    const est = await navigator.storage.estimate()
    return {
      quota: est.quota ?? 0,
      usage: est.usage ?? 0,
    }
  } catch {
    return { quota: 0, usage: 0 }
  }
}

export async function scanStorageUsage(): Promise<StorageUsage> {
  if (typeof window === 'undefined') {
    return { used: 0, total: 0, percent: 0, warning: null, byKey: [] }
  }
  const { quota: total, usage: estimateUsage } = await detectQuota()
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

  // used 用 estimate().usage(含 OPFS + IndexedDB,浏览器汇总),它比 lsBytes
  // 大或相等。此前 used 只算 localStorage → OPFS 几何不可见 → 计量偏低,
  // 80% 警告(审计 H1 丢数据的网)触发太晚。estimate 不可用(SSR/降级)时
  // 回退 lsBytes(localStorage 可见部分)。
  const used = estimateUsage > 0 ? estimateUsage : lsBytes
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
