# packages/ui — Bauhaus 设计系统

> 包豪斯 = 约束。这个包的纪律是**不让任何颜色/尺寸逃逸出 token 系统**。

## 铁律

- **6 原色，不多不少**：red / yellow / blue / black / white / gray。组件**不得**引入第七种 hex。
- **所有颜色**通过 CSS variable（`var(--color-*)`）或 Tailwind class 引用，**不在组件里写 hex**。
- **8px 网格**：所有间距是 8 的倍数（`var(--space-*)`）。不允许写 `padding: 13px`。
- **字体**：display = Space Grotesk，body = Inter，mono = JetBrains Mono。三选一，不引入第四种。
- **阴影**是硬偏移（`2px 2px 0 0 currentColor`），**不用模糊阴影 / 不用渐变**。
- **圆角**克制：默认 0 或 2–4px，**不用大圆角（>8px）**。
- tokens 双源同步：`tokens.css`（CSS variables）与 `tokens.ts`（TS 对象）必须一致。改一个改两个。

## 结构

```
src/
├── tokens.css         运行时 CSS variables（被 web globals.css import）
├── tokens.ts          TS 对象 + ColorToken/Region 类型（被 domain tokens-local 镜像）
├── tailwind-preset.css  Tailwind v4 @theme 注入
├── index.ts           barrel export
└── components/        Button/Input/Card/Tag/Toolbar/Modal/Tooltip + 各自 .module.css
```

## 改动检查清单

- [ ] `grep -rE '#[0-9a-fA-F]{3,6}' src/components/` 应**无结果**（颜色只在 tokens.css）
- [ ] 新增组件 → 在 `/design` 页面加展示（视觉契约）
- [ ] tokens.css 与 tokens.ts 改动同步
- [ ] 没引入第七种颜色 / 第四种字体
