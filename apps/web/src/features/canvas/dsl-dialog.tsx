'use client'

/**
 * DslDialog — 画布转义(DSL 双向)模态编辑器(转义产品化 Step 2)。
 *
 * 把"画布的文字形态"直接暴露给用户:工具栏 DSL 按钮 → 弹模态,textarea
 * 显示当前画布文本(serializeCanvasReadable,card 行后附 `# title:` 注释),
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
import type { CanvasHost } from '@cys-stift/canvas-engine'
import { useI18n } from '@/lib/i18n'
import { downloadFile } from '@/lib/download'
import { pushToast } from '@/lib/toast-store'
import { serializeCanvasReadable, serializeCanvas } from '../ai/canvas-dsl'
import { parseDslWithDiagnostics, type DslDiagnostic } from '../ai/dsl-parser'
import { buildCanvasPrompt } from '../ai/canvas-prompt'
import { DSL_GRAMMAR_REFERENCE } from '../ai/dsl-grammar'
import { applyLayout } from './apply-layout'
import { archiveStore } from '@/lib/archive-store'
import { buildArchivePayload } from '@/lib/build-archive-payload'
import { VERSION } from '@/lib/version'

export function DslDialog({
  open,
  onClose,
  host,
  service,
  canvasName,
  onCardCreate,
}: {
  open: boolean
  onClose: () => void
  host: CanvasHost | null
  service: CardService
  canvasName: string
  onCardCreate?: (p: { cardId: string; x: number; y: number; w: number; h: number; color?: string }) => void
}) {
  const { t } = useI18n()
  const [text, setText] = useState('')
  const [errors, setErrors] = useState<DslDiagnostic[]>([])
  const [appliedHashes, setAppliedHashes] = useState<Set<string>>(new Set())

  // 实时预览:用户输入时即重新 parse,给出"待应用 N 条 / M 行无效"计数,
  // 不必等点 Apply。只在有可说之事时渲染(ok 或 warn),其余不渲染。
  const preview = useMemo(() => {
    const { ops, errors: parseErrors } = parseDslWithDiagnostics(text)
    return { opCount: ops.length, errCount: parseErrors.length }
  }, [text])

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

  // 打开时填充当前画布文本(serializeCanvasReadable,card 附 title 注释)。
  // 同时清空诊断列表:刚序列化的文本恒为合法,无 parse 错误。
  // 也清空增量应用缓存:每次打开模态都是全新编辑会话。
  useEffect(() => {
    if (!open || !host) return
    const els = host.getElements()
    setText(serializeCanvasReadable(els, (id) => service.get(id as CardId)?.title))
    setErrors([])
    setAppliedHashes(new Set())
  }, [open, host, service])

  const apply = () => {
    if (!host) return
    const { ops, errors: parseErrors } = parseDslWithDiagnostics(text)
    setErrors(parseErrors)

    if (ops.length === 0) {
      // 无可应用的指令。区分两种:全行无法解析 vs 输入为空。
      if (parseErrors.length > 0) {
        pushToast({ kind: 'error', message: t('canvas.dslAllInvalid', { n: String(parseErrors.length) }) })
      } else {
        pushToast({ kind: 'info', message: t('canvas.dslEmpty') })
      }
      return
    }

    const { applied, skipped } = applyLayout(host, ops, appliedHashes, onCardCreate)
    // 合并新应用的 hash 到现有集合触发状态更新
    if (applied > 0) {
      setAppliedHashes(new Set(appliedHashes))
      // T5:风险 op 存档 —— DSL apply 成功(applied > 0)后落档(b 类,fire-and-forget,
      // 不阻塞 UI;apply 是同步函数,用 .then() 链接 append)。
      void buildArchivePayload()
        .then((p) => archiveStore.append('dsl-apply', `DSL apply ${applied}${skipped ? ` (skipped ${skipped})` : ''}`, p, VERSION))
        .catch((err) => console.warn('[archive] dsl-apply append failed', err))
    }
    // 重序列化:apply 后画布变了,文本同步,防重复 Apply 造副本(create 类 op 幂等失效)。
    // host 是同引用 + host.batch 原地变更,上面填充 text 的 useEffect([open,host,service])
    // 不会重跑,必须手动 setText。
    setText(serializeCanvasReadable(host.getElements(), (id) => service.get(id as CardId)?.title))
    if (parseErrors.length > 0 || skipped > 0) {
      // 有 parse 错误或 apply 跳过 → 用带 skipped 的诚实反馈(parse 错误数也在列表里展示)。
      pushToast({
        kind: 'info',
        message: t('canvas.dslAppliedSkipped', {
          applied: String(applied),
          skipped: String(skipped + parseErrors.length),
        }),
      })
    } else {
      pushToast({ kind: 'success', message: t('canvas.dslApplied', { n: String(applied) }) })
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
      {text.trim() !== '' && preview.opCount > 0 && preview.errCount === 0 && (
        <p className="dsl-preview dsl-preview--ok">
          {t('canvas.dslPreviewOk', { n: String(preview.opCount) })}
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
      {errors.length > 0 && (
        <div className="dsl-errors">
          <p className="dsl-errors__title">{t('canvas.dslErrorsTitle', { n: String(errors.length) })}</p>
          <ul className="dsl-errors__list">
            {errors.map((e, i) => (
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
        <Button variant="primary" onClick={apply} disabled={!host}>{t('canvas.dslApply')}</Button>
      </div>
      <style>{styles}</style>
    </Modal>
  )
}

const styles = `
.dsl-lede { margin: 0 0 var(--space-3); font-family: var(--font-body); font-size: var(--font-size-sm); color: var(--color-black-soft); line-height: 1.5; }
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
.dsl-preview { margin: 0 0 var(--space-2); font-family: var(--font-mono); font-size: var(--font-size-xs); }
.dsl-preview--ok { color: var(--color-gray); }
.dsl-preview--warn { color: var(--color-red); }
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
`
