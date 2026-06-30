# v0.41 打磨清单(工具栏工具逻辑 + 画布交互 + UI)

> 来源:v0.40 落地后系统审计(3 个 Explore subagent:工具栏 5 工具 / 画布交互手感 / UI 视觉)。
> 多条是 v0.40 修过的问题在**平行路径漏网**(pointercancel 修了 connect 没修 freedraw;双层缓存修了渲染没修交互命中;选择态清理修了切画布没修 Tab 失焦)。
> 用户目标:**全搞完再进 AI**(autoCurateLab)。

---

## P0 — 高频真实影响(v0.40 同类根因漏网)

### 1. Tab 切走/页面失焦,进行中交互残留 → 幽灵移动
- **现象**:拖卡/画手绘/连线中途切 Tab 或系统通知遮挡,回来后 dragGroup/currentStroke/connecting 残留,鼠标移入画布元素突然跳坐标
- **根因**:`self-built-adapter.ts` 无 `visibilitychange`/`blur` 监听;Tab 隐藏时浏览器不发 pointerup/cancel,所有交互态残留
- **修法**:挂 window visibilitychange,隐藏时 clearInteractionState + scheduleRender
- **类比**:v0.40 pointercancel 修了 connect 一条路径,visibilitychange 覆盖全部态

### 2. 方向键按住自动重复 → undo 栈爆炸
- **现象**:选中元素按住方向键,每帧推 1 步 undo,要按几十次 Ctrl+Z 才能撤销一次连续微移
- **根因**:`self-built-adapter.ts:1027-1043` 方向键 upsert 无 `e.repeat` 守卫、无 coalescing
- **修法**:首次 keydown pushUndo + coalescing=true,keyup 关;或 repeat 时跳过 pushUndo

### 3. freedraw pointercancel → 半截笔画 commit 成残线
- **现象**:手绘中系统打断 → pointercancel 走 onUp → currentStroke 被 commit 成一截残线(进 undo + 持久化)
- **根因**:`self-built-adapter.ts` onCancel 只对 connect discard,freedraw 仍走 onUp commit
- **修法**:onCancel 对 freedraw 走 discard(currentStroke=null,不 commit)
- **类比**:与 v0.40 connect cancel **完全同构**,connect 修了 freedraw 漏了

---

## P1 — 明显交互问题

### 4. connect onMove hitTest 未用渲染缓存(大画布拖线卡顿)
- **现象**:大画布 connect 拖线时 onMove 每帧 `hitTestCardWithTolerance(this.getElements(), …)`,getElements() 每帧全量排序
- **根因**:`self-built-adapter.ts:736` 用 getElements() 而非已有的 getSortedElements() 缓存
- **修法**:改用 getSortedElements()(v0.40 双层缓存的**交互命中路径漏修**)

### 5. eraser card 模式 undo/redo DB 不同步
- **现象**:card 橡皮擦卡 → undo 卡"回来了但打不开"(DB deletedAt 没回滚)/ redo 卡悬空复活(host 无但 DB 活)
- **根因**:`canvas-binding.ts:196` reconcileHistory 只 undo 方向 restore,redo 不 softDelete;adapter undo 只管元素集不回写 DB
- **修法**:reconcileHistory 区分 undo/redo 方向,redo 时对应 softDelete

### 6. resize 不遵守 snap/grid
- **现象**:snap 模式拖卡位置吸附,但拖角 resize 尺寸不是 8 倍数,手感不一致
- **根因**:`self-built-resize.ts:79` 纯 Math.round,不查 gridMode;adapter resize 分支不经 snapCoord
- **修法**:resize 结果过 snapCoord(保持对角固定)

### 7. RelationPanel 静默自动改箭头样式
- **现象**:选中无标签箭头,自动变蓝虚线 references 样式,无提示,用户以为 bug
- **根因**:`relation-panel.tsx:97-104` inferRelationType 后自动 applyRelationType,无 toast
- **修法**:auto-apply 后 toast 提示,或改为只高亮推断按钮不自动应用

### 8. 纯点击/点空白产生空 undo 步
- **现象**:select 点选一下(没拖)/ eraser 点空白(没擦到)→ pushUndo 已推,undo 栈污染,Undo 按钮亮但点了没反应
- **根因**:onDown 无条件 pushUndo 在实际操作发生前
- **修法**:pushUndo 推迟到首次实际 move/erase,或 onUp 检测无操作时弹出快照

---

## P1 — UI 高价值(多语言 + 暗色 + 铁律)

### 9. error.tsx 全量硬编码中文(i18n 完全缺)
- **根因**:`app/error.tsx:30-48` 崩溃页文案全中文,未走 t()
- **修法**:引入 useI18n,新增 error.boundary.* 键

### 10. inbox/markdown.tsx 嵌入提示硬编码中文
- **根因**:`app/inbox/markdown.tsx:99-102` 嵌入错误(嵌套过深/循环/不存在)全中文
- **修法**:新增 md.embed.* 键走 t()

### 11. agent-confirm-card.tsx 缩略图 hex 写死(违反铁律 + 暗色不可见)
- **根因**:`features/ai/agent-confirm-card.tsx:231` `#0a0a0a`/`#d40000`/`#6b6b6b`,暗色下 #0a0a0a 描边在 #0a0a0a 底不可见
- **修法**:改 readToken('--color-black', …) 等,与 graph-canvas.tsx 同模式

### 12. tag-cloud 计数色 rgba(0,0,0,0.7) 暗色不可读
- **根因**:`features/tags/tag-cloud.tsx:153`,暗色 tag 深底 + 黑字对比度极低
- **修法**:改 var(--color-black-soft) 或暗色覆盖

### 13. toolbar 工具标签 10px/9px + disabled opacity 0.55 对比度不足
- **根因**:`canvas/page.tsx:1709/1715/1718` 字号不进 token 阶(最小 xs=12px),disabled 0.55 透明度降对比度到 ~3:1 低于 AA
- **修法**:字号走 var(--font-size-xs);disabled 提 opacity 或换色

---

## P2 — 打磨(数据卫生 / 持久化 / a11y 一致性)

### 交互
- **14. freedraw 单点产生幽灵元素**:点一下(没拖)→ 1 点 freedraw(w=0 h=0),不可见不可选但进持久化。修:points.length<2 丢弃。
- **15. eraser 快速拖拽漏擦细线**:采样点间跳过线元素。修:onMove 记上一点,线段 eraserHitTest。
- **16. text 编辑中 pan 画布 textarea 错位**:textarea 用 screen 坐标,pan 后视觉飘。修:编辑中禁 pan 或跟随 view。
- **17. text 空文本提交静默丢弃无反馈**:修:toast 或允许空文本。
- **18. connect 点空白/同元素松手无引导**:新用户点一下没反应。修:toast 或 card 高亮暗示可连。

### 持久化
- **19. outline/minimap 面板折叠态不持久**:reload 后默认展开。修:collapsed 读写 localStorage。

### UI 一致性 / a11y
- **20. focus-visible 缺失/不统一**:cv-focus-exit 缺;search/ask/ai-settings/graph-filters 用 :focus 而非 :focus-visible。修:统一 :focus-visible。
- **21. disabled opacity 0.5 vs 0.55 混用**:rail-menu 0.5 / rail-btn 0.55 / settings 0.5。修:统一(建议抽 --opacity-disabled token)。
- **22. 非 8px 网格值**:freedraw-panel/relation-panel gap 4px / height 18px 30px / font 15px。修:走 space-0.5/space-2/space-4/font-size-sm。
- **23. opacity 叠 gray 对比度低**:home__secondary-sep(gray+0.6)、cv-focus-exit(0.7)。修:去 opacity 或换 gray-soft。
- **24. mini-input backdrop rgba(10,10,10,0.5) 暗色不可见**:修:color-mix 或暗色反转。

---

## 推荐分批

- **批 1(P0 + v0.40 遗漏)**:#1 visibilitychange 残留 + #2 方向键 undo + #3 freedraw cancel + #4 connect hitTest 缓存 — 全是 v0.40 同类根因,最高价值,改动集中在 adapter
- **批 2(P1 交互)**:#5 eraser undo DB + #6 resize snap + #7 RelationPanel 反馈 + #8 空 undo 步
- **批 3(P1 UI)**:#9-13 i18n + 暗色 + 铁律
- **批 4(P2 打磨)**:#14-24,可选,边做边定

每批:设计 → 计划 → subagent TDD → review → commit → 手测。
