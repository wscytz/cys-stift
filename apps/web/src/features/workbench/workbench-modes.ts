/**
 * workbench-modes — `/workbench` 库页的分类模式(数据驱动,可扩展)。
 *
 * 每个模式定义「如何把 cards 分成 sections」。UI 根据数组渲染分段控件,
 * 以后加时间/收藏夹模式只需 push 一个对象 + 实装 groupBy,不改结构(cc 给的话:可扩展)。
 *
 * 顺序 = UI 默认顺序;default = 'canvas'(cc 指定)。
 */
import type { MessageKey } from '@/lib/i18n/messages'

/** 模式 id(稳定,进 store/i18n key)。 */
export type WorkbenchModeId = 'canvas' | 'type' | 'tag'

export interface WorkbenchMode {
  id: WorkbenchModeId
  /** i18n key(`workbench.mode.<id>`,字面量类型让 t() 接受)。 */
  i18nKey: MessageKey
}

/** UI 渲染用的模式列表(顺序固定)。 */
export const WORKBENCH_MODES: readonly WorkbenchMode[] = [
  { id: 'canvas', i18nKey: 'workbench.mode.canvas' },
  { id: 'type', i18nKey: 'workbench.mode.type' },
  { id: 'tag', i18nKey: 'workbench.mode.tag' },
] as const

export const DEFAULT_WORKBENCH_MODE: WorkbenchModeId = 'canvas'
