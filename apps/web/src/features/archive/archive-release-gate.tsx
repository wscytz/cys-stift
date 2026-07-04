'use client'

import { useEffect } from 'react'
import { archiveStore } from '@/lib/archive-store'
import { buildArchivePayload } from '@/lib/build-archive-payload'
import { VERSION } from '@/lib/version'

/**
 * ArchiveReleaseGate — 空渲染组件;app 启动时调一次 release check(spec D2 a)。
 *
 * 触发条件:index.lastAppVersion !== VERSION(版本变化)。release 档 payload 由
 * buildArchivePayload 注入(全量快照,剥 mediaAssets.dataUrl)。
 *
 * 幂等:archiveStore.ensureReleaseRecord 由 index.lastAppVersion 守卫,版本同则
 * no-op,故 [] 依赖只跑一次是安全的。返回 null,布局位置不影响渲染。
 */
export function ArchiveReleaseGate(): null {
  useEffect(() => {
    void archiveStore.ensureReleaseRecord(VERSION, buildArchivePayload)
  }, [])
  return null
}
