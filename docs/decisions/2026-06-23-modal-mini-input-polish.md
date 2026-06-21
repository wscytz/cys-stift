# 2026-06-23 · v0.23.0-modal-mini-input-polish

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
- 其他 Modal 间距统一(canvas new/rename/delete / trash confirm / archive confirm)— 这些 Modal 不用 `.cd` class,不在 BUG 12 修复范围内

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