'use client'

/**
 * Canvas templates (W-T3): 4 hardcoded presets + user-saved custom templates.
 *
 * Presets are DSL text (the same bidirectional format parseDsl/applyLayout
 * consumes). Cards use the `[card #id create]` form so a brand-new (empty)
 * canvas can apply them — `create` makes applyCardOp persist a real Card row
 * via onCardCreate before upserting geometry under the same #id.
 *
 * Custom templates serialize the current canvas via serializeCanvasReadable
 * (freeform-only round-trip; card lines are update-only and re-apply to
 * existing cards by id on a populated canvas).
 *
 * Storage: localStorage `cys-stift.canvas-templates.v1` (JSON array). SSR-safe
 * (window guard). No quota/rollback dance here — a failed save just doesn't
 * persist; templates are convenience, not source-of-truth data.
 */
import { serializeCanvasReadable } from '@/features/ai/canvas-dsl'
import type { CanvasElement } from '@cys-stift/canvas-engine'

const KEY = 'cys-stift.canvas-templates.v1'

export interface CanvasTemplate {
  name: string
  dsl: string
  /** Preset templates are hardcoded and cannot be deleted. */
  preset?: boolean
}

// 4 预设(硬编码 DSL)。card 用 `[card #id create]` → 新画布建空卡;arrow 用
// `from #x to #y` 绑定端点(端点同批 create,applyArrowOp 在 batch 内能拿到)。
// frame 走 `[frame #id] @pos @size @text @color`(主题分区,看板/四象限靠它)。
export const PRESET_TEMPLATES: CanvasTemplate[] = [
  {
    name: 'mindmap',
    preset: true,
    dsl: `[frame #f1] @pos(0,0) @size(800,600) @text("Mind map") @color(blue)
[card #c1 create] @pos(340,280) @size(120,80)
[card #c2 create] @pos(100,100) @size(120,80)
[card #c3 create] @pos(580,100) @size(120,80)
[card #c4 create] @pos(100,440) @size(120,80)
[card #c5 create] @pos(580,440) @size(120,80)
[arrow #a1] from #c2 to #c1 @color(blue)
[arrow #a2] from #c3 to #c1 @color(blue)
[arrow #a3] from #c4 to #c1 @color(blue)
[arrow #a4] from #c5 to #c1 @color(blue)`,
  },
  {
    name: 'flowchart',
    preset: true,
    dsl: `[card #s1 create] @pos(50,200) @size(120,80)
[card #s2 create] @pos(250,200) @size(120,80)
[card #s3 create] @pos(450,200) @size(120,80)
[card #s4 create] @pos(650,200) @size(120,80)
[arrow #f1] from #s1 to #s2 @color(black)
[arrow #f2] from #s2 to #s3 @color(black)
[arrow #f3] from #s3 to #s4 @color(black)`,
  },
  {
    name: 'kanban',
    preset: true,
    dsl: `[frame #k1] @pos(0,0) @size(200,500) @text("待办 / To do") @color(yellow)
[frame #k2] @pos(220,0) @size(200,500) @text("进行中 / Doing") @color(blue)
[frame #k3] @pos(440,0) @size(200,500) @text("完成 / Done") @color(grey)
[frame #k4] @pos(660,0) @size(200,500) @text("归档 / Archive") @color(red)`,
  },
  {
    name: 'quadrant',
    preset: true,
    dsl: `[frame #q1] @pos(0,0) @size(300,300) @text("重要紧急") @color(red)
[frame #q2] @pos(320,0) @size(300,300) @text("重要不紧急") @color(blue)
[frame #q3] @pos(0,320) @size(300,300) @text("不重要紧急") @color(yellow)
[frame #q4] @pos(320,320) @size(300,300) @text("不重要不紧急") @color(grey)`,
  },
]

function isTemplate(x: unknown): x is CanvasTemplate {
  if (!x || typeof x !== 'object') return false
  const o = x as Record<string, unknown>
  return typeof o.name === 'string' && typeof o.dsl === 'string'
}

/** 自建模板(从 localStorage 读)。SSR / 解析失败 → 空列表,不抛。 */
export function listCustomTemplates(): CanvasTemplate[] {
  if (typeof window === 'undefined') return []
  try {
    const parsed = JSON.parse(window.localStorage.getItem(KEY) ?? '[]')
    if (!Array.isArray(parsed)) return []
    return parsed.filter(isTemplate)
  } catch {
    return []
  }
}

/**
 * 把当前画布的元素序列化成 DSL 存为自建模板。返回 true=写入成功,
 * false=配额满/异常(不抛,调用方 toast)。
 *
 * 注意:serializeCanvasReadable 对 card 是 update-only 行(只记 @pos/@size/@color,
 * 不记内容),所以自建模板重新应用到「有这些 id 的卡」的画布才还原卡位置;
 * 应用到空画布会因 card 无 create flag 而跳过 card 行(只落 freeform)。
 * 这是设计取舍:自建模板是「布局骨架」,不是「卡片克隆」。
 */
export function saveCustomTemplate(name: string, elements: CanvasElement[]): boolean {
  if (typeof window === 'undefined') return false
  const dsl = serializeCanvasReadable(elements)
  const list = listCustomTemplates()
  list.push({ name, dsl })
  try {
    window.localStorage.setItem(KEY, JSON.stringify(list))
    return true
  } catch (e) {
    console.warn('[canvas-templates] persist failed (quota?)', e)
    return false
  }
}

/** 预设 + 自建,合并列表(preset 在前)。 */
export function allTemplates(): CanvasTemplate[] {
  return [...PRESET_TEMPLATES, ...listCustomTemplates()]
}

/**
 * 用 DSL 文本 + 名字直接存为自建模板(Batch A / 方向 3:模板导入)。
 * 用户可粘贴别处复制的 DSL(或手写)存成模板。dsl 不校验语法(parseDsl 在应用时
 * 才解析,容错友好),只校验非空 + name 非空。返回 true=成功,false=配额/异常。
 * 同名模板:覆盖(用户期望"更新模板"而非"加重复")。
 */
export function addCustomTemplate(name: string, dsl: string): boolean {
  if (typeof window === 'undefined') return false
  const trimmedName = name.trim()
  const trimmedDsl = dsl.trim()
  if (!trimmedName || !trimmedDsl) return false
  const list = listCustomTemplates().filter((t) => t.name !== trimmedName)
  list.push({ name: trimmedName, dsl: trimmedDsl })
  try {
    window.localStorage.setItem(KEY, JSON.stringify(list))
    return true
  } catch (e) {
    console.warn('[canvas-templates] persist failed (quota?)', e)
    return false
  }
}

/** 删除自建模板(预设不可删)。返回 true=存在并删除,false=未找到。 */
export function removeCustomTemplate(name: string): boolean {
  if (typeof window === 'undefined') return false
  const list = listCustomTemplates()
  const next = list.filter((t) => t.name !== name)
  if (next.length === list.length) return false
  try {
    window.localStorage.setItem(KEY, JSON.stringify(next))
    return true
  } catch {
    return false
  }
}

/** 取某模板的 DSL 文本(导出用)。预设返回其硬编码 dsl,自建从 localStorage 取。 */
export function getTemplateDsl(name: string): string | null {
  const preset = PRESET_TEMPLATES.find((t) => t.name === name)
  if (preset) return preset.dsl
  const custom = listCustomTemplates().find((t) => t.name === name)
  return custom?.dsl ?? null
}
