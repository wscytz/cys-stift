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
import { useEffect, useState } from 'react'
import { Modal, Button } from '@cys-stift/ui'
import type { CardId, CardService } from '@cys-stift/domain'
import type { CanvasHost } from '@cys-stift/canvas-engine'
import { useI18n } from '@/lib/i18n'
import { pushToast } from '@/lib/toast-store'
import { serializeCanvasReadable } from '../ai/canvas-dsl'
import { parseDslWithDiagnostics, type DslDiagnostic } from '../ai/dsl-parser'
import { applyLayout } from './apply-layout'

export function DslDialog({
  open,
  onClose,
  host,
  service,
  canvasName,
}: {
  open: boolean
  onClose: () => void
  host: CanvasHost | null
  service: CardService
  canvasName: string
}) {
  const { t } = useI18n()
  const [text, setText] = useState('')
  const [errors, setErrors] = useState<DslDiagnostic[]>([])

  // 打开时填充当前画布文本(serializeCanvasReadable,card 附 title 注释)。
  // 同时清空诊断列表:刚序列化的文本恒为合法,无 parse 错误。
  useEffect(() => {
    if (!open || !host) return
    const els = host.getElements()
    setText(serializeCanvasReadable(els, (id) => service.get(id as CardId)?.title))
    setErrors([])
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

    const { applied, skipped } = applyLayout(host, ops)
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

  const download = () => {
    const baseName = canvasName || 'canvas'
    const blob = new Blob([text], { type: 'text/plain;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${baseName}.txt`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }

  return (
    <Modal open={open} onClose={onClose} title={t('canvas.dslTitle')}>
      <p className="dsl-lede">{t('canvas.dslLede')}</p>
      <details className="dsl-syntax">
        <summary className="mono-label mono-label--wide">{t('canvas.dslSyntaxTitle')}</summary>
        <p className="dsl-syntax__body">{t('canvas.dslSyntaxBody')}</p>
        <pre className="dsl-syntax__code">{`[card #id] @pos(x, y) @size(w, h) @color(blue|red|black|grey|yellow)
[rect #id] @pos(x, y) @size(w, h) @color(c)
[text #id] @pos(x, y) @text("...") @color(c)
[arrow #id] from #a to #b @label("...") @color(c) @dash(solid|dashed|dotted) @arrowhead(arrow|triangle|none)
[arrow #id] @pos(x, y) @size(w, h) @color(c)   # ${t('canvas.dslSyntaxFreeArrow')}`}</pre>
      </details>
      <textarea
        className="dsl-text"
        value={text}
        onChange={(e) => setText(e.target.value)}
        spellCheck={false}
        aria-label={t('canvas.dslTitle')}
      />
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
  background: var(--color-black); color: var(--color-white);
  font-family: var(--font-mono); font-size: var(--font-size-xs);
  border-radius: var(--radius-sm); line-height: 1.6; overflow-x: auto;
}
.dsl-text {
  width: 100%; min-height: 320px; box-sizing: border-box;
  padding: var(--space-2);
  background: var(--color-white); color: var(--color-black);
  font-family: var(--font-mono); font-size: var(--font-size-sm);
  border: var(--border-hairline); border-radius: var(--radius-sm); outline: none;
  resize: vertical; line-height: 1.5;
}
.dsl-text:focus { border-color: var(--color-red); }
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
.dsl-actions { display: flex; gap: var(--space-2); margin-top: var(--space-3); align-items: center; }
.dsl-spacer { flex: 1; }
`
