import { describe, expect, it } from 'vitest'
import type {
  CanvasElement as AppCanvasElement,
  CanvasElementKind as AppCanvasElementKind,
} from '@cys-stift/canvas-engine'
import type {
  CardId as AppCardId,
  CardType as AppCardType,
  TagColor as AppTagColor,
  TagRef as AppTagRef,
  LinkPreview as AppLinkPreview,
  CodeBlock as AppCodeBlock,
  Quote as AppQuote,
} from '@cys-stift/domain'
import type {
  CanvasElement,
  CanvasElementKind,
  CardId,
  CardType,
  TagColor,
  TagRef,
  LinkPreview,
  CodeBlock,
  Quote,
} from '../types'

/**
 * 边界类型同步断言(编译期)。
 *
 * types.ts 是权威源(domain / canvas-engine)的结构性复制;双向可赋值 = 结构全等,
 * 任何一侧漂移,`tsc --noEmit`(lint)即红。vitest 不做类型检查——本文件由包 lint
 * 检验;这里的 it() 只是让 vitest 不报"空套件"。
 */
type AssertEq<A, B> = [A] extends [B] ? ([B] extends [A] ? true : never) : never

const _element: AssertEq<CanvasElement, AppCanvasElement> = true
const _elementKind: AssertEq<CanvasElementKind, AppCanvasElementKind> = true
const _cardId: AssertEq<CardId, AppCardId> = true
const _cardType: AssertEq<CardType, AppCardType> = true
const _tagColor: AssertEq<TagColor, AppTagColor> = true
const _tagRef: AssertEq<TagRef, AppTagRef> = true
const _linkPreview: AssertEq<LinkPreview, AppLinkPreview> = true
const _codeBlock: AssertEq<CodeBlock, AppCodeBlock> = true
const _quote: AssertEq<Quote, AppQuote> = true

void [_element, _elementKind, _cardId, _cardType, _tagColor, _tagRef, _linkPreview, _codeBlock, _quote]

describe('types-compat(编译期断言,真检验在 lint 的 tsc)', () => {
  it('边界类型与权威源结构全等(断言本体见上方类型层)', () => {
    expect(true).toBe(true)
  })
})
