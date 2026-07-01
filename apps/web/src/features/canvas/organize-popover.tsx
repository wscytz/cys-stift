'use client'

/**
 * 整理范式(Batch 6)— 顶栏「整理」按钮的 popover。
 *
 * 三控件:
 * - 策略(strategy):思维导图 / 流程图 / 网格 / 紧凑 — 4 toggle 按钮。
 * - 方向(direction):TB / LR / BT / RL — 4 小按钮(箭头符号 + 文字)。
 * - 间距(gap):range 20–120,默认 60,带数字读数。
 *
 * 应用按钮:用当前三控件值调 computeAutoLayout,选中≥2 卡布局选中,否则全画布。
 * 应用后关闭 popover(干净,符合导出菜单 close-on-apply 模式)。
 *
 * 视觉:复用 cv-rail__menu 的包豪斯 chrome(2px 黑边 + 4px 硬阴影 + 黄色 active),
 * 但作为顶栏 popover 由调用方传入 fixed 定位(portal 到 body,逃离 toolbar overflow)。
 * popover 专属类名 cv-organize__(panel|section|label|grid|seg|range|apply)见 page.tsx styles。
 */

import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { useI18n } from '@/lib/i18n'
import { computeAutoLayout } from './auto-layout'
import type { OrganizeStrategy, OrganizeDirection } from './auto-layout'
import type { CanvasHost, CanvasElement } from '@cys-stift/canvas-engine'

interface Props {
  /** popover 在 body 的 fixed 定位(调用方测 trigger rect 算出)。null 时隐藏等测。 */
  pos: { left: number; top: number } | null
  /** 顶栏 adapter(画布 host)。 */
  host: CanvasHost | null
  /** 应用后调 fit 让用户看到全貌(page.tsx 传入)。 */
  onFit: () => void
  /** 关闭(popover 外点 / 应用后 / Esc)。 */
  onClose: () => void
  /** toast 推送(无卡 / 成功提示)。 */
  toast: (t: { kind: 'info' | 'success'; message: string }) => void
}

const STRATEGIES: OrganizeStrategy[] = ['mindmap', 'flow', 'grid', 'pack']
const DIRECTIONS: OrganizeDirection[] = ['TB', 'LR', 'BT', 'RL']

export function OrganizePopover({ pos, host, onFit, onClose, toast }: Props) {
  const { t } = useI18n()
  // 默认:mindmap / TB / gap60。这是"有默认方向"的体现——用户开 popover 即见明确默认。
  const [strategy, setStrategy] = useState<OrganizeStrategy>('mindmap')
  const [direction, setDirection] = useState<OrganizeDirection>('TB')
  const [gap, setGap] = useState(60)

  // Esc 关闭(组件注释承诺"Esc 关闭"但原代码漏了 —— 补 keydown,与 Overview/DslDialog 同范式)。
  useEffect(() => {
    if (!pos) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [pos, onClose])

  const apply = () => {
    if (!host) return
    const elements = host.getElements()
    const selectedIds = host.getSelectedIds()
    const selectedCards = selectedIds
      .map((id) => host.getElement(id))
      .filter((el): el is CanvasElement => !!el && el.kind === 'card')
    // 选中≥2 → 局部;否则全画布 card。匹配老 handleAutoLayout 语义。
    const targetIds =
      selectedCards.length >= 2 ? new Set(selectedCards.map((c) => c.id)) : undefined
    const positions = computeAutoLayout(elements, { targetIds, strategy, direction, gap })
    if (positions.size === 0) {
      toast({ kind: 'info', message: t('canvas.autoLayoutTooFew') })
      onClose()
      return
    }
    host.batch(() => {
      for (const [id, p] of positions) {
        const existing = host.getElement(id)
        if (!existing) continue
        // 有限性守卫(防御纵深,镜像 applyLayout 的 finiteRound):computeAutoLayout
        // 已中心化守卫,这里再兜底 —— 非有限位置回落 existing 原坐标,防 NaN 进 host
        // 序列化成 null → reload 变 0 的静默坐标损坏。
        const x = Number.isFinite(p.x) ? Math.round(p.x) : existing.x
        const y = Number.isFinite(p.y) ? Math.round(p.y) : existing.y
        host.upsert({ ...existing, x, y })
      }
    })
    const freeformCount = elements.filter((e) => e.kind !== 'card' && e.kind !== 'arrow').length
    toast({
      kind: 'success',
      message:
        freeformCount > 0
          ? t('canvas.autoLayoutDonePartial', { n: String(positions.size) })
          : t('canvas.autoLayoutDone', { n: String(positions.size) }),
    })
    onClose()
    // fit 让用户立即看到布局全貌(下个 tick,等 upsert 落渲染)。
    setTimeout(onFit, 0)
  }

  if (typeof document === 'undefined') return null

  return createPortal(
    <>
      <div className="cv-rail__menu-backdrop" onClick={onClose} aria-hidden="true" />
      <div
        className="cv-rail__menu cv-organize__panel"
        role="dialog"
        aria-label={t('canvas.organize.title')}
        style={pos ? { left: `${pos.left}px`, top: `${pos.top}px` } : { visibility: 'hidden' }}
      >
        {/* 策略 */}
        <div className="cv-organize__section">
          <span className="cv-organize__label">{t('canvas.organize.strategy')}</span>
          <div className="cv-organize__grid cv-organize__grid--2x2" role="group">
            {STRATEGIES.map((s) => (
              <button
                key={s}
                type="button"
                className={`cv-organize__seg${strategy === s ? ' cv-organize__seg--active' : ''}`}
                aria-pressed={strategy === s}
                onClick={() => setStrategy(s)}
              >
                {t(`canvas.organize.strategy.${s}`)}
              </button>
            ))}
          </div>
        </div>
        {/* 方向 */}
        <div className="cv-organize__section">
          <span className="cv-organize__label">{t('canvas.organize.direction')}</span>
          <div className="cv-organize__grid cv-organize__grid--2x2" role="group">
            {DIRECTIONS.map((d) => (
              <button
                key={d}
                type="button"
                className={`cv-organize__seg${direction === d ? ' cv-organize__seg--active' : ''}`}
                aria-pressed={direction === d}
                onClick={() => setDirection(d)}
                title={t(`canvas.organize.direction.${d}`)}
              >
                {t(`canvas.organize.direction.${d}`)}
              </button>
            ))}
          </div>
        </div>
        {/* 间距 */}
        <div className="cv-organize__section">
          <span className="cv-organize__label">
            {t('canvas.organize.gap')}
            <span className="cv-organize__gap-val">{gap}px</span>
          </span>
          <input
            type="range"
            min={20}
            max={120}
            step={5}
            value={gap}
            onChange={(e) => setGap(Number(e.target.value))}
            className="cv-organize__range"
            aria-label={t('canvas.organize.gap')}
          />
        </div>
        {/* 应用 */}
        <button
          type="button"
          className="cv-organize__apply"
          onClick={apply}
          disabled={!host}
        >
          {t('canvas.organize.apply')}
        </button>
      </div>
    </>,
    document.body,
  )
}
