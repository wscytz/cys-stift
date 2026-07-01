'use client'

/**
 * GraphZoomBar — 图谱页缩放控制条(包豪斯浮层)。
 *
 * BUG-2c:此前 /graph 无任何缩放 UI,视口(zoom/panX/panY)只活在 Canvas 内部
 * ref + localStorage,从未暴露为 React state,用户除了滚轮/捏合没法精确调缩放。
 *
 * 本组件:chrome 与 OutlinePanel / CompanionPanel 一致(2px 黑边 + 4px 硬阴影 +
 * 等宽小字 + radius-sm),定位在 .graph-canvas-wrap 右下。包含:
 *  - [−] 缩小按钮(×0.8)
 *  - range 滑块(min=MIN_ZOOM,max=MAX_ZOOM,step 0.05)直绑 zoom
 *  - [+] 放大按钮(×1.25)
 *  - [reset] 重置按钮(zoom=1,pan 居中)
 *  - 百分比读数(Math.round(zoom*100)%)
 *
 * 不持有 zoom state —— 由父组件(graph/page.tsx)拥有,通过 props 下发 zoom +
 * 上报 onZoomBy/onZoomTo/onReset 到 GraphCanvas 的 imperative 句柄。
 *
 * 缩放操作走 imperative 句柄(以画布中心为锚点),滑块走 zoomTo(直接设值)。
 */
import { useI18n } from '@/lib/i18n'
import { MIN_ZOOM, MAX_ZOOM } from './graph-canvas'

export interface GraphZoomBarProps {
  /** 当前 zoom(0.2–4)。父组件拥有;变化即重渲本条。 */
  zoom: number
  /** [−] 按钮:按因子缩小。 */
  onZoomBy: (factor: number) => void
  /** 滑块拖动:缩放到指定值。 */
  onZoomTo: (z: number) => void
  /** [reset]:重置视口。 */
  onReset: () => void
}

const ZOOM_OUT_FACTOR = 0.8
const ZOOM_IN_FACTOR = 1.25
const SLIDER_STEP = 0.05

export function GraphZoomBar({ zoom, onZoomBy, onZoomTo, onReset }: GraphZoomBarProps) {
  const { t } = useI18n()
  const pct = Math.round(zoom * 100)
  // 滑块 value 受控:zoom 钳到 [MIN,MAX](imperative zoomTo 内也钳,这里保证 input value 合法)。
  const sliderVal = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom))

  return (
    <div
      className="graph-zoom-bar"
      role="group"
      aria-label={t('graph.zoom.barLabel')}
      style={{
        position: 'absolute',
        right: 'var(--space-2)',
        bottom: 'var(--space-2)',
        zIndex: 30,
        display: 'flex',
        alignItems: 'center',
        gap: 'var(--space-1)',
        padding: 'var(--space-1) var(--space-2)',
        background: 'var(--color-white)',
        border: '2px solid var(--color-black)',
        boxShadow: '4px 4px 0 0 var(--color-black)',
        borderRadius: 'var(--radius-sm)',
      }}
    >
      <ZoomBtn
        label={t('graph.zoom.out')}
        onClick={() => onZoomBy(ZOOM_OUT_FACTOR)}
      >
        −
      </ZoomBtn>
      <input
        type="range"
        min={MIN_ZOOM}
        max={MAX_ZOOM}
        step={SLIDER_STEP}
        value={sliderVal}
        onChange={(e) => onZoomTo(Number.parseFloat(e.target.value))}
        aria-label={t('graph.zoom.slider')}
        className="graph-zoom-bar__slider"
        style={{
          width: '120px',
          accentColor: 'var(--color-black)',
          cursor: 'pointer',
        }}
      />
      <ZoomBtn
        label={t('graph.zoom.in')}
        onClick={() => onZoomBy(ZOOM_IN_FACTOR)}
      >
        +
      </ZoomBtn>
      <button
        type="button"
        onClick={onReset}
        aria-label={t('graph.zoom.reset')}
        title={t('graph.zoom.reset')}
        style={{
          fontFamily: 'var(--font-mono)',
          fontSize: 'var(--font-size-xs)',
          letterSpacing: '0.08em',
          textTransform: 'uppercase',
          lineHeight: 1,
          padding: '4px var(--space-1)',
          background: 'transparent',
          color: 'var(--color-black)',
          border: 'var(--border-hairline)',
          borderRadius: 'var(--radius-sm)',
          cursor: 'pointer',
        }}
      >
        {t('graph.zoom.reset')}
      </button>
      <span
        aria-hidden="true"
        style={{
          fontFamily: 'var(--font-mono)',
          fontSize: 'var(--font-size-xs)',
          letterSpacing: '0.04em',
          color: 'var(--color-black)',
          minWidth: '3em',
          textAlign: 'right',
        }}
      >
        {pct}%
      </span>
      <style>{styles}</style>
    </div>
  )
}

/** [−]/[+] 方形按钮(包豪斯:黑边白底,hover 反色)。 */
function ZoomBtn({
  label,
  onClick,
  children,
}: {
  label: string
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className="graph-zoom-bar__btn"
      style={{
        width: '28px',
        height: '28px',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontFamily: 'var(--font-mono)',
        fontSize: 'var(--font-size-base)',
        lineHeight: 1,
        padding: 0,
        background: 'var(--color-white)',
        color: 'var(--color-black)',
        border: '2px solid var(--color-black)',
        borderRadius: 'var(--radius-sm)',
        cursor: 'pointer',
      }}
    >
      {children}
    </button>
  )
}

const styles = `
.graph-zoom-bar__btn:hover { background: var(--color-black); color: var(--color-white); }
.graph-zoom-bar__btn:focus-visible { outline: 2px solid var(--color-red); outline-offset: 2px; }
.graph-zoom-bar__slider:focus-visible { outline: 2px solid var(--color-red); outline-offset: 2px; }
`
