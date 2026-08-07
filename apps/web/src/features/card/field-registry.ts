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
import { CodesFieldEditor, LinksFieldEditor, QuotesFieldEditor } from './field-editors'

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
}
const quotesField: CardDraftField<unknown> = {
  ...defineField<DraftQuote[]>(
    'quotes',
    (c) => (c.quotes ?? []).map((x) => ({ text: x.text, attribution: x.attribution ?? '' })),
    draftQuotesToPayload,
    jsonEquals,
  ),
  Editor: QuotesFieldEditor,
}
const mediaField = defineField<MediaRef[]>('media', (c) => c.media ?? [], (d) => d, jsonEquals)
const linksField: CardDraftField<unknown> = {
  ...defineField<DraftLink[]>(
    'links',
    (c) => (c.links ?? []).map((l) => ({ url: l.url })),
    draftLinksToPayload,
    jsonEquals,
  ),
  Editor: LinksFieldEditor,
}

// ── 字段集(各壳按需用;Step 3 后 WORKBENCH = DETAIL,字段集统一) ─────────────

/** 工作台字段集(Step 3 补 media 后 = DETAIL_FIELDS)。links/codes/quotes 进 FieldEditors;
 *  顺序与 DETAIL_FIELDS 一致(links→codes→quotes),两壳 FieldEditors 渲染顺序统一。 */
export const WORKBENCH_FIELDS: CardDraftField<unknown>[] = [
  titleField,
  bodyField,
  tagsField,
  linksField,
  codesField,
  quotesField,
]

/** 详情弹窗 edit 字段集(全字段:title/body/media/links/codes/quotes/tags)。 */
export const DETAIL_FIELDS: CardDraftField<unknown>[] = [
  titleField,
  bodyField,
  mediaField,
  linksField,
  codesField,
  quotesField,
  tagsField,
]
