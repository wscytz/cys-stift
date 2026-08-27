# Swiss Editorial 设计语言规范(v0.2 权威源)

> **来源**:PRD `stitch_high_contrast_brutalist_prd` 的 `swiss_desktop_editorial/DESIGN.md`,2026-08-24 随 packages/ui v0.2 重绘采纳,是当前设计语言的**语义与出处权威**。
> **token 权威源**不变:`packages/ui` 三源镜像(`tokens.css` / `tokens.ts` / `tailwind-preset.css`)+ canvas-engine `tokenResolver` 兜底 hex(第 4 处镜像)。本文回答"为什么是这些值、规则是什么"。
> 使用规则与组件纪律见 `packages/ui/CLAUDE.md`;v0.1 Bauhaus 时期的设计文档已归档(私有 docs 仓 `design-system.md` 顶部有换代说明)。

---

## 一、规范原文(verbatim)

```yaml
---
name: Swiss Desktop Editorial
colors:
  surface: '#fbf9f6'
  surface-dim: '#dbdad7'
  surface-bright: '#fbf9f6'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#f5f3f0'
  surface-container: '#efeeeb'
  surface-container-high: '#eae8e5'
  surface-container-highest: '#e4e2df'
  on-surface: '#1b1c1a'
  on-surface-variant: '#5b403c'
  inverse-surface: '#30312f'
  inverse-on-surface: '#f2f0ed'
  outline: '#8f706b'
  outline-variant: '#e4beb9'
  surface-tint: '#b91e19'
  primary: '#b51b17'
  on-primary: '#ffffff'
  primary-container: '#d9372d'
  on-primary-container: '#fffbff'
  inverse-primary: '#ffb4aa'
  secondary: '#5e5e5c'
  on-secondary: '#ffffff'
  secondary-container: '#e1dfdc'
  on-secondary-container: '#626360'
  tertiary: '#006480'
  on-tertiary: '#ffffff'
  tertiary-container: '#007ea1'
  on-tertiary-container: '#fbfdff'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#ffdad5'
  primary-fixed-dim: '#ffb4aa'
  on-primary-fixed: '#410001'
  on-primary-fixed-variant: '#930006'
  secondary-fixed: '#e4e2df'
  secondary-fixed-dim: '#c7c6c3'
  on-secondary-fixed: '#1b1c1a'
  on-secondary-fixed-variant: '#464744'
  tertiary-fixed: '#bce9ff'
  tertiary-fixed-dim: '#74d2f9'
  on-tertiary-fixed: '#001f2a'
  on-tertiary-fixed-variant: '#004d64'
  background: '#fbf9f6'
  on-background: '#1b1c1a'
  surface-variant: '#e4e2df'
  surface-white: '#ffffff'
  border-muted: '#dbdad7'
typography:
  display-xl:    { fontFamily: Space Grotesk, fontSize: 64px, fontWeight: '500', lineHeight: '1.1', letterSpacing: -0.03em }
  display-lg:    { fontFamily: Space Grotesk, fontSize: 48px, fontWeight: '500', lineHeight: '1.1', letterSpacing: -0.02em }
  headline-lg:   { fontFamily: Space Grotesk, fontSize: 32px, fontWeight: '500', lineHeight: '1.2', letterSpacing: -0.02em }
  ui-label-caps: { fontFamily: Space Grotesk, fontSize: 12px, fontWeight: '600', lineHeight: '1.0', letterSpacing: 0.08em }
  body-lg:       { fontFamily: Inter, fontSize: 16px, fontWeight: '400', lineHeight: '1.6', letterSpacing: 0em }
  body-sm:       { fontFamily: Inter, fontSize: 14px, fontWeight: '400', lineHeight: '1.5', letterSpacing: 0em }
  metadata:      { fontFamily: Inter, fontSize: 11px, fontWeight: '500', lineHeight: '1.2', letterSpacing: 0.05em }
  sidebar-label: { fontFamily: Space Grotesk, fontSize: 13px, fontWeight: '500', lineHeight: '1.0', letterSpacing: 0.05em }
spacing:
  sidebar-width: 280px
  topbar-height: 64px
  row-height: 48px
  margin-desktop: 32px
  grid-line: 1px
  gutter: 0px
---
```

### Brand & Style

The design system is a high-performance desktop adaptation of the Swiss International Typographic Style, optimized for information-dense environments. It targets power users who value technical precision, spatial clarity, and an authoritative aesthetic that mimics architectural broadsheets or technical blueprints.

The design movement is **Brutalist Minimalism**, defined by:
- **Structural Integrity:** Reliance on a 1px grid system rather than shadows to define hierarchy and boundaries.
- **High-Density Architecture:** Efficient use of screen real estate for complex data visualization and management.
- **Editorial Cadence:** Asymmetric layouts that guide the eye through intentional negative space and rigid typographic anchoring.
- **Technical Precision:** A clinical atmosphere achieved through sharp geometry and monospace-adjacent type.

### Colors

The palette uses a "Warm Paper" foundation to reduce eye strain in high-density desktop environments while maintaining a non-digital, tactile quality.

- **Primary (Accent-Red):** Used surgically for high-priority interactive states, active focus indicators, and errors.
- **Secondary (Ink):** Used for primary text and high-contrast structural borders for active components.
- **Neutral (Surface):** The base application background, providing a soft, professional canvas.
- **Surface-Dim:** Used for the skeleton of the system—1px structural lines, inactive containers, and grid dividers.
- **Surface-White:** Reserved for "Document" or "Canvas" areas and floating toolbars to create subtle tonal separation.

### Typography

Typography is the primary driver of the user experience. Space Grotesk provides a geometric, technical feel for navigation and headers, while Inter handles content with utilitarian neutrality.

- **Editorial Hierarchy:** Display sizes are significantly enlarged to serve as anchor points in wide viewports.
- **UI Labels:** All navigation elements and UI labels use uppercase Space Grotesk with increased tracking for clarity.
- **Metadata:** Use Inter for secondary info and small-scale labels to ensure legibility at minimal sizes.
- **Alignment:** Typography follows the grid strictly. In complex views, labels may be rotated 90 degrees to fit the narrow columns of the editorial grid.

### Layout & Spacing

The system uses a rigid, 12-column **Fixed Editorial Grid**. It prioritizes density and logical grouping over fluid padding.

- **Unified Sidebar:** A fixed 280px vertical navigation docked to the left.
- **TopBar:** A fixed 64px header that spans the width of the viewport.
- **Grid Lines:** Vertical and horizontal 1px lines (`#dbdad7`) replace standard gutters. Elements should span columns asymmetrically (e.g., 3-column metadata panel next to a 9-column workspace).
- **Responsive Behavior:**
  - **Desktop:** 12-column grid with 32px outer margins.
  - **Tablet:** 8-column grid with 24px outer margins.
  - **Mobile:** 4-column grid with 16px outer margins; Sidebar collapses to a drawer.
- **Vertical Rhythm:** All interactive list items and table rows are strictly 48px in height.

### Elevation & Depth

This design system is strictly two-dimensional. Depth is achieved through tonal stacking and 1px containment lines rather than shadows.

- **Zero Shadows:** Shadows are prohibited across all components.
  - 落地豁免(2026-08-27 注记):`globals.css` 画布 a11y 大纲面板保留 4px 墨色硬投影——它是键盘用户 Tab 聚焦时唯一的浮起指示,语义为焦点指示而非装饰性阴影,非聚焦态视觉上不可见。
- **Tonal Layers:** Hierarchy is established by the contrast between the background (`#fbf9f6`) and active surfaces (`#ffffff`).
- **Line Hierarchy:**
  - **Primary Grid:** 1px `#dbdad7` for the base structural skeleton and dividers.
  - **Active Focus:** 1px `#1b1c1a` for active buttons, focused inputs, or high-level panels.
- **Animation Principles:**
  - Interactions are instant (150ms ease-out) for hover and active states.
  - Page transitions use editorial-style movements: horizontal slide-ins or simple opacity fades to maintain a "printed page" feel.

### Shapes

The shape language is uncompromisingly **Sharp**. All UI elements—buttons, inputs, cards, and sidebars—must have 0px corner radii. This reinforces the technical, grid-based nature of the editorial design.

- **Modular Blocks:** Use square 1:1 aspect ratios for icon buttons to maintain a modular, blueprint-like feel.
- **Functional Circles:** The only exception to the sharp rule is for functional status dots (6px diameter), used sparingly for notifications or status indicators.

### Components

- **Sidebar:** 280px wide. Labels are uppercase Space Grotesk. Active states are indicated by a 2px `#e03c31` left-aligned vertical line.
- **TopBar:** 64px height with a 1px bottom border. Contains view titles and global actions. Use text-based labels over icons where possible.
- **Buttons:** 0px corners, 1px `#1b1c1a` border.
  - **Hover:** Invert colors (Surface `#1b1c1a`, Text `#fbf9f6`).
  - **Active:** Background `#e03c31`, Border `#e03c31`.
- **Cards:** Defined by a 1px `#dbdad7` border. No internal padding is used to separate cards; they are tiled against the grid lines.
- **Data Tables:** 48px row heights. 1px horizontal dividers. Headers are uppercase Space Grotesk. Hovering a row applies a `#ffffff` background tint.
- **Input Fields:** 48px height. 1px `#dbdad7` bottom border. On focus, the border becomes 1px `#1b1c1a` with the label shifting to a small uppercase position above the value.
- **Status Indicators:** 6px solid dots in `#e03c31` placed to the left of text or in the top-right corner of cards to indicate unsaved changes or "live" status.

---

## 二、落地偏差注记(app 实现与规范原文的有意差异)

规范是出发点,以下是 v0.2 落地时**有记录的偏差**,均有出处或决策依据:

| # | 规范原文 | app 落地 | 依据 |
|---|---------|---------|------|
| 1 | 页面切换"编辑式滑入/淡入"未给数值 | page-enter 350ms(PRD 600ms 是 demo hero 节奏);支持同文档 View Transitions 的引擎走 160/280ms 编辑式过渡 | 动效二轮(2026-08-24) |
| 2 | 交互动效只定 150ms ease-out | 增补动效族 token:`--duration-enter/row/title/press/flash` + `--stagger-row/step`(三源镜像) | PRD animated 稿各处节奏的收敛 |
| 3 | palette 直接使用 | legacy 6 色 token 名(red/yellow/blue/black/white/gray)**冻结为别名**:用户持久化设置与 canvas 引擎依赖名字,值映射新 palette | v0.2 迁移决策,见 `packages/ui/CLAUDE.md` |
| 4 | Sidebar 280px 常驻 | 64px 折叠图标轨 + hover/focus 覆盖式展开 280px + pin 钉住常驻 | 密度优化(64px 轨图标锚定轨心 32px 同轴) |
| 5 | Input focus 时标签上移小写位 | label 静置未上移 | **开放项**(未实装的规范细节) |
| 6 | 状态点静态 6px | 静态一致;另有 breathe 呼吸 + 扩散环动画(纯合成器,reduced-motion 关) | live 状态表达增强 |
| 7 | 品牌红只出现一次(#e03c31 状态点) | 品牌红 `--color-accent` 与交互红 `--color-primary`(#b51b17)并存 | PRD 原文即两红并存(Colors frontmatter 与 Components 均引用) |
| 8 | 旋转 90° 标签 | 未实装(竖排标签是 demo 装饰件,有意不迁) | 同 noise/scanLine 类 demo 道具决策 |
| 9 | — | 桌面 Tauri 壳吃同源 tokens;**安装器图标未随 v0.2 换代** | 已知项(Release notes 记录) |

新增组件(规范外,服务编辑语言):`EditorialMotif`(编辑装饰件)、`GridRule`(1px 栅格线)、`Tabs`(选项卡,2026-08-25);legacy `BauhausMotif` 保留仅为 v0.1 兼容。
