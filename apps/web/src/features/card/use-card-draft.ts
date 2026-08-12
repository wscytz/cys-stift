'use client'

import {
  useCallback,
  useMemo,
  useRef,
  useState,
  type ComponentType,
  type Dispatch,
  type SetStateAction,
} from 'react'
import type { Card, UpdateCardPatch } from '@cys-stift/domain'

/**
 * useCardDraft — 统一卡片编辑草稿的生命周期管理。
 *
 * 背景:CardDetailModal(弹窗,确认门)+ WorkbenchPanel(侧栏,autosave)两套编辑器
 * 此前各自手写一遍 draft state / dirty / save patch / 切卡重置,导致 v8 加
 * code/quote 时工作台漏适配(1.1.3 才补)。本 hook 收敛 draft 管理,两壳共用,
 * 根治"两套、漏一边"。详见私有仓 decisions/2026-08-07-structured-fields-registry.md。
 *
 * 职责(只管 draft,不含保存策略):
 *  - draft state(每字段一个值,单一 Record)
 *  - toDraft 初始化 / reset()(壳在切卡时调)
 *  - dirty(草稿 vs Card 原值,聚合所有 field)
 *  - toPatch()(壳的 onSave / autosave flush 调)
 *
 * 保存策略由壳决定:
 *  - CardDetailModal:onSave(toPatch()) 确认门(用户点保存)
 *  - WorkbenchPanel:autosave 防抖 + 切卡 cleanup flush(壳用 toPatch + 自管 draftRef)
 *
 * fields 应为模块级常量(壳传稳定引用),避免 useMemo/useCallback 因 fields 身份变化。
 */

export interface FieldEditorProps<D> {
  value: D
  onChange: (value: D) => void
}

export interface CardDraftField<D> {
  /** Card 字段 key(也是 UpdateCardPatch 的 key)。 */
  key: keyof UpdateCardPatch
  /** Card → 编辑草稿(初始化 / reset 用)。 */
  toDraft: (card: Card) => D
  /** 草稿 → UpdateCardPatch 字段值(空过滤 / payload 转换;可读原卡做无损合并,如 links 保留既有富字段)。 */
  toPayload: (draft: D, card: Card) => unknown
  /** 草稿相等判断(dirty 用;省略 = 严格 ===)。数组/对象字段传深比(如 JSON.stringify)。 */
  equals?: (a: D, b: D) => boolean
  /** 编辑态控件(Step 2 FieldEditors 渲染);省略 = 该字段不进 FieldEditors(壳手写,如 title/body 在壳特化)。 */
  Editor?: ComponentType<FieldEditorProps<D>>
  /** 只读态渲染(Step 2 FieldViews);省略 = view 不显示该字段。 */
  View?: ComponentType<{ card: Card }>
}

export interface CardDraftApi {
  /** 草稿(field key → 值)。 */
  draft: Record<string, unknown>
  /** 改单字段。value 可以是终值,也可以是 (prevFieldValue) => 终值 的 updater ——
   *  updater 形式用于同字段连续异步更新(如 tag onBlur 加 + 紧接着 chip × 删),
   *  避免第二次更新基于陈旧闭包覆盖第一次(blur/click race 丢未提交输入)。 */
  setField: (key: keyof UpdateCardPatch, value: unknown | ((prev: unknown) => unknown)) => void
  /** 整体替换草稿(AI onReplace 等批量改;或传 updater)。 */
  setDraft: Dispatch<SetStateAction<Record<string, unknown>>>
  /** 是否有未保存改动(任一 field 草稿 ≠ Card 原值)。 */
  dirty: boolean
  /** 构造 UpdateCardPatch(只收集脏字段 toPayload;未改字段不进 patch → 不误伤 links 富字段等)。壳的 save 调。 */
  toPatch: () => UpdateCardPatch
  /** 重置草稿回 Card(壳在切卡 / 外部更新时调)。 */
  reset: () => void
}

export function useCardDraft(
  card: Card,
  fields: CardDraftField<unknown>[],
): CardDraftApi {
  const [draft, setDraft] = useState<Record<string, unknown>>(() =>
    initDraft(card, fields),
  )

  // reset 读 ref 里最新 card,身份稳定(空 deps)而非依赖 card 对象身份:
  // 跨 tab storage 同步会重建整批 card 对象(card 引用变),若 reset 身份跟着变,
  // workbench 的 [card.id, reset] effect 会误触发 → 静默清掉进行中的草稿。
  // 只有 card.id 真正切换才重置(fields 是模块级常量)。
  const cardRef = useRef(card)
  cardRef.current = card
  const reset = useCallback(() => {
    setDraft(initDraft(cardRef.current, fields))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const dirty = useMemo(
    () =>
      fields.some((f) => {
        const cur = draft[f.key as string]
        const orig = f.toDraft(card)
        return !(f.equals ?? strictEquals)(cur, orig)
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [draft, card, fields],
  )

  const toPatch = useCallback(
    () => buildPatch(card, draft, fields),
    [card, draft, fields],
  )

  const setField = useCallback(
    (key: keyof UpdateCardPatch, value: unknown | ((prev: unknown) => unknown)) =>
      setDraft((prev) => ({
        ...prev,
        [key]: typeof value === 'function' ? (value as (p: unknown) => unknown)(prev[key as string]) : value,
      })),
    [],
  )

  return { draft, setField, setDraft, dirty, toPatch, reset }
}

function initDraft(
  card: Card,
  fields: CardDraftField<unknown>[],
): Record<string, unknown> {
  const d: Record<string, unknown> = {}
  for (const f of fields) d[f.key as string] = f.toDraft(card)
  return d
}

function strictEquals<T>(a: T, b: T): boolean {
  return a === b
}

/**
 * defineField — 类型安全的字段定义 helper。
 *
 * registry 是异构数组(每 field 的草稿类型 D 不同),不能直接用 CardDraftField<D>[]
 * (TS 不协变 toPayload 的参数)。defineField<D> 在定义处给 D 类型(toDraft/toPayload/equals
 * 都类型安全),返回 CardDraftField<unknown>(内部 cast,供 hook 用)。
 */
export function defineField<D>(
  key: keyof UpdateCardPatch,
  toDraft: (card: Card) => D,
  toPayload: (draft: D, card: Card) => unknown,
  equals?: (a: D, b: D) => boolean,
): CardDraftField<unknown> {
  return {
    key,
    toDraft,
    toPayload: (d: unknown, card: Card) => toPayload(d as D, card),
    equals: equals
      ? (a: unknown, b: unknown) => equals(a as D, b as D)
      : undefined,
  }
}

/**
 * isDirty — 纯函数版 dirty 判断(给切卡 cleanup 用)。
 *
 * hook 的 dirty 基于当前 card props;WorkbenchPanel 切卡 cleanup 要比"上一卡 draft vs
 * 上一卡 card"(card 已变新),用 isDirty(prevCard, prevDraft, fields) 显式传。
 */
export function isDirty(
  card: Card,
  draft: Record<string, unknown>,
  fields: CardDraftField<unknown>[],
): boolean {
  return fields.some((f) => {
    const cur = draft[f.key as string]
    const orig = f.toDraft(card)
    return !(f.equals ?? strictEquals)(cur, orig)
  })
}

/**
 * buildPatch — 纯函数版 toPatch(给测试 + 壳直接用)。
 *
 * per-field dirty 门控:只把【脏】字段(草稿 ≠ Card 原值)的 toPayload 放进 patch,
 * 未改字段不进 patch → service.update 不碰它们。这样编辑 body 不会触发 links 的
 * 重建抹掉富字段 —— 与 v8-fields.sameLinkUrls「相同 URL 不重写,保住已抓 title」
 * 同款语义。toPayload 接收原卡(card):links 等字段可按 URL 匹配既有记录做无损合并
 * (draftLinksToPayload 保留 URL 未变 link 的 title/ogImage/fetchedAt),不丢已抓数据。
 *
 * 不变式:dirty 为真时 buildPatch 必含 ≥1 字段(dirty 的定义就是 some(!eq),
 * buildPatch 收集的正是这些 !eq 字段),故 autosave/确认门不会发出空 patch。
 */
export function buildPatch(
  card: Card,
  draft: Record<string, unknown>,
  fields: CardDraftField<unknown>[],
): UpdateCardPatch {
  const patch: Record<string, unknown> = {}
  for (const f of fields) {
    const cur = draft[f.key as string]
    const orig = f.toDraft(card)
    if ((f.equals ?? strictEquals)(cur, orig)) continue
    patch[f.key as string] = f.toPayload(cur as never, card)
  }
  return patch as UpdateCardPatch
}
