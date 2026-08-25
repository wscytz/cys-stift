# packages/ui — Swiss Editorial 设计系统

> 编辑风 = 约束。这个包的纪律是**不让任何颜色/尺寸逃逸出 token 系统**。
> v0.2 起语言从 Bauhaus 换为 Swiss Editorial;规范原文已整合入仓:[`docs/design/swiss-editorial.md`](../../docs/design/swiss-editorial.md)(含落地偏差注记);
> 旧 6 色 token 名保留为别名(region 色 + 用户持久化设置 + canvas 引擎依赖名字)。

## 铁律

- **色板唯一来源 = `palette`**(DESIGN.md 全量,M3 风格命名)。组件**不得**引入色板外 hex。
- **legacy 6 色**(red/yellow/blue/black/white/gray)名字冻结,值映射 palette:
  red→primary、yellow→outline、blue→tertiary、black→on-surface、white→surface、gray→secondary。**不引第七个名字**。
- **所有颜色**通过 CSS variable(`var(--color-*)`)或 Tailwind class 引用,**不在组件里写 hex**。
- **8px 网格**:所有间距是 8 的倍数(`var(--space-*)`)。不允许写 `padding: 13px`。(例外须注明出处,如 StatusDot 6px 是 DESIGN.md 明文。)
- **字体**:display = Space Grotesk,body = Inter,mono = JetBrains Mono。三选一,不引入第四种。
- **零阴影**:阴影全面禁止(层级由 1px 线 + 色调分层表达)。`--shadow-*` token 保留但值恒 none。
- **圆角全 0**:唯一例外 = 功能性状态点圆(StatusDot/GridRule 不涉及)。`--radius-sm/md` 恒 0。
- **动效**:150ms ease-out(`var(--duration-fast)` / `var(--ease-standard)`);页面切换走编辑式滑入/淡入。
- tokens **三源**同步:`tokens.css`(CSS variables)、`tokens.ts`(TS 对象)、`tailwind-preset.css`(@theme)。
  另 canvas-engine 的 `tokenResolver` 兜底 hex 是第 4 处镜像(与解析值同步)。

## 结构

```
src/
├── tokens.css         运行时 CSS variables(被 web globals.css import)
├── tokens.ts          palette + tokens 对象 + ColorToken/Region 类型(被 domain tokens-local 镜像)
├── tailwind-preset.css  Tailwind v4 @theme 注入
├── index.ts           barrel export
└── components/        Button/Input/Card/Tag/Toolbar/Modal/Tooltip
                      + EditorialMotif/StatusDot/GridRule(v0.2 新)
                      + Tabs/DataTable/TopBar(2026-08-25 补齐 DESIGN.md 七件套缺口)
                      + BauhausMotif(弃用别名,别新用)
```

## 改动检查清单

- [ ] `grep -rE '#[0-9a-fA-F]{3,6}' src/components/` 应**无结果**(颜色只在 tokens 三源)
- [ ] 新增组件 → 在 `/design` 页面加展示(视觉契约)
- [ ] tokens.css / tokens.ts / tailwind-preset.css 三源同步(canvas 兜底 hex 同查)
- [ ] 没引入色板外颜色 / 第四种字体 / 任何圆角 / 任何阴影
