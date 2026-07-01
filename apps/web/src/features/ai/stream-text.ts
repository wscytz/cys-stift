'use client'

/**
 * M3.3 — Thin wrapper around `aiProviderFactory.create(cfg).streamText()`.
 * Ensures the default providers are registered before delegating. Callers
 * from AI popover / auto-relate use this single entry point so the
 * `registerDefaultProviders()` idempotency check is centralised.
 *
 * P0 修复(DR-T2):provider 的 fetch 只透传用户 signal,无 timeout。当 API
 * 端静默挂起(网络/CORS/TCP 卡死)时,fetch 永不 resolve/reject → streamText
 * 永挂 → `setAiBusy('layout')` 永不清 → 按钮永久卡 busy,用户只能 F5。
 *
 * 修法:在 streamText 入口统一合并「用户 signal + 内部 timeout」成单个
 * AbortSignal 传给 provider。任一 abort 都 abort。timeout 用 DOMException
 * ('TimeoutError') 区别于用户取消的 AbortError —— 现有 catch 块的 else
 * 分支(ai.error 显示 message)能正确吃掉 TimeoutError。provider 文件不改。
 */

import { aiProviderFactory } from './provider-factory'
import { registerDefaultProviders } from './providers'
import type { AIConfig, AIRequest, AIResponse } from './types'

/** 默认超时 30s。足够 LLM 流式响应,又不至于让用户干等挂死。 */
const DEFAULT_TIMEOUT_MS = 30_000

/**
 * 把用户 signal 和内部 timeout 合并成单个 AbortSignal。任一 abort 都 abort。
 *
 * 行为:
 * - 到 timeoutMs:ctrl.abort(DOMException('TimeoutError')) —— 区别于用户取消。
 * - 用户 signal 已 aborted:立即 abort 并沿用其 reason(通常是 AbortError)。
 * - 用户 signal 后续 aborted:转发(沿用 reason)。
 * - cleanup():清 timeout timer。streamText 在 finally 里调,确保正常返回后
 *   不残留定时器(否则会触发无意义的 abort,虽无害但脏)。
 *
 * @returns { signal, cleanup } —— signal 传给 provider,cleanup 在 finally 调。
 */
export function mergeSignalWithTimeout(
  signal: AbortSignal | undefined,
  timeoutMs: number,
): { signal: AbortSignal; cleanup: () => void } {
  const ctrl = new AbortController()

  // 用户 signal 已 aborted:立即沿用其 reason abort,无需起 timer。
  if (signal?.aborted) {
    ctrl.abort(signal.reason)
    return { signal: ctrl.signal, cleanup: () => {} }
  }

  const timer = setTimeout(() => {
    ctrl.abort(
      new DOMException(
        `AI request timed out after ${timeoutMs}ms`,
        'TimeoutError',
      ),
    )
  }, timeoutMs)

  // 用户 signal 后续 abort:清 timer + 沿用其 reason(保留 AbortError 语义)。
  if (signal) {
    signal.addEventListener(
      'abort',
      () => {
        clearTimeout(timer)
        ctrl.abort(signal.reason)
      },
      { once: true },
    )
  }

  return { signal: ctrl.signal, cleanup: () => clearTimeout(timer) }
}

export async function streamText(
  cfg: AIConfig,
  req: AIRequest,
  onDelta: (chunk: string) => void,
  signal?: AbortSignal,
  timeoutMs: number = DEFAULT_TIMEOUT_MS,
): Promise<AIResponse> {
  registerDefaultProviders()
  const provider = aiProviderFactory.create(cfg)
  if (!provider) throw new Error(`Provider "${cfg.provider}" not registered`)
  const effectiveReq: AIRequest = { ...req, model: req.model ?? cfg.model }
  // 单请求 timeout:req.timeoutMs 覆盖默认(重型 DSL 任务传 60_000);否则 30s。
  const effectiveTimeout = req.timeoutMs ?? timeoutMs
  // 合并用户 signal + 内部 timeout。provider 收到的是 merged.signal。
  // finally 必清 timer —— 正常返回 / 抛错 / 用户取消都走 cleanup。
  const merged = mergeSignalWithTimeout(signal, effectiveTimeout)
  try {
    return await provider.streamText(effectiveReq, onDelta, merged.signal)
  } finally {
    merged.cleanup()
  }
}
