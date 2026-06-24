'use client'

/**
 * DslDialog — 画布转义(DSL 双向)模态编辑器(转义产品化 Step 2)。
 *
 * 把"画布的文字形态"直接暴露给用户:工具栏 DSL 按钮 → 弹模态,textarea
 * 显示当前画布文本(serializeCanvasReadable,card 行后附 `# title:` 注释),
 * 可编辑/粘贴,"应用/复制/下载"。应用走 parseDsl + applyLayout(单 undo 步)。
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
import { parseDsl } from '../ai/dsl-parser'
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

  // 打开时填充当前画布文本(serializeCanvasReadable,card 附 title 注释)。
  useEffect(() => {
    if (!open || !host) return
    const els = host.getElements()
    setText(serializeCanvasReadable(els, (id) => service.get(id as CardId)?.title))
  }, [open, host, service])

  const apply = () => {
    if (!host) return
    const ops = parseDsl(text)
    if (ops.length === 0) {
      pushToast({ kind: 'info', message: t('canvas.dslEmpty') })
      return
    }
    const { applied, skipped } = applyLayout(host, ops)
    // 重序列化:apply 后画布变了,文本同步,防重复 Apply 造副本(create 类 op 幂等失效)。
    // host 是同引用 + host.batch 原地变更,上面填充 text 的 useEffect([open,host,service])
    // 不会重跑,必须手动 setText。
    setText(serializeCanvasReadable(host.getElements(), (id) => service.get(id as CardId)?.title))
    if (skipped > 0) {
      pushToast({
        kind: 'info',
        message: t('canvas.dslAppliedSkipped', { applied: String(applied), skipped: String(skipped) }),
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
        <summary className="dsl-syntax__summary">{t('canvas.dslSyntaxTitle')}</summary>
        <p className="dsl-syntax__body">{t('canvas.dslSyntaxBody')}</p>
        <pre className="dsl-syntax__code">{`[card #id] @pos(x, y) @size(w, h) @color(blue|red|black|grey|yellow)
[rect #id] @pos(x, y) @size(w, h) @color(c)
[text #id] @pos(x, y) @text("...") @color(c)
[arrow #id] from #a to #b @label("...") @color(c) @dash(solid|dashed|dotted) @arrowhead(arrow|triangle|none)
[arrow #id] @pos(x, y) @size(w, h) @color(c)   # 自由箭头(无 from/to;w/h 可负表方向)`}</pre>
      </details>
      <textarea
        className="dsl-text"
        value={text}
        onChange={(e) => setText(e.target.value)}
        spellCheck={false}
        aria-label={t('canvas.dslTitle')}
      />
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
.dsl-syntax__summary {
  cursor: pointer; padding: var(--space-2);
  font-family: var(--font-mono); font-size: var(--font-size-xs);
  text-transform: uppercase; letter-spacing: 0.14em; color: var(--color-gray);
}
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
.dsl-actions { display: flex; gap: var(--space-2); margin-top: var(--space-3); align-items: center; }
.dsl-spacer { flex: 1; }
`
