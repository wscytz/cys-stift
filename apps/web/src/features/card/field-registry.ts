'use client'

/**
 * field-registry — 卡片字段定义(registry)。
 *
 * 每个字段定义 { key, toDraft, toPayload, equals },供 useCardDraft 管理草稿 +
 * FieldEditors/FieldViews 渲染。加新字段只需在此 defineField 一处(两套编辑器
 * 自动适配),根治"两套、漏一边"(见 decisions/2026-08-07-structured-fields-registry.md)。
 *
 * 当前:WORKBENCH_FIELDS(工作台用,Step 1)。Step 3 补 media/links 后与详情弹窗统一为
 * CARD_FIELDS(Step 4)。
 */
import type { CardDraftField } from './use-card-draft'
import { defineField } from './use-card-draft'
import {
  draftCodesToPayload,
  draftQuotesToPayload,
  type DraftCode,
  type DraftQuote,
} from './editors'

function jsonEquals<T>(a: T, b: T): boolean {
  return JSON.stringify(a) === JSON.stringify(b)
}

/**
 * 工作台编辑字段集。
 * Step 1:与 WorkbenchPanel 现有字段一致(title/body/tags/codes/quotes)。
 * Step 3:补 media/links,字段集与详情弹窗统一。
 */
export const WORKBENCH_FIELDS: CardDraftField<unknown>[] = [
  defineField<string>('title', (c) => c.title, (d) => d),
  defineField<string>('body', (c) => c.body, (d) => d),
  defineField('tags', (c) => c.tags ?? [], (d) => d, jsonEquals),
  defineField<DraftCode[]>(
    'codeSnippets',
    (c) => (c.codeSnippets ?? []).map((x) => ({ language: x.language, code: x.code })),
    draftCodesToPayload,
    jsonEquals,
  ),
  defineField<DraftQuote[]>(
    'quotes',
    (c) => (c.quotes ?? []).map((x) => ({ text: x.text, attribution: x.attribution ?? '' })),
    draftQuotesToPayload,
    jsonEquals,
  ),
]
