'use client'

/**
 * DslDialog — 画布转义(DSL 双向)模态编辑器(转义产品化 Step 2)。
 *
 * 把"画布的文字形态"直接暴露给用户:工具栏 DSL 按钮 → 弹模态,textarea
 * 显示当前画布文本(serializeCanvasReadable;v6 card 行含真实 @title/@content token),
 * 可编辑/粘贴,"应用/复制/下载"。应用走 parseDslWithDiagnostics +
 * applyLayout(单 undo 步);parse 失败的行不再被静默吞掉,而是在
 * textarea 下方逐行展示诊断(line + 原因)。
 *
 * 不门控 AI:所有用户可用,这是核心卖点而非 AI 附属。模态照 export-dialog
 * 的结构(Modal + Button + 内联 token 化 <style> + pushToast + i18n)。
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import { Modal, Button } from '@cys-stift/ui'
import type { CardId, CardService } from '@cys-stift/domain'
import { InMemoryCanvasHost, sceneRevision, type CanvasElement, type CanvasHost } from '@cys-stift/canvas-engine'
import { useI18n } from '@/lib/i18n'
import { downloadFile } from '@/lib/download'
import { pushToast } from '@/lib/toast-store'
import { serializeCanvasReadable, serializeCanvas } from '@wscytz/dsl'
import { parseDslWithDiagnostics, type DslCardOp, type DslOp } from '@wscytz/dsl'
import { buildCanvasPrompt } from '../ai/canvas-prompt'
import { DSL_GRAMMAR_REFERENCE } from '@wscytz/dsl'
import { applyPlanIfClean, HASH_SKIP_REASON, type CardCreateHandler, type CardUpdateHandler } from './apply-layout'
import { humanizeApplyIssue } from '@/lib/dsl-issue-reasons'
import { diffCanvasSnapshots } from './canvas-diff'
import { archiveStore } from '@/lib/archive-store'
import { buildArchivePayload } from '@/lib/build-archive-payload'
import { VERSION } from '@/lib/version'
import { messages, type MessageKey } from '@/lib/i18n/messages'

/** R14:诊断消息人话化 —— 修正误导性报错(如「missing @pos」但行里其实有 @pos,
 *  那是 @pos 分隔符/参数格式错了)。可读诊断优先,原 message 兜底。 */
function diagnosticMessage(
  diag: { message: string; text?: string },
  t: (k: MessageKey, params?: Record<string, string | number>) => string,
): string {
  const line = diag.text ?? ''
  // 用户明明写了 @pos 却报 missing —— 是格式错(逗号写成空格/括号不全),提示标准形。
  if (diag.message === 'missing @pos' && /@pos/i.test(line)) {
    return t('canvas.dslErrPosFormat')
  }
  if (diag.message === 'missing @pos' && /@size/i.test(line) && !/@pos/i.test(line)) {
    return t('canvas.dslErrPosMissing')
  }
  return diag.message
}

const DSL_EXAMPLES = {
  starter: '[text #welcome] @pos(80, 80) @text("从文字开始") @color(yellow)\n[rect #frame] @pos(60, 60) @size(260, 120) @color(blue)',
  create: '[card #new-note create] @pos(120, 120) @size(260, 120) @color(red)',
  relation: '[card #parent create] @pos(120, 120) @size(240, 100) @color(blue)\n[card #child create] below #parent @gap(24)',
} as const

export function appendDslBlock(current: string, block: string): string {
  const existing = current.trimEnd()
  return existing ? `${existing}\n${block}` : block
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

export function replaceOrAppendCardRelation(
  source: string,
  targetId: string,
  anchorId: string,
  direction: 'right-of' | 'below',
): string {
  const relation = `[card #${targetId}] ${direction} #${anchorId} @gap(24)`
  const lines = source.split('\n')
  const cardLine = new RegExp(`^\\s*\\[card\\s+#${escapeRegExp(targetId)}(?:\\s+create)?\\]`)
  const index = lines.findIndex((line) => cardLine.test(line))
  if (index === -1) return appendDslBlock(source, relation)
  lines[index] = relation
  return lines.join('\n')
}

function placementOf(op: DslCardOp) {
  return op.rel ?? (op.keepExistingPos ? null : [op.x, op.y])
}

function prepareDraft(text: string, generatedText: string | null, generatedOps?: DslOp[] | null) {
  const parsed = parseDslWithDiagnostics(text)
  if (generatedText === null) return parsed
  const originalOps = generatedOps ?? parseDslWithDiagnostics(generatedText).ops
  const original = new Map<string, DslCardOp & Pick<DslOp, 'line'>>()
  for (const op of originalOps) {
    if (op.type === 'card' && !op.create && !op.delete) original.set(String(op.cardId), op)
  }
  const seen = new Set<string>()
  const repeated = new Set<string>()
  for (const op of parsed.ops) {
    if (op.type !== 'card') continue
    const id = String(op.cardId)
    if (seen.has(id)) repeated.add(id)
    seen.add(id)
  }
  // 关系行不是自包含指令：`right-of #a` 的落点取决于 #a 的几何。用户只改锚点行时，
  // 依赖行文本没变——若按“未改动”整行丢弃，依赖卡会留在旧坐标，关系凭空消失。
  // 这里先算出“哪些卡的有效位置可能变化”（含链式关系与组锚），供下方保留依赖行。
  const changed = changedCardPlacements(parsed.ops, originalOps)
  const ops: DslOp[] = []
  for (const op of parsed.ops) {
    if (op.type !== 'card' || op.create || op.delete || repeated.has(String(op.cardId))) {
      ops.push(op)
      continue
    }
    const id = String(op.cardId)
    const baseline = original.get(id)
    if (!baseline || JSON.stringify(placementOf(op)) !== JSON.stringify(placementOf(baseline))) {
      ops.push(op)
      continue
    }
    // 锚点/组包围盒变了 → 原样保留关系行，让 solver 重新落位（而不是丢弃或改写成 @pos）。
    if (op.rel !== undefined && changed.has(id)) {
      ops.push(op)
      continue
    }
    const { line: _baselineLine, ...baselineBody } = baseline
    const { line, ...body } = op
    if (JSON.stringify(body) === JSON.stringify(baselineBody)) continue
    const { rel: _relation, w, h, ...patch } = body
    ops.push({
      ...patch, line, x: 0, y: 0, keepExistingPos: true,
      ...(w !== baseline.w && w !== undefined ? { w } : {}),
      ...(h !== baseline.h && h !== undefined ? { h } : {}),
    })
  }
  return { ...parsed, ops }
}

/** 两张草稿里“有效位置可能变化”的卡 id（直接改动 + 关系链 + 组锚传播）。 */
function changedCardPlacements(nextOps: DslOp[], prevOps: DslOp[]): Set<string> {
  const cardsOf = (ops: DslOp[]) => {
    const map = new Map<string, DslCardOp>()
    for (const op of ops) if (op.type === 'card') map.set(String(op.cardId), op)
    return map
  }
  const next = cardsOf(nextOps)
  const prev = cardsOf(prevOps)
  const changed = new Set<string>()
  const geometry = (op: DslCardOp) => JSON.stringify([op.x, op.y, op.w, op.h])
  const groupKey = (op: DslCardOp) => op.group ?? ''

  for (const [id, op] of next) {
    const before = prev.get(id)
    if (!before || op.create !== before.create || op.delete !== before.delete) {
      changed.add(id)
      continue
    }
    if (groupKey(op) !== groupKey(before)) changed.add(id)
    if (op.rel === undefined && before.rel === undefined && geometry(op) !== geometry(before)) {
      changed.add(id)
      continue
    }
    if (op.rel !== undefined && before.rel !== undefined &&
        JSON.stringify(op.rel) !== JSON.stringify(before.rel)) {
      changed.add(id)
    }
  }
  for (const id of prev.keys()) if (!next.has(id)) changed.add(id)

  // 组锚：成员集合或任一成员位置变化 → 整组 bbox 变化。
  const membersOf = (cards: Map<string, DslCardOp>) => {
    const groups = new Map<string, string[]>()
    for (const [id, op] of cards) {
      if (!op.group || op.delete) continue
      const list = groups.get(op.group) ?? []
      list.push(id)
      groups.set(op.group, list)
    }
    for (const list of groups.values()) list.sort()
    return groups
  }
  const nextGroups = membersOf(next)
  const prevGroups = membersOf(prev)

  let grew = true
  while (grew) {
    grew = false
    const touchedGroups = new Set<string>()
    for (const [name, members] of nextGroups) {
      const before = prevGroups.get(name) ?? []
      if (members.length !== before.length ||
          members.some((id, index) => id !== before[index]) ||
          members.some((id) => changed.has(id))) {
        touchedGroups.add(name)
      }
    }
    for (const [id, op] of next) {
      if (op.delete || changed.has(id) || op.rel === undefined) continue
      const anchorMoved = op.rel.anchorGroup === true
        ? touchedGroups.has(op.rel.anchor)
        : changed.has(op.rel.anchor)
      if (anchorMoved) {
        changed.add(id)
        grew = true
      }
    }
  }
  return changed
}

function cloneElements(elements: readonly CanvasElement[]): CanvasElement[] {
  return elements.map((element) => ({
    ...element,
    ...(element.curve ? { curve: { ...element.curve } } : {}),
    ...(element.elbow ? { elbow: element.elbow.map((point) => ({ ...point })) } : {}),
    ...(element.meta
      ? {
          meta: {
            ...element.meta,
            ...(Array.isArray(element.meta.points)
              ? { points: (element.meta.points as unknown[]).map((point) => (Array.isArray(point) ? [...point] : point)) }
              : {}),
          },
        }
      : {}),
  }))
}

function revisionOf(elements: readonly CanvasElement[]): string {
  // sceneRevision:card h 是引擎派生值(每次 render 静默自愈),把它当"外部
  // 变更"会让对话框开着的几秒内 Apply 被假阳性拒绝(2026-11-17 真机复现:
  // 字体晚到 → h 96→58 → "画布已在编辑期间变化")。其余字段照常参与。
  return sceneRevision(elements)
}

export function DslDialog({
  open,
  onClose,
  host,
  service,
  canvasName,
  onCardCreate,
  onCardUpdate,
  onCardRemove,
  initialText,
}: {
  open: boolean
  onClose: () => void
  host: CanvasHost | null
  service: CardService
  canvasName: string
  onCardCreate?: CardCreateHandler
  /** v5:card-update 带 @title/@content 时写回 CardService。 */
  onCardUpdate?: CardUpdateHandler
  /** v10:[card #id delete] 时把卡移出画布(DB 侧);先 DB 后 host.remove。 */
  onCardRemove?: (cardId: string) => void
  /** Text supplied by the paste bridge; it is reviewed before being applied. */
  initialText?: string
}) {
  const { t, locale } = useI18n()

  // 预览标签:card 用真实标题,其余用元素类型的人话名;不再显示裸 id / 机器字段名。
  const elementLabel = (el: CanvasElement, titleById?: Map<string, string>): string => {
    if (el.kind === 'card') {
      const title = titleById?.get(el.id) ?? service.get(el.id as CardId)?.title
      return t('canvas.diffElementCard', { title: title || t('card.untitled') })
    }
    if (el.kind === 'arrow' && el.from && el.to) {
      const from = titleById?.get(el.from) ?? service.get(el.from as CardId)?.title ?? el.from
      const to = titleById?.get(el.to) ?? service.get(el.to as CardId)?.title ?? el.to
      return `${t('canvas.kind.arrow')} ${from}→${to}`
    }
    const key = `canvas.kind.${el.kind}` as MessageKey
    // 按消息表判断 key 是否存在,而不是比较 t() 返回值:测试 mock 的 t 直接回 key
    // (返回 key 也可能是"已翻译"),比较法会把已存在的 key 误判为未知而回退原串。
    return key in messages ? t(key) : el.kind
  }
  const fieldLabel = (field: string): string => {
    const key = `canvas.diffField.${field}` as MessageKey
    return key in messages ? t(key) : field
  }

  const [text, setText] = useState('')
  const [appliedHashes, setAppliedHashes] = useState<Set<string>>(new Set())
  const [base, setBase] = useState<{ elements: CanvasElement[]; revision: string } | null>(null)
  const [generatedText, setGeneratedText] = useState<string | null>(null)
  const [revisionTick, setRevisionTick] = useState(0)
  const [stale, setStale] = useState(false)
  // R14:未应用编辑的关闭确认。dirty = 当前文本与打开/载入时基线不同
  // (基线比较天然覆盖快速示例、关系生成等非 textarea 编辑入口)。
  const [confirmClose, setConfirmClose] = useState(false)
  const baselineTextRef = useRef('')
  const isDirty = text.trim() !== baselineTextRef.current.trim()

  // 实时预览:用户输入时即重新 parse,给出"待应用 N 条 / M 行无效"计数,
  // 不必等点 Apply。只在有可说之事时渲染(ok 或 warn),其余不渲染。
  // generatedText 在两次应用之间不变；缓存它的 parse 结果，避免每次击键重解析。
  const generatedOps = useMemo(
    () => (generatedText === null ? null : parseDslWithDiagnostics(generatedText).ops),
    [generatedText],
  )
  const preview = useMemo(() => {
    const { ops, errors: parseErrors, warnings: parseWarnings } = prepareDraft(text, generatedText, generatedOps)
    if (!base || ops.length === 0) {
      return {
        ops,
        errors: parseErrors,
        warnings: parseWarnings,
        opCount: ops.length,
        errCount: parseErrors.length,
        diff: null as ReturnType<typeof diffCanvasSnapshots> | null,
        titleById: new Map<string, string>(),
        contentChanges: [] as { opIndex: number; cardId: string; title: string; fields: string[] }[],
        metaChanges: [] as { opIndex: number; cardId: string; title: string; fields: string[] }[],
        applyIssues: [] as { opIndex: number; line?: number; reason: string }[],
        subsetDiff: null as ReturnType<typeof diffCanvasSnapshots> | null,
        subsetCount: 0,
        gated: false,
      }
    }
    const before = cloneElements(base.elements)
    const afterHost = new InMemoryCanvasHost()
    afterHost.applyWithoutEcho(() => {
      for (const element of before) afterHost.upsert(element)
    })
    // A preview has no persistence side effects. The successful callback only
    // makes card-create operations visible in the projected host.
    const outcome = applyPlanIfClean(afterHost, ops, new Set(appliedHashes))
    const applyIssues = outcome.ok
      ? outcome.report.opResults
          .filter((result) => result.status !== 'applied' && result.reason !== undefined)
          .map((result) => ({ opIndex: result.opIndex, line: ops[result.opIndex]?.line, reason: result.reason! }))
      : outcome.diagnostics.map((diagnostic) => ({ opIndex: diagnostic.opIndex, line: ops[diagnostic.opIndex]?.line, reason: diagnostic.message }))
    // 整单被闸门拒绝时闸门什么都不应用 → diff 为空,用户看不到其余有效行会做什么。
    // 预览补一次"跳过挂起行的投影"(只影响显示,不改 apply 的整单语义):修复挂起行前
    // 也能看到其余有效指令的改动量。注意这是"修正挂起行之后"的预期,不是本次应用的承诺。
    const blockedIndices = outcome.ok ? null : new Set(applyIssues.map((issue) => issue.opIndex))
    let subsetDiff: ReturnType<typeof diffCanvasSnapshots> | null = null
    let subsetCount = 0
    let appliedIndices = new Set(outcome.ok ? outcome.report.opResults.filter((result) => result.status === 'applied').map((result) => result.opIndex) : [])
    if (blockedIndices && applyIssues.length > 0) {
      const subsetOps = ops.filter((_, index) => !blockedIndices.has(index))
      if (subsetOps.length > 0) {
        const subsetHost = new InMemoryCanvasHost()
        subsetHost.applyWithoutEcho(() => {
          for (const element of before) subsetHost.upsert(element)
        })
        const subsetOutcome = applyPlanIfClean(subsetHost, subsetOps, new Set(appliedHashes))
        if (subsetOutcome.ok) {
          subsetDiff = diffCanvasSnapshots(before, cloneElements(subsetHost.getElements()))
          subsetCount = subsetOutcome.report.applied
          const subsetIndices = ops.flatMap((_, index) => blockedIndices.has(index) ? [] : [index])
          appliedIndices = new Set(subsetOutcome.report.opResults.flatMap((result) =>
            result.status === 'applied' ? [subsetIndices[result.opIndex]!] : [],
          ))
        }
      }
    }
    const after = cloneElements(afterHost.getElements())
    const titleById = new Map<string, string>()
    for (const op of ops) {
      if (op.type === 'card' && op.title !== undefined) titleById.set(String(op.cardId), op.title)
    }
    const allContentChanges: { opIndex: number; cardId: string; title: string; fields: string[] }[] = []
    ops.forEach((op, index) => {
      if (op.type !== 'card' || op.delete || op.create) return
      const current = service.get(op.cardId)
      const fields: string[] = []
      if (op.title !== undefined && op.title !== current?.title) fields.push('title')
      if (op.content !== undefined && op.content !== current?.body) fields.push('content')
      if (op.cardType !== undefined && op.cardType !== current?.type) fields.push('type')
      if (op.tags !== undefined && JSON.stringify(op.tags) !== JSON.stringify((current?.tags ?? []).map((tag) => tag.value))) fields.push('tags')
      if (op.links !== undefined && JSON.stringify(op.links) !== JSON.stringify((current?.links ?? []).map((link) => link.url))) fields.push('links')
      if (op.code !== undefined && JSON.stringify(op.code) !== JSON.stringify(current?.codeSnippets ?? [])) fields.push('code')
      if (op.quotes !== undefined && JSON.stringify(op.quotes) !== JSON.stringify(current?.quotes ?? [])) fields.push('quotes')
      if (fields.length > 0) {
        allContentChanges.push({ opIndex: index, cardId: String(op.cardId), title: current?.title ?? op.title ?? t('card.untitled'), fields })
      }
    })
    // 挂起行的内容修改不进预览(它还没被应允);主面板只在无挂起时渲染,天然一致。
    const contentChanges = allContentChanges.filter((change) => appliedIndices.has(change.opIndex))
    // v11.2:仅属性变化(@group/@href/layoutAnchor)时几何 diff 与内容 diff 都为空，
    // 但 Apply 确实会写 meta。预览必须承认这次写入，不能谎称“画布已是最新”。
    const metaChanges: { opIndex: number; cardId: string; title: string; fields: string[] }[] = []
    if (outcome.ok) {
      const beforeById = new Map(before.map((element) => [element.id, element]))
      for (const result of outcome.report.opResults) {
        if (result.status !== 'applied') continue
        const op = ops[result.opIndex]
        if (!op || op.type !== 'card' || op.create || op.delete) continue
        const id = String(op.cardId)
        const beforeElement = beforeById.get(id)
        const afterElement = afterHost.getElement(id)
        if (!beforeElement || !afterElement) continue
        // 位置变化时 layoutAnchor 只是关系求解的副产物，几何行已经说明变化；
        // 只在“仅属性变化”时单列 layoutAnchor，避免同一行重复两条。
        const geometryChanged =
          beforeElement.x !== afterElement.x ||
          beforeElement.y !== afterElement.y ||
          beforeElement.w !== afterElement.w ||
          beforeElement.h !== afterElement.h
        const metaKeys = geometryChanged
          ? (['group', 'href'] as const)
          : (['group', 'href', 'layoutAnchor'] as const)
        const fields = metaKeys.filter(
          (key) => JSON.stringify(beforeElement.meta?.[key]) !== JSON.stringify(afterElement.meta?.[key]),
        )
        if (fields.length > 0) {
          metaChanges.push({
            opIndex: result.opIndex,
            cardId: id,
            title: titleById.get(id) ?? service.get(op.cardId)?.title ?? t('card.untitled'),
            fields: [...fields],
          })
        }
      }
    }
    return {
      ops,
      errors: parseErrors,
      warnings: parseWarnings,
      opCount: ops.length,
      errCount: parseErrors.length,
      diff: diffCanvasSnapshots(before, after),
      titleById,
      contentChanges,
      metaChanges,
      applyIssues,
      subsetDiff,
      subsetCount,
      // gated = 诊断闸门整单拒绝(apply 真的不会发生);否则(ok)这些 applyIssues 是
      // 「计划干净但个别行被跳过」(如箭头端点指向同批更晚的卡):应用照常提交其余行,
      // UI 不能渲染成「应用已取消」(2026-11-19 收束:预览承诺必须等于 apply 行为)。
      gated: !outcome.ok,
    }
  }, [text, base, generatedText, generatedOps, appliedHashes, service, t])

  // Escape 关闭模态(与 CardDetailModal 一致;Modal 组件只处理 backdrop 点击,
  // Escape 由调用方负责)。textarea 里 Escape 仍关模态——DSL 编辑器的「完成」手势。
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      // Stacked-modal guard: if another dialog already consumed this Escape
      // (e.g. a confirm stacked on top), bail so we don't close two on one
      // keypress. We mark it consumed only when we actually close ourselves.
      if (e.defaultPrevented) return
      // IME 组合态(中日韩输入候选词)的 Escape 是取消候选,不该关模态 —— 否则
      // 用户组词时按 Escape 会丢失整个 DSL 编辑(session 不存草稿)。
      if (e.isComposing) return
      e.preventDefault()
      requestClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose, isDirty])

  // 打开时填充当前画布文本(v6:serializeCanvasReadable + CardService resolve,card 含 @title/@content)。
  // 同时清空诊断列表:刚序列化的文本恒为合法,无 parse 错误。
  // 也清空增量应用缓存:每次打开模态都是全新编辑会话。
  useEffect(() => {
    if (!open || !host) return
    const els = cloneElements(host.getElements())
    setBase({ elements: els, revision: revisionOf(els) })
    const next = initialText ?? serializeCanvasReadable(els, (id) => { const c = service.get(id as CardId); return c ? { title: c.title, content: c.body, type: c.type, tags: c.tags, links: c.links, codeSnippets: c.codeSnippets, quotes: c.quotes } : undefined })
    setText(next)
    setGeneratedText(initialText === undefined ? next : null)
    baselineTextRef.current = next
    setAppliedHashes(new Set())
    setStale(false)
  }, [open, host, service, initialText])

  // Surface a live revision change while the dialog is open. A drag, undo, or
  // another panel can mutate the host without changing this component's props.
  useEffect(() => {
    if (!open || !host) return
    return host.onUserChange(() => setRevisionTick((value) => value + 1))
  }, [open, host])

  const liveStale = !!base && !!host && revisionOf(host.getElements()) !== base.revision

  const selectedCards = useMemo(() => {
    if (!host) return []
    return host
      .getSelectedIds()
      .map((id) => host.getElement(id))
      .filter((element): element is CanvasElement => element?.kind === 'card')
      .slice(0, 2)
  }, [host, open, revisionTick])

  const reloadFromCanvas = () => {
    if (!host) return
    const elements = cloneElements(host.getElements())
    setBase({ elements, revision: revisionOf(elements) })
    const next = serializeCanvasReadable(elements, (id) => { const c = service.get(id as CardId); return c ? { title: c.title, content: c.body, type: c.type, tags: c.tags, links: c.links, codeSnippets: c.codeSnippets, quotes: c.quotes } : undefined })
    setText(next)
    setGeneratedText(next)
    baselineTextRef.current = next
    setAppliedHashes(new Set())
    setStale(false)
  }

  const arrangeSelected = (direction: 'right-of' | 'below') => {
    const [anchor, target] = selectedCards
    if (!anchor || !target) return
    setText((current) => replaceOrAppendCardRelation(current, target.id, anchor.id, direction))
  }

  // 与「载入最新画布」同源的文本。只在文本仍等于当前画布时判无变化:
  // 纯内容编辑(@title/@content)几何 diff 为零但文本不同,不能被误拦。
  const serializeCurrent = () => {
    if (!host) return ''
    return serializeCanvasReadable(host.getElements(), (id) => {
      const c = service.get(id as CardId)
      return c ? { title: c.title, content: c.body, type: c.type, tags: c.tags, links: c.links, codeSnippets: c.codeSnippets, quotes: c.quotes } : undefined
    })
  }

  const apply = () => {
    if (!host) return
    const hostRevisionChanged = !base || revisionOf(host.getElements()) !== base.revision
    if (hostRevisionChanged || stale) {
      setStale(true)
      pushToast({ kind: 'info', message: t('agent.staleRevision') })
      return
    }
    const { ops, errors: parseErrors } = preview
    if (parseErrors.length === 0 && (text.trim() === serializeCurrent().trim() ||
      (ops.length === 0 && generatedText !== null && text.trim() !== ''))) {
      pushToast({ kind: 'info', message: t('canvas.dslPreviewNoChanges') })
      return
    }

    if (ops.length === 0) {
      // 无可应用的指令。区分两种:全行无法解析 vs 输入为空。
      if (parseErrors.length > 0) {
        pushToast({ kind: 'error', message: t('canvas.dslAllInvalid', { n: String(parseErrors.length) }) })
      } else {
        pushToast({ kind: 'info', message: t('canvas.dslEmpty') })
      }
      return
    }

    const outcome = applyPlanIfClean(host, ops, new Set(appliedHashes), onCardCreate, onCardUpdate, onCardRemove)
    if (!outcome.ok) {
      pushToast({ kind: 'error', message: t('canvas.dslApplyBlocked', { n: String(outcome.diagnostics.length) }) })
      return
    }
    const { applied, skipped, failed, newlyApplied } = outcome.report
    // 合并【本次新应用】的 op hash 到现有集合 —— 部分失败时保留已应用行的 hash,
    // 重复 Apply 会跳过它们(planFree 命中已应用 hash 走 update 不造副本),防造无 #id
    // freeform 副本。全部成功时下方 else-if 分支会重序列化文本(画布即文本)并清空 hash。
    if (applied > 0) {
      const nextBase = cloneElements(host.getElements())
      setBase({ elements: nextBase, revision: revisionOf(nextBase) })
      setAppliedHashes((prev) => new Set([...prev, ...newlyApplied]))
      setStale(false)
      // T5:风险 op 存档 —— DSL apply 成功(applied > 0)后落档(b 类,fire-and-forget,
      // 不阻塞 UI;apply 是同步函数,用 .then() 链接 append)。
      void buildArchivePayload()
        .then((p) => archiveStore.append('dsl-apply', `DSL apply ${applied}${skipped + failed ? ` (skipped/failed ${skipped + failed})` : ''}`, p, VERSION))
        .catch((err) => console.warn('[archive] dsl-apply append failed', err))
    }
    const pendingSkips = outcome.report.opResults.filter((result) =>
      result.status === 'skipped' && result.reason !== HASH_SKIP_REASON,
    ).length
    const hadIssues = parseErrors.length > 0 || pendingSkips > 0 || failed > 0
    if (hadIssues) {
      // R14:部分失败时保留用户原文 + 继续显示错误面板(此前重序列化会抹掉写错的行
      // 和 # 注释,错误随 text 重新 parse 而消失,用户再也看不到错在哪)。
      // base 仍要更新(已应用部分改了画布,防 stale),但不清 dirty —— 用户还有
      // 未应用的编辑;appliedHashes 保留,重复 Apply 已应用的行会被跳过(防造副本)。
      const nextBase = cloneElements(host.getElements())
      setBase({ elements: nextBase, revision: revisionOf(nextBase) })
      // 部分应用后，画布已经变了：草稿归一基线同步到“已应用后的画布”。
      // text 保持用户原文（错误行还在），但 generatedText 必须更新，否则用户
      // 把已应用行改回旧值会被判“与基线一致 → 无需应用”，文本与画布分叉。
      setGeneratedText(serializeCurrent())
      setStale(false)
      pushToast({
        kind: 'info',
        message: t('canvas.dslAppliedSkipped', {
          applied: String(applied),
          skipped: String(pendingSkips + failed + parseErrors.length),
        }),
      })
    } else if (applied > 0 || skipped > 0) {
      // 全部成功:重序列化同步文本(画布即文本),视为已应用,不再 dirty。
      // 清空 hash —— 文本已与画布一致,旧 op hash 留着无意义(下次 apply 是全新 parse 集合)。
      const nextText = serializeCanvasReadable(host.getElements(), (id) => { const c = service.get(id as CardId); return c ? { title: c.title, content: c.body, type: c.type, tags: c.tags, links: c.links, codeSnippets: c.codeSnippets, quotes: c.quotes } : undefined })
      setText(nextText)
      setGeneratedText(nextText)
      baselineTextRef.current = nextText
      setAppliedHashes(new Set())
      if (applied > 0) pushToast({ kind: 'success', message: t('canvas.dslApplied', { n: String(applied) }) })
      else pushToast({ kind: 'info', message: t('canvas.dslPreviewNoChanges') })
    } else {
      pushToast({ kind: 'error', message: t('agent.applyFailed') })
    }
    // 不关闭模态:用户可继续编辑
  }

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text)
      pushToast({ kind: 'success', message: t('canvas.dslCopied') })
    } catch {
      pushToast({ kind: 'error', message: t('canvas.dslCopyFail') })
    }
  }

  const copySelected = async () => {
    if (!host) return
    const selectedIds = host.getSelectedIds()
    if (selectedIds.length === 0) {
      pushToast({ kind: 'info', message: t('canvas.dslSelectFirst') })
      return
    }
    const allElements = host.getElements()
    const selectedElements = allElements.filter((e) => selectedIds.includes(e.id))
    const dsl = serializeCanvas(selectedElements)
    try {
      await navigator.clipboard.writeText(dsl)
      pushToast({ kind: 'success', message: t('canvas.copyDslOk', { n: String(selectedIds.length) }) })
    } catch {
      pushToast({ kind: 'error', message: t('canvas.dslCopyFail') })
    }
  }

  // 「复制为 AI 提示词」:把当前画布打包成可直接粘进任意 LLM 网页版的提示词
  // (画布快照 + DSL 语法 + 指令)。转义双向桥的出口——不依赖内置 AI。
  const copyAsPrompt = async () => {
    if (!host) return
    try {
      const prompt = buildCanvasPrompt(host, service)
      await navigator.clipboard.writeText(prompt)
      pushToast({ kind: 'success', message: t('canvas.dslPromptCopied') })
    } catch {
      pushToast({ kind: 'error', message: t('canvas.dslCopyFail') })
    }
  }

  const download = async () => {
    // try/catch:text 极大时 new Blob / Tauri writeFile 可抛(配额/内存/SAF 拒绝),
    // 冒泡到错误边界不如 toast 友好(对齐 export-dialog doExport 的 try/catch 模式)。
    // 走 downloadFile(分平台:桌面 Blob+a.click / Android Tauri SAF save),
    // 解决 Android WebView 不处理 Blob download 的静默失败。
    try {
      const baseName = canvasName || 'canvas'
      const blob = new Blob([text], { type: 'text/plain;charset=utf-8' })
      await downloadFile(`${baseName}.txt`, blob)
      pushToast({ kind: 'success', message: t('canvas.dslDownloaded') })
    } catch {
      pushToast({ kind: 'error', message: t('canvas.dslDownloadFail') })
    }
  }

  // R14:有未应用编辑时关闭先确认(此前手写 10 分钟点 backdrop/Esc 全丢)。
  const requestClose = () => {
    if (isDirty) setConfirmClose(true)
    else onClose()
  }

  // 预览每类只列前 8 项,超出部分在列表下方给出计数提示。
  const previewTotal = preview.diff
    ? preview.diff.added.length + preview.diff.removed.length + preview.diff.changed.length +
      preview.contentChanges.length + preview.metaChanges.length
    : 0
  const previewShown = preview.diff
    ? Math.min(preview.diff.added.length, 8) +
      Math.min(preview.diff.removed.length, 8) +
      Math.min(preview.diff.changed.length, 8) +
      Math.min(preview.contentChanges.length, 8) +
      Math.min(preview.metaChanges.length, 8)
    : 0
  const previewHidden = previewTotal - previewShown

  // 改动列表渲染在「整单预览」与「挂起时其余有效行预览」两处复用;content 传入要
  // 附的内容修改列表(整单=全部,挂起子集=过滤后的;传 null 则不展示)。
  const renderChangeList = (
    diff: NonNullable<(typeof preview)['diff']>,
    content: (typeof preview)['contentChanges'] | null,
    meta: (typeof preview)['metaChanges'] | null = null,
  ) => (
    <ul className="dsl-preview__changes">
      {diff.added.slice(0, 8).map((element) => (
        <li key={`added-${element.id}`} className="dsl-preview__added">+ {elementLabel(element, preview.titleById)}</li>
      ))}
      {diff.removed.slice(0, 8).map((element) => (
        <li key={`removed-${element.id}`} className="dsl-preview__removed">- {elementLabel(element, preview.titleById)}</li>
      ))}
      {diff.changed.slice(0, 8).map((change) => (
        <li key={`changed-${change.id}`} className="dsl-preview__changed">~ {elementLabel(change.after, preview.titleById)} · {change.fields.map(fieldLabel).join(locale === 'en' ? ', ' : '、')}</li>
      ))}
      {content && content.slice(0, 8).map((change) => (
        <li key={`content-${change.opIndex}-${change.cardId}`} className="dsl-preview__changed">~ {t('canvas.diffElementCard', { title: change.title })} · {change.fields.map(fieldLabel).join(locale === 'en' ? ', ' : '、')}</li>
      ))}
      {meta && meta.slice(0, 8).map((change) => (
        <li key={`meta-${change.opIndex}-${change.cardId}`} className="dsl-preview__changed">~ {t('canvas.diffElementCard', { title: change.title })} · {change.fields.map(fieldLabel).join(locale === 'en' ? ', ' : '、')}</li>
      ))}
    </ul>
  )
  // 挂起标题按「几条操作」计数:同一 op 可产多条诊断(如重复 id + create 冲突),
  // 列表逐条显示,标题去重。列表 key 也带诊断序号,避免同 op 多条撞 React key。
  const blockedOpCount = new Set(preview.applyIssues.map((issue) => issue.opIndex)).size
  // 闸门整单拒绝 ≠ 个别行跳过:前者 apply 不会发生(红面板);后者计划干净、其余行
  // 照常提交,只能给出「将被跳过」的软提示,且必须照常展示预览 diff。
  const gateBlocked = preview.gated && preview.applyIssues.length > 0
  // 挂起/跳过原因列表两处复用(前缀区分 React key;>8 条截断提示一并带上)。
  const renderApplyIssues = (keyPrefix: string) => (
    <>
      <ul className="dsl-errors__list">
        {preview.applyIssues.slice(0, 8).map((issueValue, issueIdx) => (
          <li key={`${keyPrefix}-${issueValue.opIndex}-${issueIdx}`} className="dsl-errors__item">
            <span className="dsl-errors__line">
              {issueValue.line !== undefined ? t('canvas.dslErrorLine', { line: issueValue.line }) : `#${issueValue.opIndex + 1}:`}
            </span>
            <span className="dsl-errors__msg">{humanizeApplyIssue(issueValue.reason, t)}</span>
          </li>
        ))}
      </ul>
      {preview.applyIssues.length > 8 && (
        <p className="dsl-preview__more">{t('canvas.dslPreviewMore', { n: String(preview.applyIssues.length - 8) })}</p>
      )}
    </>
  )

  return (
    <Modal open={open} onClose={requestClose} title={t('canvas.dslTitle')} closeLabel={t('common.close')}>
      <p className="dsl-lede">{t('canvas.dslLede')}</p>
      <div className="dsl-bridge" role="note">
        <span className="dsl-bridge__label">{t('canvas.dslBridgeCanvas')}</span>
        <span aria-hidden="true">↔</span>
        <span className="dsl-bridge__label">{t('canvas.dslBridgeText')}</span>
        <span className="dsl-bridge__hint">{t('canvas.dslBridgeHint')}</span>
      </div>
      {/* 选择式关系生成只在「刚好选两张」时出现:模态打开后无法再改画布选择,
          常驻一排永远禁用的按钮只会让人以为功能坏了。 */}
      {selectedCards.length === 2 && (
        <section className="dsl-guide" aria-labelledby="dsl-guide-title">
          <div>
            <p id="dsl-guide-title" className="dsl-guide__title">{t('canvas.dslGuideTitle')}</p>
            <p className="dsl-guide__selection">
              {t('canvas.dslGuideSelection', {
                target: service.get(selectedCards[1]!.id as CardId)?.title || t('card.untitled'),
                anchor: service.get(selectedCards[0]!.id as CardId)?.title || t('card.untitled'),
              })}
            </p>
          </div>
          <div className="dsl-guide__actions">
            <Button variant="ghost" onClick={() => arrangeSelected('right-of')}>
              {t('canvas.dslGuideRight')}
            </Button>
            <Button variant="ghost" onClick={() => arrangeSelected('below')}>
              {t('canvas.dslGuideBelow')}
            </Button>
          </div>
        </section>
      )}
      <div className="dsl-examples" aria-label={t('canvas.dslExamples')}>
        <span className="dsl-examples__label">{t('canvas.dslExamples')}</span>
        {(Object.keys(DSL_EXAMPLES) as (keyof typeof DSL_EXAMPLES)[]).map((key) => (
          <button
            key={key}
            type="button"
            className="dsl-example"
            onClick={() => {
              setText((current) => appendDslBlock(current, DSL_EXAMPLES[key]))
            }}
          >
            {t(`canvas.dslExample.${key}` as never)}
          </button>
        ))}
      </div>
      <details className="dsl-syntax">
        <summary className="mono-label mono-label--wide">{t('canvas.dslSyntaxTitle')}</summary>
        <p className="dsl-syntax__body">{t('canvas.dslSyntaxBody')}</p>
        <pre className="dsl-syntax__code">{DSL_GRAMMAR_REFERENCE}</pre>
      </details>
      <textarea
        className="dsl-text"
        value={text}
        onChange={(e) => {
          setText(e.target.value)
        }}
        spellCheck={false}
        aria-label={t('canvas.dslTitle')}
      />
      {(liveStale || stale) && (
        <div className="dsl-preview dsl-preview--warn dsl-preview--stale" role="alert">
          <p>{t('canvas.dslPreviewStale')}</p>
          <Button variant="ghost" onClick={reloadFromCanvas}>{t('canvas.dslReload')}</Button>
        </div>
      )}
      {text.trim() !== '' && preview.opCount > 0 && preview.diff && previewTotal > 0 && !gateBlocked && (
        <div className="dsl-preview dsl-preview--ok" aria-live="polite">
          <p>{t('canvas.dslPreviewChanges', {
            added: String(preview.diff.added.length),
            removed: String(preview.diff.removed.length),
            changed: String(preview.diff.changed.length + preview.contentChanges.length + preview.metaChanges.length),
          })}</p>
          {renderChangeList(preview.diff, preview.contentChanges, preview.metaChanges)}
          {previewHidden > 0 && (
            <p className="dsl-preview__more">{t('canvas.dslPreviewMore', { n: String(previewHidden) })}</p>
          )}
        </div>
      )}
      {text.trim() !== '' && preview.opCount > 0 && preview.diff && previewTotal === 0 && !gateBlocked && (
        <p className="dsl-preview dsl-preview--ok">
          {t('canvas.dslPreviewNoChanges')}
        </p>
      )}
      {text.trim() !== '' && preview.errCount > 0 && (
        <p className="dsl-preview dsl-preview--warn">
          {t('canvas.dslPreviewIssues', {
            ok: String(preview.opCount),
            bad: String(preview.errCount),
          })}
        </p>
      )}
      {text.trim() !== '' && gateBlocked && (
        <div className="dsl-errors" role="alert" data-testid="dsl-apply-blocked">
          <p className="dsl-errors__title">{t('canvas.dslPreviewBlocked', { n: String(blockedOpCount) })}</p>
          {renderApplyIssues('blocked')}
        </div>
      )}
      {text.trim() !== '' && !preview.gated && preview.applyIssues.length > 0 && (
        <div className="dsl-errors dsl-errors--soft" role="status">
          <p className="dsl-errors__title dsl-errors__title--soft">
            {t('canvas.dslPreviewSkipped', { n: String(blockedOpCount) })}
          </p>
          {renderApplyIssues('skipped')}
        </div>
      )}
      {text.trim() !== '' && preview.subsetDiff && preview.subsetCount > 0 &&
        (preview.subsetDiff.added.length + preview.subsetDiff.removed.length + preview.subsetDiff.changed.length + preview.contentChanges.length) > 0 && (
        <div className="dsl-preview dsl-preview--ok" aria-live="polite">
          <p>{t('canvas.dslPreviewSubset', {
            n: String(preview.subsetCount),
            added: String(preview.subsetDiff.added.length),
            removed: String(preview.subsetDiff.removed.length),
            changed: String(preview.subsetDiff.changed.length + preview.contentChanges.length),
          })}</p>
          {renderChangeList(preview.subsetDiff, preview.contentChanges)}        </div>
      )}
      {preview.errors.length > 0 && (
        <div className="dsl-errors" role="alert">
          <p className="dsl-errors__title">{t('canvas.dslErrorsTitle', { n: String(preview.errors.length) })}</p>
          <ul className="dsl-errors__list">
            {preview.errors.map((e, i) => (
              <li key={i} className="dsl-errors__item">
                <span className="dsl-errors__line">{t('canvas.dslErrorLine', { line: String(e.line) })}</span>
                {/* R14:显示出错行原文(此前只有"第 N 行",长文本要自己数行;含 @pos 却报
                    missing @pos 的误导也由此可辨 —— 用户能看到自己写的原样)。 */}
                {e.text && <code className="dsl-errors__source">{e.text}</code>}
                <span className="dsl-errors__msg">{diagnosticMessage(e, t)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
      {preview.warnings.length > 0 && (
        <div className="dsl-errors dsl-errors--soft" role="status">
          <p className="dsl-errors__title dsl-errors__title--soft">
            {t('canvas.dslPreviewHints', { n: String(preview.warnings.length) })}
          </p>
          <ul className="dsl-errors__list">
            {preview.warnings.map((w, i) => (
              <li key={i} className="dsl-errors__item">
                <span className="dsl-errors__line">{t('canvas.dslErrorLine', { line: String(w.line) })}</span>
                {w.text && <code className="dsl-errors__source">{w.text}</code>}
                <span className="dsl-errors__msg">{w.message}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
      <div className="dsl-actions">
        <Button variant="ghost" onClick={copy}>{t('canvas.dslCopy')}</Button>
        <Button
          variant="ghost"
          onClick={copySelected}
          disabled={!host || host.getSelectedIds().length === 0}
        >
          {t('canvas.dslCopySelected')}
        </Button>
        <Button variant="ghost" onClick={copyAsPrompt}>{t('canvas.dslCopyAsPrompt')}</Button>
        <Button variant="ghost" onClick={download}>{t('canvas.dslDownload')}</Button>
        <span className="dsl-spacer" />
        {/* 取消+应用成组换行:窄宽下应用键不再孤行(2026-11-19 截图实锤)。 */}
        <div className="dsl-commit">
          <Button variant="ghost" onClick={requestClose}>{t('common.cancel')}</Button>
          <Button variant="primary" onClick={apply} disabled={!host || liveStale || stale}>{t('canvas.dslApply')}</Button>
        </div>
      </div>

      {/* R14:未应用编辑的关闭确认(防手写/粘贴一大段被 backdrop/Esc 丢弃)。 */}
      {confirmClose && (
        <Modal
          open
          onClose={() => setConfirmClose(false)}
          title={t('canvas.dslDiscardTitle')}
          closeLabel={t('common.cancel')}
        >
          <p className="dsl-confirm">{t('canvas.dslDiscardBody')}</p>
          <div className="dsl-confirm__actions">
            <Button variant="ghost" onClick={() => setConfirmClose(false)}>{t('common.cancel')}</Button>
            <Button variant="danger" onClick={() => { setConfirmClose(false); onClose() }}>
              {t('canvas.dslDiscardAction')}
            </Button>
          </div>
        </Modal>
      )}
      <style>{styles}</style>
    </Modal>
  )
}

const styles = `
.dsl-lede { margin: 0 0 var(--space-3); font-family: var(--font-body); font-size: var(--font-size-sm); color: var(--color-black-soft); line-height: 1.5; }
.dsl-bridge { display: flex; align-items: center; gap: var(--space-2); margin: 0 0 var(--space-2); padding: var(--space-2); border: var(--border-hairline); background: var(--color-yellow-soft); font-family: var(--font-mono); font-size: var(--font-size-xs); }
.dsl-bridge__label { font-weight: 700; text-transform: uppercase; letter-spacing: 0.08em; }
.dsl-bridge__hint { margin-left: auto; color: var(--color-gray); font-family: var(--font-body); }
.dsl-guide { display: flex; align-items: center; justify-content: space-between; gap: var(--space-2); margin: 0 0 var(--space-2); padding: var(--space-2); border: var(--border-hairline); background: var(--color-white); }
.dsl-guide__title { margin: 0 0 var(--space-half); font-family: var(--font-display); font-size: var(--font-size-sm); }
.dsl-guide__selection { margin: 0; color: var(--color-gray); font-family: var(--font-body); font-size: var(--font-size-xs); }
.dsl-guide__actions { display: flex; flex-wrap: wrap; gap: var(--space-1); }
.dsl-examples { display: flex; flex-wrap: wrap; align-items: center; gap: var(--space-1); margin: 0 0 var(--space-3); }
.dsl-examples__label { margin-right: var(--space-1); font-family: var(--font-mono); font-size: var(--font-size-xs); color: var(--color-gray); }
.dsl-example { min-height: 36px; padding: 0 var(--space-2); border: var(--border-hairline); border-radius: var(--radius-sm); background: var(--color-white); color: var(--color-black); font-family: var(--font-body); font-size: var(--font-size-xs); cursor: pointer; }
.dsl-example:hover { background: var(--color-yellow); }
.dsl-example:focus-visible { outline: 2px solid var(--color-red); outline-offset: 2px; }
.dsl-syntax { margin: 0 0 var(--space-3); border: var(--border-hairline); border-radius: var(--radius-sm); background: var(--color-gray-soft); }
.dsl-syntax__body { margin: 0 var(--space-2) var(--space-2); font-family: var(--font-body); font-size: var(--font-size-sm); color: var(--color-black-soft); line-height: 1.5; }
.dsl-syntax__code {
  margin: 0 var(--space-2) var(--space-2); padding: var(--space-2);
  background: var(--color-code-bg); color: var(--color-code-fg);
  font-family: var(--font-mono); font-size: var(--font-size-xs);
  border-radius: var(--radius-sm); line-height: 1.6; overflow-x: auto;
}
.dsl-text {
  width: 100%; min-height: 240px; box-sizing: border-box;
  padding: var(--space-2);
  background: var(--color-white); color: var(--color-black);
  font-family: var(--font-mono); font-size: var(--font-size-sm);
  border: var(--border-hairline); border-radius: var(--radius-sm); outline: none;
  resize: vertical; line-height: 1.5;
  /* R14:多行正文序列化成单条物理巨行 → 软换行显示,避免光标/滚动无法定位。
     实际存储仍是单行(往返对称),仅视觉换行。 */
  white-space: pre-wrap; word-break: break-all; overflow-wrap: anywhere;
}
.dsl-text:focus { border-color: var(--color-red); }
.dsl-preview { margin: 0 0 var(--space-2); padding: var(--space-1) var(--space-2); font-family: var(--font-mono); font-size: var(--font-size-xs); }
.dsl-preview p { margin: 0; }
.dsl-preview ul { display: flex; flex-wrap: wrap; gap: var(--space-1) var(--space-3); margin: var(--space-1) 0 0; padding: 0; list-style: none; color: var(--color-gray); }
.dsl-preview__changes { display: grid !important; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: var(--space-1) var(--space-2) !important; }
.dsl-preview__changes li { overflow-wrap: anywhere; }
.dsl-preview__added { color: var(--color-blue); }
.dsl-preview__removed { color: var(--color-red); }
.dsl-preview__changed { color: var(--color-black-soft); }
/* 隐藏项计数:与列表同层,弱化呈现。选择器带上 .dsl-preview 以压过上方 .dsl-preview p 的 margin:0。 */
.dsl-preview .dsl-preview__more { margin: var(--space-1) 0 0; color: var(--color-gray); }
.dsl-preview--ok { color: var(--color-gray); }
.dsl-preview--warn { color: var(--color-red); }
.dsl-preview--stale { display: flex; align-items: center; justify-content: space-between; gap: var(--space-2); }
.dsl-errors {
  margin-top: var(--space-2);
  padding: var(--space-2) var(--space-3);
  background: var(--color-red-soft);
  border: var(--border-hairline);
  border-color: var(--color-red);
  border-radius: var(--radius-sm);
}
/* 提示(全角标点/拼写手误):元素已保留,琥珀弱化,别和错误一个视觉权重 */
.dsl-errors--soft {
  background: transparent;
  border-color: var(--color-yellow);
  opacity: 0.85;
}
.dsl-errors__title--soft { color: var(--color-yellow); }
.dsl-errors__title {
  margin: 0 0 var(--space-1);
  font-family: var(--font-body);
  font-size: var(--font-size-sm);
  color: var(--color-red);
  font-weight: 500;
}
.dsl-errors__list { margin: 0; padding: 0; list-style: none; }
.dsl-errors__item {
  display: flex; gap: var(--space-2);
  font-family: var(--font-mono); font-size: var(--font-size-xs);
  color: var(--color-black-soft); line-height: 1.5;
  padding: var(--space-1) 0;
}
.dsl-errors__line { color: var(--color-red); flex-shrink: 0; }
.dsl-errors__source {
  display: block; width: 100%; flex-basis: 100%;
  background: var(--color-black-soft); color: var(--color-white);
  padding: var(--space-1) var(--space-2); border-radius: var(--radius-sm);
  font-family: var(--font-mono); font-size: var(--font-size-xs);
  white-space: pre-wrap; word-break: break-all;
}
.dsl-errors__msg { word-break: break-word; }
.dsl-actions { display: flex; flex-wrap: wrap; gap: var(--space-2); margin-top: var(--space-3); align-items: center; }
.dsl-spacer { flex: 1; min-width: 0; }
.dsl-commit { display: flex; gap: var(--space-2); }
@media (max-width: 767px) {
  .dsl-bridge { align-items: flex-start; flex-wrap: wrap; }
  .dsl-bridge__hint { width: 100%; margin-left: 0; }
  .dsl-guide { align-items: stretch; flex-direction: column; }
  .dsl-guide__actions { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .dsl-example { min-height: 48px; }
  .dsl-preview--stale { align-items: stretch; flex-direction: column; }
  .dsl-text { min-height: 200px; }
}
`
