# Phase 3 视觉 + 持久化对照笔记

> 截图：`docs/design/screenshots/phase-3/`（8 张）
> 测试：puppeteer-core + 系统 Chrome 驱动
> 服务：`apps/web/out` 经 `python3 -m http.server 3002`

---

## 结论

**Phase 3 核心承诺达成**：UI 写带多媒介（链接 / 代码 / 引用）的卡片 → 详情 / 编辑 / 归档 / 软删 全部走 `CardService` → 跨刷新数据仍在。puppeteer 自动化断言 session A 创建 3 张卡 → session B（同 context 模拟"刷新"）→ 2 张 active 卡完整保留 + 1 张归档仍在。

---

## 8 张截图

| 文件 | 状态 |
|---|---|
| `01-empty.png` | 空态：toolbar 红条 + active 红 tag "0" + Create 表单 + "No cards yet." 空态卡 |
| `02-three-created.png` | 创建 3 张卡：inbox 红 tag "3"，卡片网格（每张带红条 + NOTE 红 tag + 3 MEDIA 蓝 tag + 日期） |
| `03-detail-view.png` | 详情 Modal（Bauhaus 多媒介卡）：Markdown 渲染（标题 / 列表 / 链接 / 黑底代码块 / 红条引用块）+ Edit / Archive / Soft-delete 按钮 |
| `04-detail-edit.png` | 编辑模式 Modal：title 红 focus 下划线 + body textarea + Save / Cancel + "links/code/quotes editing intentionally not exposed (Phase 3 MVP)" 提示 |
| `05-after-archive.png` | 归档一张卡后：active 红 tag "2"（凌晨卡已隐藏）|
| `06-archived-tab.png` | 归档 tab：archived 蓝 tag "1"，被归档的"凌晨 3 点"卡片 |
| `07-after-refresh.png` | 同 context 重新 navigate 后：active 2 张卡完整保留 |
| `08-mobile.png` | 390px 视口：toolbar / 表单 / 网格响应式正常 |

---

## 持久化证据（puppeteer 自动断言）

```
session A tile titles: [ '网格即内存', 'Bauhaus 几何规则速查', '凌晨 3 点的产品想法' ]
session B tile titles (after refresh): [ '网格即内存', 'Bauhaus 几何规则速查' ]

✅ persistence confirmed (2 active cards survived refresh)
```

归档那张（凌晨 3 点）在归档 tab 里仍然存在，证实 `archived: true` 不删除数据。

---

## Markdown 渲染（spec §1.4 安全要求）

- `react-markdown@9` + `rehype-sanitize@6`：`<script>` / `javascript:` 自动拦
- 链接统一 stamp `target="_blank" rel="noopener noreferrer"`（sanitize 不会自动加）
- 自定义 `a` 组件再做协议白名单（http/https/相对），防止 `data:` 等协议绕过 sanitize
- 渲染样式包豪斯：标题 Space Grotesk，code mono 黑底白字，列表用红色方块 marker（不用圆点），引用红条 + soft 红底

---

## 视觉对照笔记（spec §5）

### 6 色 token 仍对
- Inbox toolbar 8px 红条 = `var(--color-red)` ✅
- 卡片左 8px 红条 = `var(--color-red)` ✅
- NOTE 红 tag、3 MEDIA 蓝 tag、归档蓝 tag = `var(--color-red)` / `var(--color-blue)` ✅
- Soft-delete 红按钮 = `var(--color-red)` ✅
- 代码块 `var(--color-black)` 底 + `var(--color-white)` 字 ✅
- Edit focus 下划线 `var(--color-red)` ✅

### 字体 + 网格
- "New card" / "INBOX" 标题 Space Grotesk 大字号 ✅
- "TITLE" / "BODY (MARKDOWN, OPTIONAL)" eyebrow 灰色 mono caps ✅
- 表单下划线、卡片边框、tag 间距、所有间距 8px 节奏 ✅
- 代码块 JetBrains Mono ✅
- 引用 italic 系统字体 + 红条 ✅

### 组件复用（packages/ui）
- Toolbar region="inbox"（红条）
- Tag（NOTE 红 / 3 MEDIA 蓝 / archived 蓝）
- Input（under-line focus 变红）
- Button（primary Edit / secondary Archive / danger Soft-delete / ghost Cancel）
- Card（包裹 EmptyState）
- Modal（详情 + 软删二次确认）

### 视图切换
- active tab 下划线红色，archived tab 切换蓝条对应色
- 计数 Tag 颜色与 view 对齐（active=红, archived=蓝）

---

## 安全审查（Phase 3 重点）

- ✅ Markdown 经 `rehype-sanitize`
- ✅ 外链 `rel="noopener noreferrer"` + `target="_blank"`
- ✅ 自定义 `a` 组件再做 `http`/`https`/相对 协议白名单
- ✅ 软删二次确认 Modal（Cancel / Soft-delete 两个按钮，软删按钮变红 danger）

---

## 与 spec 的差距（已知 / 后续 phase）

| 项 | 现状 | 计划中 | 后续 phase |
|---|---|---|---|
| 编辑多媒介（详情 Modal 内） | 仅标题/正文可编辑；links/code/quotes 提示"intentionally not exposed" | 同表单支持（参考 Create form） | Phase 3.5 增量 |
| 拖到画布 | 仅 schema 字段，未渲染 | tldraw 集成 | Phase 4 |
| 图片上传 | 仅 schema，无 UI | MediaAsset 真实落盘 | Phase 6 |
| 捕获快捷键 | 仅手动 form | 全局快捷键 + mini input | Phase 6 |
| 全局搜索 UI | 不做（spec §4.10 已声明） | LIKE → FTS5 | 视 wa-sqlite 构建 |

---

## 关键工程决策

1. **`react-markdown` v9 + `rehype-sanitize` v6**：选 v9 因为用 React 19 兼容；rehypePlugins 数组形式仍可用。React 19 在 Next.js 15 + pnpm 9 装下来只有 2 个 peer 警告（`react@^18.2.0 || 19.0.0-rc-...`），实测运行时无碍。
2. **多媒介编辑器用三段独立 `ListEditor`**：`+ Link` / `+ Code` / `+ Quote` 各 toggle 一次，只有点 `+ Add ...` 才加一条 draft。避免误触后立刻多个空输入。
3. **Detail modal 不暴露多媒介编辑**：Phase 3 MVP 简化（plan §3 P3-T3 描述的"编辑模式：标题/正文可改"）。修改多媒介需要先 archive+创建或后续 phase 加。
4. **toolbar Tag 计数随 view 切换变颜色**：active 红 / archived 蓝，视觉上直接对应所选区域（避免数字与所选 view 不一致的迷惑）。
5. **Soft-delete 二次确认 Modal**：用 packages/ui 的 Modal + danger Button，符合 §1.4 MVP 用户流程。

---

## 验收对照

- ✅ `pnpm --filter domain test` — 10 tests 全绿（Phase 3 加 4 个 update 测试，未破原 6 个）
- ✅ `pnpm --filter web build` — exit 0，8 个静态页（含 `/inbox`），产物 1.6 MB
- ✅ 持久化跨刷新（puppeteer 断言）
- ✅ 截图覆盖：空态 / 多媒介 / 编辑 / 归档 / 移动
- ✅ 视觉契约（6 色 / 字体 / 网格）未破
- ✅ Markdown 经 sanitize + 外链 rel=noopener
- ✅ 软删二次确认