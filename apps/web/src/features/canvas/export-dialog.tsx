'use client'

/**
 * P5.5 — ExportDialog. Bauhaus-styled canvas export with the `.cystift`
 * roundtrip front-and-centre (the distinctive feature: the exported image
 * carries the full canvas — drag it back to restore).
 *
 * Options (drawio P5-1 vocabulary, modelled on its export dialog):
 *   format  SVG / PNG / JPEG
 *   scope   whole canvas / selection
 *   scale   1× / 2× / 3×  (raster only — applied as bitmap pixelRatio)
 *   border  symmetric px padding around content
 *   background  opaque / transparent (PNG only)
 *
 * SVG + PNG always carry the .cystift payload; JPEG does not (no clean
 * metadata channel we use). The black info card explains this so users know
 * to drop the file back onto the app to restore.
 */
import { useState } from 'react'
import { Modal, Button } from '@cys-stift/ui'
import type { CanvasId, CardService } from '@cys-stift/domain'
import { useI18n } from '@/lib/i18n'
import type { MessageKey } from '@/lib/i18n/messages'
import { pushToast } from '@/lib/toast-store'
import {
  exportCanvasSvg,
  downloadSvg,
} from './export-svg'
import {
  exportCanvasImage,
  downloadImage,
  type RasterFormat,
} from './export-raster'
import type { ExportScope } from './export-bounds'
import type { CanvasHost } from '@cys-stift/canvas-engine'

type Format = 'svg' | RasterFormat

export function ExportDialog({
  open,
  onClose,
  host,
  service,
  canvasId,
  canvasName,
}: {
  open: boolean
  onClose: () => void
  host: CanvasHost | null
  service: CardService
  canvasId: CanvasId
  canvasName: string
}) {
  const { t } = useI18n()
  const [format, setFormat] = useState<Format>('png')
  const [scope, setScope] = useState<ExportScope>('diagram')
  const [scale, setScale] = useState(2)
  const [border, setBorder] = useState(16)
  const [opaque, setOpaque] = useState(true)
  const [busy, setBusy] = useState(false)

  // Reactive selection count — disable the "selection" scope when empty.
  // (host.getSelectedIds 是命令式读;open 时每次 render 取当前值即可——
  //  dialog 打开期间用户不交互画布选择,值稳定。)
  const selectedCount = host?.getSelectedIds().length ?? 0
  const scopeIsSelection = scope === 'selection'
  const selectionDisabled = selectedCount === 0

  const doExport = async () => {
    if (!host || busy) return
    setBusy(true)
    try {
      const effectiveScope: ExportScope =
        scopeIsSelection && selectionDisabled ? 'diagram' : scope
      const baseName = canvasName || 'canvas'
      if (format === 'svg') {
        const result = await exportCanvasSvg(host, service, canvasId, canvasName, {
          scope: effectiveScope,
          scale: 1,
          border,
          background: opaque,
        })
        if (!result) {
          pushToast({ kind: 'error', message: t('canvas.exportEmpty') })
          return
        }
        downloadSvg(result.svg, baseName)
      } else {
        const blob = await exportCanvasImage(host, service, canvasId, canvasName, {
          scope: effectiveScope,
          scale,
          border,
          background: opaque,
          format,
        })
        if (!blob) {
          pushToast({ kind: 'error', message: t('canvas.exportEmpty') })
          return
        }
        downloadImage(blob, baseName, format)
      }
      pushToast({ kind: 'success', message: t('canvas.exportDone', { name: baseName }) })
      onClose()
    } catch (e) {
      pushToast({
        kind: 'error',
        message: t('canvas.exportFail', { error: e instanceof Error ? e.message : String(e) }),
      })
    } finally {
      setBusy(false)
    }
  }

  const transparentAvailable = format !== 'jpeg'

  return (
    <Modal open={open} onClose={onClose} title={t('canvas.exportTitle')}>
      <p className="exp-lede">{t('canvas.exportLede')}</p>

      {/* Format */}
      <Field label={t('canvas.exportFormat')}>
        <Segmented
          value={format}
          onChange={(v) => setFormat(v as Format)}
          options={[
            { value: 'svg', label: t('canvas.exportFormatSvg') },
            { value: 'png', label: t('canvas.exportFormatPng') },
            { value: 'jpeg', label: t('canvas.exportFormatJpeg') },
          ]}
        />
      </Field>

      {/* Scope */}
      <Field label={t('canvas.exportScope')}>
        <Segmented
          value={scopeIsSelection && selectionDisabled ? 'diagram' : scope}
          onChange={(v) => setScope(v as ExportScope)}
          options={[
            { value: 'diagram', label: t('canvas.exportScopeDiagram') },
            {
              value: 'selection',
              label: t('canvas.exportScopeSelection'),
              disabled: selectionDisabled,
            },
          ]}
        />
      </Field>

      {/* Scale (raster only) */}
      {format !== 'svg' && (
        <Field label={t('canvas.exportScale')}>
          <Segmented
            value={String(scale)}
            onChange={(v) => setScale(Number(v))}
            options={[
              { value: '1', label: t('canvas.exportScale1x') },
              { value: '2', label: t('canvas.exportScale2x') },
              { value: '3', label: t('canvas.exportScale3x') },
            ]}
          />
        </Field>
      )}

      {/* Background (transparent only meaningful for PNG) */}
      {transparentAvailable && (
        <Field label={t('canvas.exportBackground')}>
          <Segmented
            value={opaque ? 'opaque' : 'transparent'}
            onChange={(v) => setOpaque(v === 'opaque')}
            options={[
              { value: 'opaque', label: t('canvas.exportOpaque') },
              { value: 'transparent', label: t('canvas.exportTransparent') },
            ]}
          />
        </Field>
      )}

      {/* Border */}
      <Field label={t('canvas.exportBorder')}>
        <input
          className="exp-number"
          type="number"
          min={0}
          max={128}
          value={border}
          onChange={(e) =>
            setBorder(Math.max(0, Math.min(128, Number(e.target.value) || 0)))
          }
        />
      </Field>

      {/* .cystift roundtrip callout — the headline feature */}
      {format !== 'jpeg' && (
        <div className="exp-cystift" role="note">
          <div className="exp-cystift__badge">{t('canvas.exportCystiftBadge')}</div>
          <div className="exp-cystift__hint">{t('canvas.exportCystiftHint')}</div>
        </div>
      )}

      <div className="exp-actions">
        <Button variant="ghost" onClick={onClose} disabled={busy}>
          {t('common.cancel')}
        </Button>
        <Button
          variant="primary"
          onClick={doExport}
          disabled={!host || busy}
        >
          {busy ? '…' : t('canvas.exportDo')}
        </Button>
      </div>

      <style>{styles}</style>
    </Modal>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="exp-field">
      <span className="mono-label mono-label--wide">{label}</span>
      <div className="exp-field__control">{children}</div>
    </div>
  )
}

function Segmented<T extends string>({
  value,
  onChange,
  options,
}: {
  value: T
  onChange: (v: T) => void
  options: { value: T; label: string; disabled?: boolean; key?: MessageKey }[]
}) {
  return (
    <div className="exp-seg" role="radiogroup">
      {options.map((o) => {
        const active = o.value === value
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={active}
            className={`exp-seg__btn ${active ? 'exp-seg__btn--active' : ''}`}
            disabled={o.disabled}
            onClick={() => onChange(o.value)}
          >
            {o.label}
          </button>
        )
      })}
    </div>
  )
}

const styles = `
.exp-lede { margin: 0 0 var(--space-3); font-family: var(--font-body); font-size: var(--font-size-sm); color: var(--color-black-soft); line-height: 1.5; }
.exp-field { display: flex; align-items: center; justify-content: space-between; gap: var(--space-3); margin-bottom: var(--space-2); }
.exp-field__control { display: flex; align-items: center; }
.exp-number {
  width: 88px; height: 32px; padding: 0 var(--space-2);
  background: var(--color-white); color: var(--color-black);
  font-family: var(--font-mono); font-size: var(--font-size-sm);
  border: var(--border-hairline); border-radius: var(--radius-sm); outline: none;
  text-align: right;
}
.exp-number:focus { border-color: var(--color-red); }

.exp-seg { display: inline-flex; border: var(--border-hairline); border-radius: var(--radius-sm); overflow: hidden; }
.exp-seg__btn {
  min-width: 44px; height: 32px; padding: 0 var(--space-2);
  background: var(--color-white); color: var(--color-black);
  font-family: var(--font-mono); font-size: var(--font-size-xs);
  letter-spacing: 0.1em; text-transform: uppercase;
  border: 0; border-right: var(--border-hairline); cursor: pointer;
  transition: background 80ms ease-out, color 80ms ease-out;
}
.exp-seg__btn:last-child { border-right: 0; }
.exp-seg__btn:hover:not(:disabled):not(.exp-seg__btn--active) { background: var(--color-gray-soft); }
.exp-seg__btn--active { background: var(--color-black); color: var(--color-white); }
.exp-seg__btn:disabled { opacity: 0.35; cursor: not-allowed; }
.exp-seg__btn:focus-visible { outline: 2px solid var(--color-red); outline-offset: -2px; }

/* .cystift roundtrip callout — inverted Bauhaus block, the feature highlight. */
.exp-cystift {
  margin: var(--space-3) 0;
  padding: var(--space-3);
  background: var(--color-black);
  color: var(--color-white);
  border-radius: var(--radius-sm);
  box-shadow: 4px 4px 0 0 var(--color-red);
}
.exp-cystift__badge {
  font-family: var(--font-mono); font-size: var(--font-size-xs);
  text-transform: uppercase; letter-spacing: 0.16em;
  color: var(--color-yellow);
  margin-bottom: var(--space-1);
}
.exp-cystift__hint {
  font-family: var(--font-body); font-size: var(--font-size-sm);
  line-height: 1.5; color: var(--color-white);
  opacity: 0.85;
}

.exp-actions { display: flex; gap: var(--space-2); justify-content: flex-end; margin-top: var(--space-3); }
`
