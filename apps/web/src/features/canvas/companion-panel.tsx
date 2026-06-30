'use client'

/**
 * CanvasCompanionPanel — 画布常驻 AI 浮面板(发现 tab)。
 *
 * 镜像 OutlinePanel 范式:浮面板 z30 / Bauhaus chrome(白底 2px 黑边 4px 硬阴影)/
 * 折叠持久 / 订阅 host.onUserChange + onSelectionChange(force 重渲染)。
 *
 * 发现 = 本地预筛零外发(R2):discoverInsights 是纯函数,复用 findDuplicateGroups +
 * recommendRelations 本地信号,不经 serializeCardsForAI、不发网络。本 task(T2)只接
 * 「选中定位」动作;建立关联 = T3 / AI 深挖 = T4(按钮留位)。对话 tab = 二期占位。
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import type { Card } from '@cys-stift/domain'
import type { CanvasHost, CanvasElement } from '@cys-stift/canvas-engine'
import { useI18n } from '@/lib/i18n'
import { discoverInsights, elementsCenter, buildConnectArrows, type Insight } from './companion-discovery'

const PANEL_WIDTH = 360
/** 限制列表高度,避免大画布把面板顶出屏;内部滚动。 */
const BODY_MAX_HEIGHT = 420

// 折叠态 + 激活 tab 持久(reload 后保留用户选择)。
const COLLAPSED_KEY = 'cys-stift.companion-collapsed.v1'
const TAB_KEY = 'cys-stift.companion-tab.v1'
type Tab = 'discover' | 'chat'

function loadCollapsed(): boolean {
  if (typeof window === 'undefined') return true // 默认折叠(不抢首屏)
  return window.localStorage.getItem(COLLAPSED_KEY) === '1'
}
function loadTab(): Tab {
  if (typeof window === 'undefined') return 'discover'
  return window.localStorage.getItem(TAB_KEY) === 'chat' ? 'chat' : 'discover'
}

export function CanvasCompanionPanel({
  host,
  cards,
  canvasEl,
  getCardTitle,
}: {
  host: CanvasHost | null
  /** 当前画布卡(page 传 service.listOnCanvas(canvasId).filter(!deletedAt))。 */
  cards: Card[]
  /** 主画布元素(读 CSS 尺寸做居中数学)。null → 隐藏。 */
  canvasEl: HTMLCanvasElement | null
  getCardTitle: (id: string) => string | undefined
}) {
  const { t } = useI18n()
  const [collapsed, setCollapsed] = useState(loadCollapsed)
  const [tab, setTab] = useState<Tab>(loadTab)
  // host 变更触发重算 + 重渲染 —— 镜像 OutlinePanel 的 force 范式(它也没把 force 进 deps)。
  const [, force] = useState(0)

  useEffect(() => {
    if (!host) return
    const bump = () => force((n) => n + 1)
    const unsubs = [host.onUserChange(bump), host.onSelectionChange(bump)]
    return () => {
      for (const u of unsubs) u()
    }
  }, [host])

  // selectedIds 每次 render 现取(镜像 OutlinePanel:不用 useMemo,force 驱动重渲染)。
  const selectedIds = host ? new Set(host.getSelectedIds()) : new Set<string>()

  const elements: CanvasElement[] = host ? host.getElements() : []
  const insights: Insight[] = useMemo(
    () => (host && !collapsed && tab === 'discover') ? discoverInsights(elements, cards) : [],
    [host, collapsed, tab, elements, cards],
  )

  /** 选中 + 居中涉及卡(elementsCenter 并集 bbox → setView 居中 + setSelectedIds)。
   *  镜像 OutlinePanel focusItem 的同款 centering 数学(pan = screenCenter - pageCenter*zoom)。 */
  const focusInsight = useCallback((insight: Insight) => {
    if (!host || !canvasEl) return
    const els = insight.cardIds
      .map((id) => host.getElement(id))
      .filter(Boolean) as CanvasElement[]
    const c = elementsCenter(els)
    if (!c) return
    const view = host.getView()
    const zoom = view.zoom || 1
    host.setView({
      ...view,
      panX: canvasEl.clientWidth / 2 - c.x * zoom,
      panY: canvasEl.clientHeight / 2 - c.y * zoom,
    })
    host.setSelectedIds(insight.cardIds)
  }, [host, canvasEl])

  /** 建立关联:按 insight 建 relation arrow(duplicate 星形 / relation 单箭头 / orphan 无)。
   *  走 host.batch 单 undo 步;已有箭头的 pair 跳过(buildConnectArrows 内去重)。
   *  建完调 focusInsight 选中+居中 —— 面板在右侧、卡可能在画布别处,聚焦让用户立刻看到新箭头。 */
  const connectInsight = useCallback((insight: Insight) => {
    if (!host) return
    const arrows = buildConnectArrows(insight, host.getElements())
    if (arrows.length === 0) return // 已全连 / orphan —— 无事可做
    host.batch(() => { for (const a of arrows) host.upsert(a) })
    focusInsight(insight)
  }, [host, focusInsight])

  if (!host) return null
  const title = t('canvas.companion')
  const collapseLabel = collapsed ? t('canvas.companion.expand') : t('canvas.companion.collapse')

  return (
    <div
      className="cv-companion"
      role="group"
      aria-label={title}
      style={{
        position: 'absolute',
        right: 'var(--space-1)',
        top: 'calc(var(--app-menu-height) + 3px)',
        width: PANEL_WIDTH,
        zIndex: 30,
        background: 'var(--color-white)',
        border: '2px solid var(--color-black)',
        boxShadow: '4px 4px 0 0 var(--color-black)',
        borderRadius: 'var(--radius-sm)',
      }}
    >
      {/* 标题栏:tab 切换 + 折叠 */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: 'var(--space-1)',
          borderBottom: collapsed ? 'none' : 'var(--border-hairline)',
        }}
      >
        <div role="tablist" aria-label={title} style={{ display: 'flex', gap: 'var(--space-1)' }}>
          {(['discover', 'chat'] as Tab[]).map((tb) => (
            <button
              key={tb}
              type="button"
              role="tab"
              aria-selected={tab === tb}
              onClick={() => {
                setTab(tb)
                try { window.localStorage.setItem(TAB_KEY, tb) } catch { /* quota */ }
              }}
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: 'var(--font-size-xs)',
                letterSpacing: '0.08em',
                textTransform: 'uppercase',
                background: tab === tb ? 'var(--color-black)' : 'transparent',
                color: tab === tb ? 'var(--color-white)' : 'var(--color-black)',
                border: '1px solid var(--color-black)',
                borderRadius: 'var(--radius-sm)',
                padding: '2px var(--space-1)',
                cursor: 'pointer',
              }}
            >
              {t(`canvas.companion.tab.${tb}`)}
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={() => {
            const next = !collapsed
            setCollapsed(next)
            try { window.localStorage.setItem(COLLAPSED_KEY, next ? '1' : '0') } catch { /* quota */ }
          }}
          aria-label={collapseLabel}
          aria-expanded={!collapsed}
          title={collapseLabel}
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 'var(--font-size-xs)',
            lineHeight: 1,
            padding: '0 var(--space-1)',
            background: 'transparent',
            color: 'var(--color-black)',
            border: 'none',
            cursor: 'pointer',
          }}
        >
          {collapsed ? '▸' : '▾'}
        </button>
      </div>

      {!collapsed && (
        <div
          className="cv-companion__body"
          role="tabpanel"
          style={{
            maxHeight: BODY_MAX_HEIGHT,
            overflowY: 'auto',
            padding: 'var(--space-1)',
          }}
        >
          {tab === 'chat' ? (
            <p style={mutedTextStyle}>
              {t('canvas.companion.chat.soon')}
            </p>
          ) : insights.length === 0 ? (
            <p style={mutedTextStyle}>
              {t('canvas.companion.empty')}
            </p>
          ) : (
            <ul
              className="cv-companion__list"
              style={{
                listStyle: 'none',
                margin: 0,
                padding: 0,
                display: 'flex',
                flexDirection: 'column',
                gap: 'var(--space-1)',
              }}
            >
              {insights.map((ins) => {
                const active = ins.cardIds.some((id) => selectedIds.has(id))
                const label =
                  ins.kind === 'duplicate'
                    ? t('canvas.companion.kind.duplicate', { count: ins.cardIds.length })
                    : ins.kind === 'relation'
                      ? t('canvas.companion.kind.relation')
                      : t('canvas.companion.kind.orphan')
                const titles = ins.cardIds.map(getCardTitle).filter(Boolean).join(' · ')
                return (
                  <li key={ins.id} style={{ margin: 0, padding: 0 }}>
                    <div
                      className={`cv-companion__item${active ? ' cv-companion__item--active' : ''}`}
                      style={{
                        border: `1px solid ${active ? 'var(--color-black)' : 'var(--color-gray)'}`,
                        borderRadius: 'var(--radius-sm)',
                        padding: 'var(--space-1)',
                        background: active ? 'var(--color-yellow-soft)' : 'transparent',
                      }}
                    >
                      <div
                        style={{
                          fontFamily: 'var(--font-mono)',
                          fontSize: 'var(--font-size-xs)',
                          color: 'var(--color-black)',
                          marginBottom: 2,
                        }}
                      >
                        {label}
                      </div>
                      <div
                        style={{
                          fontSize: 'calc(var(--font-size-xs) + 1px)',
                          color: 'var(--color-black-soft)',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                          marginBottom: 'var(--space-1)',
                        }}
                        title={titles}
                      >
                        {titles || '—'}
                      </div>
                      {/* 动作:选中定位(本 task)。建立关联 / AI 深挖 = T3/T4 接线。 */}
                      <div style={{ display: 'flex', gap: 'var(--space-1)' }}>
                        <button
                          type="button"
                          className="cv-companion__action"
                          onClick={() => focusInsight(ins)}
                          style={actionBtnStyle}
                        >
                          {t('canvas.companion.action.locate')}
                        </button>
                        {(ins.kind === 'relation' || ins.kind === 'duplicate') && (
                          <button
                            type="button"
                            className="cv-companion__action"
                            onClick={() => connectInsight(ins)}
                            style={actionBtnStyle}
                          >
                            {t('canvas.companion.action.connect')}
                          </button>
                        )}
                        {/* T4: 深挖 */}
                      </div>
                    </div>
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      )}

      <style>{styles}</style>
    </div>
  )
}

const mutedTextStyle: React.CSSProperties = {
  margin: 0,
  padding: 'var(--space-1)',
  fontFamily: 'var(--font-mono)',
  fontSize: 'var(--font-size-xs)',
  color: 'var(--color-gray)',
}

const actionBtnStyle: React.CSSProperties = {
  fontFamily: 'var(--font-mono)',
  fontSize: 'var(--font-size-xs)',
  background: 'transparent',
  color: 'var(--color-black)',
  border: '1px solid var(--color-black)',
  borderRadius: 'var(--radius-sm)',
  padding: '2px var(--space-1)',
  cursor: 'pointer',
}

const styles = `
.cv-companion__item:hover:not(.cv-companion__item--active) {
  background: var(--color-gray-soft);
}
.cv-companion__action:focus-visible {
  outline: 2px solid var(--color-red);
  outline-offset: 2px;
}
.cv-companion__body::-webkit-scrollbar { width: 6px; }
.cv-companion__body::-webkit-scrollbar-thumb { background: var(--color-gray); border-radius: 3px; }
`
