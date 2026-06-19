import type { CaptureInput, CardId, CardService } from '@cys-stift/domain'

/**
 * CaptureSink — spec §7 "Capture 入口" 接口预留。多个实现路径：
 * - features/capture-tauri/    → 桌面端全局快捷键（Tauri global-shortcut）
 * - features/capture-menubar/  → 桌面端菜单栏
 * - features/capture-webhook/  → 浏览器扩展
 * - features/capture-mobile/   → 未来移动端 widget
 * - features/capture-alfred/   → 未来 Alfred 工作流
 * - features/capture-manual/   → 在 Inbox 里直接新建（Phase 3 直调 service.create）
 *
 * 接口由消费方（web）定义；具体实现类也归 web（features/）。Domain 层只
 * 提供 CardService.fromCapture 作为底层统一入口，不耦合到任何 CaptureSink
 * 抽象 — 这是依赖倒置：web 端定义接口，web 端实现，domain 不感知。
 *
 * Phase 6 Lean 范围只落地 web 1 个实现（WebCaptureSink），其余留 Phase 6+。
 */
export interface CaptureSink {
  submit(input: CaptureInput): Promise<{ cardId: CardId }>
}

/**
 * WebCaptureSink — web 端的 CaptureSink 实现。Phase 6 Lean 范围内的唯
 * 一 sink。其他 sink（Tauri / menubar / webhook / mobile / alfred）
 * 留 Phase 6+。
 *
 * 直接走 CardService.fromCapture（domain 已有，Phase 2 实现 + 1 个
 * vitest 覆盖）。不绕开 domain，不重复校验逻辑。
 */
export class WebCaptureSink implements CaptureSink {
  constructor(private readonly service: CardService) {}

  submit(input: CaptureInput): Promise<{ cardId: CardId }> {
    const card = this.service.fromCapture(input)
    return Promise.resolve({ cardId: card.id })
  }
}

// ── Registry (Phase 6.5g) ──────────────────────────────────────────────────
// Routes CaptureInput to the right sink by `source.kind`. The Mini Input
// (Phase 6) and the AppMenu "Capture" button (Phase 6.5g) both go through
// `captureSinkRegistry.submit` so adding a new entry-point (Tauri global
// shortcut, webhook, …) just means registering a new sink.
//
// Race safety: sinks are registered async (dynamic import in CaptureHost /
// inbox mount). If a submit arrives before the matching sink is registered,
// we fall back to `fallbackService.fromCapture` so the card is never lost.
// The registered sink (when present) wins.
const _sinks = new Map<string, CaptureSink>()
let _fallbackService: CardService | null = null

export const captureSinkRegistry = {
  /** Register a fallback CardService used when no sink matches yet. */
  setFallbackService(service: CardService) {
    _fallbackService = service
  },
  register(kind: string, sink: CaptureSink) {
    _sinks.set(kind, sink)
  },
  unregister(kind: string) {
    _sinks.delete(kind)
  },
  submit(input: CaptureInput): Promise<{ cardId: CardId }> {
    const kind = input.source.kind
    const sink = _sinks.get(kind)
    if (sink) return sink.submit(input)
    if (_fallbackService) {
      const card = _fallbackService.fromCapture(input)
      return Promise.resolve({ cardId: card.id })
    }
    return Promise.reject(
      new Error(
        `[captureSinkRegistry] no sink registered for source.kind="${kind}" and no fallback service`,
      ),
    )
  },
  has(kind: string): boolean {
    return _sinks.has(kind)
  },
}