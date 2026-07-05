# 设计 token · 包豪斯约束

> 摘自 [`docs/specs/2026-06-19-cys-stift-design.md` §5](../specs/2026-06-19-cys-stift-design.md#5-ui-与设计系统包豪斯)。本文件是"规则 + 用法"，完整推理见 spec。

---

## 六原色（不可新增）

| token | hex | soft | 默认用途 |
|---|---|---|---|
| red | `#d40000` | `#ffe5e5` | capture / inbox（灵感火花） |
| yellow | `#ffce00` | `#fff8dc` | （备用） |
| blue | `#003f7f` | `#e0ebf5` | archive（已沉淀） |
| black | `#0a0a0a` | `#2b2b2b` | canvas（工作区） |
| white | `#fafafa` | `#ffffff` | 背景 |
| gray | `#666666` | `#d9d9d9` | system UI（不抢戏） |

**硬约束**：

1. 组件库不得引入第六种颜色或第七种 hex。
2. 用户可重映射 region → token（见下），但 token 集不变。
3. 所有颜色都通过 CSS variables（`--color-*`）引用，不在组件里写 hex。

## 功能区 → token（默认）

```ts
capture → red
inbox   → red
canvas  → black
archive → blue
system  → gray
```

## 字体

| 用途 | 字体 |
|---|---|
| display（标题） | Space Grotesk |
| body（正文） | Inter |
| mono（代码 / eyebrow） | JetBrains Mono（fallback: SF Mono, ui-monospace） |

免费可商用。

## 8px 网格

所有间距从：`0, 8, 16, 24, 32, 40, 48, 64, 80, 96, 128`（px）。

Tailwind 的 `spacing` 将来在 preset 里覆盖为这套。

## 边框 / 圆角 / 阴影

- **边框**：单线 1px / 粗 2px。包豪斯极少用模糊阴影。
- **圆角**：默认 0（几何方正），微圆角 2–4px 仅在必要时。
- **阴影**：用 `currentColor` 偏移（`2px 2px 0 0 currentColor`），不模糊。

## 反模式（避坑）

- ❌ 多色渐变
- ❌ 模糊阴影 / 发光
- ❌ 大圆角（>8px）
- ❌ emoji 当 UI 图标
- ❌ 装饰性插画
