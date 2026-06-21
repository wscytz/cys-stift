# 2026-06-23 · v0.24.1-modal-focus-trap

> Phase B(a11y)。ui 包 Modal 加 focus trap。

## 修复明细

### Modal focus trap

`packages/ui/src/components/modal.tsx`

**Before**: Modal 无 focus 管理。打开后 Tab 逃出到页面背后,关闭后焦点不回到触发元素。键盘/a11y 用户体验差。

**After**:
- 打开:stash `document.activeElement`,focus frame 内首个 focusable(否则 frame 本身,`tabIndex=-1` fallback)
- Tab/Shift+Tab:在 frame 的 focusable 列表内循环(shift+tab 在 first → 跳 last;tab 在 last → 跳 first)
- 关闭:restore 焦点到 stashed 元素
- 每个 trap 只在 `frame.contains(document.activeElement)` 时干预 → modal 栈(card-detail 主 Modal + confirm-delete 子 Modal)只有顶层 trap 接管,不抢键
- Escape 不变(仍由 caller 外部 useEffect 处理)

### design page 适配

`apps/web/src/app/design/page.tsx`

Modal 现在是 `'use client'`(ui 包第一个用 hooks 的组件)。/design 是 server showcase 页(export `metadata`),**不能传函数 prop(`onClose`)给 client 组件**(Next.js 规则)。

ModalExample 原本 `<Modal open={false} onClose={() => {}}>`(渲染 null,实际展示靠下面静态 div)。改为纯 CSS 视觉 mockup,删掉真 Modal 用法 + import。design 保持 server(保留 metadata)。

## 关键决策

### 为什么 Modal 要 'use client'

focus trap 用 `useEffect`(document keydown listener)+ `useRef`(frame ref)。React hooks 只在 client component 跑。Modal 是 ui 包第一个需要 hooks 的组件(Button/Input/Tag/Toolbar/Card 都是纯展示无 hooks)。

### 为什么每个 trap 自检 contains(activeElement)

card-detail.tsx 同时渲染主 Modal + confirm-delete 子 Modal(两个 `<Modal>`)。两个都 mount 时,两个 document keydown listener 都在。若都无条件干预 Tab,会冲突(preventDefault + focus 互相打架)。

自检 `frame.contains(document.activeElement)` 让只有"焦点在自己 frame 内"的 trap 响应。confirm 打开时焦点在 confirm frame → 只有 confirm trap 响应;主 Modal trap 静默。confirm 关闭后焦点 restore 回主 Modal frame → 主 trap 重新响应。链式正确。

### 为什么 frame tabIndex=-1 + :focus outline none

- frame 需要 `tabIndex=-1` 才能被 `.focus()` 程序聚焦(作 fallback,当 frame 内无 focusable 子元素时)
- frame 被 focus 时默认有浏览器 outline,视觉难看(它只是 focus 容器,不是交互元素)
- `:focus { outline: none }` 移除,因为真正的 focus 指示由内部控件(button/input 的 focus 样式)承担
- 这是焦点管理容器的标准做法

### 为什么不抽 ModalExample 到 client 子文件

可以抽 `apps/web/src/app/design/modal-example.tsx`('use client')让 design page import。但:
- ModalExample 用 `open={false}` 本来就不显示真 Modal(渲染 null)
- 实际视觉展示靠静态 div mockup
- 抽文件增加一个模块,无实际收益(YAGNI)
- 真 Modal 在 /inbox /archive /trash /canvas 产品页验证,design 只是视觉契约静态展示

所以直接删真 Modal 用法,保留静态 mockup。

### 为什么 Escape 不放进 Modal

现有模式:caller(card-detail.tsx 等)在外部 `useEffect` 监听 window keydown 处理 Escape(有时还要区分"主 Modal escape"vs"confirm Modal escape")。Modal 内部加 Escape 会与 caller 冲突或重复。保持 Escape 由 caller 负责,Modal 只管 focus trap(Tab)。职责分离。

## 不修复的发现(明确 defer)

- ⏸️ focus trap 未处理"frame 内无 focusable 时 Tab 默认行为"边缘——已有 fallback(focus frame),足够 MVP
- ⏸️ Modal 未监听 backdrop 点击外的"点击 frame 外区域"——backdrop onClick 已处理
- ⏸️ Phase C Tauri 全局快捷键(下一档)
- ⏸️ 媒体入口 / OPFS / canvas body preview / 其他 backlog

## 验收

- domain 26/26 + db 7/7 + web build 14 页 exit 0
- 3 个文件 / +90 -9 行 / 1 个 commit

## 已知遗留(明确 out of scope)

无 — Phase B 闭合,Phase C 待启动。