'use client'

/**
 * Phase 1 dev 挂载页 — SelfBuiltAdapter(Canvas 2D)与主画布(tldraw)并存验证。
 * 复用 Phase 0 的 canvas-binding(host 无关)。Select/Draw/Text 工具。
 * text 编辑(本计划):Text 模式点击放浮动 textarea,原生 IME,textEditKeyAction 守卫,
 * Ctrl/Enter 或 blur 提交、Escape 取消。
 */
import { useEffect, useRef, useState } from 'react'
import { useDb } from '@/lib/db-client'
import { DEFAULT_CANVAS_ID } from '@/features/canvas/default-canvas'
import { loadCardsIntoEditor, bindCardWriteback } from '@/features/canvas/canvas-binding'
import { SelfBuiltAdapter } from '@cys-stift/canvas-engine'
import { measureText, textEditKeyAction } from '@cys-stift/canvas-engine'
import { readToken } from '@cys-stift/canvas-engine'

type Tool = 'select' | 'freedraw' | 'text' | 'connect'

interface EditSession {
  screenX: number
  screenY: number
  pageX: number
  pageY: number
}

export default function CanvasSelfPage() {
  const { service } = useDb()
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const adapterRef = useRef<SelfBuiltAdapter | null>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const committedRef = useRef(false) // 防 commit 竞态(Ctrl+Enter 后 textarea 卸载触发 onBlur 双提交)
  const [tool, setTool] = useState<Tool>('select')
  const [edit, setEdit] = useState<EditSession | null>(null)
  const [textValue, setTextValue] = useState('')

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const adapter = new SelfBuiltAdapter(canvas, {
      getCardInfo: (id) => {
        const c = service.get(id as never)
        return c ? { title: c.title, body: c.body ?? '', type: c.type, pinned: c.pinned } : null
      },
    })
    adapterRef.current = adapter
    if (typeof window !== 'undefined') {
      ;(window as unknown as { __selfAdapter?: SelfBuiltAdapter }).__selfAdapter = adapter
    }
    loadCardsIntoEditor(adapter, service, DEFAULT_CANVAS_ID)
    const unbind = bindCardWriteback(adapter, service, DEFAULT_CANVAS_ID)
    return () => {
      unbind()
      adapter.detach()
      adapterRef.current = null
      if (typeof window !== 'undefined') {
        delete (window as unknown as { __selfAdapter?: SelfBuiltAdapter }).__selfAdapter
      }
    }
  }, [service])

  // edit 变化时 focus textarea
  useEffect(() => {
    if (edit) textareaRef.current?.focus()
  }, [edit])

  const switchTool = (t: Tool) => {
    setTool(t)
    adapterRef.current?.setTool(t)
    if (t !== 'text') setEdit(null) // 切离 text 收起 textarea(blur 会触发 commit)
  }

  const onCanvasClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (tool !== 'text') return
    const canvas = canvasRef.current
    if (!canvas) return
    const rect = canvas.getBoundingClientRect()
    const sx = e.clientX - rect.left
    const sy = e.clientY - rect.top
    const view = adapterRef.current?.getView() ?? { panX: 0, panY: 0, zoom: 1 }
    const px = (sx - view.panX) / view.zoom
    const py = (sy - view.panY) / view.zoom
    setEdit({ screenX: sx, screenY: sy, pageX: Math.round(px), pageY: Math.round(py) })
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
    const v = textValue.trim()
    const adapter = adapterRef.current
    const canvas = canvasRef.current
    if (v && edit && adapter && canvas) {
      const ctx = canvas.getContext('2d')
      if (ctx) {
        const font = `14px ${readToken('--font-body', 'Inter, sans-serif')}`
        const { w, h } = measureText(v, ctx, font, 18)
        const id =
          'text-' +
          (typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : Math.random().toString(36).slice(2))
        adapter.upsert({ id, kind: 'text', x: edit.pageX, y: edit.pageY, w, h, rotation: 0, text: v, color: 'black' })
      }
    }
    setEdit(null)
    setTextValue('')
  }

  const btn = (t: Tool, label: string) => (
    <button
      onClick={() => switchTool(t)}
      style={{
        padding: 'var(--space-1) var(--space-2)',
        border: 'var(--border-hairline)',
        background: tool === t ? 'var(--color-black)' : 'var(--color-white)',
        color: tool === t ? 'var(--color-white)' : 'var(--color-black)',
        fontFamily: 'var(--font-mono)',
        fontSize: 'var(--font-size-xs)',
        cursor: 'pointer',
      }}
    >
      {label}
    </button>
  )

  return (
    <div style={{ width: '100vw', height: '100vh', position: 'relative' }}>
      <div style={{ position: 'absolute', top: 'var(--space-2)', left: 'var(--space-2)', display: 'flex', gap: 'var(--space-1)', zIndex: 10 }}>
        {btn('select', 'Select')}
        {btn('freedraw', 'Draw')}
        {btn('text', 'Text')}
        {btn('connect', 'Connect')}
      </div>
      <canvas
        ref={canvasRef}
        onClick={onCanvasClick}
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
    </div>
  )
}
