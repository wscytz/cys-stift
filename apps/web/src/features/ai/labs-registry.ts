'use client'

/**
 * labs-registry — 实验室功能注册表 + 统一守卫 hook。
 *
 * 集中定义所有实验室的元数据(id / 标题 / 风险说明 / 确认门文案),避免散落。
 * /settings 实验室区从注册表渲染;新加 lab 只改注册表 + Settings.labs 类型,
 * 不改 UI(<LabToggle> 遍历注册表)。
 *
 * 分层判据 + 实施顺序见 docs/specs/2026-06-30-ai-labs-strategy.md。
 */
import { useSettings } from '@/lib/settings-store'
import type { MessageKey } from '@/lib/i18n/messages'

/** 合法实验室 id(与 Settings.labs 字段一一对应)。 */
export type LabId = 'visionLab'

/** 实验室元数据(从注册表读,<LabToggle> 渲染用)。 */
export interface LabMeta {
  id: LabId
  /** 标题 i18n key。 */
  labelKey: MessageKey
  /** 风险说明 i18n key(开启会发生什么)。 */
  warnKey: MessageKey
  /** 确认门标题 i18n key。 */
  confirmTitleKey: MessageKey
  /** 确认门正文 i18n key。 */
  confirmBodyKey: MessageKey
  /** 确认门按钮 i18n key。 */
  confirmActionKey: MessageKey
}

/**
 * 实验室注册表。新加 lab:① Settings.labs 加字段;② 这里加 meta;③ i18n 加 keys。
 * 顺序 = /settings 实验室区显示顺序。
 */
export const LAB_REGISTRY: LabMeta[] = []

/**
 * 统一实验室守卫 hook。false 时该 lab 路径完全不可达(代码层守卫,非仅 UI 隐藏)。
 * 用法:`const enabled = useLabEnabled('visionLab'); if (!enabled) return null`
 * 替代每 lab 一个 hook,减少重复。保留 useVisionLabEnabled 作为语义别名(已广泛使用)。
 */
export function useLabEnabled(lab: LabId): boolean {
  const { settings } = useSettings()
  return Boolean(settings.labs?.[lab])
}
