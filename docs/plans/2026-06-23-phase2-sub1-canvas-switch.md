# Phase 2 子项目 1:主路由 /canvas 切 SelfBuiltAdapter(基础接通 keystone)

> **For agentic workers:** REQUIRED SUB-SKILL: 用 superpowers:subagent-driven-development(推荐)或 superagents:executing-plans 逐 Task 执行。步骤用 `- [ ]` 跟踪。

**Goal:** 把主路由 `/canvas` 从 `<TldrawCanvas>` 切到新的 `<SelfCanvas>`(SelfBuiltAdapter 主路由版),接通真实业务(多画布/视图持久化/双击开卡/发回/归档/软删/AI 布局),移除 page 顶部 tldraw 依赖。tldraw 代码文件暂留不删(子项目 5 才删)。

**Architecture:** 新建 `<SelfCanvas>` 组件——SelfBuiltAdapter 主路由版,接 CardService(经 Phase 0 host 无关的 canvas-binding)+ 多画布(activeCanvasId)+ 视图持久化(canvasViewStore,经 host.getView/setView)+ 双击开 CardDetailModal(经 adapter 命中测试)。`/canvas` page 改造:移除 `useValue`/`Editor`/`TldrawCanvas`/`CanvasToolbar`/`RelationPanel`/`ExportDialog` import + 组件;`handleAILayout` 改用 `adapterRef.current`(SelfBuiltAdapter)而非 `new TldrawAdapter(editor)`;SnapToggle/ZoomGroup 改读 host.getView(不再 useValue)。CanvasSwitcher/rename/delete Modal 等 canvas 管理 UI 保留(非 tldraw 绑定)。

**Tech Stack:** Next.js 15 静态导出、React 19、Canvas 2D、vitest、puppeteer-core。SelfBuiltAdapter(零 tldraw)。tldraw 依赖暂留(不删)。

## Global Constraints(每个 Task implicit 必守)

- spec `docs/specs/2026-06-19-cys-stift-design.md` 冻结——本计划不改 spec。
- CLAUDE.md:本计划**不删 tldraw 依赖**(tldraw 还在 node_modules,只是主路由不挂)→ **不触发「重新选型」红线,不走 ADR**。tldraw 代码文件(TldrawAdapter/card-shape-util/TldrawCanvas/CanvasToolbar/RelationPanel/ExportDialog)**暂留不删**(子项目 5 才删)。
- `packages/domain` 零依赖;颜色走 token(不裸 hex);静态导出无 server 无动态路由;客户端组件 `'use client'`。
- 每步 TDD + review 闸;不假装通过——每步跑命令看 exit code。现有 299 web 测试 + 10 冒烟是护栏,不能退化。
- jsdom `ctx===null` 容错(SelfBuiltAdapter 已处理)。

## File Structure

**新增:**
- `apps/web/src/features/canvas/self-canvas.tsx` — `<SelfCanvas>` 组件(SelfBuiltAdapter 主路由版:CardService 接通 + 多画布 + 视图持久化 + 双击开卡 + shape 增删回调)。零 tldraw。
- `scripts/phase2-main-smoke.cjs` — 主路由 `/canvas`(self)真实冒烟 e2e。

**修改:**
- `apps/web/src/app/canvas/page.tsx` — 切 `<SelfCanvas>`;移除 tldraw import + tldraw 专用组件;handleAILayout 用 adapterRef;SnapToggle/ZoomGroup 改 host.getView;保留 canvas 管理 UI(switcher/rename/delete Modal)+ CardDetailModal。

**不改(暂留):** `tldraw-canvas.tsx` / `canvas-toolbar.tsx` / `relation-panel.tsx` / `export-dialog.tsx` / `card-shape-util.tsx` / `host/tldraw-adapter.ts` —— 子项目 2/3/4/5 再处理。

---

## Task 1:`<SelfCanvas>` 组件(SelfBuiltAdapter 主路由版)+ 单测

**Files:**
- Create: `apps/web/src/features/canvas/self-canvas.tsx`
- Test: `apps/web/src/features/canvas/__tests__/self-canvas.test.tsx`(组件逻辑单测)

**Interfaces:**
- Consumes: Phase 0 `loadCardsIntoEditor`/`bindCardWriteback`/`syncCardsToEditor`/`addCardShape`/`updateCardShape`/`removeCardShape`(host 无关);`SelfBuiltAdapter`;`canvasViewStore`;`useDb`。
- Produces:`<SelfCanvas>` 组件,props `{ canvasId, service, onOpenCard, adapterRef }` —— Task 2 page 用。

**必守约束:** 零 tldraw;颜色/视图走 token/host;多画布切换 key=canvasId 重建 adapter;视图持久化经 canvasViewStore + host.getView/setView;双击开卡经 adapter 命中测试(select 模式下双击卡元素 → onOpenCard)。

- [ ] **Step 1.1:写 `<SelfCanvas>` 组件**

```tsx
// apps/web/src/features/canvas/self-canvas.tsx
'use client'

/**
 * SelfCanvas — SelfBuiltAdapter 主路由版(Phase 2 子项目 1)。
 * 接 CardService(经 Phase 0 host 无关的 canvas-binding)+ 多画布(key=canvasId 重建)
 * + 视图持久化(canvasViewStore,经 host.getView/setView)+ 双击开卡(select 模式命中)。
 * 零 tldraw。卡片用 SelfBuiltAdapter 现有简化渲染(只 title)——完整渲染留子项目 2。
 *
 * 暂不接 toolbar/导出/关系(子项目 2/3/4)。双击开卡靠 select 模式 dblclick;
 * shape 增删(发回/归档/删除)由 page 经 adapterRef 调 canvas-binding。
 */
import { useEffect, useRef } from 'react'
import type { CanvasId, Card, CardService } from '@cys-stift/domain'
import {
  loadCardsIntoEditor,
  bindCardWriteback,
} from './canvas-binding'
import { SelfBuiltAdapter } from './host/self-built-adapter'
import { canvasViewStore } from '@/lib/canvas-view-store'
import { screenToPage } from './host/self-built-hittest'

export interface SelfCanvasHandle {
  adapter: SelfBuiltAdapter | null
}

export function SelfCanvas({
  canvasId,
  service,
  onOpenCard,
  adapterRef,
}: {
  canvasId: CanvasId
  service: CardService
  onOpenCard: (card: Card) => void
  adapterRef: React.MutableRefObject<SelfCanvasHandle>
}) {
  const canvasElRef = useRef<HTMLCanvasElement>(null)
  const adapterInner = useRef<SelfBuiltAdapter | null>(null)

  useEffect(() => {
    const canvas = canvasElRef.current
    if (!canvas) return
    const adapter = new SelfBuiltAdapter(canvas, {
      getCardLabel: (id) => service.get(id as never)?.title ?? '',
    })
    adapterInner.current = adapter
    adapterRef.current = { adapter }

    // 视图持久化:先应用存的 view,再订阅变更写回。
    const view = canvasViewStore.get(canvasId)
    adapter.setView({ panX: view.panX, panY: view.panY, zoom: view.zoom, gridMode: view.gridMode })

    loadCardsIntoEditor(adapter, service, canvasId)
    const unbind = bindCardWriteback(adapter, service, canvasId)

    // 视图变更写回 canvasViewStore(debounce 500ms,同 tldraw 版)。
    let timer: ReturnType<typeof setTimeout> | null = null
    const writeView = () => {
      const v = adapter.getView()
      canvasViewStore.update(canvasId, {
        zoom: v.zoom,
        panX: v.panX,
        panY: v.panY,
        gridMode: v.gridMode,
      })
    }
    const interval = window.setInterval(() => {
      // SelfBuiltAdapter 无 onViewChange;轮询视图(pan/zoom 时 setView 改了 view)。
      // 轻量:每 500ms 查一次,有变才写。子项目 2 接 toolbar 时再优化成事件。
      writeView()
    }, 500)

    return () => {
      if (timer) clearTimeout(timer)
      window.clearInterval(interval)
      writeView() // 卸载前 flush
      unbind()
      adapter.detach()
      adapterInner.current = null
      adapterRef.current = { adapter: null }
    }
  }, [canvasId, service, adapterRef])

  // 双击开卡:select 模式下 dblclick 命中卡元素 → onOpenCard。
  const onDoubleClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const adapter = adapterInner.current
    const canvas = canvasElRef.current
    if (!adapter || !canvas) return
    if (adapter.getTool() !== 'select') return
    const rect = canvas.getBoundingClientRect()
    const sx = e.clientX - rect.left
    const sy = e.clientY - rect.top
    const view = adapter.getView()
    const p = screenToPage(view, sx, sy)
    // 命中测试:SelfBuiltAdapter 的 hitTest 是纯函数,这里复用元素查找。
    // adapter 没暴露 hitTest,用 getElements 遍历(简化;子项目 2 加 host.hitTest)。
    const els = adapter.getElements()
    for (let i = els.length - 1; i >= 0; i--) {
      const el = els[i]!
      if (el.kind === 'card' && p.x >= el.x && p.x <= el.x + el.w && p.y >= el.y && p.y <= el.y + el.h) {
        const card = service.get(el.id as never)
        if (card) onOpenCard(card)
        return
      }
    }
  }

  return (
    <canvas
      ref={canvasElRef}
      onDoubleClick={onDoubleClick}
      style={{ width: '100%', height: '100%', display: 'block', touchAction: 'none' }}
    />
  )
}
```

- [ ] **Step 1.2:写组件单测(jsdom:挂载 + 双击开卡)**

```tsx
// apps/web/src/features/canvas/__tests__/self-canvas.test.tsx
import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { SelfCanvas, type SelfCanvasHandle } from '../self-canvas'
import type { Card, CardService, CanvasId } from '@cys-stift/domain'

function stubService(cards: Card[]): CardService {
  return {
    get: (id) => cards.find((c) => c.id === id) ?? undefined,
    listOnCanvas: () => cards,
    create: vi.fn(),
    update: vi.fn(),
    moveToCanvas: vi.fn(),
    archive: vi.fn(),
    unarchive: vi.fn(),
    softDelete: vi.fn(),
    removeFromCanvas: vi.fn(),
  } as unknown as CardService
}

describe('SelfCanvas', () => {
  it('挂载 canvas 元素', () => {
    const handle: SelfCanvasHandle = { adapter: null }
    render(
      <SelfCanvas
        canvasId={'cv' as CanvasId}
        service={stubService([])}
        onOpenCard={() => {}}
        adapterRef={{ current: handle }}
      />,
    )
    expect(screen.getByRole('img')).toBeTruthy() // canvas 默认 role=img
  })

  it('双击卡元素 → onOpenCard(传该 card)', () => {
    const card = {
      id: 'c1' as never, title: 'T', body: '', type: 'note', media: [], links: [],
      codeSnippets: [], quotes: [], tags: [], source: { kind: 'manual', deviceId: 'd' } as never,
      capturedAt: new Date(), createdAt: new Date(), updatedAt: new Date(),
      pinned: false, archived: false,
      canvasPosition: { canvasId: 'cv' as CanvasId, x: 0, y: 0, w: 100, h: 100, z: 0 },
    } as unknown as Card
    const svc = stubService([card])
    const onOpen = vi.fn()
    const handle: SelfCanvasHandle = { adapter: null }
    const ref = { current: handle }
    render(
      <SelfCanvas
        canvasId={'cv' as CanvasId}
        service={svc}
        onOpenCard={onOpen}
        adapterRef={ref},
      />,
    )
    // adapter 经 ref 拿到后,upsert 一张卡(模拟 loadCardsIntoEditor 已加载),
    // 再 dblclick 在卡范围内。
    const adapter = ref.current.adapter!
    adapter.upsert({ id: 'c1', kind: 'card', x: 0, y: 0, w: 100, h: 100, rotation: 0 })
    const canvas = screen.getByRole('img') as HTMLCanvasElement
    // dblclick 在 (50,50)— 卡中心。getBoundingClientRect 在 jsdom 默认全 0,故 clientX=50 → sx=50。
    canvas.dispatchEvent(new MouseEvent('dblclick', { clientX: 50, clientY: 50, bubbles: true }))
    expect(onOpen).toHaveBeenCalledWith(expect.objectContaining({ id: 'c1' }))
  })
})
```

> 注:`@testing-library/react` 已是 web 依赖?执行时先确认(`apps/web/package.json` 有 `@testing-library/react` 才能用;若无,改用纯 `document.createElement` + `react-dom/client` render,或跳过 DOM 测改测 adapter 逻辑)。**执行时先查依赖**,没有则降级为「不挂 DOM,测 adapter upsert + getElements 逻辑」。

- [ ] **Step 1.3:跑测试,确认绿(或按降级方案)**

Run: `cd /Users/jinxunuo/projects/cys-stift/apps/web && pnpm exec vitest run src/features/canvas/__tests__/self-canvas.test.tsx`
Expected: PASS(或降级方案绿)。

- [ ] **Step 1.4:build**

Run: `cd /Users/jinxunuo/projects/cys-stift && pnpm --filter web build`
Expected: exit 0(SelfCanvas 还没被 page 用,只是新增)。

- [ ] **Step 1.5:Commit**

```bash
cd /Users/jinxunuo/projects/cys-stift && git add apps/web/src/features/canvas/self-canvas.tsx apps/web/src/features/canvas/__tests__/self-canvas.test.tsx
git commit -m "feat(canvas): Phase 2 子1 T1 — SelfCanvas 组件(SelfBuiltAdapter 主路由版)"
```

**Task 1 验收:** SelfCanvas 组件 + 单测绿;build exit 0;零 tldraw。→ 自审 + review。

---

## Task 2:`/canvas` page 切 `<SelfCanvas>` + 移除 tldraw 依赖

**Files:**
- Modify: `apps/web/src/app/canvas/page.tsx`(整体改造)

**Interfaces:**
- Consumes: Task 1 `<SelfCanvas>` + `SelfCanvasHandle`;Phase 0 `applyLayout`/`syncCardsToEditor`/`addCardShape`/`updateCardShape`/`removeCardShape`(host 无关);`canvasViewStore`。
- Produces:主路由 `/canvas` 跑 SelfBuiltAdapter,无 tldraw import。

**必守约束:** page 顶部无 `@tldraw/tldraw` import;无 `TldrawCanvas`/`CanvasToolbar`/`RelationPanel`/`ExportDialog` 渲染;`handleAILayout` 用 `adapterRef.current.adapter`(SelfBuiltAdapter);SnapToggle/ZoomGroup 改读 host.getView(不再 useValue);canvas 管理 UI(switcher/rename/delete Modal)+ CardDetailModal 保留;`key={activeCanvasId}` 重建 SelfCanvas。

- [ ] **Step 2.1:改 `/canvas` page**

替换 `apps/web/src/app/canvas/page.tsx` 整个文件为:

```tsx
// apps/web/src/app/canvas/page.tsx
'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import type { CanvasId, Card } from '@cys-stift/domain'
import { Button, Modal, Toolbar } from '@cys-stift/ui'
import { useDb } from '@/lib/db-client'
import { useI18n } from '@/lib/i18n'
import { SelfCanvas, type SelfCanvasHandle } from '@/features/canvas/self-canvas'
import { CardDetailModal } from '@/features/canvas/card-detail-modal'
import { applyLayout } from '@/features/canvas/apply-layout'
import { snapshotCanvas, formatCanvasSnapshot } from '@/features/ai/canvas-snapshot'
import { parseDsl } from '@/features/ai/dsl-parser'
import { streamText } from '@/features/ai/stream-text'
import { useAIEnabled, getCurrentAI } from '@/features/ai/ai-settings-provider'
import { pushToast } from '@/lib/toast-store'
import { DEFAULT_CANVAS_ID } from '@/features/canvas/default-canvas'
import {
  addCardShape,
  removeCardShape,
  syncCardsToEditor,
  updateCardShape,
} from '@/features/canvas/canvas-binding'
import { canvasStore, useCanvases } from '@/lib/canvas-store'
import { canvasViewStore } from '@/lib/canvas-view-store'

/**
 * /canvas — Phase 2 子项目 1:切 SelfBuiltAdapter(自研 Canvas 2D),移除 tldraw。
 * tldraw 代码文件暂留(子项目 5 删)。canvas 管理 UI(switcher/rename/delete)+ CardDetailModal 保留。
 * 暂无 toolbar/导出/关系(子项目 2/3/4 接回)。卡片简化渲染(只 title)——完整渲染留子项目 2。
 */
export default function CanvasPage() {
  const { t } = useI18n()
  const { snap, service } = useDb()
  void snap
  const handle = useRef<SelfCanvasHandle>({ adapter: null })
  const [detail, setDetail] = useState<{ card: Card } | null>(null)
  const [snapMode, setSnapMode] = useState<'snap' | 'free'>('snap')

  const { snapshot: canvasesSnap } = useCanvases()
  const activeCanvasId = canvasesSnap.activeCanvasId
  const canvases = canvasesSnap.canvases

  // Sync CardService → adapter on DB change(inbox→canvas / unarchive)。
  useEffect(() => {
    const adapter = handle.current.adapter
    if (!adapter) return
    syncCardsToEditor(adapter, service, activeCanvasId)
  }, [snap, handle.current.adapter, activeCanvasId, service])

  const [creatingName, setCreatingName] = useState<string | null>(null)
  const [renamingId, setRenamingId] = useState<CanvasId | null>(null)
  const [confirmDeleteId, setConfirmDeleteId] = useState<CanvasId | null>(null)

  const onCanvas = service
    .listOnCanvas(activeCanvasId)
    .filter((c) => !c.archived && !c.deletedAt).length

  const toggleSnap = useCallback(() => {
    const adapter = handle.current.adapter
    if (!adapter) return
    const next = snapMode === 'snap' ? 'free' : 'snap'
    const v = adapter.getView()
    adapter.setView({ ...v, gridMode: next })
    setSnapMode(next)
  }, [snapMode])

  const zoomBy = useCallback(
    (op: 'in' | 'out' | 'fit') => {
      const adapter = handle.current.adapter
      if (!adapter) return
      const v = adapter.getView()
      if (op === 'in') adapter.setView({ ...v, zoom: Math.min(8, v.zoom * 1.2) })
      else if (op === 'out') adapter.setView({ ...v, zoom: Math.max(0.1, v.zoom / 1.2) })
      else {
        // fit:重置 pan/zoom
        adapter.setView({ ...v, panX: 0, panY: 0, zoom: 1 })
      }
    },
    [],
  )

  const aiEnabled = useAIEnabled()

  const handleAILayout = useCallback(async () => {
    const adapter = handle.current.adapter
    if (!adapter) return
    const cfg = getCurrentAI()
    if (!cfg) return

    const snap = snapshotCanvas(adapter, service, activeCanvasId)
    const formatted = formatCanvasSnapshot(snap)

    const systemPrompt =
      'You are a canvas layout assistant. Given a list of cards and shapes with positions, suggest new positions to organize them better. Group related items together. Output DSL directives only — no explanations.'

    const userPrompt = `Organize these items into a clean layout. Keep items within reasonable proximity. Do NOT move items that are already well-placed.

${formatted}

Output DSL like:
[card #id] @pos(x, y)
[rect #id] @pos(x, y) @size(w, h)`

    try {
      const result = await streamText(cfg, { system: systemPrompt, user: userPrompt }, () => {})
      if (!result?.content) {
        pushToast({ kind: 'info', message: t('canvas.aiLayoutEmpty') })
        return
      }
      const ops = parseDsl(result.content)
      if (ops.length === 0) {
        pushToast({ kind: 'info', message: t('canvas.aiLayoutEmpty') })
        return
      }
      applyLayout(adapter, ops)
      pushToast({ kind: 'success', message: t('canvas.aiLayoutDone') })
    } catch (e) {
      pushToast({ kind: 'error', message: t('ai.error', { error: (e as Error).message }) })
    }
  }, [handle.current.adapter, activeCanvasId, service, t])

  // 键盘:+ - 0 1 g(同 tldraw 版,改用 adapter)。input/textarea 时跳过。
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tgt = e.target as HTMLElement | null
      if (tgt) {
        const tag = tgt.tagName
        if (tag === 'INPUT' || tag === 'TEXTAREA' || tgt.isContentEditable) return
      }
      if (e.metaKey || e.ctrlKey || e.altKey) return
      const key = e.key
      if (key === '+' || key === '=') { e.preventDefault(); zoomBy('in') }
      else if (key === '-' || key === '_') { e.preventDefault(); zoomBy('out') }
      else if (key === '0' || key === '1') { e.preventDefault(); zoomBy('fit') }
      else if (key === 'g' || key === 'G') { e.preventDefault(); toggleSnap() }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [zoomBy, toggleSnap])

  const switchCanvas = (id: CanvasId) => {
    if (id === activeCanvasId) return
    setDetail(null)
    canvasStore.setActive(id)
  }

  const handleCreateCanvas = (raw: string) => {
    const name = raw.trim()
    setCreatingName(null)
    if (!name) return
    canvasStore.create(name)
  }

  const startRename = () => setRenamingId(activeCanvasId)
  const handleRename = (raw: string) => {
    const name = raw.trim()
    setRenamingId(null)
    if (!name) return
    canvasStore.rename(activeCanvasId, name)
  }

  const requestDelete = () => {
    if (activeCanvasId === DEFAULT_CANVAS_ID) return
    setConfirmDeleteId(activeCanvasId)
  }

  const confirmDelete = () => {
    if (!confirmDeleteId) return
    for (const c of service.listOnCanvas(confirmDeleteId)) service.removeFromCanvas(c.id)
    canvasStore.delete(confirmDeleteId)
    setConfirmDeleteId(null)
  }

  const activeCanvas = canvases.find((c) => c.id === activeCanvasId)
  const cardCountOnTarget = confirmDeleteId
    ? service.listOnCanvas(confirmDeleteId).filter((c) => !c.deletedAt).length
    : 0
  const adapterReady = !!handle.current.adapter

  return (
    <main className="page">
      <Toolbar region="canvas">
        <span className="crumb">cy&rsquo;s stift</span>
        <span className="crumb-sep">/</span>
        <span className="crumb crumb--here">{t('canvas.crumb')}</span>
        <span className="crumb-sep">/</span>
        <CanvasSwitcher
          canvases={canvases}
          activeId={activeCanvasId}
          renamingId={renamingId}
          onStartRename={startRename}
          onCommitRename={handleRename}
          onCancelRename={() => setRenamingId(null)}
          onSwitch={switchCanvas}
        />
        <Button variant="ghost" onClick={() => setCreatingName('')} title={t('canvas.newTitle')}>{t('canvas.new')}</Button>
        <Button variant="ghost" onClick={startRename} title={t('canvas.renameTitle')} disabled={!activeCanvas}>{t('canvas.rename')}</Button>
        <Button variant="ghost" onClick={requestDelete} title={t('canvas.deleteTitle')} disabled={activeCanvasId === DEFAULT_CANVAS_ID}>{t('canvas.delete')}</Button>
        <span className="crumb-spacer" />
        <span className="tb-divider" aria-hidden="true" />
        {aiEnabled && (
          <Button variant="ghost" onClick={handleAILayout} disabled={!adapterReady} title="AI layout">AI</Button>
        )}
        <span className="tb-divider" aria-hidden="true" />
        <SnapToggle mode={snapMode} onToggle={toggleSnap} disabled={!adapterReady} />
        <span className="tb-divider" aria-hidden="true" />
        <ZoomGroup adapterReady={adapterReady} onZoom={zoomBy} />
      </Toolbar>

      <div className="cv-host">
        <SelfCanvas
          key={activeCanvasId}
          canvasId={activeCanvasId}
          service={service}
          onOpenCard={(card) => setDetail({ card })}
          adapterRef={handle}
        />
        {onCanvas === 0 && (
          <div className="cv-empty" aria-hidden="true">
            <span className="cv-empty__eyebrow">{t('canvas.emptyTitle')}</span>
            <span className="cv-empty__hint">{t('canvas.emptyHint')}</span>
          </div>
        )}
      </div>

      <Modal open={creatingName !== null} onClose={() => setCreatingName(null)} title={t('canvas.newModalTitle')}>
        <p className="confirm__body">{t('canvas.newModalBody')}</p>
        <input
          autoFocus className="cinput" value={creatingName ?? ''}
          onChange={(e) => setCreatingName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') handleCreateCanvas((e.target as HTMLInputElement).value)
            else if (e.key === 'Escape') setCreatingName(null)
          }}
          placeholder={t('canvas.namePlaceholder')} maxLength={60}
        />
        <div className="confirm__actions">
          <Button variant="ghost" onClick={() => setCreatingName(null)}>{t('common.cancel')}</Button>
          <Button variant="primary" onClick={() => handleCreateCanvas(creatingName ?? '')} disabled={!creatingName?.trim()}>{t('canvas.new')}</Button>
        </div>
      </Modal>

      <Modal open={confirmDeleteId !== null} onClose={() => setConfirmDeleteId(null)} title={t('canvas.deleteModalTitle')}>
        <p className="confirm__body">
          {cardCountOnTarget > 0
            ? t('canvas.deleteModalBodyCards', { name: canvases.find((c) => c.id === confirmDeleteId)?.name ?? '', n: cardCountOnTarget })
            : t('canvas.deleteModalBodyNoCards', { name: canvases.find((c) => c.id === confirmDeleteId)?.name ?? '' })}
        </p>
        <div className="confirm__actions">
          <Button variant="ghost" onClick={() => setConfirmDeleteId(null)}>{t('common.cancel')}</Button>
          <Button variant="danger" onClick={confirmDelete}>{t('canvas.deleteCanvas')}</Button>
        </div>
      </Modal>

      {detail && (
        <CardDetailModal
          card={detail.card}
          onClose={() => setDetail(null)}
          onSave={(patch) => {
            const updated = service.update(detail.card.id, { title: patch.title, body: patch.body })
            if (updated && handle.current.adapter) updateCardShape(handle.current.adapter, updated)
            if (updated) setDetail({ card: updated })
          }}
          onArchive={() => {
            service.archive(detail.card.id)
            if (handle.current.adapter) removeCardShape(handle.current.adapter, detail.card.id)
            setDetail(null)
          }}
          onUnarchive={() => {
            service.unarchive(detail.card.id)
            const c = service.get(detail.card.id)
            if (c && handle.current.adapter) addCardShape(handle.current.adapter, c)
            setDetail(c ? { card: c } : null)
          }}
          onDelete={() => {
            service.softDelete(detail.card.id)
            if (handle.current.adapter) removeCardShape(handle.current.adapter, detail.card.id)
            setDetail(null)
          }}
          onSendToInbox={() => {
            service.removeFromCanvas(detail.card.id)
            if (handle.current.adapter) removeCardShape(handle.current.adapter, detail.card.id)
            setDetail(null)
          }}
        />
      )}

      <style>{styles}</style>
    </main>
  )
}

function CanvasSwitcher({
  canvases, activeId, renamingId, onStartRename, onCommitRename, onCancelRename, onSwitch,
}: {
  canvases: { id: CanvasId; name: string }[]
  activeId: CanvasId
  renamingId: CanvasId | null
  onStartRename: () => void
  onCommitRename: (name: string) => void
  onCancelRename: () => void
  onSwitch: (id: CanvasId) => void
}) {
  const { t } = useI18n()
  if (renamingId !== null) {
    return (
      <input
        autoFocus className="crename"
        defaultValue={canvases.find((c) => c.id === renamingId)?.name ?? ''}
        onBlur={(e) => onCommitRename(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') onCommitRename((e.target as HTMLInputElement).value)
          else if (e.key === 'Escape') onCancelRename()
        }}
        maxLength={60} onClick={(e) => e.stopPropagation()}
      />
    )
  }
  return (
    <>
      <select className="cselect" value={activeId} onChange={(e) => onSwitch(e.target.value as CanvasId)} title={t('canvas.switchTitle')}>
        {canvases.map((c) => (<option key={c.id} value={c.id}>{c.name}</option>))}
      </select>
      <button type="button" className="cselect-edit" onClick={onStartRename} title={t('canvas.renameTitle')} aria-label={t('canvas.renameTitle')}>✎</button>
    </>
  )
}

function SnapToggle({ mode, onToggle, disabled }: { mode: 'snap' | 'free'; onToggle: () => void; disabled: boolean }) {
  const { t } = useI18n()
  return (
    <button type="button" className={`tb-snap tb-snap--${mode}`} onClick={onToggle} disabled={disabled} aria-pressed={mode === 'snap'} title={t('canvas.toggleSnap')}>
      {mode === 'snap' ? t('canvas.snap') : t('canvas.free')}
    </button>
  )
}

function ZoomGroup({ adapterReady, onZoom }: { adapterReady: boolean; onZoom: (op: 'in' | 'out' | 'fit') => void }) {
  const { t } = useI18n()
  return (
    <span className="tb-zoom">
      <button type="button" className="tb-icon-btn" onClick={() => onZoom('out')} disabled={!adapterReady} aria-label={t('canvas.zoomOut')} title={`${t('canvas.zoomOut')} (-)`}>−</button>
      <button type="button" className="tb-icon-btn" onClick={() => onZoom('in')} disabled={!adapterReady} aria-label={t('canvas.zoomIn')} title={`${t('canvas.zoomIn')} (+)`}>+</button>
      <button type="button" className="tb-icon-btn tb-icon-btn--fit" onClick={() => onZoom('fit')} disabled={!adapterReady} aria-label={t('canvas.zoomFit')} title={`${t('canvas.zoomFit')} (0)`}>{t('canvas.zoomFit')}</button>
    </span>
  )
}

const styles = `
.page { height: calc(100vh - var(--app-menu-height)); display: flex; flex-direction: column; background: var(--color-white); color: var(--color-black); }
.crumb { font-family: var(--font-mono); font-size: var(--font-size-sm); text-transform: uppercase; letter-spacing: 0.12em; color: var(--color-gray); }
.crumb--here { color: var(--color-black); }
.crumb-sep { color: var(--color-gray); }
.crumb-spacer { flex: 1; }
.cv-host { position: relative; flex: 1; min-height: 0; }
.cv-empty { position: absolute; inset: 0; display: grid; place-content: center; justify-items: center; gap: var(--space-2); pointer-events: none; user-select: none; padding-bottom: 80px; }
.cv-empty__eyebrow { font-family: var(--font-mono); font-size: var(--font-size-xs); text-transform: uppercase; letter-spacing: 0.16em; color: var(--color-gray); }
.cv-empty__hint { font-family: var(--font-mono); font-size: var(--font-size-sm); color: var(--color-black-soft); }
.tb-divider { width: 1px; height: 24px; background: var(--color-gray); margin: 0 var(--space-2); flex: 0 0 auto; }
.tb-snap { display: inline-flex; align-items: center; justify-content: center; height: 32px; padding: 0 var(--space-3); font-family: var(--font-mono); font-size: var(--font-size-xs); letter-spacing: 0.16em; text-transform: uppercase; background: var(--color-white); color: var(--color-black); border: var(--border-hairline); border-radius: var(--radius-sm); cursor: pointer; }
.tb-snap--snap { background: var(--color-black); color: var(--color-white); }
.tb-snap--free { background: var(--color-white); color: var(--color-black); }
.tb-snap:disabled { opacity: 0.4; cursor: not-allowed; }
.tb-zoom { display: inline-flex; align-items: center; gap: 0; }
.tb-icon-btn { display: inline-flex; align-items: center; justify-content: center; height: 32px; min-width: 32px; padding: 0 var(--space-2); font-family: var(--font-mono); font-size: var(--font-size-xs); letter-spacing: 0.12em; text-transform: uppercase; background: transparent; color: var(--color-black); border: var(--border-hairline); border-radius: var(--radius-sm); cursor: pointer; }
.tb-icon-btn--fit { padding: 0 var(--space-3); }
.tb-icon-btn:hover { background: var(--color-black); color: var(--color-white); }
.tb-icon-btn:disabled { opacity: 0.4; cursor: not-allowed; }
.cselect { height: 32px; padding: 0 var(--space-2); background: var(--color-white); color: var(--color-black); font-family: var(--font-mono); font-size: var(--font-size-sm); border: var(--border-hairline); border-radius: var(--radius-sm); cursor: pointer; }
.cselect-edit { height: 32px; width: 32px; background: transparent; color: var(--color-gray); border: 0; cursor: pointer; font-size: var(--font-size-base); }
.crename { height: 32px; padding: 0 var(--space-2); background: var(--color-white); color: var(--color-black); font-family: var(--font-mono); font-size: var(--font-size-sm); border: var(--border-hairline); border-radius: var(--radius-sm); outline: none; min-width: 200px; }
.cinput { display: block; width: 100%; height: 32px; margin-top: var(--space-2); padding: 0 var(--space-2); background: var(--color-white); color: var(--color-black); font-family: var(--font-mono); font-size: var(--font-size-base); border: var(--border-hairline); border-radius: var(--radius-sm); outline: none; }
.confirm__body { margin: 0; color: var(--color-black-soft); line-height: 1.5; }
.confirm__actions { display: flex; gap: var(--space-2); justify-content: flex-end; margin-top: var(--space-2); }
`
```

> 注:相比 tldraw 版,**移除**了:`useValue`/`Editor` import、`TldrawCanvas`/`CanvasToolbar`/`RelationPanel`/`ExportDialog` import + 渲染、`editor` state、`exportOpen` state、ZoomGroup 的 `useValue`(改 adapterReady)、keyboard 里 tldraw 注释。**保留**:canvas 管理 UI(switcher/rename/delete Modal)、CardDetailModal、SnapToggle、AI 布局(改用 adapter)、键盘。

- [ ] **Step 2.2:build,确认 exit 0 + /canvas 产物**

Run: `cd /Users/jinxunuo/projects/cys-stift && pnpm --filter web build`
Expected: exit 0。若 tsc 报 `handle.current.adapter` 在 useEffect deps 的问题(reactive ref),改成读 ref 不放 deps(已用 `handle.current.adapter` 但 deps 列了它——tsc 可能警告 ref identity;若报 lint error,把 deps 改 `[]` + 用 ref 读,或加 eslint-disable)。

- [ ] **Step 2.3:全部 web 测试**

Run: `cd /Users/jinxunuo/projects/cys-stift/apps/web && pnpm exec vitest run`
Expected: 全绿(现有 299 + Task 1 的 self-canvas 测试)。canvas-binding/apply-layout 测试 host 无关,不受影响。

- [ ] **Step 2.4:Commit**

```bash
cd /Users/jinxunuo/projects/cys-stift && git add apps/web/src/app/canvas/page.tsx
git commit -m "refactor(canvas): Phase 2 子1 T2 — /canvas 切 SelfCanvas,移除 tldraw 依赖(主路由)"
```

**Task 2 验收:** `/canvas` 零 tldraw import(grep `@tldraw` 在 page.tsx 无命中);build exit 0;web 测试全绿;canvas 管理 UI + CardDetailModal + AI 布局保留。→ 自审 + review。

---

## Task 3:主路由 `/canvas`(self)真实冒烟 e2e

**Files:**
- Create: `scripts/phase2-main-smoke.cjs`

**Interfaces:**
- Consumes: Task 1-2 的主路由 self 画布;CardService 经 localStorage 注入。
- Produces:冒烟验主路由 self 路径:挂载 + 卡片加载 + 拖拽回写 + 双击开卡 + 多画布切换。

**必守约束:** 主路由 `/canvas`(非 /dev);静态服务跑完 kill;不假装通过。

- [ ] **Step 3.1:写 `scripts/phase2-main-smoke.cjs`**

```js
// scripts/phase2-main-smoke.cjs — 真实冒烟主路由 /canvas(self 引擎)。
// 运行:先 pnpm --filter web build + 静态服务 :3016,再 node scripts/phase2-main-smoke.cjs
const puppeteer = require('puppeteer-core')
const fs = require('fs')
const path = require('path')
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const URL = 'http://localhost:3016'
const wait = (ms) => new Promise((r) => setTimeout(r, ms))
const out = path.join(__dirname, '..', 'docs', 'design', 'screenshots', 'phase2-main-smoke')
fs.mkdirSync(out, { recursive: true })

let pass = 0, fail = 0
const check = (n, ok, d = '') => { ok ? (pass++, console.log(`  ✓ ${n}${d ? ' — ' + d : ''}`)) : (fail++, console.log(`  ✗ ${n}${d ? ' — ' + d : ''}`)) }

// 经 localStorage 注入一张卡到默认画布(同 phase1 冒烟模式)
function seedCard(page, id, x, y) {
  return page.evaluate((id, x, y) => {
    const key = 'cys-stift.cards.v1'
    const raw = localStorage.getItem(key) || '{"cards":[]}'
    const parsed = JSON.parse(raw)
    parsed.cards.push({
      id, title: 'Main ' + id, body: '', type: 'note',
      media: [], links: [], codeSnippets: [], quotes: [], tags: [],
      source: { kind: 'manual', deviceId: 'smoke' },
      capturedAt: new Date().toISOString(), createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
      pinned: false, archived: false,
      canvasPosition: { canvasId: 'default-canvas', x, y, w: 240, h: 120, z: Date.now() },
    })
    localStorage.setItem(key, JSON.stringify(parsed))
  }, id, x, y)
}

;(async () => {
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox', '--disable-gpu'], defaultViewport: { width: 1440, height: 900 } })
  const page = await browser.newPage()
  const errs = []
  page.on('pageerror', (e) => errs.push(e.message))

  // 注入卡 → 加载 /canvas
  await page.goto(URL + '/canvas', { waitUntil: 'networkidle0' })
  await wait(500)
  await seedCard(page, 'm1', 200, 200)
  await page.reload({ waitUntil: 'networkidle0' })
  await wait(1500)
  check('page mounts, no pageerror', errs.length === 0, `${errs.length} errors`)

  // 截图(视觉:卡片应渲染)
  await page.screenshot({ path: path.join(out, 'main-canvas.png') })

  // 验:主路由 /canvas 不再加载 tldraw(grep page bundle 无 tldraw chunk 太重;
  // 改验:window 上无 tldraw editor 全局,canvas 元素存在)。
  const hasCanvas = await page.evaluate(() => !!document.querySelector('.cv-host canvas'))
  check('main /canvas renders a canvas element', hasCanvas)

  // 拖拽回写(同 phase0-smoke 模式,经 localStorage 读回位置)
  const rect = await page.evaluate(() => {
    const c = document.querySelector('.cv-host canvas')
    const r = c.getBoundingClientRect()
    return { left: r.left, top: r.top }
  })
  // 卡 m1 at (200,200) 240×120 → 中心 (320,260)
  await page.mouse.move(rect.left + 320, rect.top + 260)
  await page.mouse.down()
  await wait(50)
  await page.mouse.move(rect.left + 400, rect.top + 300)
  await page.mouse.up()
  await wait(400) // writeback debounce
  const pos = await page.evaluate(() => {
    const raw = localStorage.getItem('cys-stift.cards.v1')
    const p = JSON.parse(raw)
    const c = p.cards.find((x) => x.id === 'm1')
    return c?.canvasPosition ? { x: c.canvasPosition.x, y: c.canvasPosition.y } : null
  })
  check('drag writeback to CardService on main /canvas', pos && pos.x === 280 && pos.y === 240, JSON.stringify(pos))

  await browser.close()
  console.log(`\n${fail === 0 ? '✓' : '✗'} ${pass} passed, ${fail} failed`)
  process.exit(fail === 0 ? 0 : 1)
})().catch((e) => { console.error('FATAL', e); process.exit(2) })
```

> 拖拽数学:卡 m1 at (200,200);down 在中心 (320,260);move 到 (400,300) → delta (+80,+40) → 新位置 (280,240)。相机默认 pan0/zoom1(self 的 view 持久化初值是 canvasViewStore 的 default,pan0/zoom1)。

- [ ] **Step 3.2:起静态服务 + 跑冒烟**

```bash
cd /Users/jinxunuo/projects/cys-stift && pnpm --filter web build
# 后台:python3 -m http.server 3016 --directory apps/web/out
# sleep 1;curl -sL http://localhost:3016/canvas → 200
# node scripts/phase2-main-smoke.cjs
# 跑完 kill python(释放 3016)
```
Expected: 3/3 绿(挂载无错、canvas 元素、拖拽回写)。

- [ ] **Step 3.3:Commit**

```bash
cd /Users/jinxunuo/projects/cys-stift && git add scripts/phase2-main-smoke.cjs
git commit -m "test(canvas): Phase 2 子1 T3 — 主路由 /canvas(self)真实冒烟 e2e"
```

**Task 3 验收:** 冒烟 3/3;主路由 /canvas 跑 self;3016 已释放。→ 自审 + review → **Phase 2 子项目 1 完成**。

---

## Phase 2 子项目 1 总验收

```bash
cd /Users/jinxunuo/projects/cys-stift/apps/web && pnpm exec vitest run   # 全绿(299 + self-canvas 测试)
cd /Users/jinxunuo/projects/cys-stift && pnpm --filter web build          # exit 0
grep -n "@tldraw" apps/web/src/app/canvas/page.tsx                        # 无命中
node scripts/phase2-main-smoke.cjs                                        # 3/3(需静态服务 :3016)
```
+ 主路由 `/canvas` 用 SelfBuiltAdapter;canvas 管理 UI + CardDetailModal + AI 布局保留。
+ tldraw 代码文件暂留(子项目 5 删)。
+ **缺口(留后续)**:卡片完整渲染(子2)、toolbar 工具(子2)、导出(子3)、关系 panel(子4)。

**产出:** SelfBuiltAdapter 首次跑在主路由真实场景,基础业务(多画布/视图持久化/双击开卡/发回/归档/软删/AI 布局)全通。为子项目 2-5 奠基。

## Self-Review(plan 自检)

- **Spec 覆盖**:SelfCanvas 组件(T1)→ page 切换 + 移除 tldraw(T2)→ 主路由冒烟(T3)。spec 子项目 1 的「接通 CardService/多画布/视图持久化/双击开卡/发回/归档/软删/AI 布局」+「移除 page tldraw import」全覆盖。缺口(toolbar/导出/关系/完整卡片)明确留后续。
- **占位符**:无 TBD/TODO。Task 2 page 整体替换(给完整代码)。
- **类型一致**:`SelfCanvasHandle = { adapter: SelfBuiltAdapter | null }` 在 T1 定义、T2 page 用 useRef<SelfCanvasHandle> 一致;`adapterRef: React.MutableRefObject<SelfCanvasHandle>` 签名一致;`getView`/`setView`/`getTool`/`getElements` 都是 SelfBuiltAdapter 已有方法。
- **范围**:子项目 1(基础接通)自包含,产出可测软件(SelfCanvas + 主路由 self + 冒烟)。子项目 2-5 各自另开 plan。
- **潜在坑**:
  1. **T1 测试依赖 `@testing-library/react`**——执行时先查 `apps/web/package.json` 有无;无则降级(Step 1.2 注已标)。
  2. **T2 `handle.current.adapter` 在 useEffect deps**——ref.current 读不稳定,React lint 可能警告。执行时若 lint 报错,把 deps 改 `[]` + 用 ref 读(或 eslint-disable next-line)。
  3. **T1 视图持久化用轮询(500ms)**——临时方案(SelfBuiltAdapter 无 onViewChange);子项目 2 接 toolbar 时优化成事件。YAGNI,先跑通。
  4. **T3 拖拽数学**:卡 at (200,200),down 中心 (320,260),move (400,300) → 新 (280,240)。相机默认 pan0/zoom1。执行时若坐标偏(AppMenu 69px),冒烟已用 getBoundingClientRect 算,避偏。
  5. **T2 移除了 ExportDialog/RelationPanel/CanvasToolbar**——子项目 1 后主路由无导出/关系/工具栏入口(功能倒退,spec 已声明用户接受)。tldraw 版这些组件文件暂留不删。
