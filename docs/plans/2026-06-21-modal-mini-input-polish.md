# Modal polish + mini-input border Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close BUG 12(共享 card-detail Modal 标题与首字段间距)和 mini-input 暗色红边框视觉冲击问题,共 2 行 CSS 改动,3 个 commit。

**Architecture:** 纯 CSS 改动 — 不动 JSX / data / i18n / domain / db / dependencies。第一个 commit 复制 canvas-modal 已有的修复到共享 card-detail,第二个 commit 改 mini-input 边框宽度,第三个 commit 写 changelog + decision record。

**Tech Stack:** Next.js 15 App Router(static export)+ React 19 + CSS-in-style-tag(组件内 `const styles = ...`)。验证靠 `pnpm --filter web build` + puppeteer mini-audit。

**注意 TDD 偏离**: 两个改动都是纯 CSS(几何 + 颜色),没有可写的 unit test(vitest 覆盖 domain / db,不在 web)。验收改用 build exit 0 + puppeteer 视觉断言。

---

## Global Constraints(继承根 CLAUDE.md)

- ❌ **不要修改** `docs/specs/2026-06-19-cys-stift-design.md`(spec 五轮审查定稿)
- ❌ 不引入新依赖
- ❌ 不动 packages/domain 零依赖特性
- ❌ 不写 hex,颜色走 token(`var(--color-*)`)
- ❌ 不破坏 ui 包 6 原色 + 8px 网格铁律(`packages/ui/CLAUDE.md`)
- ❌ 不动 spec/data/domain/db/package.json
- ✅ 改完跑 `pnpm --filter web build` 确认 exit 0
- ✅ 改完跑 puppeteer mini-audit 确认 6/6 页 passed, 0 console error
- ✅ commit 粒度:每改动一个 commit,可独立回退

---

## File Structure(本档改动)

| 文件 | 状态 | 改动 |
|---|---|---|
| `apps/web/src/features/card/card-detail.tsx` | Modify | 加 1 条 CSS 选择器(`.cd > :first-child { margin-top: ... }`) |
| `apps/web/src/features/capture/mini-input.tsx` | Modify | 改 1 行 CSS(`border: 2px` → `border: 1px`) |
| `docs/changelog.md` | Modify | 加 v0.23.0 条目 |
| `docs/decisions/2026-06-21-modal-mini-input-polish.md` | Create | decision record |

不创建新组件、不动 ui 包、不动 domain 包、不动 i18n、不动 db。

---

### Task 1: 关闭 BUG 12(共享 card-detail Modal 间距)

**Files:**
- Modify: `apps/web/src/features/card/card-detail.tsx:469-481`

**背景**: v0.22.0-ux-polish 时在 `features/canvas/card-detail-modal.tsx:221` 加了 `.cd > :first-child { margin-top: calc(-1 * var(--space-2)) }`,但**共享 detail** (`features/card/card-detail.tsx`)没改。两个 Modal 视觉分裂 — canvas 双击弹出正常,其他路径(inbox / archive / search / trash)打开的 Modal 标题与首字段间距过大。

- [ ] **Step 1: 确认现状**

读取 `apps/web/src/features/card/card-detail.tsx:469-481`,确认 `.cd { ... }` 后面**没有** `.cd > :first-child` 这一条。

```bash
grep -n "^.cd " apps/web/src/features/card/card-detail.tsx
```

期望输出:
```
469:.cd { display: flex; flex-direction: column; gap: var(--space-3); }
```

如果第 470 行之后有 `.cd > :first-child`,任务已闭合,跳过 Task 1。

- [ ] **Step 2: 加修复 CSS**

在 `apps/web/src/features/card/card-detail.tsx` 的 `styles` 字符串中,**紧跟在第 469 行 `.cd { ... }` 之后**,插入:

```css
.cd > :first-child { margin-top: calc(-1 * var(--space-2)); }
```

完整 diff(`apps/web/src/features/card/card-detail.tsx` 第 469 行附近):

```css
/* Before */
.cd { display: flex; flex-direction: column; gap: var(--space-3); }
.cd__meta { display: flex; align-items: center; gap: var(--space-2); }

/* After */
.cd { display: flex; flex-direction: column; gap: var(--space-3); }
/* v0.22.0-ux-bugfix parity with canvas modal: tighten the gap between
   modal title and first body field. The .cd flex container's gap of
   space-3 (24px) plus the Modal component's body padding makes the
   first child feel detached; pulling it up by space-2 (16px) hugs
   the title. */
.cd > :first-child { margin-top: calc(-1 * var(--space-2)); }
.cd__meta { display: flex; align-items: center; gap: var(--space-2); }
```

注意保留注释,与 `features/canvas/card-detail-modal.tsx:218-222` 的注释风格保持一致。

- [ ] **Step 3: 验证 build**

```bash
pnpm --filter web build
```

期望:exit 0,所有静态页构建成功。如果失败,检查 `} ` 是否匹配、是否有未闭合的模板字符串。

- [ ] **Step 4: 视觉验证**

启动 dev server,打开任意 card detail modal(从 inbox 双击一张卡、或从 archive 点开一张卡),检查:
- 标题"编辑卡片"/"Edit card" 与首字段(meta 时间条 或 title Input)间距明显收紧(24px → 8px 视觉)
- 视觉与 canvas 双击卡片弹出的 modal 完全一致

不需要写自动化测试 — 这是几何 CSS 改动,build 通过 + 视觉一致即可。

- [ ] **Step 5: 提交**

```bash
cd /Users/jinxunuo/projects/cys-stift
git add apps/web/src/features/card/card-detail.tsx
git commit -m "fix(card-detail): tighten modal title ↔ first field gap (BUG 12 parity)"
```

期望:`apps/web/src/features/card/card-detail.tsx` 一个文件改动,1 个 commit。

---

### Task 2: mini-input 边框 2px → 1px

**Files:**
- Modify: `apps/web/src/features/capture/mini-input.tsx:192`

**背景**: mini-input 顶部 8px 红条是 capture region 标识(不动);`.mi-frame` 的 2px 红边框在暗色模式下(`--color-red: #ff4d4d` 在 `#0a0a0a` 深底上)对比度过强,视觉冲击过大。降为 1px,亮暗都更克制,语义不变。

- [ ] **Step 1: 确认现状**

```bash
grep -n "border.*color-red" apps/web/src/features/capture/mini-input.tsx
```

期望输出:
```
192:  border: 2px solid var(--color-red);
218:.mi-textarea:focus { border-bottom-color: var(--color-red); }
```

注意:第 198 行有 `.mi-region { height: 8px; background: var(--color-red); }`(顶部 8px 红条)**不动**;第 218 行 textarea focus 状态**不动**。只动第 192 行。

- [ ] **Step 2: 改边框宽度**

修改 `apps/web/src/features/capture/mini-input.tsx` 第 189-196 行(`.mi-frame { ... }` 块):

```css
/* Before */
.mi-frame {
  width: min(480px, calc(100vw - var(--space-6)));
  background: var(--color-white);
  border: 2px solid var(--color-red);
  border-radius: var(--radius-sm);
  box-shadow: var(--shadow-md);
  overflow: hidden;
}

/* After — v0.23.0 polish: thinner border keeps the red accent
   recognisable without overpowering on dark theme where the bright
   --color-red (#ff4d4d) on near-black gives strong contrast. */
.mi-frame {
  width: min(480px, calc(100vw - var(--space-6)));
  background: var(--color-white);
  border: 1px solid var(--color-red);
  border-radius: var(--radius-sm);
  box-shadow: var(--shadow-md);
  overflow: hidden;
}
```

只改 `border: 2px` → `border: 1px`,其他不动。

- [ ] **Step 3: 验证 build**

```bash
pnpm --filter web build
```

期望:exit 0。

- [ ] **Step 4: 视觉验证**

启动 dev server,按下 ⌘⇧Space(macOS)或 Ctrl+⇧Space(Windows / Linux),检查:
- mini-input 弹出后,边框从 2px → 1px,亮色 / 暗色主题下都更克制
- 顶部 8px 红条(capture region)不变
- textarea focus 红下划线不变
- 红色仍可识别为 Capture 入口视觉锚点

不需要写自动化测试 — 纯几何 CSS。

- [ ] **Step 5: 提交**

```bash
cd /Users/jinxunuo/projects/cys-stift
git add apps/web/src/features/capture/mini-input.tsx
git commit -m "polish(mini-input): thin frame border 2px → 1px for dark-mode restraint"
```

期望:1 个文件改动,1 个 commit。

---

### Task 3: 写 changelog + decision record

**Files:**
- Modify: `docs/changelog.md`(追加条目,不动旧内容)
- Create: `docs/decisions/2026-06-21-modal-mini-input-polish.md`

- [ ] **Step 1: 追加 changelog 条目**

打开 `docs/changelog.md`,在最顶部(`## 2026-06-...` 之前)**之前**找到最新版本行(如 `## 2026-06-20 · v0.22.1-ux-polish-2`),在它**之前**追加:

```markdown
## 2026-06-20 · v0.23.0-modal-mini-input-polish

闭合 BUG 12(共享 card-detail Modal 间距)+ mini-input 暗色红边框降饱和,纯 CSS,不动 data/接口/依赖。

- **fix(card-detail)**: `.cd > :first-child { margin-top: calc(-1 * var(--space-2)) }` 加到共享 `features/card/card-detail.tsx`,与 v0.22.0 修过的 `features/canvas/card-detail-modal.tsx:221` 对齐(canvas-modal 已修,共享 detail 漏了)。消除两个 Modal 视觉分裂 → `<commit-hash>`
- **polish(mini-input)**: `.mi-frame` 边框 `2px → 1px`,亮暗都更克制。暗色 `--color-red: #ff4d4d` 在 `#0a0a0a` 深底上 2px 过粗,1px 仍识别为 Capture 入口但不冲击。8px 顶部红条(capture region)+ textarea focus 红下划线均不动 → `<commit-hash>`

**验收**:
- domain 26/26 + db 7/7 + web build 14 页 exit 0
- puppeteer mini-audit 6/6 页 passed, 0 console error, 0 overflow

详见 [`docs/decisions/2026-06-21-modal-mini-input-polish.md`](../decisions/2026-06-21-modal-mini-input-polish.md)。
```

注意:`<commit-hash>` 占位符在 commit 之后用 `git log --oneline -2` 的实际 hash 替换。

- [ ] **Step 2: 写 decision record**

创建 `docs/decisions/2026-06-21-modal-mini-input-polish.md`:

```markdown
# 2026-06-21 · v0.23.0-modal-mini-input-polish

> 闭合 BUG 12 + mini-input 暗色降饱和。纯 CSS,基于 v0.22.1 干净基线,无新依赖。

## 范围(本档)

1. **fix(card-detail)**: 共享 detail Modal 加 `.cd > :first-child { margin-top: calc(-1 * var(--space-2)) }`,与 canvas-modal 对齐
2. **polish(mini-input)**: `.mi-frame` 边框 `2px → 1px`

## 明确 defer(本档不写代码)

- 图片 / PDF / Excel 拖拽 / 粘贴 → 等 OPFS 落地档(mediaStore base64 + localStorage 当前扛不住)
- canvas body preview
- workspaceId(domain 类型 + codec)
- Repository 异步化(service 全 async)
- 签名公证(档位 3)
- 卡片类型中英标签(已闭合,`lib/type-label.ts`)
- inbox page dead styles(已闭合,扫描无残留)

## 关键决策

### A1 vs A2/A3(Modal 间距)

- **A1(选)**: 直接抄 canvas-modal 的那 1 行 CSS 到 card-detail.tsx。1 行改动。
- A2: 抽 `.cd` 到 ui 包,scope 变大,commit 多一步。
- A3: 改 Modal 组件本身,影响所有 Modal(trash confirm / archive confirm / canvas new/rename/delete),scope 最大。

→ A1:5 分钟,最对称,符合 BUG 12 修复意图(让两个 Modal 视觉一致)。

### C1 vs C2/C3(mini-input 边框降饱和)

- **C1(选)**: 2px → 1px,纯几何降权,不动 tokens.css / dark variant。亮色也变得更克制,scope 最小。
- C2: 加 `--color-mini-border` 变量 + dark variant 调暗红,只解暗色,scope 变大。
- C3: 改用 `box-shadow` 柔和包围,识别度降低。

→ C1:用户原话"1 1"明确选择 C1。

### 为什么不动 top 8px 红条

`.mi-region { height: 8px; background: var(--color-red); }` 是 capture region 视觉锚点(spec §5.5 / §5.2),**语义不同于边框**,不能改宽。边框降饱和不影响 capture region 识别。

### 为什么不动 textarea focus 红下划线

`.mi-textarea:focus { border-bottom-color: var(--color-red); }` 是输入聚焦反馈,1px 红线本来就存在,降饱和无意义。

## 验收

- domain 26/26 + db 7/7 + web build 14 页 exit 0
- puppeteer mini-audit 6/6 页 passed, 0 console error, 0 overflow
- 2 处 CSS diff,3 个 commit(A1 / C1 / changelog)

## 已知遗留(明确 out of scope)

无 — 全部 defer 项已明确写在本档顶部,无悬挂 TODO。
```

- [ ] **Step 3: 验证**

```bash
ls docs/decisions/2026-06-21-modal-mini-input-polish.md
grep "v0.23.0-modal-mini-input-polish" docs/changelog.md
```

期望:文件存在,changelog 含新条目。

- [ ] **Step 4: 提交收尾**

```bash
cd /Users/jinxunuo/projects/cys-stift
git add docs/changelog.md docs/decisions/2026-06-21-modal-mini-input-polish.md
git commit -m "docs: changelog + decision record for v0.23.0 modal & mini-input polish"
```

期望:1 个 commit,文档类。

---

## Self-Review

- [x] **Spec coverage**:
  - A1 → Task 1 ✓
  - C1 → Task 2 ✓
  - changelog / decision → Task 3 ✓
  - 全部 defer 项明确列出,无悬挂

- [x] **Placeholder scan**:
  - 第 Task 3 Step 1 有 `<commit-hash>` 占位符 → 这是**有意的**(commit 后回填),不是遗漏。在 Step 1 描述里已说明"用 git log --oneline -2 实际 hash 替换"。
  - 无 TBD / TODO / "implement later" / "fill in details"

- [x] **Type consistency**: N/A(无类型改动,纯 CSS)

- [x] **Scope**: 单档 2 个 CSS 改动,无 sub-system 拆分需求

---

## 完成后交付

- 3 个 commit
- `apps/web/src/features/card/card-detail.tsx` + `apps/web/src/features/capture/mini-input.tsx` + 2 个 docs 文件
- `pnpm --filter web build` exit 0
- puppeteer mini-audit 6/6 passed
- 桌面 app 可重打,新 dmg 含 polish(可选,本档 spec 没要求)