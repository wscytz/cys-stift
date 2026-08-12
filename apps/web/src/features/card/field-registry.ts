'use client'

/**
 * field-registry — 卡片字段定义(registry)。
 *
 * 每个字段定义 { key, toDraft, toPayload, equals },供 useCardDraft 管理草稿 +
 * FieldEditors/FieldViews 渲染。加新字段只需在此 defineField 一处(两套编辑器
 * 自动适配),根治"两套、漏一边"(见 decisions/2026-08-07-structured-fields-registry.md)。
 */
import type { MediaRef } from '@cys-stift/domain'
import type { CardDraftField } from './use-card-draft'
import { defineField } from './use-card-draft'
import {
  draftCodesToPayload,
  draftLinksToPayload,
  draftQuotesToPayload,
  type DraftCode,
  type DraftLink,
  type DraftQuote,
} from './editors'
import {
  CodesFieldEditor,
  CodesFieldView,
  LinksFieldEditor,
  LinksFieldView,
  QuotesFieldEditor,
  QuotesFieldView,
} from './field-editors'

function jsonEquals<T>(a: T, b: T): boolean {
  return JSON.stringify(a) === JSON.stringify(b)
}

// ── 命名字段(复用,避免 WORKBENCH/DETAIL 重复定义) ──────────────────────────

const titleField = defineField<string>('title', (c) => c.title, (d) => d)
const bodyField = defineField<string>('body', (c) => c.body, (d) => d)
const tagsField = defineField('tags', (c) => c.tags ?? [], (d) => d, jsonEquals)
const codesField: CardDraftField<unknown> = {
  ...defineField<DraftCode[]>(
    'codeSnippets',
    (c) => (c.codeSnippets ?? []).map((x) => ({ language: x.language, code: x.code })),
    draftCodesToPayload,
    jsonEquals,
  ),
  Editor: CodesFieldEditor,
  View: CodesFieldView,
}
const quotesField: CardDraftField<unknown> = {
  ...defineField<DraftQuote[]>(
    'quotes',
    (c) => (c.quotes ?? []).map((x) => ({ text: x.text, attribution: x.attribution ?? '' })),
    draftQuotesToPayload,
    jsonEquals,
  ),
  Editor: QuotesFieldEditor,
  View: QuotesFieldView,
}
const mediaField = defineField<MediaRef[]>('media', (c) => c.media ?? [], (d) => d, jsonEquals)
const linksField: CardDraftField<unknown> = {
  ...defineField<DraftLink[]>(
    'links',
    (c) => (c.links ?? []).map((l) => ({ url: l.url })),
    // 传原卡 links:URL 未变的 link 保留既有富字段(title/ogImage/fetchedAt)。
    (draft, card) => draftLinksToPayload(draft, card.links),
    jsonEquals,
  ),
  Editor: LinksFieldEditor,
  View: LinksFieldView,
}

// ── 字段集(B-1:两壳共用单一字段集,根治"两套数组漂移、漏 media")─────────────

/**
 * 卡片字段集(详情弹窗 + 工作台共用同一份)。title/body/media/tags 壳特化(渲染位置 /
 * 形态各壳定,无 Editor/View);links/codes/quotes 走 registry(FieldEditors/FieldViews
 * 自动渲染两态)。
 *
 * 此前 WORKBENCH_FIELDS 与 DETAIL_FIELDS 是两份独立数组, drifted:工作台漏 mediaField
 * + tags 顺序与详情不一致(注释号称"Step 3 后相等"实则否)。B-1(2026-08-08)合并为单一
 * CARD_FIELDS —— 两壳编辑同一份字段集,永不漂移;真要某壳用子集,该壳自行声明(不再靠
 * "两份保持同步"这种必漂的约定)。
 */
export const CARD_FIELDS: CardDraftField<unknown>[] = [
  titleField,
  bodyField,
  mediaField,
  linksField,
  codesField,
  quotesField,
  tagsField,
]
