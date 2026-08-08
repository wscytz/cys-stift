'use client'

/**
 * capability-registry — 能力注册表(B-5 统一功能管理)。
 *
 * 把产品的可选能力 + 核心能力收敛为单一清单(settings「能力清单」真相源):
 *  - core(常开):产品核心能力,说明「这个应用能做什么」,默认开启。
 *  - optional(可门控):AI(就绪度派生,isAIReady)/ Labs(显式开关,useLabEnabled)。
 *
 * 范式来源:原本只有 Labs 用注册式(LAB_REGISTRY + useLabEnabled + LabToggle),本档
 * 泛化到全部可选能力 —— 加新可选能力:注册一处 + 能力清单自动渲染,门控复用现有
 * isAIReady / useLabEnabled(不新增门控机制)。
 */
import { useLabEnabled } from '@/features/ai/labs-registry'
import { getCurrentAI, isAIReady } from '@/features/ai/ai-settings-provider'
import type { MessageKey } from '@/lib/i18n/messages'

export type CapabilityKind = 'core' | 'optional'

export interface CapabilityDef {
  id: string
  kind: CapabilityKind
  labelKey: MessageKey
  descKey: MessageKey
}

export const CAPABILITY_REGISTRY: CapabilityDef[] = [
  // ── core(常开):产品核心能力 ──────────────────────────────────────────────
  { id: 'canvas', kind: 'core', labelKey: 'capabilities.canvas.label', descKey: 'capabilities.canvas.desc' },
  { id: 'relations', kind: 'core', labelKey: 'capabilities.relations.label', descKey: 'capabilities.relations.desc' },
  { id: 'dsl', kind: 'core', labelKey: 'capabilities.dsl.label', descKey: 'capabilities.dsl.desc' },
  { id: 'compute', kind: 'core', labelKey: 'capabilities.compute.label', descKey: 'capabilities.compute.desc' },
  { id: 'structuredFields', kind: 'core', labelKey: 'capabilities.structuredFields.label', descKey: 'capabilities.structuredFields.desc' },
  { id: 'search', kind: 'core', labelKey: 'capabilities.search.label', descKey: 'capabilities.search.desc' },
  { id: 'exportRestore', kind: 'core', labelKey: 'capabilities.exportRestore.label', descKey: 'capabilities.exportRestore.desc' },
  { id: 'localFirst', kind: 'core', labelKey: 'capabilities.localFirst.label', descKey: 'capabilities.localFirst.desc' },
  // ── optional(可门控):AI 就绪度 + Labs 显式开关 ───────────────────────────
  { id: 'ai', kind: 'optional', labelKey: 'capabilities.ai.label', descKey: 'capabilities.ai.desc' },
  { id: 'proposalCoauthorLab', kind: 'optional', labelKey: 'labs.proposal.label', descKey: 'capabilities.proposalCoauthor.desc' },
]

export interface CapabilityStatus {
  /** 状态标签 i18n key(常开 / 就绪 / 未配置 / 已开启 / 已关闭)。 */
  noteKey: MessageKey
  /** 可选:如何开启的提示 i18n key。 */
  hintKey?: MessageKey
  /** 可选:提示指向的同页锚点(如 #settings-ai)。 */
  hintAnchor?: string
}

/** 各能力当前状态(派生自现有 gate:core 常开 / ai 用 isAIReady / lab 用 useLabEnabled)。 */
export function useCapabilities(): { cap: CapabilityDef; status: CapabilityStatus }[] {
  const labEnabled = useLabEnabled('proposalCoauthorLab')
  const aiReady = isAIReady(getCurrentAI())
  return CAPABILITY_REGISTRY.map((cap) => {
    if (cap.id === 'ai') {
      return {
        cap,
        status: aiReady
          ? { noteKey: 'capabilities.status.ready' }
          : {
              noteKey: 'capabilities.status.notReady',
              hintKey: 'capabilities.hint.ai',
              hintAnchor: '#settings-ai',
            },
      }
    }
    if (cap.id === 'proposalCoauthorLab') {
      return {
        cap,
        status: labEnabled
          ? { noteKey: 'capabilities.status.on' }
          : {
              noteKey: 'capabilities.status.off',
              hintKey: 'capabilities.hint.labs',
              hintAnchor: '#settings-labs',
            },
      }
    }
    return { cap, status: { noteKey: 'capabilities.status.core' } }
  })
}
