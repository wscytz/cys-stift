# cy's Stift UI 设计系统

> 2026-06-27 确立。subagent 四轮审计后沉淀的完整视觉规范。
> 权威 token 源:`packages/ui/src/tokens.css` + `tokens.ts`。本文档是**使用规则**。
> 任何新组件/页面必须遵循;改 token 改两处(CSS + TS)。

## 核心原则

**Bauhaus = 三原色 + 8px 网格 + 硬边框 + 硬阴影 + 功能即形式。**
不做模糊、不做渐变、不做柔光。每个元素都能被一眼读出"属于这个系统"。

---

## 一、颜色(6 原色,不可越界)

| Token | 浅色 | 暗色 | 语义 |
|-------|------|------|------|
| `--color-red` | #d40000 | #ff4d4d | 危险/错误/focus 轮廓 |
| `--color-yellow` | #ffce00 | #ffd633 | **激活/选中**(Bauhaus 强调色) |
| `--color-blue` | #003f7f | #66a3ff | 信息/链接/frame |
| `--color-black` | #0a0a0a | #fafafa | 主文字 / toggle-ON 底 |
| `--color-white` | #fafafa | #0a0a0a | 页面底 / 卡片底 |
| `--color-gray` | #666666 | #808080 | 次要文字 / hover 底(soft) |

**铁律**:
- ❌ 禁第 7 色(无 green/teal/purple)。颜色只来自上表 + `-soft` 变体。
- ❌ 组件层不写 hex,全走 `var(--color-*)`。`grep -rE '#[0-9a-f]{3,6}' src/components/` 应无果。
- **黄=激活选中**,**黑=toggle ON**,**红=危险**,**灰=hover/次要** —— 语义不可混用。

### 对比度(WCAG AA,已验证)

| 组合 | 对比度 | 用途 |
|------|--------|------|
| black-soft on white | 13.6:1 ✅ | 正文 |
| gray(#666) on white | 5.5:1 ✅ | 次要文字(≥4.5 达标) |
| black on yellow | 13.3:1 ✅ | 激活态文字 |
| red on white | 5.3:1 ✅ | focus 轮廓 |
| disabled(opacity 0.55) | 4.35:1 | 接近 AA,可接受 |

---

## 二、间距(8px 网格 + 4px 半阶)

| Token | 值 | 用途 |
|-------|-----|------|
| `--space-0` | 0 | — |
| `--space-quarter` | 2px | 边框/分隔线粗细(罕用) |
| `--space-0.5` | 4px | **小间距**(tag chip、图标间距) |
| `--space-1` | 8px | 基础内边距/小 gap |
| `--space-2` | 16px | 卡片内边距/中 gap |
| `--space-3` | 24px | 区块间距 |
| `--space-4` | 32px | 大区块 |
| `--space-5`~`--space-16` | 40~128px | 页面级布局 |

**铁律**:
- 所有间距/尺寸是 4 或 8 的倍数。❌ 禁 5px/6px/7px/13px。
- 同语义用同 token(卡片内边距恒 `--space-2`,不混 12px/16px)。
- `grep -rE ':\s*[0-9]+px'` 应只剩 1px 边框、10px 微字号等已声明例外。

---

## 三、尺寸(控件高度三阶 + 触摸目标)

| 场景 | 高度 | 用途 |
|------|------|------|
| 紧凑控件 | 32px | 输入框/下拉/小按钮(顶栏) |
| 标准按钮 | 40px | 主按钮/`@cys-stift/ui Button` |
| 工具按钮 | 44×40px | 画布工具(图标+标签两行) |
| 大输入 | 48px | 搜索框(全宽) |
| 触摸目标 | ≥44px | WCAG 推荐(允许非 8 倍数) |

**铁律**:同类控件跨页面高度一致。❌ 禁 28px/30px(破坏网格,已清理)。

---

## 四、排版

### 字号阶梯

| Token | 值 | 用途 |
|-------|-----|------|
| `--font-size-xs` | 12px | 标签/eyebrow/mono 小字 |
| `--font-size-sm` | 14px | 次要正文/按钮文字 |
| `--font-size-base` | 16px | 正文 |
| `--font-size-lg` | 20px | 小标题 |
| `--font-size-xl`~`4xl` | 24~64px | 标题 |

### 字体(三选一)

| Token | 字体 | 用途 |
|-------|------|------|
| `--font-display` | Space Grotesk | 标题 |
| `--font-body` | Inter | 正文 |
| `--font-mono` | JetBrains Mono | 代码/标签/工具栏 |

**铁律**:❌ 禁第 4 种字体。❌ 禁写死 `monospace`/`'Inter'`,全走 token。

---

## 五、边框 / 圆角 / 阴影

### 边框
| Token | 值 | 用途 |
|-------|-----|------|
| `--border-hairline` | 1px solid | 常规分隔 |
| `--border-thick` | 2px solid | 强调边框(激活态/浮层) |

### 圆角
| Token | 值 | 用途 |
|-------|-----|------|
| `--radius-sm` | 2px | 默认(按钮/卡片/输入框) |
| `--radius-md` | 4px | 大容器(罕用) |

**Bauhaus 圆角克制**:默认 2px,❌ 禁 >8px 大圆角。

### 阴影(硬偏移,无模糊)
| Token | 值 | 用途 |
|-------|-----|------|
| `--shadow-sm` | 0 1px 0 | 轻分隔 |
| `--shadow-md` | 2px 2px 0 0 | 卡片/按钮 |
| `--shadow-lg` | 4px 4px 0 0 | 浮层/模态 |

**铁律**:❌ 禁模糊阴影(`box-shadow: Npx Npx Npx` 带 blur 破坏 Bauhaus)。颜色用 `currentColor` 或 `var(--color-black)`。

---

## 六、交互态(五态状态机)

详见 [`interaction-language.md`](./interaction-language.md)。摘要:

| 状态 | 视觉 |
|------|------|
| default | 白底黑字,`--border-hairline` |
| hover | `--color-gray-soft` 浅灰底 |
| **active(按下)** | `transform: scale(0.94~0.96)` + 黄底,**必须有** |
| 激活/选中 | 黄底黑边(`--color-yellow` + `--color-black`) |
| toggle ON | 黑底白字(区别于选中) |
| disabled | `opacity: 0.55` |

**自检**:每个可点击按钮必须有 `:active { transform: scale() }` —— 缺了用户觉得按钮"死的"。

---

## 七、z-index 分层(全局统一)

| 层 | z-index | 内容 |
|----|---------|------|
| 内容 | 0 | 页面/画布主体 |
| 浮动缩略 | 10 | minimap |
| 侧栏 | 20 | canvas side rail |
| 浮动面板 | 30 | relation/freedraw/outline panel |
| AppMenu | 40 | 全局顶栏 |
| **模态** | **100** | 所有 Modal(基座 `@cys-stift/ui`) |
| **通知/捕获** | **110** | Toast、MiniInput(在模态之上) |
| skip-link | 9999 | a11y 跳过 |

**铁律**:Toast/MiniInput 用 110(在模态之上,但不倒置到 200)。❌ 禁随意写 z-index 魔法值。

---

## 八、画布专用(`--color-canvas`)

画布页底色走 `--color-canvas` token(浅色=白,暗色=深灰),**不写死 #f8fafc**。
自研引擎 `tokenResolver('--color-canvas', '#ffffff')` 读此 token,暗色模式自动跟随主题。

---

## 自检清单(新组件/页面必过)

- [ ] 颜色只来自 6 token,无 hex/第 7 色
- [ ] 间距是 4/8 倍数,走 `--space-*`
- [ ] 控件高度用三阶(32/40/48)或触摸目标(44)
- [ ] 字号走 `--font-size-*`,字体走三 token
- [ ] 边框/圆角/阴影走 token,无写死像素
- [ ] 五态全覆盖,`:active` 有缩放
- [ ] z-index 用分层值(10/20/30/100/110),不造新魔法值
- [ ] 暗色模式:无写死白底,背景走 `--color-canvas`/`--color-page-bg`
- [ ] `grep -rE '#[0-9a-f]{3,6}' src/` 在本组件无新增
