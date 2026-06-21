# Modal 间距 + mini-input 边框 polish(v0.23.0)

> 单档小修。两个独立 commit,纯 CSS,不碰 data/domain/i18n/spec/dependencies。

## 范围

1. **A1 — BUG 12 Modal 标题与首字段间距**(共享 `card-detail.tsx`)
2. **C1 — mini-input 边框暗色降饱和**(2px → 1px)

## 明确 defer(本轮不写代码)

- 图片 / PDF / Excel 拖拽 / 粘贴 / 媒体层升级 → 全部推到 OPFS 落地档
- canvas body preview
- workspaceId / Repository async
- 签名公证(档位 3)

---

## A1 — Modal 标题与首字段间距

### 现状

`apps/web/src/features/card/card-detail.tsx:469`:

```css
.cd { display: flex; flex-direction: column; gap: var(--space-3); }
```

**缺**一条 `.cd > :first-child { margin-top: calc(-1 * var(--space-2)) }` 来抵消 Modal 自身的 body padding(让首字段紧贴 title)。

同档位 v0.22.0-ux-polish 时已经在 `features/canvas/card-detail-modal.tsx:221` 加过,但**共享 detail 没改**。两个 Modal 视觉分裂。

### 修改

**文件**: `apps/web/src/features/card/card-detail.tsx`

在 `.cd { ... }` 之后(约第 469 行),插入:

```css
/* v0.22.0-ux-bugfix parity with canvas modal: tighten the gap between
   modal title and first body field. The .cd flex container's gap of
   space-3 (24px) plus the Modal component's body padding makes the
   first child feel detached; pulling it up by space-2 (16px) hugs
   the title. */
.cd > :first-child { margin-top: calc(-1 * var(--space-2)); }
```

### 验收

- 打开任意 card detail modal(view 或 edit 模式),title 与首字段(`.cd__meta` 或 `<Input>`)间距明显收紧(从 24px → 8px)
- 视觉与 canvas 双击卡片弹出的 detail modal 完全一致
- 不影响其它 Modal(trash confirm / archive confirm / canvas new/rename/delete)— 它们没用 `.cd` class
- `pnpm --filter web build` exit 0
- puppeteer mini-audit 6/6 页 passed,0 console error

---

## C1 — mini-input 红边框 2px → 1px

### 现状

`apps/web/src/features/capture/mini-input.tsx:192`:

```css
.mi-frame {
  ...
  border: 2px solid var(--color-red);
  ...
}
```

### 问题

暗色模式下 `--color-red: #ff4d4d`(亮的)在 `#0a0a0a` 深底上对比度过强,v0.22.1 留的设计 polish 坑。

### 方案 C1(选中)

边框宽度从 `2px` → `1px`,色彩保持 `var(--color-red)` 不变(亮暗都是红)。

**为什么 C1 而不是 C2**:
- C1 是**纯几何降权**,不动色板。亮色也变得更克制,视觉一致性更好。
- C2(暗色专用变量)需要动 `tokens.css`,加新变量 `--color-mini-border` + dark variant。scope 变大,且只解决暗色,亮色仍然偏粗。
- 用户原话"1 1"明确选 C1。

### 修改

**文件**: `apps/web/src/features/capture/mini-input.tsx`

第 192 行:

```css
/* Before */
border: 2px solid var(--color-red);

/* After — v0.23.0 polish: thinner border keeps the red accent
   recognisable without overpowering on dark theme where the bright
   --color-red (#ff4d4d) on near-black gives strong contrast. */
border: 1px solid var(--color-red);
```

### 验收

- 全局 ⌘⇧Space / Ctrl+⇧Space 唤起 mini-input
- 边框从 2px → 1px,亮暗都更克制
- 8px 顶部红条不动(那是 capture region 标识,语义不同于边框)
- 红边框仍可一眼识别(Capture 入口的视觉锚点)
- `pnpm --filter web build` exit 0
- puppeteer mini-audit 6/6 页 passed,0 console error

---

## 全局约束(继承根 CLAUDE.md)

- ❌ 不改 spec `docs/superpowers/specs/2026-06-19-cys-stift-design.md`
- ❌ 不引入新依赖
- ❌ 不动 packages/domain 零依赖特性
- ❌ 不写 hex,颜色走 token
- ❌ 不破坏 ui 包 6 原色 + 8px 网格铁律
- ✅ 改完跑 `pnpm --filter web build` 确认 exit 0
- ✅ commit 粒度:A1 一个 commit,C1 一个 commit,可独立回退

## 提交计划

| # | Commit | 范围 |
|---|---|---|
| 1 | `fix(card-detail): tighten modal title ↔ first field gap (BUG 12 parity)` | A1 |
| 2 | `polish(mini-input): thin frame border 2px → 1px for dark-mode restraint` | C1 |
| 3 | `docs: changelog + decision record for v0.23.0` | 收尾 |

## 风险与回退

- **风险极低**:两处都是纯 CSS 改动,1 行 + 1 行,无 JSX/data/i18n 触达
- **回退成本**:`git revert <commit-hash>` 单 commit 即回退
- **回归可能**:无。`.cd > :first-child` 是局部 `margin-top`,不会泄漏到其他 Modal;mini-input 改的是局部 `.mi-frame` border