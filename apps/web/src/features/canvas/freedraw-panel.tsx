'use client'

/**
 * FreedrawPanel(2026-06-23)— 选中单个手绘时浮出的辅助面板。
 *
 * 手绘语义识别是**辅助**,不是精确判断(见 freedraw-classify.ts)。面板:
 *  - 用本地几何启发式(classifyFreedraw,零外发——手绘点序列是 R2 隐私)给出
 *    「看起来像:箭头 / 装饰 / 说不准」+ 置信度百分比,措辞刻意保守(「看起来像」)。
 *  - 装饰类给【复制】按钮(duplicateFreedraw + host.upsert,偏移 24px 盖一份)——
 *    正是「画一次,到处盖」的装饰复用。任何手绘都能复制(不止装饰),只是装饰最常用。
 *
 * 非破坏性:不自动改 / 不自动转箭头,只提示 + 让用户点。仿 RelationPanel:选中单个
 * freedraw 才显示,host 事件驱动重渲染,位置由 bbox→屏幕坐标算。
 */
import { useEffect, useState } from 'react'
import { useI18n } from '@/lib/i18n'
import {
  classifyFreedraw,
  duplicateFreedraw,
  freedrawPoints,
  freedrawToArrow,
  type FreedrawKind,
} from '@cys-stift/canvas-engine'
import type { CanvasHost, CanvasElement } from '@cys-stift/canvas-engine'

const DUP_OFFSET = 24
/** 判为 arrow 且置信度 ≥ 此阈值,才提供「转为箭头」(保守:低置信不打扰)。 */
const TO_ARROW_CONFIDENCE = 0.6

function shortId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID().slice(0, 8)
  return Math.random().toString(36).slice(2, 10)
}

export function FreedrawPanel({
  host,
  canvasEl,
}: {
  host: CanvasHost | null
  canvasEl: HTMLCanvasElement | null
}) {
  const { t } = useI18n()
  const [, force] = useState(0)
  useEffect(() => {
    if (!host) return
    const bump = () => force((n) => n + 1)
    const unsubs = [
      host.onSelectionChange(bump),
      host.onViewChange(bump),
      host.onUserChange(bump),
    ]
    return () => unsubs.forEach((u) => u())
  }, [host])

  if (!host) return null
  const sel = host.getSelectedIds()
  if (sel.length !== 1) return null
  const el = host.getElement(sel[0]!)
  if (!el || el.kind !== 'freedraw') return null

  const points = freedrawPoints(el)
  if (!points) return null
  const { kind, confidence } = classifyFreedraw(points)

  const position = computePanelPosition(el, host, canvasEl)
  const panelStyle = position
    ? {
        position: 'fixed' as const,
        left: `${position.left}px`,
        top: `${position.top}px`,
        transform: 'translateX(-50%)',
      }
    : { display: 'none' as const }

  const duplicate = () => {
    const dup = duplicateFreedraw(el, `freedraw-${shortId()}`, DUP_OFFSET, DUP_OFFSET)
    if (!dup) return
    host.upsert(dup)
    host.setSelectedIds([dup.id]) // 选中新副本,可连点连复制
  }

  // ③ 特殊互动:本地猜是箭头且够自信 → 一键转真 arrow(替换手绘,单步可 undo)。
  const canToArrow = kind === 'arrow' && confidence >= TO_ARROW_CONFIDENCE
  const toArrow = () => {
    const arrow = freedrawToArrow(el, `arrow-${shortId()}`)
    if (!arrow) return
    host.batch(() => {
      host.remove(el.id)
      host.upsert(arrow)
    })
    host.setSelectedIds([arrow.id])
  }

  return (
    <div
      className="cv-freedraw"
      role="group"
      aria-label={t('freedraw.title')}
      style={panelStyle}
    >
      <span className="cv-freedraw__eyebrow" aria-hidden="true">
        {t('freedraw.title')}
      </span>
      <span className="cv-freedraw__sep" aria-hidden="true" />
      <span className="cv-freedraw__guess">
        {t(guessKey(kind))}
        <span className="cv-freedraw__conf">{Math.round(confidence * 100)}%</span>
      </span>
      {canToArrow && (
        <button
          type="button"
          className="cv-freedraw__btn"
          onClick={toArrow}
          title={t('freedraw.toArrow')}
        >
          {t('freedraw.toArrow')}
        </button>
      )}
      <button
        type="button"
        className="cv-freedraw__btn"
        onClick={duplicate}
        title={t('freedraw.duplicate')}
      >
        {t('freedraw.duplicate')}
      </button>
      <style>{styles}</style>
    </div>
  )
}

function guessKey(kind: FreedrawKind): 'freedraw.looksArrow' | 'freedraw.looksDecoration' | 'freedraw.looksUnknown' {
  if (kind === 'arrow') return 'freedraw.looksArrow'
  if (kind === 'decoration') return 'freedraw.looksDecoration'
  return 'freedraw.looksUnknown'
}

/** 面板位置:手绘 bbox 顶边中点 → 屏幕坐标(canvas rect + host view)。 */
function computePanelPosition(
  el: CanvasElement,
  host: CanvasHost,
  canvasEl: HTMLCanvasElement | null,
): { left: number; top: number } | null {
  if (!canvasEl) return null
  const view = host.getView()
  const rect = canvasEl.getBoundingClientRect()
  const cx = el.x + el.w / 2
  const cy = el.y
  const screenX = rect.left + view.panX + cx * view.zoom
  const screenY = rect.top + view.panY + cy * view.zoom
  return { left: screenX, top: screenY - 56 }
}

const styles = `
.cv-freedraw {
  z-index: 25;
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 6px 8px;
  background: var(--color-white);
  border: 2px solid var(--color-black);
  border-radius: 2px;
  box-shadow: 4px 4px 0 0 var(--color-black);
  font-family: var(--font-mono);
  white-space: nowrap;
}
.cv-freedraw__eyebrow {
  padding: 0 var(--space-2);
  font-size: var(--font-size-xs);
  letter-spacing: 0.16em;
  text-transform: uppercase;
  color: var(--color-gray);
}
.cv-freedraw__sep {
  width: 1px;
  height: 18px;
  background: var(--color-gray-soft);
  margin: 0 2px;
}
.cv-freedraw__guess {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 0 var(--space-2);
  font-size: var(--font-size-xs);
  letter-spacing: 0.08em;
  color: var(--color-black);
}
.cv-freedraw__conf {
  color: var(--color-gray);
  font-size: var(--font-size-xs);
}
.cv-freedraw__btn {
  height: 30px;
  padding: 0 var(--space-3);
  display: inline-flex;
  align-items: center;
  background: transparent;
  border: 1px solid var(--color-black);
  border-radius: 2px;
  color: var(--color-black);
  font-family: var(--font-mono);
  font-size: var(--font-size-xs);
  letter-spacing: 0.12em;
  text-transform: uppercase;
  cursor: pointer;
  transition: background 80ms ease-out, color 80ms ease-out;
}
.cv-freedraw__btn:hover {
  background: var(--color-black);
  color: var(--color-white);
}
.cv-freedraw__btn:focus-visible {
  outline: 2px solid var(--color-red);
  outline-offset: 2px;
}
`
