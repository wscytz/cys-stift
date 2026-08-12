'use client'

/**
 * field-editors — Step 2 共享字段组件(edit + view)。
 *
 * FieldEditors 按 registry 渲染各字段的 Editor(两壳详情/工作台复用,消除 edit JSX
 * 重复);FieldViews 按 registry 渲染各字段的 View(详情弹窗 view 模式,消除 view
 * Section 手写)。两者对称:加新结构化字段只需 registry 一处注册 Editor + View,
 * edit/view 自动渲染,根治"两套、漏一边"(见 decisions/2026-08-07-structured-fields-registry.md)。
 * title/body/media/tags 壳特化(渲染位置 / 形态各壳定,不进 registry)。body 两壳统一用
 * MarkdownEditor(B-1,2026-08-08),仅因两壳渲染位置不同而暂留壳特化,不再有 textarea 之分。
 */
import type { ComponentType, ReactNode } from 'react'
import type { Card, MediaRef, UpdateCardPatch } from '@cys-stift/domain'
import type { CardDraftField, FieldEditorProps } from './use-card-draft'
import { CodeEditor, ListEditor, QuoteEditor, type DraftCode, type DraftLink, type DraftQuote } from './editors'
import { useI18n } from '@/lib/i18n'
import { safeHref, isSafeImageDataUrl, MAX_SAFE_MEDIA_BYTES } from '@/lib/safe-href'
import { mediaStore } from '@/lib/media-store'
import { pushToast } from '@/lib/toast-store'

/** 代码块字段编辑器(label + CodeEditor)。 */
export function CodesFieldEditor({ value, onChange }: FieldEditorProps<unknown>) {
  const { t } = useI18n()
  return (
    <div className="fe">
      <span className="fe__label">{t('card.detail.code')}</span>
      <CodeEditor items={value as DraftCode[]} onChange={(v) => onChange(v)} />
    </div>
  )
}

/** 引用字段编辑器(label + QuoteEditor)。 */
export function QuotesFieldEditor({ value, onChange }: FieldEditorProps<unknown>) {
  const { t } = useI18n()
  return (
    <div className="fe">
      <span className="fe__label">{t('card.detail.quotes')}</span>
      <QuoteEditor items={value as DraftQuote[]} onChange={(v) => onChange(v)} />
    </div>
  )
}

/** 链接字段编辑器(label + ListEditor)。壳传 DraftLink[](url 单字段);toPayload 时过滤空 + 补 fetchedAt。 */
export function LinksFieldEditor({ value, onChange }: FieldEditorProps<unknown>) {
  const { t } = useI18n()
  return (
    <div className="fe">
      <span className="fe__label">{t('card.detail.links')}</span>
      <ListEditor
        items={value as DraftLink[]}
        onChange={(v) => onChange(v)}
        make={() => ({ url: '' })}
        label={t('card.detail.linkLabel')}
        placeholder="https://…"
        fieldKey="url"
        reorderable // R13:链接可排序
      />
    </div>
  )
}

/**
 * 媒体字段编辑器(label + file input + 缩略图)。两壳共用(B-1 补工作台 media 缺口,
 * 详情弹窗从内联 JSX 抽到此共享组件)。
 *
 * attach 即写入 mediaStore(建 asset,立即持久);删除只 onChange 摘掉引用,**不**在此调
 * mediaStore.remove —— 真删时机由壳经 onRemoveAsset 决定(详情弹窗 defer 到 handleSave
 * 成功、工作台 defer 到 flush 成功):否则取消/保存失败时卡片引用已删而图还在(丢图),
 * 或保存失败留下悬挂引用。自包含样式(mfe-*),不依赖壳注入 CSS。
 */
export function MediaFieldEditor({
  value,
  onChange,
  onRemoveAsset,
}: {
  value: MediaRef[]
  onChange: (media: MediaRef[]) => void
  onRemoveAsset?: (id: MediaRef['assetId']) => void
}) {
  const { t } = useI18n()
  const handleFiles = async (files: FileList | null) => {
    if (!files) return
    for (const file of Array.from(files)) {
      try {
        const ref = await mediaStore.attach(file)
        onChange([...value, ref])
        // R16:大文件(>500KB 建议上限,但 <5MB 能存)attach 成功时提示占空间,
        // 否则用户 attach 一张 4MB 图毫无警告,下次保存失败才懵("存满了不知道")。
        if (file.size > mediaStore.SOFT_LIMIT_BYTES) {
          pushToast({ kind: 'info', message: t('card.mediaLargeWarning', { name: file.name, kb: String(Math.round(file.size / 1024)) }) })
        }
      } catch (err) {
        console.error('[MediaFieldEditor] attach failed', err)
        pushToast({ kind: 'error', message: t('card.mediaAttachFail', { name: file.name }) })
      }
    }
  }
  return (
    <div className="mfe">
      <style>{mfeStyles}</style>
      <span className="mfe__label">{t('card.detail.mediaFiles')}</span>
      <input
        type="file"
        accept="image/*"
        multiple
        onChange={(e) => {
          void handleFiles(e.target.files)
          e.target.value = ''
        }}
        className="mfe__file"
      />
      {value.length > 0 && (
        <ul className="mfe__list">
          {value.map((m, i) => {
            const asset = mediaStore.getAsset(m.assetId)
            if (!asset) return null
            return (
              <li key={String(m.assetId)} className="mfe__item">
                {asset.kind === 'image' &&
                  (asset.byteSize <= MAX_SAFE_MEDIA_BYTES && isSafeImageDataUrl(asset.dataUrl) ? (
                    <img
                      src={asset.dataUrl}
                      alt={t('card.detail.mediaAlt', { n: i + 1 })}
                      className="mfe__thumb"
                    />
                  ) : (
                    // 对齐只读态:非安全 data URL(SVG/超大)渲染文本 fallback,不进 <img>。
                    <span className="mfe__fallback">
                      {asset.mimeType} ({(asset.byteSize / 1024).toFixed(1)} KB)
                    </span>
                  ))}
                <button
                  type="button"
                  className="mfe__remove"
                  onClick={() => {
                    // 只摘引用 + 上报待删 id;真删交给壳(save/flush 成功后)。
                    onRemoveAsset?.(m.assetId)
                    onChange(value.filter((x) => x.assetId !== m.assetId))
                  }}
                  aria-label={t('card.detail.removeMediaAria')}
                >
                  ×
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}

/**
 * FieldEditors — 渲染 fields 中带 Editor 的字段(省略 Editor 的跳过,如 title/body 壳特化)。
 * 壳传 fields(子集或全集)+ draft + setField。.fe 通用样式(label + 控件),两壳一致。
 */
export function FieldEditors({
  fields,
  draft,
  setField,
}: {
  fields: CardDraftField<unknown>[]
  draft: Record<string, unknown>
  setField: (key: keyof UpdateCardPatch, value: unknown) => void
}) {
  return (
    <>
      <style>{feStyles}</style>
      {fields.map((f) => {
        const Editor = f.Editor as ComponentType<FieldEditorProps<unknown>> | undefined
        if (!Editor) return null
        return (
          <Editor
            key={f.key as string}
            value={draft[f.key as string]}
            onChange={(v) => setField(f.key, v)}
          />
        )
      })}
    </>
  )
}

// ── View side (read-only) ─────────────────────────────────────────────────

/** FieldSection — 只读字段区标题包裹(Views + card-detail 派生区 media/backlinks/
 *  recommend 共用)。cd__sec* 样式由消费壳(card-detail 的 <style>)注入;FieldViews
 *  只在详情 view 模式渲染,样式必在。 */
export function FieldSection({
  label,
  children,
}: {
  label: string
  children: ReactNode
}) {
  return (
    <section className="cd__sec">
      <h3 className="cd__sec-h">{label}</h3>
      <div className="cd__sec-body">{children}</div>
    </section>
  )
}

/** 链接字段只读态(cd__links:<a> 列表,safeHref 守 URL)。空数组不渲染。 */
export function LinksFieldView({ card }: { card: Card }) {
  const { t } = useI18n()
  const links = card.links ?? []
  if (links.length === 0) return null
  return (
    <FieldSection label={t('card.detail.links')}>
      <ul className="cd__links">
        {links.map((l, i) => (
          <li key={i}>
            <a href={safeHref(l.url)} target="_blank" rel="noopener noreferrer">
              {l.url}
            </a>
          </li>
        ))}
      </ul>
    </FieldSection>
  )
}

/** 代码字段只读态(cd__code:lang 头 + 黑底 mono pre)。空数组不渲染。 */
export function CodesFieldView({ card }: { card: Card }) {
  const { t } = useI18n()
  const codes = card.codeSnippets ?? []
  if (codes.length === 0) return null
  return (
    <FieldSection label={t('card.detail.code')}>
      {codes.map((c, i) => (
        <div key={i} className="cd__code">
          <div className="cd__code-lang">{c.language}</div>
          <pre className="cd__code-pre">
            <code>{c.code}</code>
          </pre>
        </div>
      ))}
    </FieldSection>
  )
}

/** 引用字段只读态(cd__quote:red 左边栏 blockquote + 可选 cite)。空数组不渲染。 */
export function QuotesFieldView({ card }: { card: Card }) {
  const { t } = useI18n()
  const quotes = card.quotes ?? []
  if (quotes.length === 0) return null
  return (
    <FieldSection label={t('card.detail.quotes')}>
      {quotes.map((q, i) => (
        <blockquote key={i} className="cd__quote">
          <p>{q.text}</p>
          {q.attribution && (
            <cite className="cd__cite">— {q.attribution}</cite>
          )}
        </blockquote>
      ))}
    </FieldSection>
  )
}

/**
 * FieldViews — view 模式按 registry 渲染各字段的 View(省略 View 的跳过:media 壳
 * 特化、title/body 不在只读态复现)。与 FieldEditors 对称,加新结构化字段注册 View
 * 一处即自动渲染,不再手写 Section(根治 view 侧"两套、漏一边")。
 */
export function FieldViews({
  fields,
  card,
}: {
  fields: CardDraftField<unknown>[]
  card: Card
}) {
  return (
    <>
      {fields.map((f) => {
        const View = f.View as ComponentType<{ card: Card }> | undefined
        if (!View) return null
        return <View key={f.key as string} card={card} />
      })}
    </>
  )
}

const feStyles = `
.fe { display: flex; flex-direction: column; gap: var(--space-2); }
.fe__label { font-family: var(--font-mono); font-size: var(--font-size-xs); text-transform: uppercase; letter-spacing: 0.12em; color: var(--color-black-soft); }
`

const mfeStyles = `
.mfe { display: flex; flex-direction: column; gap: var(--space-2); }
.mfe__label { font-family: var(--font-mono); font-size: var(--font-size-xs); text-transform: uppercase; letter-spacing: 0.12em; color: var(--color-black-soft); }
.mfe__file { font-family: var(--font-mono); font-size: var(--font-size-sm); margin-top: var(--space-1); }
.mfe__list { list-style: none; margin: 0; padding: 0; display: flex; flex-wrap: wrap; gap: var(--space-2); }
.mfe__item { position: relative; display: inline-flex; }
.mfe__thumb { width: 96px; height: 96px; object-fit: cover; border: var(--border-hairline); display: block; }
.mfe__fallback { font-family: var(--font-mono); font-size: var(--font-size-xs); color: var(--color-black-soft); border: var(--border-hairline); padding: var(--space-1); }
.mfe__remove { position: absolute; top: 0; right: 0; background: var(--color-white); border: var(--border-hairline); min-width: 44px; min-height: 44px; cursor: pointer; font-family: var(--font-mono); font-size: var(--font-size-sm); line-height: 1; }
.mfe__remove:hover { background: var(--color-red); color: var(--color-white); }
`
