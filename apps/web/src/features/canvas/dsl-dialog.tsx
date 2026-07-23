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
import { useEffect, useMemo, useState } from 'react'
import { Modal, Button } from '@cys-stift/ui'
import type { CardId, CardService } from '@cys-stift/domain'
import { InMemoryCanvasHost, type CanvasElement, type CanvasHost } from '@cys-stift/canvas-engine'
import { useI18n } from '@/lib/i18n'
import { downloadFile } from '@/lib/download'
import { pushToast } from '@/lib/toast-store'
import { serializeCanvasReadable, serializeCanvas } from '@cys-stift/dsl'
import { parseDslWithDiagnostics } from '@cys-stift/dsl'
import { buildCanvasPrompt } from '../ai/canvas-prompt'
import { DSL_GRAMMAR_REFERENCE } from '@cys-stift/dsl'
import { applyLayout, type CardCreateHandler, type CardUpdateHandler } from './apply-layout'
import { diffCanvasSnapshots } from './canvas-diff'
import { archiveStore } from '@/lib/archive-store'
import { buildArchivePayload } from '@/lib/build-archive-payload'
import { VERSION } from '@/lib/version'

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
  return JSON.stringify(cloneElements(elements).sort((a, b) => a.id.localeCompare(b.id)))
}

export function DslDialog({
  open,
  onClose,
  host,
  service,
  canvasName,
  onCardCreate,
  onCardUpdate,
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
  /** Text supplied by the paste bridge; it is reviewed before being applied. */
  initialText?: string
}) {
  const { t } = useI18n()
  const [text, setText] = useState('')
  const [appliedHashes, setAppliedHashes] = useState<Set<string>>(new Set())
  const [base, setBase] = useState<{ elements: CanvasElement[]; revision: string } | null>(null)
  const [revisionTick, setRevisionTick] = useState(0)
  const [stale, setStale] = useState(false)

  // 实时预览:用户输入时即重新 parse,给出"待应用 N 条 / M 行无效"计数,
  // 不必等点 Apply。只在有可说之事时渲染(ok 或 warn),其余不渲染。
  const preview = useMemo(() => {
    const { ops, errors: parseErrors } = parseDslWithDiagnostics(text)
    if (!base || ops.length === 0) {
      return {
        ops,
        errors: parseErrors,
        opCount: ops.length,
        errCount: parseErrors.length,
        diff: null as ReturnType<typeof diffCanvasSnapshots> | null,
      }
    }
    const before = cloneElements(base.elements)
    const afterHost = new InMemoryCanvasHost()
    afterHost.applyWithoutEcho(() => {
      for (const element of before) afterHost.upsert(element)
    })
    // A preview has no persistence side effects. The successful callback only
    // makes card-create operations visible in the projected host.
    applyLayout(afterHost, ops, undefined, () => ({ ok: true }))
    const after = cloneElements(afterHost.getElements())
    return {
      ops,
      errors: parseErrors,
      opCount: ops.length,
      errCount: parseErrors.length,
      diff: diffCanvasSnapshots(before, after),
    }
  }, [text, base])

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
      onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  // 打开时填充当前画布文本(v6:serializeCanvasReadable + CardService resolve,card 含 @title/@content)。
  // 同时清空诊断列表:刚序列化的文本恒为合法,无 parse 错误。
  // 也清空增量应用缓存:每次打开模态都是全新编辑会话。
  useEffect(() => {
    if (!open || !host) return
    const els = cloneElements(host.getElements())
    setBase({ elements: els, revision: revisionOf(els) })
    setText(initialText ?? serializeCanvasReadable(els, (id) => { const c = service.get(id as CardId); return c ? { title: c.title, content: c.body, type: c.type, tags: c.tags, links: c.links, codeSnippets: c.codeSnippets, quotes: c.quotes } : undefined }))
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
    setText(serializeCanvasReadable(elements, (id) => { const c = service.get(id as CardId); return c ? { title: c.title, content: c.body, type: c.type, tags: c.tags, links: c.links, codeSnippets: c.codeSnippets, quotes: c.quotes } : undefined }))
    setAppliedHashes(new Set())
    setStale(false)
  }

  const arrangeSelected = (direction: 'right-of' | 'below') => {
    const [anchor, target] = selectedCards
    if (!anchor || !target) return
    setText((current) => replaceOrAppendCardRelation(current, target.id, anchor.id, direction))
  }

  const apply = () => {
    if (!host) return
    const hostRevisionChanged = !base || revisionOf(host.getElements()) !== base.revision
    if (hostRevisionChanged || stale) {
      setStale(true)
      pushToast({ kind: 'info', message: t('agent.staleRevision') })
      return
    }
    const { ops, errors: parseErrors } = parseDslWithDiagnostics(text)

    if (ops.length === 0) {
      // 无可应用的指令。区分两种:全行无法解析 vs 输入为空。
      if (parseErrors.length > 0) {
        pushToast({ kind: 'error', message: t('canvas.dslAllInvalid', { n: String(parseErrors.length) }) })
      } else {
        pushToast({ kind: 'info', message: t('canvas.dslEmpty') })
      }
      return
    }

    const { applied, skipped, failed } = applyLayout(host, ops, appliedHashes, onCardCreate, onCardUpdate)
    // 合并新应用的 hash 到现有集合触发状态更新
    if (applied > 0) {
      const nextBase = cloneElements(host.getElements())
      setBase({ elements: nextBase, revision: revisionOf(nextBase) })
      setAppliedHashes(new Set())
      setStale(false)
      // T5:风险 op 存档 —— DSL apply 成功(applied > 0)后落档(b 类,fire-and-forget,
      // 不阻塞 UI;apply 是同步函数,用 .then() 链接 append)。
      void buildArchivePayload()
        .then((p) => archiveStore.append('dsl-apply', `DSL apply ${applied}${skipped + failed ? ` (skipped/failed ${skipped + failed})` : ''}`, p, VERSION))
        .catch((err) => console.warn('[archive] dsl-apply append failed', err))
    }
    // 重序列化:apply 后画布变了,文本同步,防重复 Apply 造副本(create 类 op 幂等失效)。
    // host 是同引用 + host.batch 原地变更,上面填充 text 的 useEffect([open,host,service])
    // 不会重跑,必须手动 setText。
    setText(serializeCanvasReadable(host.getElements(), (id) => { const c = service.get(id as CardId); return c ? { title: c.title, content: c.body, type: c.type, tags: c.tags, links: c.links, codeSnippets: c.codeSnippets, quotes: c.quotes } : undefined }))
    if (parseErrors.length > 0 || skipped > 0 || failed > 0) {
      // 有 parse 错误或 apply 跳过 → 用带 skipped 的诚实反馈(parse 错误数也在列表里展示)。
      pushToast({
        kind: 'info',
        message: t('canvas.dslAppliedSkipped', {
          applied: String(applied),
          skipped: String(skipped + failed + parseErrors.length),
        }),
      })
    } else if (applied > 0) {
      pushToast({ kind: 'success', message: t('canvas.dslApplied', { n: String(applied) }) })
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

  return (
    <Modal open={open} onClose={onClose} title={t('canvas.dslTitle')} closeLabel={t('common.close')}>
      <p className="dsl-lede">{t('canvas.dslLede')}</p>
      <div className="dsl-bridge" role="note">
        <span className="dsl-bridge__label">Canvas</span>
        <span aria-hidden="true">↔</span>
        <span className="dsl-bridge__label">Text DSL</span>
        <span className="dsl-bridge__hint">{t('canvas.dslBridgeHint')}</span>
      </div>
      <section className="dsl-guide" aria-labelledby="dsl-guide-title">
        <div>
          <p id="dsl-guide-title" className="dsl-guide__title">{t('canvas.dslGuideTitle')}</p>
          {selectedCards.length === 2 ? (
            <p className="dsl-guide__selection">
              {t('canvas.dslGuideSelection', {
                target: service.get(selectedCards[1]!.id as CardId)?.title || `#${selectedCards[1]!.id}`,
                anchor: service.get(selectedCards[0]!.id as CardId)?.title || `#${selectedCards[0]!.id}`,
              })}
            </p>
          ) : (
            <p className="dsl-guide__selection">{t('canvas.dslGuideHint')}</p>
          )}
        </div>
        <div className="dsl-guide__actions">
          <Button variant="ghost" onClick={() => arrangeSelected('right-of')} disabled={selectedCards.length !== 2}>
            {t('canvas.dslGuideRight')}
          </Button>
          <Button variant="ghost" onClick={() => arrangeSelected('below')} disabled={selectedCards.length !== 2}>
            {t('canvas.dslGuideBelow')}
          </Button>
        </div>
      </section>
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
        onChange={(e) => setText(e.target.value)}
        spellCheck={false}
        aria-label={t('canvas.dslTitle')}
      />
      {(liveStale || stale) && (
        <div className="dsl-preview dsl-preview--warn dsl-preview--stale" role="alert">
          <p>{t('canvas.dslPreviewStale')}</p>
          <Button variant="ghost" onClick={reloadFromCanvas}>{t('canvas.dslReload')}</Button>
        </div>
      )}
      {text.trim() !== '' && preview.opCount > 0 && preview.diff && preview.diff.added.length + preview.diff.removed.length + preview.diff.changed.length > 0 && (
        <div className="dsl-preview dsl-preview--ok" aria-live="polite">
          <p>{t('canvas.dslPreviewChanges', {
            added: String(preview.diff.added.length),
            removed: String(preview.diff.removed.length),
            changed: String(preview.diff.changed.length),
          })}</p>
          <ul className="dsl-preview__changes">
            {preview.diff.added.slice(0, 8).map((element) => (
              <li key={`added-${element.id}`} className="dsl-preview__added">+ {element.kind} #{element.id}</li>
            ))}
            {preview.diff.removed.slice(0, 8).map((element) => (
              <li key={`removed-${element.id}`} className="dsl-preview__removed">- {element.kind} #{element.id}</li>
            ))}
            {preview.diff.changed.slice(0, 8).map((change) => (
              <li key={`changed-${change.id}`} className="dsl-preview__changed">~ {change.after.kind} #{change.id} · {change.fields.join(', ')}</li>
            ))}
          </ul>
        </div>
      )}
      {text.trim() !== '' && preview.opCount > 0 && preview.diff && preview.diff.added.length + preview.diff.removed.length + preview.diff.changed.length === 0 && (
        <p className="dsl-preview dsl-preview--ok">{t('canvas.dslPreviewNoChanges')}</p>
      )}
      {text.trim() !== '' && preview.errCount > 0 && (
        <p className="dsl-preview dsl-preview--warn">
          {t('canvas.dslPreviewIssues', {
            ok: String(preview.opCount),
            bad: String(preview.errCount),
          })}
        </p>
      )}
      {preview.errors.length > 0 && (
        <div className="dsl-errors">
          <p className="dsl-errors__title">{t('canvas.dslErrorsTitle', { n: String(preview.errors.length) })}</p>
          <ul className="dsl-errors__list">
            {preview.errors.map((e, i) => (
              <li key={i} className="dsl-errors__item">
                <span className="dsl-errors__line">{t('canvas.dslErrorLine', { line: String(e.line) })}</span>
                <span className="dsl-errors__msg">{e.message}</span>
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
        <Button variant="ghost" onClick={onClose}>{t('common.cancel')}</Button>
        <Button variant="primary" onClick={apply} disabled={!host || liveStale || stale}>{t('canvas.dslApply')}</Button>
      </div>
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
.dsl-guide__title { margin: 0 0 var(--space-0.5); font-family: var(--font-display); font-size: var(--font-size-sm); }
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
}
.dsl-text:focus { border-color: var(--color-red); }
.dsl-preview { margin: 0 0 var(--space-2); padding: var(--space-1) var(--space-2); border-left: var(--space-quarter) solid var(--color-blue); font-family: var(--font-mono); font-size: var(--font-size-xs); }
.dsl-preview p { margin: 0; }
.dsl-preview ul { display: flex; flex-wrap: wrap; gap: var(--space-1) var(--space-3); margin: var(--space-1) 0 0; padding: 0; list-style: none; color: var(--color-gray); }
.dsl-preview__changes { display: grid !important; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: var(--space-1) var(--space-2) !important; }
.dsl-preview__changes li { overflow-wrap: anywhere; }
.dsl-preview__added { color: var(--color-blue); }
.dsl-preview__removed { color: var(--color-red); }
.dsl-preview__changed { color: var(--color-black-soft); }
.dsl-preview--ok { color: var(--color-gray); }
.dsl-preview--warn { color: var(--color-red); }
.dsl-preview--stale { display: flex; align-items: center; justify-content: space-between; gap: var(--space-2); }
.dsl-errors {
  margin-top: var(--space-2);
  padding: var(--space-2) var(--space-3);
  background: var(--color-red-soft);
  border-left: var(--space-1) solid var(--color-red);
  border-radius: var(--radius-sm);
}
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
.dsl-errors__msg { word-break: break-word; }
.dsl-actions { display: flex; flex-wrap: wrap; gap: var(--space-2); margin-top: var(--space-3); align-items: center; }
.dsl-spacer { flex: 1; min-width: 0; }
@media (max-width: 767px) {
  .dsl-bridge { align-items: flex-start; flex-wrap: wrap; }
  .dsl-bridge__hint { width: 100%; margin-left: 0; }
  .dsl-guide { align-items: stretch; flex-direction: column; }
  .dsl-guide__actions { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .dsl-example { min-height: 44px; }
  .dsl-preview--stale { align-items: stretch; flex-direction: column; }
  .dsl-text { min-height: 200px; }
}
`
