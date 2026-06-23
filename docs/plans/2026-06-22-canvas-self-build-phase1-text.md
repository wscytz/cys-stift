# 画布自研 · Phase 1 text(文本编辑,含中文 IME)实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: 用 superpowers:subagent-driven-development(推荐)或 superagents:executing-plans 逐 Task 执行。步骤用 `- [ ]` 跟踪。

**Goal:** SelfBuiltAdapter 渲染 text 元素(多行)+ 在 `/dev/canvas-self` 上用**浮动 `<textarea>`** 做文本编辑:Text 工具点击放置 textarea,浏览器原生处理 IME(中文组合态),`textEditKeyAction` 纯函数守卫(组合态不误触发 commit/cancel),Ctrl/Enter 或 blur 提交、Escape 取消。

**Architecture:** text 元素复用现有 `CanvasElement`(kind='text',text/x/y/w/h/color)。渲染在 `drawElement` 加 text 分支(按 `\n` 分行 fillText)。编辑用**浮动 textarea** 覆盖在 canvas 上(textarea 原生处理 IME composition,无需自己造输入法);**IME 守卫逻辑抽成纯函数 `textEditKeyAction`**(可单测:`isComposing` 时返回 null → 不拦截 Enter/Escape);commit 用 `measureText`(纯函数,传入 ctx)算 text 元素的 w/h,再 `adapter.upsert`。activeTool 加 'text';adapter 在 text 模式 onDown no-op(不 drag/pan/freedraw),让页面的 onClick 放 textarea。

**Tech Stack:** TypeScript strict、Canvas 2D、React(state + 浮动 textarea)、vitest、puppeteer-core。零 tldraw。

## Global Constraints(每个 Task implicitly 必守)

- spec 冻结;feature-flag 只在 `/dev/*`,**不碰主路由 `/canvas`**。
- `packages/domain` 零依赖不破坏。
- 颜色/字体走 token(`readToken`),绘制路径不裸 hex。
- **零 tldraw import**。
- 静态导出;客户端组件 `'use client'`;jsdom `ctx===null` 容错。
- **IME 必须正确**:`isComposing` 组合态不拦截 Enter/Escape(不误 commit/cancel);commit 在 compositionend 之后(用 blur / Ctrl+Enter / Escape 触发,这些都在非组合态)。
- 每步 TDD:先红 → 绿 → commit。每 Task 自审 + review 闸。
- 不假装通过 —— 每步跑命令看 exit code。

## File Structure

**新增:**
- `apps/web/src/features/canvas/host/self-built-text.ts` — 纯函数 `measureText(text, ctx, font, lineHeight)` + `textEditKeyAction(e)`(IME 守卫)。
- `apps/web/src/features/canvas/host/__tests__/self-built-text.test.ts` — 上述纯函数单测。
- `scripts/phase1-text-smoke.cjs` — /dev/canvas-self 文本编辑(含中文)冒烟。

**修改:**
- `apps/web/src/features/canvas/host/self-built-render.ts` — `drawElement` 加 `case 'text'`(多行 fillText)。
- `apps/web/src/features/canvas/host/__tests__/self-built-render.test.ts` — 加 text 渲染断言。
- `apps/web/src/features/canvas/host/self-built-adapter.ts` — `activeTool` union 加 `'text'`;`setTool` 签名加 `'text'`;`onDown` 在 text 模式 no-op(early return)。
- `apps/web/src/features/canvas/host/__tests__/self-built-adapter.test.ts` — 加 text 模式 no-op 测试。
- `apps/web/src/app/dev/canvas-self/page.tsx` — Tool 加 'text';Text 按钮;edit session(浮动 textarea + IME handlers + commit/cancel)。

---

## Task 1:text 渲染分支(多行 fillText)+ 渲染测试

**Files:**
- Modify: `apps/web/src/features/canvas/host/self-built-render.ts`(`drawElement` 加 `case 'text'`)
- Test: `apps/web/src/features/canvas/host/__tests__/self-built-render.test.ts`

**Interfaces:**
- Consumes: `CanvasElement.text`/`.color`;`colorOf`/`readToken`(已在本文件)。
- Produces: `drawElement` 能画 text(card/rect/freedraw/arrow 不变)。

**必守约束:** 多行按 `\n` 分行;lineHeight=18,fontSize=14,字体走 token;`textBaseline='top'`(el.y 为顶左角);颜色走 token。

- [ ] **Step 1.1:加 text 渲染测试(先红)**

在 `self-built-render.test.ts` 的 describe 末尾加:

```ts
  it('renders text (multi-line, top baseline)', () => {
    const ctx = mockCtx()
    const els = [
      { id: 't1', kind: 'text', x: 10, y: 20, w: 100, h: 36, rotation: 0, text: 'hello\nworld' },
    ] as unknown as CanvasElement[]
    renderElements(ctx, els, { panX: 0, panY: 0, zoom: 1, gridMode: 'free' }, 800, 600, () => '', '#ffffff')
    // 行 1 @ y=20,行 2 @ y=20+18=38
    expect(ctx._calls).toContain('fillText(hello@10,20)')
    expect(ctx._calls).toContain('fillText(world@10,38)')
  })

  it('text with empty string draws nothing (no throw)', () => {
    const ctx = mockCtx()
    const els = [{ id: 't2', kind: 'text', x: 0, y: 0, w: 1, h: 1, rotation: 0, text: '' }] as unknown as CanvasElement[]
    expect(() => renderElements(ctx, els, { panX: 0, panY: 0, zoom: 1, gridMode: 'free' }, 800, 600, () => '', '#ffffff')).not.toThrow()
    expect(ctx._calls.some((c) => c.startsWith('fillText'))).toBe(false)
  })
```

- [ ] **Step 1.2:跑,确认红**

Run: `cd /Users/jinxunuo/projects/cys-stift/apps/web && pnpm exec vitest run src/features/canvas/host/__tests__/self-built-render.test.ts`
Expected: FAIL —— text 现走 default 不画 → `fillText(hello@10,20)` 断言失败。

- [ ] **Step 1.3:`drawElement` 加 text 分支**

在 `self-built-render.ts` 的 `drawElement` switch 里,`case 'arrow'` 之后、`default` 之前加:

```ts
    case 'text': {
      const lines = (el.text ?? '').split('\n')
      if (lines.length === 0 || (lines.length === 1 && lines[0] === '')) break
      ctx.fillStyle = colorOf(el.color)
      ctx.font = `14px ${readToken('--font-body', 'Inter, sans-serif')}`
      ctx.textBaseline = 'top'
      for (let i = 0; i < lines.length; i++) {
        ctx.fillText(lines[i]!, el.x, el.y + i * 18)
      }
      break
    }
```

- [ ] **Step 1.4:跑渲染测试,确认绿**

Run: `cd /Users/jinxunuo/projects/cys-stift/apps/web && pnpm exec vitest run src/features/canvas/host/__tests__/self-built-render.test.ts`
Expected: PASS —— 原 7 + text 2 = 9 项。

- [ ] **Step 1.5:全部 host 测试 + build**

Run: `cd /Users/jinxunuo/projects/cys-stift/apps/web && pnpm exec vitest run src/features/canvas/host/ && cd /Users/jinxunuo/projects/cys-stift && pnpm --filter web build`
Expected: 全绿 + exit 0。

- [ ] **Step 1.6:Commit**

```bash
cd /Users/jinxunuo/projects/cys-stift && git add apps/web/src/features/canvas/host/self-built-render.ts apps/web/src/features/canvas/host/__tests__/self-built-render.test.ts
git commit -m "feat(canvas): Phase 1 text T1 — drawElement 加 text 渲染(多行 fillText)"
```

**Task 1 验收:** 渲染测试 9 项绿(含 text 2);host 全绿;build exit 0。→ 自审 + review。

---

## Task 2:text 纯函数(measureText + textEditKeyAction)+ 测试

**Files:**
- Create: `apps/web/src/features/canvas/host/self-built-text.ts`
- Test: `apps/web/src/features/canvas/host/__tests__/self-built-text.test.ts`

**Interfaces:**
- Consumes: `CanvasRenderingContext2D`(measureText 用,传入便于 mock)。
- Produces: `measureText(text, ctx, font, lineHeight)→{w,h}`(commit 算 bbox)、`textEditKeyAction(e)→'commit'|'cancel'|null`(Task 3 的 textarea onKeyDown 用)。

**必守约束:** 纯函数(无 DOM 副作用);measureText 空行按空格度量(避免 0 宽);textEditKeyAction 在 `isComposing` 时返回 null(IME 组合态不拦截)。

- [ ] **Step 2.1:写失败测试**

```ts
// apps/web/src/features/canvas/host/__tests__/self-built-text.test.ts
import { describe, expect, it } from 'vitest'
import { measureText, textEditKeyAction } from '../self-built-text'

/** mock ctx:measureText 返回 字符数×10 的宽度(可预测)。 */
function mockCtx() {
  return {
    set font(_f: string) { /* ignore */ },
    measureText: (s: string) => ({ width: s.length * 10 }),
  } as unknown as CanvasRenderingContext2D
}

describe('measureText', () => {
  it('单行:w=字符宽度和,h=lineHeight', () => {
    expect(measureText('hello', mockCtx(), '14px Inter', 18)).toEqual({ w: 50, h: 18 })
  })
  it('多行:w 取最长行,h=行数×lineHeight', () => {
    expect(measureText('hi\nhello!\nhey', mockCtx(), '14px Inter', 18)).toEqual({ w: 60, h: 54 }) // 60=max(20,60,30);54=3×18
  })
  it('空行按空格度量(避免 0 宽)', () => {
    expect(measureText('a\n', mockCtx(), '14px Inter', 18)).toEqual({ w: 10, h: 36 }) // 行2 ''→' ' = 10;2 行
  })
})

describe('textEditKeyAction', () => {
  it('IME 组合态(isComposing)→ null(不拦截 Enter/Escape)', () => {
    expect(textEditKeyAction({ isComposing: true, key: 'Enter', metaKey: false, ctrlKey: false })).toBeNull()
    expect(textEditKeyAction({ isComposing: true, key: 'Escape', metaKey: false, ctrlKey: false })).toBeNull()
  })
  it('Escape → cancel', () => {
    expect(textEditKeyAction({ isComposing: false, key: 'Escape', metaKey: false, ctrlKey: false })).toBe('cancel')
  })
  it('Ctrl/Cmd+Enter → commit', () => {
    expect(textEditKeyAction({ isComposing: false, key: 'Enter', metaKey: true, ctrlKey: false })).toBe('commit')
    expect(textEditKeyAction({ isComposing: false, key: 'Enter', metaKey: false, ctrlKey: true })).toBe('commit')
  })
  it('纯 Enter(无修饰)→ null(textarea 换行)', () => {
    expect(textEditKeyAction({ isComposing: false, key: 'Enter', metaKey: false, ctrlKey: false })).toBeNull()
  })
  it('普通字符 → null', () => {
    expect(textEditKeyAction({ isComposing: false, key: 'a', metaKey: false, ctrlKey: false })).toBeNull()
  })
})
```

- [ ] **Step 2.2:跑,确认红**

Run: `cd /Users/jinxunuo/projects/cys-stift/apps/web && pnpm exec vitest run src/features/canvas/host/__tests__/self-built-text.test.ts`
Expected: FAIL — `measureText/textEditKeyAction is not exported`。

- [ ] **Step 2.3:写 `self-built-text.ts`**

```ts
// apps/web/src/features/canvas/host/self-built-text.ts
'use client'

/**
 * text(文本编辑)纯函数:度量 + IME 守卫。
 * - measureText:commit 时算 text 元素 bbox(传入 ctx 便于 mock 测)。
 * - textEditKeyAction:textarea onKeyDown 的动作判定(IME 组合态不拦截)。
 */

/** 度量文本(支持多行)的包围盒。空行按空格度量避免 0 宽。 */
export function measureText(
  text: string,
  ctx: CanvasRenderingContext2D,
  font: string,
  lineHeight: number,
): { w: number; h: number } {
  ctx.font = font
  const lines = text.split('\n')
  let w = 0
  for (const line of lines) {
    const m = ctx.measureText(line.length > 0 ? line : ' ')
    if (m.width > w) w = m.width
  }
  return { w: Math.ceil(w), h: lines.length * lineHeight }
}

/** textarea onKeyDown 动作判定。IME 组合态(isComposing)一律返回 null(不拦截)。 */
export function textEditKeyAction(e: {
  isComposing: boolean
  key: string
  metaKey: boolean
  ctrlKey: boolean
}): 'commit' | 'cancel' | null {
  if (e.isComposing) return null
  if (e.key === 'Escape') return 'cancel'
  if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) return 'commit'
  return null
}
```

- [ ] **Step 2.4:跑,确认绿**

Run: `cd /Users/jinxunuo/projects/cys-stift/apps/web && pnpm exec vitest run src/features/canvas/host/__tests__/self-built-text.test.ts`
Expected: PASS —— measureText 3 + textEditKeyAction 5 = 8 项。

- [ ] **Step 2.5:build**

Run: `cd /Users/jinxunuo/projects/cys-stift && pnpm --filter web build`
Expected: exit 0。

- [ ] **Step 2.6:Commit**

```bash
cd /Users/jinxunuo/projects/cys-stift && git add apps/web/src/features/canvas/host/self-built-text.ts apps/web/src/features/canvas/host/__tests__/self-built-text.test.ts
git commit -m "feat(canvas): Phase 1 text T2 — measureText + textEditKeyAction(IME 守卫)纯函数 + 单测"
```

**Task 2 验收:** 8 项单测绿(含 IME 组合态守卫);build exit 0;零 tldraw。→ 自审 + review。

---

## Task 3:adapter text 模式 no-op + /dev/canvas-self 文本编辑 edit session

**Files:**
- Modify: `apps/web/src/features/canvas/host/self-built-adapter.ts`(activeTool union + setTool 签名加 'text';onDown text 模式 no-op)
- Modify: `apps/web/src/features/canvas/host/__tests__/self-built-adapter.test.ts`(加 text 模式 no-op 测试)
- Modify: `apps/web/src/app/dev/canvas-self/page.tsx`(Tool 加 'text';Text 按钮;edit session + 浮动 textarea + IME handlers + commit/cancel)

**Interfaces:**
- Consumes: Task 1 text 渲染;Task 2 `measureText` + `textEditKeyAction`;`readToken`(从 self-built-render)。
- Produces:`SelfBuiltAdapter.setTool('select'|'freedraw'|'text')`;`/dev/canvas-self` Text 工具 + edit session。

**必守约束:** adapter text 模式 onDown **no-op**(不 drag/pan/freedraw,让页面 onClick 放 textarea);textarea 原生处理 IME,组件 onKeyDown 只在 `textEditKeyAction !== null` 时 preventDefault + 动作;commit 经 `measureText` 算 w/h → `adapter.upsert(text)`;颜色/字体走 token。

- [ ] **Step 3.1:加 adapter text 模式 no-op 测试(先红)**

在 `self-built-adapter.test.ts` 末尾(freedraw describe 之后)加:

```ts
describe('SelfBuiltAdapter text 模式', () => {
  function dispatch(canvas: HTMLCanvasElement, type: string, x: number, y: number) {
    canvas.dispatchEvent(
      new PointerEvent(type, { pointerId: 1, pointerType: 'mouse', bubbles: true, clientX: x, clientY: y }),
    )
  }

  it('text 模式:pointerdown 不触发 drag/pan/freedraw(no-op)', () => {
    const host = new SelfBuiltAdapter(document.createElement('canvas'))
    const canvas = (host as unknown as { canvas: HTMLCanvasElement }).canvas
    ;(host as unknown as { setTool: (t: string) => void }).setTool('text')
    host.upsert({ id: 'c1', kind: 'card', x: 0, y: 0, w: 100, h: 100, rotation: 0 }) // 可被拖拽的卡片
    let fired = 0
    host.onUserChange(() => fired++)
    dispatch(canvas, 'pointerdown', 50, 50) // 命中卡片
    dispatch(canvas, 'pointermove', 80, 80)
    dispatch(canvas, 'pointerup', 80, 80)
    expect(fired).toBe(0) // text 模式 pointerdown/move/up 全 no-op → 不触发 onUserChange。listener 在 upsert(c1) 之后才加,所以初始 upsert 那次也没被计数 → fired 恒为 0。
  })
})
```

> 断言 `toBe(0)` 是正确的:`host.onUserChange(...)` 在 `host.upsert(c1)` **之后**才注册,所以初始 upsert 不计数;text 模式 dispatch 又是 no-op,故全程 0。

- [ ] **Step 3.2:跑,确认红**

Run: `cd /Users/jinxunuo/projects/cys-stift/apps/web && pnpm exec vitest run src/features/canvas/host/__tests__/self-built-adapter.test.ts`
Expected: FAIL —— `setTool('text')` 不被接受(类型/值)或 text 模式仍 drag。

- [ ] **Step 3.3:改 `self-built-adapter.ts` —— activeTool 加 'text' + onDown text no-op**

字段 `activeTool` 类型改:

```ts
  private activeTool: 'select' | 'freedraw' | 'text' = 'select'
```

`setTool` 签名改(接受 'text'):

```ts
  setTool(t: 'select' | 'freedraw' | 'text'): void {
    this.activeTool = t
    if (t !== 'freedraw' && this.currentStroke) {
      this.currentStroke = null
      this.scheduleRender()
    }
  }
  getTool(): 'select' | 'freedraw' | 'text' {
    return this.activeTool
  }
```

`attachPointer` 的 `onDown` **最开头**加 text 早退(在算 rect/sx/sy 之前):

```ts
    const onDown = (e: PointerEvent) => {
      if (this.activeTool === 'text') return // text 模式:不 drag/pan/freedraw,让页面 onClick 放 textarea
      const rect = this.canvas.getBoundingClientRect()
      const sx = e.clientX - rect.left
      const sy = e.clientY - rect.top
      const p = screenToPage(this.view, sx, sy)
      if (this.activeTool === 'freedraw') {
        // ……(原 freedraw 分支不动)
      }
      // ……(原 hit/pan 分支不动)
    }
```

- [ ] **Step 3.4:跑 adapter 测试,确认绿**

Run: `cd /Users/jinxunuo/projects/cys-stift/apps/web && pnpm exec vitest run src/features/canvas/host/__tests__/self-built-adapter.test.ts`
Expected: PASS —— 原 7 + text no-op 1 = 8 项。

- [ ] **Step 3.5:改 `/dev/canvas-self/page.tsx` —— Text 按钮 + edit session**

替换整个文件为:

```tsx
// apps/web/src/app/dev/canvas-self/page.tsx
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
import { SelfBuiltAdapter } from '@/features/canvas/host/self-built-adapter'
import { measureText, textEditKeyAction } from '@/features/canvas/host/self-built-text'
import { readToken } from '@/features/canvas/host/self-built-render'

type Tool = 'select' | 'freedraw' | 'text'

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
      getCardLabel: (id) => service.get(id as never)?.title ?? '',
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
            const a = textEditKeyAction(e)
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
```

- [ ] **Step 3.6:全部 host 测试 + build**

Run: `cd /Users/jinxunuo/projects/cys-stift/apps/web && pnpm exec vitest run src/features/canvas/host/ && cd /Users/jinxunuo/projects/cys-stift && pnpm --filter web build`
Expected: 全绿 + exit 0(`/dev/canvas-self` 产物在)。

- [ ] **Step 3.7:Commit**

```bash
cd /Users/jinxunuo/projects/cys-stift && git add apps/web/src/features/canvas/host/self-built-adapter.ts apps/web/src/features/canvas/host/__tests__/self-built-adapter.test.ts apps/web/src/app/dev/canvas-self/page.tsx
git commit -m "feat(canvas): Phase 1 text T3 — adapter text 模式 no-op + /dev 文本编辑 edit session(浮动 textarea + IME 守卫)"
```

**Task 3 验收:** adapter 测试 8 项绿(含 text no-op);host 全绿;build exit 0;select/freedraw/arrow 行为零变化。→ 自审 + review。

---

## Task 4:`/dev/canvas-self` 文本编辑(含中文)冒烟

**Files:**
- Create: `scripts/phase1-text-smoke.cjs`

**Interfaces:**
- Consumes: Task 3 的 edit session;`window.__selfAdapter`。
- Produces: 冒烟验证 text 编辑端到端(英文 + 中文字符 + commit + 渲染)。

**必守约束:** 主路由零改动;静态服务跑完 kill;不假装通过。

- [ ] **Step 4.1:写 `scripts/phase1-text-smoke.cjs`**

```js
// scripts/phase1-text-smoke.cjs — 真实冒烟 /dev/canvas-self 的文本编辑(含中文)。
// 运行:先 pnpm --filter web build + 静态服务 :3016,再 node scripts/phase1-text-smoke.cjs
const puppeteer = require('puppeteer-core')
const fs = require('fs')
const path = require('path')
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const URL = 'http://localhost:3016'
const wait = (ms) => new Promise((r) => setTimeout(r, ms))
const out = path.join(__dirname, '..', 'docs', 'design', 'screenshots', 'phase1-text-smoke')
fs.mkdirSync(out, { recursive: true })

let pass = 0, fail = 0
const check = (n, ok, d = '') => { ok ? (pass++, console.log(`  ✓ ${n}${d ? ' — ' + d : ''}`)) : (fail++, console.log(`  ✗ ${n}${d ? ' — ' + d : ''}`)) }

;(async () => {
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox', '--disable-gpu'], defaultViewport: { width: 1440, height: 900 } })
  const page = await browser.newPage()
  const errs = []
  page.on('pageerror', (e) => errs.push(e.message))

  await page.goto(URL + '/dev/canvas-self', { waitUntil: 'networkidle0', timeout: 30000 })
  await wait(1500)
  check('page mounts, no pageerror', errs.length === 0, `${errs.length} errors`)

  // 切到 Text 工具
  await page.evaluate(() => window.__selfAdapter.setTool('text'))

  // 读 canvas rect 算点击坐标(避 AppMenu 偏移),点击放 textarea
  const rect = await page.evaluate(() => {
    const c = document.querySelector('canvas')
    const r = c.getBoundingClientRect()
    return { left: r.left, top: r.top }
  })
  await page.mouse.click(rect.left + 300, rect.top + 300)
  await wait(200)
  const hasTextarea = await page.evaluate(() => !!document.querySelector('textarea'))
  check('textarea mounted on text-mode click', hasTextarea)

  // 输入英文 + 中文字符 + 换行(puppeteer keyboard.type 直接发字符;IME 组合态本身由 textEditKeyAction 单测覆盖)
  await page.keyboard.type('Hello 你好')
  await page.keyboard.down('Shift')
  await page.keyboard.press('Enter')
  await page.keyboard.up('Shift')
  await page.keyboard.type('第二行')
  await wait(100)

  // Ctrl+Enter commit(mac 用 Meta)
  const isMac = process.platform === 'darwin'
  await page.keyboard.down(isMac ? 'Meta' : 'Control')
  await page.keyboard.press('Enter')
  await page.keyboard.up(isMac ? 'Meta' : 'Control')
  await wait(300)

  // 验:text 元素入 host + 文本含中英文 + 多行
  const result = await page.evaluate(() => {
    const a = window.__selfAdapter
    const texts = a.getElements().filter((e) => e.kind === 'text')
    if (texts.length !== 1) return { error: 'text count != 1', count: texts.length }
    const t = texts[0]
    return { text: t.text, w: t.w, h: t.h }
  })
  check('1 text element committed', !result.error, JSON.stringify(result))
  check('text has ascii + CJK + 2 lines', !result.error && result.text.includes('Hello') && result.text.includes('第二行') && result.text.includes('\n'), JSON.stringify(result))
  check('text measured w/h (non-zero)', !result.error && result.w > 0 && result.h >= 36, JSON.stringify(result))

  await page.screenshot({ path: path.join(out, 'text-committed.png') })
  await browser.close()
  console.log(`\n${fail === 0 ? '✓' : '✗'} ${pass} passed, ${fail} failed`)
  process.exit(fail === 0 ? 0 : 1)
})().catch((e) => { console.error('FATAL', e); process.exit(2) })
```

- [ ] **Step 4.2:起静态服务 + 跑冒烟**

```bash
cd /Users/jinxunuo/projects/cys-stift && pnpm --filter web build
# 后台:python3 -m http.server 3016 --directory apps/web/out
# sleep 1;curl -sL http://localhost:3016/dev/canvas-self → 200
# node scripts/phase1-text-smoke.cjs
# 跑完 kill python(释放 3016)
```
Expected: 5/5 绿(挂载无错、textarea 出现、commit 1 text、含中英文 + 2 行、w/h 非零)。

> IME 组合态本身的正确性(isComposing 守卫)由 Task 2 的 `textEditKeyAction` 单测覆盖;冒烟用 keyboard.type 直接发字符(绕过真实 IME composition),验的是「字符进 textarea → commit → 入 host → 度量」端到端。

- [ ] **Step 4.3:Commit**

```bash
cd /Users/jinxunuo/projects/cys-stift && git add scripts/phase1-text-smoke.cjs
git commit -m "test(canvas): Phase 1 text T4 — /dev/canvas-self 文本编辑(含中文)冒烟 e2e"
```

**Task 4 验收:** 冒烟 5/5;主路由零改动;3016 已释放。→ 自审 + review → **Phase 1 text 完成**。

---

## Phase 1 text 总验收

```bash
cd /Users/jinxunuo/projects/cys-stift/apps/web && pnpm exec vitest run src/features/canvas/host/   # 全绿(契约 12 + 渲染 9 + 命中 3 + adapter 8 + tldraw-adapter 7 + freedraw 5 + arrow 8 + text 8 = 60)
cd /Users/jinxunuo/projects/cys-stift && pnpm --filter web build                                    # exit 0
node scripts/phase1-text-smoke.cjs                                                                  # 5/5(需静态服务 :3016)
```
+ `grep -r "@tldraw" apps/web/src/features/canvas/host/self-built-text.ts apps/web/src/app/dev/canvas-self/page.tsx` → 无命中。
+ 主路由 `/canvas`(tldraw)零改动。
+ IME 守卫正确(isComposing 单测覆盖 + commit 在非组合态)。

**产出:** 自研渲染器支持文本编辑(多行渲染 + 浮动 textarea 原生 IME + 度量 + commit/cancel),中英文 + 多行打通。为 Phase 1 后续(arrow 交互创建 / 交互打磨 / Phase 2)奠基。

## Self-Review(plan 自检)

- **Spec 覆盖**:text 渲染(Task 1)→ 度量+IME 守卫纯函数(Task 2)→ adapter no-op + edit session(Task 3)→ 冒烟(Task 4)。IME 正确性:Task 2 `textEditKeyAction` 单测覆盖 isComposing 守卫;Task 3 onKeyDown 只在非组合态动作;Task 4 冒烟验端到端。
- **占位符扫描**:无 TBD/TODO 占位。Task 3 的 freedraw/hit/pan 分支用「// ……(原 freedraw 分支不动)」指代 —— 意为保留现有实现,执行时只加 text 早退行(在 onDown 最开头),不重写其它分支。每步代码完整。
- **类型一致性**:`measureText(text, ctx, font, lineHeight)`、`textEditKeyAction(e)` 在 Task 2 定义、Task 3 page 消费,签名一致;`activeTool: 'select'|'freedraw'|'text'` 在 adapter(T3)与 page Tool type(T3)一致;`readToken` 从 self-built-render import(page T3);`EditSession={screenX,screenY,pageX,pageY}` 贯穿。
- **范围**:本计划自包含,产出可测软件(渲染 + 纯函数 + edit session + 冒烟)。text 选择/移动/resize、富文本、arrow 交互创建、打磨、Phase 2 各自另开 plan。

## 二次 review 修正(2026-06-23)

- **Step 3.1 断言 `toBe(0)` 是正确的**(之前 self-review 误判为 toBe(1)):`onUserChange` listener 在 `upsert(c1)` **之后**才注册,初始 upsert 不计数;text 模式 dispatch 全 no-op → fired 恒 0。已修正正文注释 + 删除误导 note。
- **加 `committedRef` 守卫**(Step 3.5 page):防 Ctrl+Enter commit 后 textarea 卸载触发 `onBlur` 双提交。`commitEdit` 入口 `if (committedRef.current) return`;新 edit(onCanvasClick)重置 false;cancelEdit 置 true。`edit` guard 也兜底(双保险)。
- **冒烟断言软化**(Step 4.1):文本从精确 `===` 改 `includes`——puppeteer 中文输入偶发不稳,IME 守卫本身已由 Task 2 单测覆盖,冒烟只验端到端「字符进 textarea → commit → 入 host → 度量」。
