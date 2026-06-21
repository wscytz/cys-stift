# Phase 1 视觉对照笔记

> 截图：`docs/design/screenshots/phase-1/`（desktop 1440×4800 + mobile 390×2400 + home 1440×900）
> 服务：`apps/web/out/` 经 `python3 -m http.server 3002` 静态服务

---

## 总体

**结论**：设计系统落地与 spec §5 一致。视觉契约成立——任何人打开 `/design` 都能一眼看到"这就是 cy's Stift 的视觉语言"。

---

## 逐项核对

### Manifesto / 头部
- [x] 顶部 8px 灰色（system region）Toolbar，左侧"cy's stift / design"，右侧 v0.2.0 红 tag
- [x] "Form follows **function**" 中 "function" 红字 accent
- [x] 五条 manifesto：six colours / eight-pixel grid / three voices / hard shadows / geometric

### 01 · Color（六原色）
| token | spec hex | 截图标注 | 一致 |
|---|---|---|---|
| red | `#d40000` | `#d40000` | ✅ |
| yellow | `#ffce00` | `#ffce00` | ✅ |
| blue | `#003f7f` | `#003f7f` | ✅ |
| black | `#0a0a0a` | `#0a0a0a` | ✅ |
| white | `#fafafa` | `#fafafa` | ✅ |
| gray | `#8c8c8c` | `#8c8c8c` | ✅ |
| soft 副色 | 各 token 自带 | 每个色块下方都有 soft 行 | ✅ |

### 02 · Typography
- [x] Display "灵感 3 秒记" — Space Grotesk，几何感对
- [x] Body "A local-first inspiration canvas…" — Inter
- [x] Mono "phase 1 · design system · v0.2.0" — JetBrains Mono
- [x] 字体阶梯 xs/sm/base/lg/xl/2xl/3xl/4xl 全部可见，"Bauhaus" 字号递增

### 03 · Spacing
- [x] 0/8/16/24/32/40/48/64/80/96/128px 红 bar 阶梯
- [x] 全部 8 倍数，符合 §5.1 网格

### 04 · Borders & shadows
- [x] hairline 1px（细）
- [x] thick 2px（粗）
- [x] shadow sm `0 1px 0 0 currentColor`
- [x] shadow md `2px 2px 0 0 currentColor`（无模糊）

### 05 · Region colors
- [x] capture → red
- [x] inbox   → red
- [x] canvas  → black
- [x] archive → blue
- [x] system  → gray（也展示在顶部 Toolbar）

### 组件

#### Button
- [x] Primary（白底黑边 + 红/黑阴影）
- [x] Secondary（黑底白字）
- [x] Danger（红底白字）
- [x] Ghost（无边框）
- [x] Disabled（灰 40% 透明）

#### Input
- [x] Title / Body 两个 under-line input
- [x] 标签 mono caps
- [x] 提示 "Focus turns the underline red"

#### Card
- [x] "A bold idea" / "Quiet reference" 两张示例
- [x] 白底 + 单线边 + 8px 微圆角 + Space Grotesk 标题

#### Tag
- [x] 6 色：red(yellow-blue-black-gray-white) 各一
- [x] 软底 + 颜色边框 + mono caps 文字

#### Toolbar
- [x] 三条 region 色条 toolbar（capture/canvas/archive）

#### Modal
- [x] 静态 frame 示范可见（hairline white + 50% black backdrop + offset shadow）
- [ ] 实际 open/close 行为需要交互验证，留 Phase 2+ 真实 use case

#### Tooltip
- [x] 三个按钮包了 Tooltip（hover/focus 才显示）
- [ ] Tooltip 本体需 hover 截图，静态截图不可见（预期）

---

## 已知 / 待优化

1. **Next.js peer dep warning**（React 19 vs Next 15.0.3 期望）— 不影响 build，但 Phase 2 顺手升 Next 15.1+
2. **Modal 静态展示** — `/design` 页里通过 React state 切换，截图看不到弹层（设计如此）。完整交互验证在后续 phase 用真实 use case 触发
3. **Tooltip** 同上
4. **字体加载确认** — "灵感 3 秒记" 看上去像 Space Grotesk，但要在桌面端 Tauri webview 内截图确认（字体文件网络下载需时）

---

## 跨平台状态

- ✅ macOS / 1440×4800：渲染正常
- ⏳ Windows / iOS / Android：未在本阶段复验（按计划）
