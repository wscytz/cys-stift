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
 * runAI 封装的返回信号:
 *  - 'not-ready':AI 未就绪(已由 runAI 内部触发 onNotReady 回调,runFn 未跑)。
 *    handler 通常不关心返回值,但保留信号便于需要时分支。
 *  - 'busy':已有 action 在跑,本次被防重复点击跳过。
 *  - 'done':runFn 已执行完(无论内部是否成功;异常已在 catch 内 toast)。
 */
export type RunAIResult = 'not-ready' | 'busy' | 'done'

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
    ): Promise<RunAIResult> => {
      // 防重复点击:已在跑则忽略(审计 M5)。
      if (aiBusy) return 'busy'
      // AI 就绪守卫(统一就绪检查):未配置/禁用/缺 key → 交给 page 弹引导,
      // 不静默 no-op。这一步是 R3 抽 hook 的核心价值 —— 三 handler 走同一条
      // 就绪路径,防第 4 个 handler 又漏(正是 A3 cluster 当年的根因)。
      // 注:shouldShowAiSetupForLayout(cfg) ⟺ !isAIReady(cfg),三 handler 原本
      // 分别用这两个写法但语义完全等价,此处统一成 isAIReady 一个闸门。
      const cfg = getCurrentAI()
      if (!isAIReady(cfg)) {
        onNotReady()
        return 'not-ready'
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
      return 'done'
    },
    [aiBusy, t, onNotReady],
  )

  return { aiBusy, runAI }
}
