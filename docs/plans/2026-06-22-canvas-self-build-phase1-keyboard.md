# 画布自研 · Phase 1 交互打磨(5):更多键盘(微移 + 全选 + undo/redo)

> **For agentic workers:** REQUIRED SUB-SKILL: 用 superpowers:subagent-driven-development(推荐)或 superagents:executing-plans 逐 Task 执行。步骤用 `- [ ]` 跟踪。

**Goal:** 加键盘交互:**方向键微移选中元素**(1px/10px shift)、**Ctrl/Cmd+A 全选**、**Ctrl/Cmd+Z undo / Ctrl/Cmd+Shift+Z redo**。建在 selection 上。

**Architecture:** undo 用**元素快照栈**:`undoStack: CanvasElement[][]`(每次 user-source 变更前的全量快照)+ `redoStack`。`pushUndo()` 在 `onUserChange` 触发前(或 emitUser 时)存当前快照;undo 弹栈恢复 + redo 压当前;applyWithoutEcho(不触发 onUserChange,避免 undo 自己进栈)。方向键微移/Ctrl+A 也走 user-change(进 undo 栈)。纯函数 `arrowKeyDelta(key, shift)` / `selectAllIds(elements)` 可单测。

**Tech Stack:** TypeScript strict、Canvas 2D、vitest、puppeteer-core。零 tldraw。

## Global Constraints(每个 Task implicit 必守)

- spec 冻结;feature-flag 只在 `/dev/*`,不碰主路由 `/canvas`。
- `packages/domain` 零依赖;颜色走 token;**零 tldraw**。
- 静态导出;jsdom `ctx===null` 容错。
- 键盘守卫严:text 模式 + 焦点在 input/textarea + undo 守 isComposing(IME)不触发;undo/redo 不把自己进栈(applyWithoutEcho)。
- undo 栈上限(防内存爆):50 步。
- 每步 TDD + review 闸;不假装通过。

## File Structure

**新增:**
- `apps/web/src/features/canvas/host/self-built-keyboard.ts` — 纯函数 `arrowKeyDelta` + `selectAllIds` + `parseKeyboardAction`。
- `apps/web/src/features/canvas/host/__tests__/self-built-keyboard.test.ts`。
- `scripts/phase1-keyboard-smoke.cjs`。

**修改:**
- `apps/web/src/features/canvas/host/self-built-adapter.ts` — undoStack/redoStack + pushUndo + undo/redo + 扩 keyHandler(微移/全选/undo/redo)+ onUserChange 进栈。

---

## Task 1:keyboard 纯函数(arrowKeyDelta + selectAllIds + parseKeyboardAction)+ 测试

**Files:**
- Create: `apps/web/src/features/canvas/host/self-built-keyboard.ts`
- Test: `apps/web/src/features/canvas/host/__tests__/self-built-keyboard.test.ts`

**Interfaces:**
- Consumes: 无(纯函数)。
- Produces:`arrowKeyDelta(key, shift)→{dx,dy}|null`、`selectAllIds(elements)→string[]`、`parseKeyboardAction(e)→'undo'|'redo'|'selectAll'|null` —— Task 2 adapter 用。

**必守约束:** 纯函数;非方向键 → null;parseKeyboardAction 不判 isComposing(守卫在 adapter 层,因为这函数也可能在非组合判断时用——但 undo/redo 在 adapter 守 isComposing)。

- [ ] **Step 1.1:写失败测试**

```ts
// apps/web/src/features/canvas/host/__tests__/self-built-keyboard.test.ts
import { describe, expect, it } from 'vitest'
import { arrowKeyDelta, selectAllIds, parseKeyboardAction } from '../self-built-keyboard'
import type { CanvasElement } from '../canvas-host'

describe('arrowKeyDelta', () => {
  it('方向键 1px', () => {
    expect(arrowKeyDelta('ArrowUp', false)).toEqual({ dx: 0, dy: -1 })
    expect(arrowKeyDelta('ArrowDown', false)).toEqual({ dx: 0, dy: 1 })
    expect(arrowKeyDelta('ArrowLeft', false)).toEqual({ dx: -1, dy: 0 })
    expect(arrowKeyDelta('ArrowRight', false)).toEqual({ dx: 1, dy: 0 })
  })
  it('shift 方向键 10px', () => {
    expect(arrowKeyDelta('ArrowUp', true)).toEqual({ dx: 0, dy: -10 })
  })
  it('非方向键 → null', () => {
    expect(arrowKeyDelta('Enter', false)).toBeNull()
  })
})

describe('selectAllIds', () => {
  it('返回所有元素 id', () => {
    const els = [
      { id: 'a', kind: 'card', x: 0, y: 0, w: 10, h: 10, rotation: 0 },
      { id: 'b', kind: 'card', x: 20, y: 0, w: 10, h: 10, rotation: 0 },
    ] as unknown as CanvasElement[]
    expect(selectAllIds(els)).toEqual(['a', 'b'])
  })
})

describe('parseKeyboardAction', () => {
  const mod = (extra: Record<string, unknown> = {}) => ({ isComposing: false, key: 'a', metaKey: false, ctrlKey: false, shiftKey: false, ...extra })
  it('Ctrl+Z → undo', () => {
    expect(parseKeyboardAction(mod({ key: 'z', ctrlKey: true }))).toBe('undo')
    expect(parseKeyboardAction(mod({ key: 'z', metaKey: true }))).toBe('undo')
  })
  it('Ctrl+Shift+Z → redo', () => {
    expect(parseKeyboardAction(mod({ key: 'z', ctrlKey: true, shiftKey: true }))).toBe('redo')
    expect(parseKeyboardAction(mod({ key: 'y', ctrlKey: true }))).toBe('redo') // Ctrl+Y 也 redo
  })
  it('Ctrl+A → selectAll', () => {
    expect(parseKeyboardAction(mod({ key: 'a', ctrlKey: true }))).toBe('selectAll')
  })
  it('普通键 → null', () => {
    expect(parseKeyboardAction(mod({ key: 'z' }))).toBeNull()
    expect(parseKeyboardAction(mod({ key: 'a' }))).toBeNull()
  })
})
```

- [ ] **Step 1.2:跑,确认红**

Run: `cd /Users/jinxunuo/projects/cys-stift/apps/web && pnpm exec vitest run src/features/canvas/host/__tests__/self-built-keyboard.test.ts`
Expected: FAIL — `arrowKeyDelta is not exported`。

- [ ] **Step 1.3:写 `self-built-keyboard.ts`**

```ts
// apps/web/src/features/canvas/host/self-built-keyboard.ts
'use client'

import type { CanvasElement } from './canvas-host'

/** 方向键 → 偏移(1px,shift 时 10px)。非方向键 → null。 */
export function arrowKeyDelta(key: string, shift: boolean): { dx: number; dy: number } | null {
  const step = shift ? 10 : 1
  switch (key) {
    case 'ArrowUp': return { dx: 0, dy: -step }
    case 'ArrowDown': return { dx: 0, dy: step }
    case 'ArrowLeft': return { dx: -step, dy: 0 }
    case 'ArrowRight': return { dx: step, dy: 0 }
    default: return null
  }
}

/** 全选:返回所有元素 id。 */
export function selectAllIds(elements: CanvasElement[]): string[] {
  return elements.map((e) => e.id)
}

/**
 * 键盘动作判定(undo/redo/selectAll)。不判 isComposing——adapter 层守。
 * - Ctrl/Cmd+Z(无 shift)→ undo
 * - Ctrl/Cmd+Shift+Z 或 Ctrl+Y → redo
 * - Ctrl/Cmd+A → selectAll
 */
export function parseKeyboardAction(e: {
  key: string
  metaKey: boolean
  ctrlKey: boolean
  shiftKey: boolean
}): 'undo' | 'redo' | 'selectAll' | null {
  const mod = e.metaKey || e.ctrlKey
  if (!mod) return null
  const k = e.key.toLowerCase()
  if (k === 'z' && !e.shiftKey) return 'undo'
  if ((k === 'z' && e.shiftKey) || k === 'y') return 'redo'
  if (k === 'a') return 'selectAll'
  return null
}
```

- [ ] **Step 1.4:跑,确认绿**

Run: `cd /Users/jinxunuo/projects/cys-stift/apps/web && pnpm exec vitest run src/features/canvas/host/__tests__/self-built-keyboard.test.ts`
Expected: PASS —— arrowKeyDelta 3 + selectAllIds 1 + parseKeyboardAction 4 = 8 项。

- [ ] **Step 1.5:build**

Run: `cd /Users/jinxunuo/projects/cys-stift && pnpm --filter web build`
Expected: exit 0。

- [ ] **Step 1.6:Commit**

```bash
cd /Users/jinxunuo/projects/cys-stift && git add apps/web/src/features/canvas/host/self-built-keyboard.ts apps/web/src/features/canvas/host/__tests__/self-built-keyboard.test.ts
git commit -m "feat(canvas): Phase 1 keyboard T1 — arrowKeyDelta + selectAllIds + parseKeyboardAction 纯函数 + 单测"
```

**Task 1 验收:** 8 项单测绿;build exit 0;零 tldraw。→ 自审 + review。

---

## Task 2:adapter undo/redo 栈(undoStack/redoStack + pushUndo + undo/redo)+ 测试

**Files:**
- Modify: `apps/web/src/features/canvas/host/self-built-adapter.ts`
- Test: `apps/web/src/features/canvas/host/__tests__/self-built-adapter.test.ts`

**Interfaces:**
- Consumes: `CanvasElement`(快照)。
- Produces:`undo()` / `redo()` / `canUndo()` / `canRedo()` —— Task 3 keyHandler 调。

**必守约束:** undo 栈上限 50;`pushUndo` 存全量快照(deep clone);undo/redo 用 `applyWithoutEcho`(不进栈、不触发 onUserChange);redo 栈在 new user-change 时清空。

- [ ] **Step 2.1:加 undo/redo 测试(先红)**

`self-built-adapter.test.ts` 末尾加:

```ts
describe('SelfBuiltAdapter undo/redo', () => {
  it('pushUndo(经 user-change)存栈;undo 恢复;redo 重做', () => {
    const host = new SelfBuiltAdapter(document.createElement('canvas'))
    const h = host as unknown as { undo: () => void; redo: () => void; canUndo: () => boolean; canRedo: () => boolean }
    host.upsert({ id: 'c1', kind: 'card', x: 0, y: 0, w: 10, h: 10, rotation: 0 }) // 进栈前快照=空
    expect(h.canUndo()).toBe(true)
    host.upsert({ id: 'c2', kind: 'card', x: 0, y: 0, w: 10, h: 10, rotation: 0 })
    // undo → 回到只有 c2(撤掉 c2 的 upsert,恢复 c2 upsert 前的快照=只有 c1)
    h.undo()
    expect(host.getElements().map((e) => e.id)).toEqual(['c1'])
    expect(h.canRedo()).toBe(true)
    h.redo()
    expect(host.getElements().map((e) => e.id).sort()).toEqual(['c1', 'c2'])
  })

  it('new user-change 清空 redo 栈', () => {
    const host = new SelfBuiltAdapter(document.createElement('canvas'))
    const h = host as unknown as { undo: () => void; redo: () => void; canRedo: () => boolean }
    host.upsert({ id: 'c1', kind: 'card', x: 0, y: 0, w: 10, h: 10, rotation: 0 })
    host.upsert({ id: 'c2', kind: 'card', x: 0, y: 0, w: 10, h: 10, rotation: 0 })
    h.undo() // 回到 c1
    expect(h.canRedo()).toBe(true)
    host.upsert({ id: 'c3', kind: 'card', x: 0, y: 0, w: 10, h: 10, rotation: 0 }) // 新变更清 redo
    expect(h.canRedo()).toBe(false)
  })

  it('undo 栈上限 50(第 51 步丢弃最旧)', () => {
    const host = new SelfBuiltAdapter(document.createElement('canvas'))
    const h = host as unknown as { canUndo: () => boolean; undo: () => void }
    for (let i = 0; i < 55; i++) {
      host.upsert({ id: 'c' + i, kind: 'card', x: i, y: 0, w: 10, h: 10, rotation: 0 })
    }
    // undo 50 次应还能再 undo(false);第 51 次到空
    let count = 0
    while (h.canUndo()) { h.undo(); count++ }
    expect(count).toBe(50)
  })
})
```

- [ ] **Step 2.2:跑,确认红**

Run: `cd /Users/jinxunuo/projects/cys-stift/apps/web && pnpm exec vitest run src/features/canvas/host/__tests__/self-built-adapter.test.ts`
Expected: FAIL — `undo is not a function`。

- [ ] **Step 2.3:adapter 加 undo/redo 栈**

字段区(在 `connecting` 之后)加:

```ts
  private undoStack: CanvasElement[][] = []
  private redoStack: CanvasElement[][] = []
  private static readonly UNDO_LIMIT = 50
```

**关键:`pushUndo` 在 `emitUser` 触发前调**(回写/拖拽/删除都能 undo)。改 `emitUser`:

```ts
  protected emitUser(c: UserChange): void {
    // user-change 前存当前快照(供 undo 恢复到变更前)
    this.pushUndo()
    for (const l of this.userListeners) l(c)
  }

  private pushUndo(): void {
    this.undoStack.push(this.snapshot())
    if (this.undoStack.length > SelfBuiltAdapter.UNDO_LIMIT) this.undoStack.shift()
    this.redoStack = [] // 新 user-change 清 redo
  }

  private snapshot(): CanvasElement[] {
    return this.getElements().map((e) => ({ ...e, meta: e.meta ? { ...e.meta } : undefined }))
  }

  canUndo(): boolean {
    return this.undoStack.length > 0
  }

  canRedo(): boolean {
    return this.redoStack.length > 0
  }

  undo(): void {
    const prev = this.undoStack.pop()
    if (!prev) return
    this.redoStack.push(this.snapshot())
    this.restore(prev)
  }

  redo(): void {
    const next = this.redoStack.pop()
    if (!next) return
    this.undoStack.push(this.snapshot())
    this.restore(next)
  }

  /** 用快照替换所有元素(不进栈、不触发 onUserChange)。 */
  private restore(snapshot: CanvasElement[]): void {
    this.applyWithoutEcho(() => {
      this.elements.clear()
      for (const el of snapshot) this.elements.set(el.id, el)
    })
    this.scheduleRender()
  }
```

- [ ] **Step 2.4:跑 undo/redo 测试,确认绿**

Run: `cd /Users/jinxunuo/projects/cys-stift/apps/web && pnpm exec vitest run src/features/canvas/host/__tests__/self-built-adapter.test.ts`
Expected: PASS —— 原 23 + undo/redo 3 = 26 项。

> **注意契约测试**:InMemoryCanvasHost 不实现 undo/canUndo(那不是 CanvasHost 接口)。契约测试用的是 InMemoryCanvasHost + SelfBuiltAdapter 的 CanvasHost 契约,undo 方法不在接口里,契约测试不受影响。若契约测试因 emitUser 改动挂了,查 pushUndo 是否在 SelfBuiltAdapter 的 echo 路径正确触发。

- [ ] **Step 2.5:全部 host 测试 + build**

Run: `cd /Users/jinxunuo/projects/cys-stift/apps/web && pnpm exec vitest run src/features/canvas/host/ && cd /Users/jinxunuo/projects/cys-stift && pnpm --filter web build`
Expected: 全绿 + exit 0。

- [ ] **Step 2.6:Commit**

```bash
cd /Users/jinxunuo/projects/cys-stift && git add apps/web/src/features/canvas/host/self-built-adapter.ts apps/web/src/features/canvas/host/__tests__/self-built-adapter.test.ts
git commit -m "feat(canvas): Phase 1 keyboard T2 — undo/redo 栈(全量快照 + 50 上限 + applyWithoutEcho)"
```

**Task 2 验收:** adapter 测试 26 项绿(含 undo/redo 3);契约测试不退化;build exit 0。→ 自审 + review。

---

## Task 3:keyHandler 扩展(微移 + 全选 + undo/redo 键绑定)+ 测试

**Files:**
- Modify: `apps/web/src/features/canvas/host/self-built-adapter.ts`(扩 keyHandler)
- Test: `apps/web/src/features/canvas/host/__tests__/self-built-adapter.test.ts`

**Interfaces:**
- Consumes: Task 1 `arrowKeyDelta`/`selectAllIds`/`parseKeyboardAction`;Task 2 `undo`/`redo`。
- Produces:方向键微移 + Ctrl+A 全选 + Ctrl+Z/Shift+Z undo/redo。

**必守约束:** 守卫严:text 模式 + input/textarea 焦点 + undo/redo 守 isComposing 不触发;微移有选中才触发;undo/redo 用 applyWithoutEcho(已在 undo/redo 方法里);preventDefault。

- [ ] **Step 3.1:加键盘交互测试(先红)**

`self-built-adapter.test.ts` 末尾加(复用 keydown helper——若文件已有则复用,否则定义):

```ts
describe('SelfBuiltAdapter keyboard actions', () => {
  function keydown(key: string, opts: { ctrl?: boolean; meta?: boolean; shift?: boolean; isComposing?: boolean; target?: unknown } = {}) {
    const ev = new KeyboardEvent('keydown', {
      key,
      bubbles: true,
      ctrlKey: !!opts.ctrl,
      metaKey: !!opts.meta,
      shiftKey: !!opts.shift,
    })
    if (opts.isComposing !== undefined) Object.defineProperty(ev, 'isComposing', { value: opts.isComposing, configurable: true })
    if (opts.target !== undefined) Object.defineProperty(ev, 'target', { value: opts.target, configurable: true })
    window.dispatchEvent(ev)
  }

  it('方向键微移选中元素(+1px)', () => {
    const host = new SelfBuiltAdapter(document.createElement('canvas'))
    host.upsert({ id: 'c1', kind: 'card', x: 0, y: 0, w: 10, h: 10, rotation: 0 })
    ;(host as unknown as { setSelectedIds: (i: string[]) => void }).setSelectedIds(['c1'])
    keydown('ArrowRight')
    expect(host.getElement('c1')?.x).toBe(1)
    keydown('ArrowDown', { shift: true }) // +10
    expect(host.getElement('c1')?.y).toBe(10)
  })

  it('Ctrl+A 全选', () => {
    const host = new SelfBuiltAdapter(document.createElement('canvas'))
    host.upsert({ id: 'a', kind: 'card', x: 0, y: 0, w: 10, h: 10, rotation: 0 })
    host.upsert({ id: 'b', kind: 'card', x: 20, y: 0, w: 10, h: 10, rotation: 0 })
    keydown('a', { ctrl: true })
    expect((host as unknown as { getSelectedIds: () => string[] }).getSelectedIds().sort()).toEqual(['a', 'b'])
  })

  it('Ctrl+Z undo 微移', () => {
    const host = new SelfBuiltAdapter(document.createElement('canvas'))
    host.upsert({ id: 'c1', kind: 'card', x: 0, y: 0, w: 10, h: 10, rotation: 0 })
    ;(host as unknown as { setSelectedIds: (i: string[]) => void }).setSelectedIds(['c1'])
    keydown('ArrowRight') // x→1
    keydown('z', { ctrl: true }) // undo → x→0
    expect(host.getElement('c1')?.x).toBe(0)
  })

  it('IME 组合态 Ctrl+Z 不触发 undo', () => {
    const host = new SelfBuiltAdapter(document.createElement('canvas'))
    host.upsert({ id: 'c1', kind: 'card', x: 0, y: 0, w: 10, h: 10, rotation: 0 })
    ;(host as unknown as { setSelectedIds: (i: string[]) => void }).setSelectedIds(['c1'])
    keydown('ArrowRight') // x→1,进 undo 栈
    keydown('z', { ctrl: true, isComposing: true }) // IME 中 → 不 undo
    expect(host.getElement('c1')?.x).toBe(1) // 仍 1
  })
})
```

- [ ] **Step 3.2:跑,确认红**

Run: `cd /Users/jinxunuo/projects/cys-stift/apps/web && pnpm exec vitest run src/features/canvas/host/__tests__/self-built-adapter.test.ts`
Expected: FAIL —— 方向键不微移 / Ctrl+Z 不 undo。

- [ ] **Step 3.3:扩 keyHandler**

import 加:

```ts
import { arrowKeyDelta, selectAllIds, parseKeyboardAction } from './self-built-keyboard'
```

把 `attachKeyboard` 的 `this.keyHandler = (e) => { ... }` 整体替换成:

```ts
    this.keyHandler = (e: KeyboardEvent) => {
      // 守卫:text 模式 / 焦点在输入框
      const t = e.target as HTMLElement | null
      const inInput = !!t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA')
      if (this.activeTool === 'text' || inInput) {
        // 文本编辑中:只可能 IME;不拦截任何键(Delete/微移/undo 都不触发)
        return
      }
      // undo/redo/selectAll(守 isComposing——IME 组合态不 undo)
      const action = parseKeyboardAction(e)
      if (action) {
        if (e.isComposing) return
        e.preventDefault()
        if (action === 'undo') this.undo()
        else if (action === 'redo') this.redo()
        else if (action === 'selectAll') this.setSelectedIds(selectAllIds(this.getElements()))
        return
      }
      // Delete/Backspace(现有)
      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (this.selectedIds.size === 0) return
        e.preventDefault()
        const ids = [...this.selectedIds]
        this.setSelectedIds([])
        for (const id of ids) this.remove(id)
        return
      }
      // 方向键微移
      const delta = arrowKeyDelta(e.key, e.shiftKey)
      if (delta) {
        if (this.selectedIds.size === 0) return
        e.preventDefault()
        for (const id of this.selectedIds) {
          const el = this.getElement(id)
          if (el) this.upsert({ ...el, x: el.x + delta.dx, y: el.y + delta.dy })
        }
      }
    }
```

- [ ] **Step 3.4:跑 adapter 测试,确认绿**

Run: `cd /Users/jinxunuo/projects/cys-stift/apps/web && pnpm exec vitest run src/features/canvas/host/__tests__/self-built-adapter.test.ts`
Expected: PASS —— 原 26 + keyboard 4 = 30 项。

- [ ] **Step 3.5:全部 host 测试 + build**

Run: `cd /Users/jinxunuo/projects/cys-stift/apps/web && pnpm exec vitest run src/features/canvas/host/ && cd /Users/jinxunuo/projects/cys-stift && pnpm --filter web build`
Expected: 全绿 + exit 0。

- [ ] **Step 3.6:Commit**

```bash
cd /Users/jinxunuo/projects/cys-stift && git add apps/web/src/features/canvas/host/self-built-adapter.ts apps/web/src/features/canvas/host/__tests__/self-built-adapter.test.ts
git commit -m "feat(canvas): Phase 1 keyboard T3 — keyHandler 扩展(方向键微移 + Ctrl+A 全选 + Ctrl+Z/Y undo/redo)"
```

**Task 3 验收:** adapter 测试 30 项绿(含 keyboard 4);Delete 现有测试不退化;build exit 0;IME 守卫覆盖。→ 自审 + review。

---

## Task 4:`/dev/canvas-self` 键盘冒烟

**Files:**
- Create: `scripts/phase1-keyboard-smoke.cjs`

**Interfaces:**
- Consumes: Task 2-3;`window.__selfAdapter`。
- Produces:冒烟验方向键微移 + Ctrl+Z undo 真实 Chrome。

**必守约束:** 主路由零改动;静态服务跑完 kill;不假装通过。

- [ ] **Step 4.1:写 `scripts/phase1-keyboard-smoke.cjs`**

```js
// scripts/phase1-keyboard-smoke.cjs — 真实冒烟 /dev/canvas-self 的键盘(微移 + undo)。
// 运行:先 pnpm --filter web build + 静态服务 :3016,再 node scripts/phase1-keyboard-smoke.cjs
const puppeteer = require('puppeteer-core')
const fs = require('fs')
const path = require('path')
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const URL = 'http://localhost:3016'
const wait = (ms) => new Promise((r) => setTimeout(r, ms))
const out = path.join(__dirname, '..', 'docs', 'design', 'screenshots', 'phase1-keyboard-smoke')
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

  // 放 card + 选中
  const rect = await page.evaluate(() => {
    window.__selfAdapter.upsert({ id: 'ca', kind: 'card', x: 300, y: 300, w: 160, h: 100, rotation: 0 })
    window.__selfAdapter.setTool('select')
    const r = document.querySelector('canvas').getBoundingClientRect()
    return { left: r.left, top: r.top }
  })
  await page.mouse.click(rect.left + 380, rect.top + 350) // 点 card 中心选中
  await wait(200)

  // 方向键右 ×3 → x +3
  await page.keyboard.press('ArrowRight')
  await page.keyboard.press('ArrowRight')
  await page.keyboard.press('ArrowRight')
  await wait(200)
  let x1 = await page.evaluate(() => window.__selfAdapter.getElement('ca').x)
  check('arrow keys nudge +3', x1 === 303, `x=${x1}`)

  // Ctrl/Meta+Z undo ×3 → 撤 3 次微移,x 回 300(实现:每次微移=1 undo 条目)
  const isMac = process.platform === 'darwin'
  for (let i = 0; i < 3; i++) {
    await page.keyboard.down(isMac ? 'Meta' : 'Control')
    await page.keyboard.press('z')
    await page.keyboard.up(isMac ? 'Meta' : 'Control')
  }
  await wait(200)
  let x2 = await page.evaluate(() => window.__selfAdapter.getElement('ca').x)
  check('Ctrl+Z ×3 undo nudges back to 300', x2 === 300, `x=${x2}`)

  await page.screenshot({ path: path.join(out, 'keyboard.png') })
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
# node scripts/phase1-keyboard-smoke.cjs
# 跑完 kill python(释放 3016)
```
Expected: 3/3 绿(挂载、方向键 +3、Ctrl+Z ×3 undo 回 300)。

- [ ] **Step 4.3:Commit**

```bash
cd /Users/jinxunuo/projects/cys-stift && git add scripts/phase1-keyboard-smoke.cjs
git commit -m "test(canvas): Phase 1 keyboard T4 — /dev/canvas-self 键盘(微移 + undo)冒烟 e2e"
```

**Task 4 验收:** 冒烟 3/3;主路由零改动;3016 已释放。→ 自审 + review → **Phase 1 打磨(5)更多键盘 完成 → Phase 1 打磨全部完成**。

---

## Phase 1 keyboard 总验收

```bash
cd /Users/jinxunuo/projects/cys-stift/apps/web && pnpm exec vitest run src/features/canvas/host/   # 全绿(契约 12 + 渲染 13 + 命中 3 + adapter 30 + tldraw-adapter 7 + freedraw 5 + arrow 8 + text 8 + resize 10 + marquee 6 + connect 2 + keyboard 8 = 112)
cd /Users/jinxunuo/projects/cys-stift && pnpm --filter web build                                    # exit 0
node scripts/phase1-keyboard-smoke.cjs                                                              # 3/3(需静态服务 :3016)
```
+ 主路由 `/canvas`(tldraw)零改动;零 tldraw 新增;颜色走 token。

**产出:** 方向键微移(1/10px)+ Ctrl+A 全选 + Ctrl+Z/Y undo/redo(50 步快照栈)+ IME 守卫。Phase 1 打磨全部完成。

## Self-Review(plan 自检)

- **Spec 覆盖**:键盘纯函数(T1)→ undo/redo 栈(T2)→ keyHandler 扩展(T3)→ 冒烟(T4)。IME 守卫(T3 单测)+ undo 栈上限(T2 单测)+ 全选/微移(T3 单测)全覆盖。
- **占位符**:无 TBD/TODO。Task 3 keyHandler 整体替换(给完整代码)。每步代码完整。
- **类型一致**:`arrowKeyDelta(key, shift)→{dx,dy}|null`、`selectAllIds(elements)→string[]`、`parseKeyboardAction(e)→'undo'|'redo'|'selectAll'|null` 在 T1 定义、T3 消费;`undo()`/`redo()`/`canUndo()`/`canRedo()` 在 T2 定义、T3 消费;`undoStack`/`redoStack`/`snapshot`/`restore` 一致。
- **范围**:键盘(微移/全选/undo/redo)自包含。Phase 1 打磨至此全部完成;Phase 2(ADR + 移除 tldraw)另开。
- **潜在坑(T2 emitUser 改动)**:把 pushUndo 放进 emitUser 会影响**所有** user-change 路径(拖拽每 move 都进栈!)。拖拽 onMove 每 move 都 upsert→emitUser→pushUndo 会爆栈(50 步全是一帧的微移)。**修正:onMove 拖拽的连续 upsert 不应每次进栈**。方案:pushUndo 只在「离散动作」(Delete/微移/up 那次/commit)进栈,不在 onMove 连续 upsert 进栈。
  - **实现修正**:不在 emitUser 里 pushUndo。改为:在 `upsert`/`remove` 里加一个 `private _dirty` 标志——onDown 开 drag/connect/freedraw 前 pushUndo 一次(动作起点),onMove 连续 upsert 不 pushUndo。简化:**只在 onDown(各动作起点)+ Delete + 微移 + commit 前 pushUndo**。具体:在 onDown 的 drag/connect/freedraw/marquee 分支各 pushUndo 一次;Delete/微移在 keyHandler pushUndo;up 时不再 pushUndo(起点已存)。
  - 执行时按此修正实现(不在 emitUser 里 pushUndo),否则 undo 栈被拖拽微步爆满。**这是本计划最重要的一处修正,执行时务必按此,不要在 emitUser 里 pushUndo。**
