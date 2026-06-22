# 2026-06-21 · v0.26.1-high-freedom-canvas-f2

> 高自由画布 Phase F2(工具栏)。spec: [`2026-06-21-high-freedom-canvas.md`](../../specs/2026-06-21-high-freedom-canvas.md)。承接 F1(v0.26.0)地基。

## 背景

F1 铺好持久化地基 + card body preview,但画布仍 `hideUi` —— 用户无法加自由元素(便签/文本/形状/箭头/手绘),自由元素持久化"已就位但无法测试"。F2 放开 tldraw 笔记工具,画布真正可用为"自由整理"。

## 实现

### CanvasToolbar
`features/canvas/canvas-toolbar.tsx`(新)。fixed 底部居中浮动,8 工具:
- select(↖ v)/ draw(✎ d)/ rectangle(▭ r)/ ellipse(◯ o)/ arrow(→ a)/ note(☰ n)/ text(T t)/ eraser(⌫ e)

- `editor.setCurrentTool(id)` 切换
- `useValue('canvas tool', () => editor?.getCurrentToolId(), [editor])` 响应式高亮(active 红)
- 键盘快捷键 useEffect(meta/ctrl/alt 跳过,input/textarea/contenteditable 跳过)
- 包豪斯:白底 hairline + 硬阴影 + mono 字符 + active 红底白字
- editor null 时按钮 disabled

接入 `canvas/page.tsx` `.cv-host` 内 `<CanvasToolbar editor={editor} />`(TldrawCanvas 后)。

## 关键决策

### 为什么保留 hideUi 自定义工具栏(不放开 tldraw 默认)
- tldraw 默认 toolbar 彩色丰富(多种笔色/便利贴色/形状),与包豪斯 6 原色 + 极简冲突
- 自定义保持品牌:mono 字符 + hairline + 硬阴影 + 红 active
- hideUi 屏蔽默认 chrome,我们的工具栏是唯一工具入口

### 为什么 card 不进工具栏(仍 dblclick)
- card 是结构化数据(CardService 单一源,跨 inbox/archive/search),与自由 shape(只存 snapshot)数据源不同
- dblclick 建 card 是现有肌肉记忆(DoubleClickBridge)
- 工具栏放 card 会混淆两种"创建"模式(结构化卡 vs 自由 shape)
- 未来若要显式 card 入口,可加 card 工具(自定义 tool,点击建空卡),scope 更大,defer

### 工具集选择
- select / draw / rectangle / ellipse / arrow / note / text / eraser
- 无边记核心:手绘(draw,草图/圈注)+ 形状(rectangle/ellipse,分组/框)+ 箭头(arrow,关系)+ 便签(note)+ 文本(text)
- 包豪斯约束:无彩色便利贴(tldraw note 默认黄,但包豪斯容忍单一中性色,后续可调)
- 不放 triangle/diamond/hexagon/star(line-clamp 工具栏宽度,基础形够用)
- 用户说"手绘稍微做" → draw 工具含,基础可用

### 快捷键
- v/d/r/o/a/n/t/e(对应 8 工具)
- 避开现有 canvas 快捷键(+ - 0 1 g)
- meta/ctrl/alt 组合跳过(不抢系统快捷键)
- input/textarea/contenteditable 内跳过(不打字时触发)
- tldraw 默认快捷键在 hideUi 下可能仍绑 → 双绑切同工具,无冲突

## 验收

- domain 26/26 + db 7/7 + web build exit 0
- GUI(需手动测):工具栏显示,切换工具,画布加便签/文本/形状/箭头/手绘,与灵感卡共存,刷新全部持久(F1 snapshot)

## 不修复 / defer

- ⏸️ card 显式工具入口(自定义 tool,点击建空卡)
- ⏸️ tldraw note 颜色包豪斯化(默认黄,可接受)
- ⏸️ 工具栏更多形状(triangle/diamond 等,YAGNI)
- ⏸️ OPFS / snapshot 体积管理(F1 defer 继续)

## 已知遗留

无 — F2 闭合高自由画布核心,F1+F2 共同交付"无边记式整理笔记"。