# Phase 1 实现计划 · 设计系统

| 字段 | 值 |
|---|---|
| 计划 | Phase 1：设计系统 |
| 创建 | 2026-06-19 |
| 依据 spec | `docs/superpowers/specs/2026-06-19-cys-stift-design.md` §5、ADR-0004 |
| 上游交付 | Phase 0（scaffold） |
| 下游交付 | Phase 2（数据层）前必须就位 |

---

## 0. 目标

把 spec §5 的包豪斯 tokens **落地为可用的 React 组件库**，并建一个 **可独立访问的 `/design` 页面**作为视觉契约——以后每个 phase 改动设计前，先来这里对照。

**核心承诺**：组件库不引入第六种颜色，所有间距在 8px 网格上，所有阴影是硬偏移（不模糊），所有标题用 Space Grotesk。

---

## 1. 范围

### ✅ 本阶段做

- **packages/ui** 从占位升级为真组件库
- **Tailwind preset** 把 Bauhaus tokens 注入 Tailwind 主题
- **7 个核心组件**：Button / Input / Card / Tag / Toolbar / Modal / Tooltip
- **`/design` 页面**：完整的视觉展示（token 调色板 / 字体 / 网格 / 每个组件的变体 / 区域色条）
- **Storybook-lite**：在 `/design` 下用 anchor 链接做"侧栏导航"，**不引入 Storybook 依赖**（保持 lean，符合 §6.2 选择）

### ❌ 本阶段不做

- 业务组件（InboxCard、CanvasCard）— Phase 3/4
- 暗色模式 — 预留
- 动画 — 包豪斯偏静，缓动 200ms 已够
- 多语言文案层 — Phase 1 全中文，硬编码即可

---

## 2. 前置

- Phase 0 已完成（pnpm / Next / Tauri shell 跑通）
- Node 22、pnpm 9+ 已就位

---

## 3. 任务清单

### P1-T1 · packages/ui 基础

- 把 `apps/web/src/styles/tokens.css` 移出（变成 `packages/ui/src/tokens.css`），让 web 端通过 `@import '@cys-stift/ui/tokens.css'` 消费
- `packages/ui/src/tokens.ts`：把 spec §5.1 的 tokens 转成 TS 对象（颜色 / 字体 / 间距 / 圆角 / 阴影），**与 CSS variables 保持双源**（CSS 优先，TS 用于 Tailwind preset 和运行时类型）
- `packages/ui/tailwind-preset.ts`：Tailwind v4 preset（用 `@theme` 把 tokens 注入 theme.colors / spacing / fontFamily）
- `packages/ui/src/index.ts`：导出所有组件
- 把 `apps/web` 的 `globals.css` 改成 import `@cys-stift/ui/tokens.css` + 一行 `@import "tailwindcss"`
- **验证**：`pnpm --filter web build` 仍能出静态产物，页面样式不变

### P1-T2 · 核心组件（每个都遵循 §5.3 的包豪斯特征）

| 组件 | 关键点 | 文件 |
|---|---|---|
| `Button` | 单线边框 + 几何形 + 按下时 `var(--shadow-md)` 偏移变实 + 4 变体（primary/secondary/danger/ghost） | `src/components/button.tsx` |
| `Input` | 极简下划线式（无背景框），聚焦时 `border-color: var(--color-red)` | `src/components/input.tsx` |
| `Card` | 白底 + `1px solid var(--color-black)` 边 + 8px 微圆角 + 标题用 Space Grotesk | `src/components/card.tsx` |
| `Tag` | 纯文字 + 颜色 token，可换 6 色 | `src/components/tag.tsx` |
| `Toolbar` | 左侧 8px 宽色条标识 region（slot） | `src/components/toolbar.tsx` |
| `Modal` | 全屏 50% 黑遮罩 + 白底单线主体，Esc 关闭 | `src/components/modal.tsx` |
| `Tooltip` | 黑底白字 + 2px 圆角 + 200ms 缓动 | `src/components/tooltip.tsx` |

每个组件：
- 一个 `.tsx` + 必要的 CSS（或 Tailwind class）
- 一个 `.stories.tsx`（同目录，提供示例 props）—— 不引入 Storybook 运行时，只在 `/design` 里渲染
- 导出 props 类型

**验证**：每个组件在 `/design` 页面里有可见示例

### P1-T3 · `/design` 视觉契约页面

- 新路由 `apps/web/src/app/design/page.tsx`
- 左侧 anchor 导航（in-page TOC）：
  1. **Tokens** —— 6 色块 + soft 色块 + 字体大小阶梯 + 间距阶梯 + 圆角/阴影
  2. **Typography** —— Space Grotesk / Inter / JetBrains Mono 三字体样本
  3. **Region Colors** —— 5 个功能区色条 + 重映射示范
  4. **8px Grid** —— 一个可见的网格 overlay（toggle 开关）
  5. **Components** —— 7 个组件，每个展示 2–4 个变体
- 设计系统规则写在页头（"Form follows function" / "6 colors / 8px grid / Space Grotesk"）
- **验证**：`pnpm dev` 打开 `localhost:3000/design`，肉眼逐项对照 spec §5

### P1-T4 · 视觉验证（关键！）

- 用 `screencapture -o -l$(window-id)` 或 `screencapture -i` 截：
  - `localhost:3000/design`（桌面 1280×800）
  - `localhost:3000/`（首页确认没坏）
- 截 Tauri 窗口（同样地址，验证 web 与桌面视觉一致）
- 用 Preview 或 `sips` 看尺寸对不对
- **手动核对清单**：
  - 红是 `#d40000` 吗？
  - 标题字体是 Space Grotesk（不是 fallback 到 system-ui）吗？
  - 卡片边框是 1px 实线吗？
  - 间距能感觉到 8 的倍数吗？
- 把截图存到 `docs/design/screenshots/phase-1/` + 写一份视觉对比笔记

### P1-T5 · 收尾

- `docs/development/changelog.md` 加 Phase 1 段
- `docs/memory/decisions/2026-06-19-phase-1.md`
- `docs/memory/MEMORY.md` 索引加一条
- `git commit` + `git tag v0.2.0-phase-1`

---

## 4. 验收清单

- [ ] `pnpm --filter web build` 通过，静态产物仍正常
- [ ] `pnpm tauri dev` 仍能弹出窗口
- [ ] `/design` 页面在 web + 桌面看到一致
- [ ] 7 个组件每个都在 `/design` 有可见展示
- [ ] 没有引入第六种颜色（grep 验证）
- [ ] 间距都是 8 的倍数（视觉 + grep 验证关键组件）
- [ ] 截图归档到 `docs/design/screenshots/phase-1/`
- [ ] 视觉对比笔记写完，明确"哪些对"、"哪些待调"

---

## 5. 风险

| 风险 | 处理 |
|---|---|
| Tailwind v4 与 v3 写法差异大 | preset 用 v4 `@theme`，参考 v4 文档 |
| 字体在桌面端没加载（Tauri webview） | 截图核验；fallback 到 system-ui 也算可接受但要标注 |
| 颜色硬编码泄露 | grep `--color-[a-z]+-` 在 components 目录，结果应只剩 token 引用 |
| 组件 API 难用 | 每个组件写 1–2 个变体示例，不复杂化 |

---

## 6. 产出与汇报

完成后主动给出：

1. `pnpm build` 输出 + 产物大小
2. **`/design` 截图**（desktop + Tauri 两份）
3. **视觉对比笔记**（token / 字体 / 间距逐项打勾）
4. 下一步预告：Phase 2（数据层）
