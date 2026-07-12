'use client'

import { useEffect } from 'react'
import { migrateAllLegacyConversations } from '@/lib/conversation-store'

/**
 * LegacyConversationMigrator — 应用启动时一次性迁移所有遗留 v1 conversation
 * key 到 v2(per-canvas companion + 全局 ask),并删除 v1 旧 key。
 *
 * loadConversation 的 lazy migrate 只覆盖「被打开过的画布」;未打开画布的 v1
 * 对话会漏进备份(export-service 只枚举 v2)。本组件在 mount 时跑全量迁移,
 * 使整个应用进入纯 v2 状态。幂等,多次运行安全。
 *
 * 同 ThemeBoot 范式:client-only mount,返回 null,不渲染任何 DOM。
 */
export function LegacyConversationMigrator(): null {
  useEffect(() => {
    migrateAllLegacyConversations()
  }, [])
  return null
}
