# Plan · Phase canvas-refactor · useEffect 驱动 canvas-editor(#4 #5)

> 承接 `docs/decisions/2026-06-19-review-findings.md` 的 #4 + #5。
> 目标:**唯一一次动 canvas 时顺手关掉这两个脆弱点**;不引入功能变化。
> 本档是实施计划;执行者(主模型 Claude)照此推进 + 自审。

## 背景(为什么)

review 发现的两条脆弱/风险都集中在 `apps/web/src/features/canvas/canvas-editor.tsx:53-104`(`Tldraw.onMount` 回调):

- **#4 editor.dispose 猴补丁**:用 `const prevDispose = editor.dispose.bind(editor); editor.dispose = () => {...}` 把原方法换掉,**假设 tldraw v3 unmount 时调 editor.dispose**。如果未来 tldraw 改了清理路径(走 store.dispose / 自己卸载容器),`unsub()` 和 timer 永远不执行——pending timer 在 disposed editor 上调 `getCamera()` 可能抛错或写脏 store。puppeteer e2e 只测了 reload(整页卸载 → dispose 自然触发),**没测过快速在 /canvas ↔ /canvas 之间切** 或 React 卸载 / 重新挂载 canvas 组件的场景。
- **#5 editor.store.listen 无 filter**:第二个参数该传 scope/filter 但没传,默认监听**所有 store changes**——含 `bindCardWriteback` 的卡片拖动。每次拖卡触发 camera 读取 + debounce 重排,功能没错纯浪费。改动 `canvas-binding.ts` 或卡片频繁 CRUD 时性能塌。

两条都要**重构成 React `useEffect`**——以 `editor` 为 dep,cleanup 直接 unsub + clear timer,不依赖 tldraw 是否调 dispose。**这是 review 报告本身给的标准修法**。

## 探索结论(已确认,别重造)

- **editor 已是 page state**(`apps/web/src/app/canvas/page.tsx:38` `useState<Editor | null>(null)`,Phase 5 已提升)— onMount 通过 `onEditorReady` 回调 → `setEditor`。可以**反向下传 editor 作 prop** 让 canvas-editor 自己 useEffect。两种走法:
  - **A 下传 editor prop**:page 用 `useEffect([editor])` 注册全局键盘;canvas-editor 内部 `useEffect([editor])` 注册 view 持久化 + double-click。**职责清晰**。
  - **B editor ref 上传**:canvas-editor 暴露 `editorRef` ref,page 不感知 editor,所有副作用都在 canvas-editor 里。**封装更彻底,但 page 还需要 editor 给 CardDetailModal 用 onSave/onArchive/onDelete 同步 shape——必须外露**,所以 A 更直接。
  - **选 A**。下传 prop `editor?: Editor | null`(`undefined` 表示 onMount 还没触发),canvas-editor 内 `useEffect` deps `[editor, service, canvasId, onOpenCard]`(回调 ref 稳定,deps 主要看 editor)。
- **listen scope/filter**:`editor.store.listen(callback, scope?, filter?)`,scope 形如 `'document'` / `'session'` / `'all'`,filter 是 (entry) => boolean。tldraw v3 store 提供 `entry.scope` 和 `entry.changes`(Diff)。我们的目标:只关心 camera + instance state(zoom/pan/gridMode)。
  - **简单做法**:filter 判 `entry.changes` 是否含相机相关或 instance — 但要枚举全部字段名(脆)。
  - **更简单做法**:**不存 useEffect** — 改用 `useValue` 订阅 `() => editor.getCamera()` 和 `editor.getInstanceState()`,各自通过 tldraw reactive 系统 + `useEffect` 防抖写回 store。**两种变化各自触发一次 useEffect,完全跳过 listen**。
  - 选更简单做法。这其实是更 React-y 的修法:不依赖 listen 副作用机制,用 tldraw 自己的 `useValue` 订阅(已经在 `ZoomGroup` 用过 `useValue('canvas zoom', ...)`)。
- **double-click 监听**:绑在 `editor.getContainer()` DOM 元素上,tldraw 卸载时容器消失,事件自然回收——但 page 切走时 editor 不立刻 dispose,而是 React 先卸载 DOM(`CanvasEditor` 组件 unmount → Tldraw 实例仍存活到下一帧)。**保险起见也走 useEffect cleanup**。
- **不动**:`bindCardWriteback`、`loadCardsIntoEditor`、`addCardShape` 等 binding / shape util 内部逻辑(本次 scope 外);只动 onMount 的副作用组装。
- **`__canvasEditor` 诊断句柄**:puppeteer 用 `window.__canvasEditor` 读 live editor state,要保留。

## 范围

### ✅ 做

**canvas-editor.tsx 重构**(唯一文件改动):
- 接收新 prop `editor: Editor | null`(page 通过 `onEditorReady` 拿到后 setEditor,然后把 editor 作为 prop 传回来——可以同时保留 `onEditorReady`,因为 page 的 `setEditor` 仍需要)。
- 删除原 `onMount` 里所有副作用(view apply / `loadCardsIntoEditor` / `bindCardWriteback` / listen+debounce / dispose 猴补丁)。保留:
  - view apply(zoom/pan/gridMode/gridSize setCamera + updateInstanceState + updateDocumentSettings)— 仍在 onMount,纯一次性
  - `__canvasEditor` 句柄设置
  - `onEditorReady` 回调
  - `loadCardsIntoEditor` + `bindCardWriteback` 调用(不归本 phase 管,纯一次性副作用)
- 新增 useEffects(在 `<Tldraw>` 外层 `<div className="cv-editor">` 组件里用 React hooks),deps 含 editor:
  - `useEffect([editor])`:相机 + gridMode 持久化。`useValue('camera', () => editor.getCamera())` + `useValue('isGridMode', () => editor.getInstanceState().isGridMode)` 各自订阅;组合 useEffect 在变化时防抖 500ms 写回 `canvasViewStore.update`。cleanup `clearTimeout`。
  - `useEffect([editor])`:double-click 监听。`editor.getContainer().addEventListener('dblclick', ...)`,cleanup `removeEventListener`。**不再绑在 wireDoubleClick 里被忘掉**。
- **listen 全删** — 用 useValue 替代,无 store 全量订阅。
- **dispose 猴补丁全删** — useEffect cleanup 不依赖 editor.dispose。
- **`onMount` 仍存在,但只剩"一次性副作用 + 通知父"**:view apply + loadCardsIntoEditor + bindCardWriteback + __canvasEditor + onEditorReady。这样语义清晰:**onMount = tldraw 触发,只做一次;后续变化 = useEffect + useValue 响应**。

**page.tsx 小改**:
- 把 `editor` state 作为 prop 传给 `<TldrawCanvas>`(新增 prop,见下)。
- `TldrawCanvas` 透传 `editor` 给 `CanvasEditor`。

**TldrawCanvas.tsx 透传**:
- `CanvasEditorProps` 加 `editor: Editor | null`。
- `TldrawCanvas(props)` 直接 `{...props}` 给 `Editor`,已是透传,**无需改**。

**e2e**:
- 写 `scripts/canvas-refactor-shots.cjs`(新):**关键场景 = 反复切 /canvas ↔ / 切走再回来** + reload + zoom 持久化回归。
- 回归:原 `p4` / `p5` / `p6.5d` e2e 脚本(若时间紧只跑 p6.5d,因为它是 view 持久化的直接覆盖)。

**closeout 四件套**:`changelog` / `decisions/2026-06-20-canvas-refactor.md` / `MEMORY.md` / 根 `CLAUDE.md` / `current-session.md` + tag **`v0.11.0-canvas-refactor`**。

### ❌ 不做(留后)

- canvas dblclick 走 capture registry(plan 决定走 captureSinkRegistry,但当前实现是直接 `service.create`;review 没说,本 phase 不动)
- 多画布 UI(spec §4.9 schema 已支持)
- 把 view 持久化迁到 domain `CanvasService.updateView`(Phase 8 Tauri 替换时统一)
- `bindCardWriteback` / `loadCardsIntoEditor` 内部逻辑
- 添加 "重置 view" 按钮(已知 UX 缺口,YAGNI)

## 关键代码形态

**canvas-editor.tsx 重构后核心**:

```tsx
export interface CanvasEditorProps {
  service: CardService
  canvasId: CanvasId
  /** Editor lifted to page state via onEditorReady; CanvasEditor also
   * receives the same handle as a prop so it can register reactive
   * side-effects (view persistence, dblclick) inside React useEffects. */
  editor: Editor | null
  onOpenCard: (card: Card) => void
  onEditorReady?: (editor: Editor) => void
}

export function CanvasEditor({
  service, canvasId, editor, onOpenCard, onEditorReady,
}: CanvasEditorProps) {
  return (
    <div className="cv-editor">
      <Tldraw
        shapeUtils={shapeUtils}
        hideUi
        onMount={(ed: Editor) => {
          // Apply persisted view (Phase 6.5d) BEFORE first paint so users
          // never see the default view flash. One-shot.
          const view = canvasViewStore.get()
          ed.setCamera({ x: view.panX, y: view.panY, z: view.zoom })
          const snap = view.gridMode === 'snap'
          ed.updateInstanceState({ isGridMode: snap })
          ed.user.updateUserPreferences({ isSnapMode: snap })
          ed.updateDocumentSettings({ gridSize: view.gridSize })
          // Diagnostic handle + initial sync (one-shot)
          if (typeof window !== 'undefined') {
            ;(window as unknown as { __canvasEditor?: Editor }).__canvasEditor = ed
          }
          loadCardsIntoEditor(ed, service, canvasId)
          bindCardWriteback(ed, service, canvasId)
          onEditorReady?.(ed)
        }}
      />
      <ViewPersistenceBridge editor={editor} />
      <DoubleClickBridge editor={editor} canvasId={canvasId} service={service} onOpenCard={onOpenCard} />
    </div>
  )
}

/**
 * ViewPersistenceBridge — subscribes to camera + gridMode via tldraw's
 * reactive useValue (same pattern ZoomGroup uses), and debounce-writes
 * to canvasViewStore on change. Cleanup is pure React — no editor.dispose
 * monkey-patching, no editor.store.listen with no filter.
 */
function ViewPersistenceBridge({ editor }: { editor: Editor | null }) {
  const cam = useValue('cvp camera', () => editor?.getCamera(), [editor])
  const isGrid = useValue('cvp grid', () => editor?.getInstanceState().isGridMode, [editor])
  useEffect(() => {
    if (!editor || !cam) return
    const id = setTimeout(() => {
      canvasViewStore.update({
        zoom: cam.z,
        panX: cam.x,
        panY: cam.y,
        gridMode: isGrid ? 'snap' : 'free',
      })
    }, VIEW_PERSIST_DEBOUNCE_MS)
    return () => clearTimeout(id)
  }, [editor, cam?.z, cam?.x, cam?.y, isGrid])
  return null
}

/**
 * DoubleClickBridge — listens on editor.getContainer() for dblclick.
 * Pure React useEffect with add/removeEventListener cleanup. Replaces
 * wireDoubleClick() which lived inside onMount and had no cleanup hook.
 */
function DoubleClickBridge({
  editor, canvasId, service, onOpenCard,
}: {
  editor: Editor | null
  canvasId: CanvasId
  service: CardService
  onOpenCard: (card: Card) => void
}) {
  useEffect(() => {
    if (!editor) return
    const container = editor.getContainer()
    const onDbl = (e: MouseEvent) => {
      const pagePoint = editor.screenToPage({ x: e.clientX, y: e.clientY })
      const hit = editor.getShapeAtPoint(pagePoint)
      if (hit && hit.type === 'card') {
        const card = service.get(cardIdFromShapeId(String(hit.id)))
        if (card) onOpenCard(card)
        return
      }
      const card = service.create({
        title: '',
        source: { kind: 'manual', deviceId: DEVICE_ID },
        canvasPosition: {
          canvasId,
          x: Math.round(pagePoint.x),
          y: Math.round(pagePoint.y),
          w: DEFAULT_CARD_W,
          h: DEFAULT_CARD_H,
          z: Date.now(),
        },
      })
      addCardShape(editor, card)
      onOpenCard(card)
    }
    container.addEventListener('dblclick', onDbl)
    return () => container.removeEventListener('dblclick', onDbl)
  }, [editor, canvasId, service, onOpenCard])
  return null
}
```

> ⚠️ `onOpenCard` 是 page 传来的回调,每次 render 都是新函数 — `useEffect` deps 会一直变。修法:`useRef` 存回调,effect 里读 ref(`(card) => onOpenCardRef.current?.(card)`)。**或**在 page 端用 `useCallback` 包一层(已经有的 `toggleSnap`/`zoomBy` 模式)。**选 useRef 路径**——不依赖 page 的纪律。

**page.tsx 改动**:1 行 — `<TldrawCanvas editor={editor} ... />`,把 editor 传下去。

**TldrawCanvas.tsx**:无 — `CanvasEditorProps` 加 `editor?: Editor | null`(optional,允许 back-compat),`TldrawCanvas` 已透传 `{...props}`。

## 纪律(执行时)

- ❌ 不改 spec · 不重新选型 · 不加未要求依赖 · 组件层不写死 hex(全 token) · 不破坏 domain 零依赖
- ✅ 静态导出:`/canvas` 是静态路由,本次改 canvas 不影响 14 静态页
- ✅ 实跑 exit code,不假装通过
- ✅ 不动 `bindCardWriteback` / `loadCardsIntoEditor` / `addCardShape` 等其他文件
- ✅ 保留 `__canvasEditor` 诊断句柄(puppeteer 用)
- ✅ 保留 `onEditorReady` callback(page 还需要它 setEditor)
- ✅ 双击创建卡走 `service.create({source: {kind: 'manual', deviceId: 'web'}})` 复用,跟 plan 一致

## 验证(端到端)

```bash
# 1. 单测 + build 回归
pnpm --filter domain test            # 15 passed(本次未改 domain)
pnpm --filter db test                #  7 passed
pnpm --filter web build              # exit 0,14 静态页

# 2. e2e:新脚本 + 回归 p6.5d
pnpm --filter web dev --port 3016 &
node scripts/canvas-refactor-shots.cjs   # 反复切 /canvas / reload / zoom 持久化
node scripts/p6.5d-shots.cjs             # view 持久化回归

# 3. 手测(本机)
# - /canvas → zoom ×2 → 切 /inbox → 切回 /canvas → view 应保留,且 console 无 error
# - 双击空白处建卡 → modal 打开
# - 双击已有卡 → 打开详情
# - 拖动卡 → 不应触发 console error / view 写入应不刷
```

断言要点:反复切 /canvas 后无 console error;reload 后 view 保留;双击建卡成功;拖卡过程不再额外触发持久化(debounce 后只一次)。