'use client'

/**
 * SelfCanvas — SelfBuiltAdapter 主路由版(Phase 2 子项目 1)。
 * 接 CardService(经 Phase 0 host 无关的 canvas-binding)+ 多画布(key=canvasId 重建)
 * + 视图持久化(canvasViewStore,经 host.getView/setView)+ 双击开卡(select 模式命中)。
 * 零 tldraw。卡片用 SelfBuiltAdapter 现有简化渲染(只 title)——完整渲染留子项目 2。
 *
 * 文本编辑(debt 收口 2026-06-23):Text 工具下点击 canvas 放浮动 textarea,
 * 原生 IME(composition)+ textEditKeyAction 守卫,Ctrl/Enter 或 blur 提交、
 * Escape 取消。逻辑从 /dev/canvas-self 的验证版搬过来,适配主路由(adapter 在 ref)。
 * 注:text/freedraw 等非卡片元素当前不持久化(reload 丢)——自研快照层是下一个 debt。
 *
 * shape 增删(发回/归档/删除)由 page 经 adapterRef 调 canvas-binding。
 */
import { useEffect, useRef, useState } from 'react'
import type { CanvasId, Card, CardService } from '@cys-stift/domain'
import {
  loadCardsIntoEditor,
  bindCardWriteback,
} from './canvas-binding'
import { attachCanvasFreeformPersistence } from './canvas-freeform-binding'
import { SelfBuiltAdapter } from '@cys-stift/canvas-engine'
import { canvasViewStore } from '@/lib/canvas-view-store'
import { screenToPage } from '@cys-stift/canvas-engine'
import { measureText, textEditKeyAction } from '@cys-stift/canvas-engine'
import { readToken } from '@cys-stift/canvas-engine'
import { useI18n } from '@/lib/i18n'

/** 浮动 textarea 编辑会话:屏幕锚点(textarea 定位)+ 页锚点(text 元素落点)。 */
interface EditSession {
  screenX: number
  screenY: number
  pageX: number
  pageY: number
}

export interface SelfCanvasHandle {
  adapter: SelfBuiltAdapter | null
}

export function SelfCanvas({
  canvasId,
  service,
  tool,
  onOpenCard,
  adapterRef,
  canvasElRef,
  onAdapterReady,
}: {
  canvasId: CanvasId
  service: CardService
  /** 当前工具(page 持有)。切离 'text' 时收起编辑中的 textarea。 */
  tool: 'select' | 'freedraw' | 'text' | 'connect'
  onOpenCard: (card: Card) => void
  adapterRef: React.MutableRefObject<SelfCanvasHandle>
  /** Page-supplied ref so the RelationPanel can read the canvas rect for
   *  positioning (子4: panel floats above selected arrow, needs screen coords). */
  canvasElRef?: React.MutableRefObject<HTMLCanvasElement | null>
  /**
   * 通知 page adapter 已就绪 / 已卸载。ref 赋值不会触发 re-render,所以
   *  page 必须靠这个回调把 adapter 抬进 state,渲染输出才能反映就绪态
   *  (toolbar 启用 / RelationPanel·FreedrawPanel·Minimap 挂载)。冷启动和
   *  每次切画布(key=canvasId 重建)都会经过 null → adapter 的转换。
   */
  onAdapterReady?: (adapter: SelfBuiltAdapter | null) => void
}) {
  const innerCanvasRef = useRef<HTMLCanvasElement>(null)
  const adapterInner = useRef<SelfBuiltAdapter | null>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  // 防 commit 竞态:Ctrl+Enter 后 textarea 卸载触发 onBlur 双提交。
  const committedRef = useRef(false)
  const [edit, setEdit] = useState<EditSession | null>(null)
  const [textValue, setTextValue] = useState('')
  // Bug 7: mirror the in-progress edit state into refs so an unmount cleanup
  // (canvas switch) can commit the latest typed text. `commitEdit` reads
  // component state, but on unmount React captures the last-render values —
  // these refs always hold the freshest edit + value for the cleanup path.
  const editRef = useRef<EditSession | null>(null)
  const textValueRef = useRef('')
  editRef.current = edit
  textValueRef.current = textValue
  const { t } = useI18n()

  useEffect(() => {
    const canvas = innerCanvasRef.current
    if (canvas) {
      if (canvasElRef) canvasElRef.current = canvas
    }
    if (!canvas) return
    const adapter = new SelfBuiltAdapter(canvas, {
      getCardInfo: (id) => {
        const c = service.get(id as never)
        return c ? { title: c.title, body: c.body ?? '', type: c.type, pinned: c.pinned } : null
      },
    })
    adapterInner.current = adapter
    adapterRef.current = { adapter }
    onAdapterReady?.(adapter)

    // 视图持久化:先应用存的 view,再订阅变更写回。
    const view = canvasViewStore.get(canvasId)
    adapter.setView({ panX: view.panX, panY: view.panY, zoom: view.zoom, gridMode: view.gridMode })

    loadCardsIntoEditor(adapter, service, canvasId)
    // freeform 元素(text/freedraw/arrow/rect)持久化:load 恢复 + 用户改动 debounce 写回。
    // card 几何不在此(走 bindCardWriteback → DB,单一可信源)。须在 loadCardsIntoEditor
    // 之后 attach,以便 restore 时能跳过同 id 的 card。
    const unbindFreeform = attachCanvasFreeformPersistence(adapter, canvasId)
    const unbind = bindCardWriteback(adapter, service, canvasId)

    // 视图持久化:onViewChange + 500ms debounce 写 canvasViewStore(替代轮询)。
    let viewTimer: ReturnType<typeof setTimeout> | null = null
    const unbindView = adapter.onViewChange(() => {
      if (viewTimer) clearTimeout(viewTimer)
      viewTimer = setTimeout(() => {
        const v = adapter.getView()
        canvasViewStore.update(canvasId, {
          zoom: v.zoom,
          panX: v.panX,
          panY: v.panY,
          gridMode: v.gridMode,
        })
      }, 500)
    })

    return () => {
      if (viewTimer) {
        clearTimeout(viewTimer)
        const v = adapter.getView()
        canvasViewStore.update(canvasId, {
          zoom: v.zoom,
          panX: v.panX,
          panY: v.panY,
          gridMode: v.gridMode,
        })
      }
      unbindView()
      unbindFreeform()
      unbind()
      adapter.detach()
      adapterInner.current = null
      adapterRef.current = { adapter: null }
      onAdapterReady?.(null)
      if (canvasElRef) canvasElRef.current = null
    }
  }, [canvasId, service, adapterRef])

  // 双击开卡:select 模式下 dblclick 命中卡元素 → onOpenCard。
  const onDoubleClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const adapter = adapterInner.current
    const canvas = innerCanvasRef.current
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
    // 未命中卡片:选中箭头时双击 → 加折点(elbow 未满)/ 重置直线(否则)。
    adapter.doubleClickArrowAt(p)
  }

  // edit 会话出现时 focus textarea。
  useEffect(() => {
    if (edit) textareaRef.current?.focus()
  }, [edit])

  // 切离 text 工具:收起编辑中的 textarea(blur 会触发 commit)。
  useEffect(() => {
    if (tool !== 'text') {
      setEdit(null)
      setTextValue('')
    }
  }, [tool])

  // Text 工具下点击 canvas:在落点放浮动 textarea。
  const onCanvasClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (tool !== 'text') return
    const canvas = innerCanvasRef.current
    const adapter = adapterInner.current
    if (!canvas || !adapter) return
    const rect = canvas.getBoundingClientRect()
    const sx = e.clientX - rect.left
    const sy = e.clientY - rect.top
    const view = adapter.getView()
    const p = screenToPage(view, sx, sy)
    setEdit({ screenX: sx, screenY: sy, pageX: Math.round(p.x), pageY: Math.round(p.y) })
    setTextValue('')
    committedRef.current = false // 新 edit session,重置 commit 守卫
  }

  const cancelEdit = () => {
    committedRef.current = true // 标记已结束,防后续 onBlur 误 commit
    setEdit(null)
    setTextValue('')
  }

  const commitEdit = () => {
    if (committedRef.current) return // 已 commit/cancel(防 onBlur + Ctrl+Enter 双触发)
    committedRef.current = true
    // Read from refs (not state) so this stays safe when called from an
    // unmount cleanup, where the closure would otherwise capture stale state.
    const v = textValueRef.current.trim()
    const curEdit = editRef.current
    const adapter = adapterInner.current
    const canvas = innerCanvasRef.current
    if (v && curEdit && adapter && canvas) {
      const ctx = canvas.getContext('2d')
      if (ctx) {
        const font = `14px ${readToken('--font-body', 'Inter, sans-serif')}`
        const { w, h } = measureText(v, ctx, font, 18)
        const id =
          'text-' +
          (typeof crypto !== 'undefined' && 'randomUUID' in crypto
            ? crypto.randomUUID()
            : Math.random().toString(36).slice(2))
        adapter.upsert({ id, kind: 'text', x: curEdit.pageX, y: curEdit.pageY, w, h, rotation: 0, text: v, color: 'black' })
      }
    }
    setEdit(null)
    setTextValue('')
  }

  // Bug 7: if the component unmounts mid-edit (canvas switch), commitEdit is
  // never called → in-progress typed text is silently dropped. Commit any
  // pending text in the cleanup. committedRef prevents double-commit if the
  // textarea's onBlur also fires during teardown.
  useEffect(() => {
    return () => {
      if (editRef.current && !committedRef.current) {
        commitEdit()
      }
    }
  }, [])

  return (
    <>
      <canvas
        ref={innerCanvasRef}
        onClick={onCanvasClick}
        onDoubleClick={onDoubleClick}
        role="img"
        aria-label={t('canvas.srLabel')}
        style={{ width: '100%', height: '100%', display: 'block', touchAction: 'none' }}
      />
      {edit && (
        <textarea
          ref={textareaRef}
          value={textValue}
          onChange={(e) => setTextValue(e.target.value)}
          onKeyDown={(e) => {
            // 用 nativeEvent(真实 DOM KeyboardEvent,含 isComposing)以通过 IME 组合态守卫;
            // React 的 KeyboardEvent 类型未声明 isComposing,故传原生事件。
            const a = textEditKeyAction(e.nativeEvent)
            if (a === 'cancel') {
              e.preventDefault()
              cancelEdit()
            } else if (a === 'commit') {
              e.preventDefault()
              commitEdit()
            }
          }}
          onBlur={commitEdit}
          style={{
            position: 'absolute',
            left: edit.screenX,
            top: edit.screenY,
            fontFamily: 'var(--font-body)',
            fontSize: '14px',
            lineHeight: '18px',
            color: 'var(--color-black)',
            background: 'var(--color-white)',
            border: 'var(--border-hairline)',
            padding: '2px',
            margin: 0,
            resize: 'none',
            minWidth: '120px',
            minHeight: '18px',
            zIndex: 20,
          }}
        />
      )}
    </>
  )
}
