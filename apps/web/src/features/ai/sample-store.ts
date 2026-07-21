/**
 * sample-store — AI 交互样本的本地累积(供导出/调优/未来训练语料)。
 *
 * 镜像 ask-history 范式(SSR-safe / quota-safe),单全局 key,封顶最近 500 条。
 * 明确同意后才累积(Settings.aiSampleCapture === true 才写)——
 * 由 addSample 的 enabled 参数控制(调用方读 settingsStore.get().aiSampleCapture 传入)。
 *
 * R2:样本字段(question/context/aiOutput)源自 buildAgentUserPrompt(走 serializeCardsForAI
 * allowlist)+ formatCanvasSnapshot(仅几何)。绝不存原始 Card[]/settings/deviceId/apiKey。
 *
 * 纯函数不调 Date.now() —— ts 由调用方传(可测)。genSampleId 用 crypto.randomUUID 兜底。
 */
import { DSL_VERSION } from '@cys-stift/dsl'

export interface BaseSample {
  id: string
  ts: number
  source: 'ask' | 'companion' | 'canvasLayout'
  question?: string
  context: string
  aiOutput: string
  editedOutput?: string
  targetCanvasId?: string
  /** 生成此样本时的 cys-dsl 语法版号(来自 DSL_VERSION)。旧样本无此字段 → undefined。 */
  dslVersion?: number
}
export interface DslSample extends BaseSample {
  kind: 'dsl'
  outcome: 'applied' | 'applied_edited' | 'rejected' | 'parse_failed'
  /** retry 耗尽仍 parse 失败时的尝试次数(仅 parse_failed 有意义)。 */
  attempts?: number
  /** parse 失败的结构化错误(仅 parse_failed;前 8 条,DslDiagnostic 形状)。 */
  parseErrors?: Array<{ line: number; text: string; message: string }>
}
export interface QaSample extends BaseSample {
  kind: 'qa'
  outcome: 'answered'
}
export type Sample = DslSample | QaSample

export const SAMPLES_KEY = 'cys-stift.ai-samples.v1'
const CAP = 500

// 配额失败订阅(Task 6):addSample 写失败 → notifyQuota → AppMenu toast。
const _quotaSubscribers = new Set<() => void>()
function notifyQuota(): void { for (const cb of _quotaSubscribers) cb() }
export function onQuotaExceeded(cb: () => void): () => void {
  _quotaSubscribers.add(cb)
  return () => { _quotaSubscribers.delete(cb) }
}

export function genSampleId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return 's_' + Math.random().toString(36).slice(2, 10)
}

/** 读全部样本。SSR / 无 key / corrupt → []。 */
export function loadSamples(): Sample[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = window.localStorage.getItem(SAMPLES_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.filter(
      (s): s is Sample =>
        s != null && typeof s === 'object' &&
        typeof s.id === 'string' && typeof s.ts === 'number' &&
        (s.kind === 'dsl' || s.kind === 'qa') && typeof s.context === 'string' && typeof s.aiOutput === 'string',
    )
  } catch {
    return []
  }
}

/**
 * 追加一条样本。仅 enabled=true 才写；undefined/false 均视为未同意。
 * 封顶最近 CAP 条(slice(-CAP))。quota 静默返 false。纯函数不调 Date.now —— ts 由 s 带。
 */
export function addSample(s: Sample, enabled: boolean | undefined): boolean {
  if (enabled !== true) return false
  if (typeof window === 'undefined') return false
  try {
    const stamped = { ...s, dslVersion: DSL_VERSION }
    const next = [...loadSamples(), stamped].slice(-CAP)
    window.localStorage.setItem(SAMPLES_KEY, JSON.stringify(next))
    return true
  } catch {
    notifyQuota()
    return false
  }
}

export function clearSamples(): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.removeItem(SAMPLES_KEY)
  } catch {
    // 隐私模式等 —— 跳过
  }
}

export function getSampleCount(): number {
  return loadSamples().length
}
