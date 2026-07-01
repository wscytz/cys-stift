'use client'

/**
 * R3 — 三个 AI handler(handleAILayout / handleAICluster / handleAIOutline)
 * 的共享骨架。拥有 aiBusy state + aiAbortRef,封装防重复点击 / AI 就绪守卫 /
 * AbortController / 统一 catch(AbortError → aiCancelled;else → ai.error) /
 * finally 复位。各 handler 只需提供 runFn(ready, signal) 业务体。
 *
 * 核心动机:当年 A3 cluster 漏「就绪守卫」的根因就是骨架被复制粘贴时丢了中间一段。
 * 集中到这里后,任何新 handler 都无法再漏守卫 —— 就绪检查是 runAI 内部的前置步骤,
 * runFn 只在已就绪(ready 非空)时才被调用。
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { useI18n } from '@/lib/i18n'
import { getCurrentAI, isAIReady } from '@/features/ai/ai-settings-provider'
import type { AIConfig } from '@/features/ai/types'
import { pushToast } from '@/lib/toast-store'

/** 哪个 AI action 在跑(用于 rail 按钮 spinner / 互斥禁用)。null = 空闲。 */
export type AIActionKind = 'layout' | 'cluster' | 'outline'

/**
 * @param onNotReady AI 未就绪时的回调(由 page 提供,通常是 setShowAiSetup(true))。
 *                   统一三个 handler 都走这一条「未就绪 → 弹 AiSetupCard」路径。
 */
export function useAIAction(onNotReady: () => void) {
  const { t } = useI18n()
  const [aiBusy, setAiBusy] = useState<null | AIActionKind>(null)
  const aiAbortRef = useRef<AbortController | null>(null)

  // 卸载时 abort 进行中的 AI 请求(审计 M9:防切走后请求继续跑浪费 API 费 +
  // 可能 unmounted setState)。
  useEffect(() => {
    return () => {
      aiAbortRef.current?.abort()
    }
  }, [])

  /**
   * @param kind 哪个 action(写入 aiBusy,驱动对应按钮 spinner)
   * @param runFn 业务体:收到已就绪的 ready config + abort signal。就绪守卫、
   *              防重复、AbortController、catch、finally 复位均由 runAI 负责。
   */
  const runAI = useCallback(
    async (
      kind: AIActionKind,
      runFn: (ready: AIConfig, signal: AbortSignal) => Promise<void>,
    ): Promise<void> => {
      // 防重复点击:已在跑则忽略(审计 M5)。
      if (aiBusy) return
      // AI 就绪守卫(统一就绪检查):未配置/禁用/缺 key → 交给 page 弹引导,
      // 不静默 no-op。R3 核心:就绪检查集中在此 —— 之前三 handler 各写一份等价
      // 检查,复制粘贴时易漏(A3 cluster 当年就漏了中间一段)。现在 runFn 只在
      // ready 时被调,第 4 个 handler 无法再漏。
      const cfg = getCurrentAI()
      if (!isAIReady(cfg)) {
        onNotReady()
        return
      }
      // isAIReady 为 true ⟺ cfg 非空;断言给 TS,使 runFn 的 ready 参数非 null。
      const ready = cfg as AIConfig
      setAiBusy(kind)
      const ac = new AbortController()
      aiAbortRef.current = ac
      try {
        await runFn(ready, ac.signal)
      } catch (e) {
        if ((e as Error).name === 'AbortError') {
          pushToast({ kind: 'info', message: t('canvas.aiCancelled') })
        } else {
          pushToast({ kind: 'error', message: t('ai.error', { error: (e as Error).message }) })
        }
      } finally {
        setAiBusy(null)
        aiAbortRef.current = null
      }
    },
    [aiBusy, t, onNotReady],
  )

  return { aiBusy, runAI }
}
