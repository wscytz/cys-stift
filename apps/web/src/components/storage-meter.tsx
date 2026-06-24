'use client'

/**
 * StorageMeter — settings-page widget showing how much of the browser's
 * localStorage quota is consumed by cys-stift data. v0.26.3.
 *
 * Layout: a Bauhaus bar (black hairline border, hard offset shadow, fill
 * gradient grey → yellow → red as you approach the 80% warning threshold)
 * above a small breakdown line and a collapsible per-key detail list.
 *
 * Data is read via useStorageUsage() (lib/storage-usage) which polls every
 * 5s so the bar reacts to cards, snapshots, and media landing.
 */
import { useState } from 'react'
import { useI18n } from '@/lib/i18n'
import { useStorageUsage, type StorageWarning } from '@/lib/storage-usage'

const MB = 1024 * 1024

function formatBytes(b: number): string {
  if (b >= MB) return `${(b / MB).toFixed(1)} MB`
  if (b >= 1024) return `${(b / 1024).toFixed(1)} KB`
  return `${b} B`
}

const WARNING_BG: Record<NonNullable<StorageWarning>, string> = {
  warn: 'var(--color-yellow)',
  critical: 'var(--color-red)',
}

export function StorageMeter() {
  const { t } = useI18n()
  const usage = useStorageUsage()
  const [expanded, setExpanded] = useState(false)
  const fillColor =
    usage.warning === 'critical'
      ? 'var(--color-red)'
      : usage.warning === 'warn'
        ? 'var(--color-yellow)'
        : 'var(--color-black)'

  return (
    <section className="sm" aria-label={t('storage.title')}>
      <h2 className="sm__h">{t('storage.title')}</h2>
      <p className="sm__line">
        {t('storage.usedOf', { used: formatBytes(usage.used), total: formatBytes(usage.total) })}
        <span className="sm__pct"> · {usage.percent}%</span>
      </p>
      <div
        className="sm__bar"
        role="progressbar"
        aria-valuenow={usage.percent}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <div className="sm__fill" style={{ width: `${usage.percent}%`, background: fillColor }} />
      </div>
      {usage.warning && (
        <p
          className="sm__warn"
          style={{ background: WARNING_BG[usage.warning] }}
          role="alert"
        >
          {t('storage.warning')}
        </p>
      )}
      <button
        type="button"
        className="mono-label"
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
      >
        {t('storage.detailToggle')}
        <span aria-hidden="true">{expanded ? ' ▴' : ' ▾'}</span>
      </button>
      {expanded && (
        <ul className="sm__list">
          {usage.byKey.map((row) => (
            <li key={row.key} className="sm__row">
              <span className="sm__cat">{t(`storage.category.${row.category}` as never)}</span>
              <code className="sm__key">{row.key}</code>
              <span className="sm__bytes">{formatBytes(row.bytes)}</span>
            </li>
          ))}
        </ul>
      )}
      <style>{styles}</style>
    </section>
  )
}

const styles = `
.sm {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  padding: var(--space-3);
  background: var(--color-white);
  border: var(--border-hairline);
  border-radius: var(--radius-sm);
  box-shadow: var(--shadow-sm);
}
.sm__h {
  margin: 0;
  font-family: var(--font-display);
  font-size: var(--font-size-lg);
  font-weight: 500;
  letter-spacing: -0.01em;
}
.sm__line {
  margin: 0;
  font-family: var(--font-mono);
  font-size: var(--font-size-sm);
  color: var(--color-black-soft);
}
.sm__pct { font-weight: 700; }
.sm__bar {
  position: relative;
  height: 14px;
  background: var(--color-gray-soft);
  border: var(--border-hairline);
  border-radius: var(--radius-sm);
  overflow: hidden;
}
.sm__fill {
  height: 100%;
  transition: width 200ms ease-out, background 200ms ease-out;
}
.sm__warn {
  margin: 0;
  padding: var(--space-2);
  font-family: var(--font-mono);
  font-size: var(--font-size-sm);
  color: var(--color-white);
  border-radius: var(--radius-sm);
}
.sm__list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
  font-family: var(--font-mono);
  font-size: var(--font-size-xs);
}
.sm__row {
  display: grid;
  grid-template-columns: 100px 1fr 80px;
  gap: var(--space-2);
  padding: var(--space-1) 0;
  border-bottom: 1px solid var(--color-gray-soft);
}
.sm__row:last-child { border-bottom: 0; }
.sm__cat { text-transform: uppercase; letter-spacing: 0.08em; color: var(--color-gray); }
.sm__key { word-break: break-all; color: var(--color-black-soft); }
.sm__bytes { text-align: right; color: var(--color-black); }
`