# 交互设计语言 — Bauhaus 三态视觉规范

> 2026-06-27 确立。5 轮画布工具栏打磨后沉淀的统一规范。
> 任何新按钮 / 可交互元素都必须遵循这套语言,不要临时发挥。

## 核心原则

**Bauhaus = 三原色 + 硬边框 + 硬阴影 + 功能即形式。** 交互态用颜色 + 缩放表达,
不用模糊 / 渐变 / 柔和阴影。每个按钮的「当前态」必须一眼可辨。

## 按钮状态机(五态)

| 状态 | 视觉 | 语义 | 用色 |
|------|------|------|------|
| **default** | 白底黑字,灰边框 | 可点击,未激活 | `--color-white` / `--color-black` / `--color-gray-soft` |
| **hover** | 浅灰底 | 鼠标悬停轻提示 | `--color-gray-soft` |
| **active(按下)** | 黄底黑边 + `scale(0.94~0.96)` | 正在按下,触感反馈 | `--color-yellow` + `transform: scale()` |
| **激活/选中(持续)** | 黄底黑边黑字 | 这个在用 / 面板开着 | `--color-yellow` + `--color-black` |
| **disabled** | `opacity: 0.55` | 不可用 | 灰化 |

> 特例:**toggle 开关 ON 态**(如 Snap 网格开关)用**黑底白字**,区别于「选中」
> (黄底)—— 开关是二值状态,选中是模式选择,视觉分层。

## 颜色语义(不可混用)

| 颜色 | 语义 | 误用警告 |
|------|------|---------|
| **黄 `--color-yellow`** | 激活 / 选中 / 正在用 | ❌ 不要用于危险操作 |
| **黑 `--color-black`** | toggle ON / 边框 / 主文字 | — |
| **红 `--color-red`** | 危险 / 错误 / focus 轮廓 | ❌ 不要用于普通激活 |
| **灰 `--color-gray-soft`** | hover / 分隔线 / 次要文字 | — |

**关键约束**:工具激活态(`.tb-tool--active`)用**黄底黑边**,不是红。
红色只留给危险/错误/focus 轮廓。

## 尺寸规范

| 元素 | 尺寸 | 布局 |
|------|------|------|
| 顶栏工具按钮 `.tb-tool` | 44×40px | 图标 + 中文标签 两行 |
| 侧栏按钮 `.cv-rail__btn` | 60×44px(窄屏 40×40) | 图标 + 短标签 两行 |
| 顶栏小按钮 `.tb-snap`/`.tb-icon-btn` | 高 32px | 单行 |
| 最小点击目标 | ≥ 32×32px | 触摸友好 |

## 实现技巧

### 1. 透明边框占位(防布局跳动)

```css
.foo { border: 2px solid transparent; }            /* 占位 */
.foo:hover { background: var(--color-gray-soft); }  /* 边框不变,不跳 */
.foo--active { border-color: var(--color-black); }  /* 填色,尺寸不变 */
```
**反模式**:`border: 0` → hover 时加 `border: 2px` 会让按钮跳 4px。

### 2. 过渡时长

```css
transition: background 80ms, color 80ms, border-color 80ms, transform 60ms;
```
- 颜色/边框:80ms(快速但不突兀)
- transform(缩放):60ms(更跟手)

### 3. 按下缩放

```css
.foo:active:not(:disabled) { transform: scale(0.94); }
```
所有可点击按钮都要有 `:active` 缩放 —— **这是「按动反馈」的核心**。
缺了它用户会觉得按钮「死的」。

## 硬阴影(Bauhaus 标志)

浮层 / 模态用**硬偏移阴影**(无模糊),不用柔光:
```css
box-shadow: 2px 2px 0 0 var(--color-black);   /* 轻浮层 */
box-shadow: 4px 4px 0 0 var(--color-black);   /* 模态/强浮层 */
```

## 自检清单(新按钮必过)

- [ ] 五态全覆盖(default/hover/active/激活/disabled)
- [ ] `:active` 有 `transform: scale()` 按下反馈
- [ ] 透明边框占位,态切换不跳动
- [ ] 激活态用黄底黑边(非红)
- [ ] transition 80ms 颜色 + 60ms transform
- [ ] 最小点击区 ≥ 32×32
- [ ] focus-visible 有红轮廓(outline 2px + offset 2px)
