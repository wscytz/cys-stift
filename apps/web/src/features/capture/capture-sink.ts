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