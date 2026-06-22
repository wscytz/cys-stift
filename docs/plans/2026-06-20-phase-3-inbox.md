# Phase 3 实现计划 · Inbox 业务

> ✅ **已完成**（commit `284be2a`，tag `v0.4.0-phase-3`，GLM audit pass，2026-06-19）。
> 下方为原始计划，保留作为历史记录。本 phase 是 Ralph 模式下手动执行的产物（Ralph 在此 phase 期间停用，改主模型执行；见根 `CLAUDE.md` "Ralph 状态"）。

| 字段 | 值 |
|---|---|
| 计划 | Phase 3：Inbox 业务 |
| 创建 | 2026-06-20 |
| 依据 spec | §4.2（Card 多媒介）/ §4.8（CaptureInput）/ §5.4（Inbox 视觉骨架）/ §1.4（MVP 流程裁决） |
| 上游交付 | Phase 2（domain + db + db-client 就绪） |
| 下游交付 | Phase 4（Canvas / tldraw）前必须先有可用的卡片创建 + 列表 |

---

## 0. 目标

把 `/dev/db` 烟测页升级为**正式的 `/inbox` production 路由**：用户能创建带多媒介（链接 / 代码片段 / 引用）的卡片、查看、编辑、归档、软删。视觉上严格包豪斯，全部走 `@cys-stift/ui` 组件。

**核心承诺**：一个真实用户打开 `/inbox`，能完成"想到一个点子 → 记下来（带链接/代码/引用）→ 之后回来看 / 改 / 归档"的完整闭环。

---

## 1. 范围

### ✅ 本阶段做

- **`/inbox` production 路由**（`apps/web/src/app/inbox/page.tsx`，`'use client'`）
- **卡片创建表单**：标题 + 正文 + 链接 + 代码片段 + 引用（spec §4.8 CaptureInput 对应字段）
- **卡片列表视图**：用 `@cys-stift/ui` 的 Card 组件，8px 网格，inbox region 红条 Toolbar
- **卡片详情 / 编辑**：点开看全文，能改标题/正文，能加新媒介
- **生命周期操作**：归档 / 取消归档 / 软删（软删二次确认）
- **基础 Markdown 渲染**：正文渲染标题/列表/粗体/行内代码/代码块/链接（用 `react-markdown` + `rehype-sanitize`，spec §1.4 渲染安全要求）
- **首页加入口**：`/` 加一个跳 `/inbox` 的链接（小改动，让应用有入口）

### ❌ 本阶段不做（明确留后）

- **图片上传**：需要 MediaAsset 文件存储基础设施（spec §4.5），Phase 3.5+
- **链接 OG 抓取**：spec §4.8 已声明 MVP 不做（浏览器 CORS + 无 server）
- **全文搜索 UI**：spec §4.10 已声明不做（基础 LIKE 可用）
- **Canvas 画布位置**：Phase 4（tldraw）
- **捕获入口（全局快捷键）**：Phase 6
- **复杂 Markdown 扩展**（表格/脚注/Mermaid 等）：后续

---

## 2. 前置（Phase 2 已就绪，直接复用）

- `CardService`（domain）：已支持 `create({ title, body, links, codeSnippets, quotes, source })` / `archive` / `unarchive` / `softDelete` / `update`
- `db-client.ts` 的 `useDb()` hook：已支持 SSR/客户端 hydration，localStorage 持久化
- `@cys-stift/ui`：Button / Input / Card / Tag / Toolbar / Modal / Tooltip 齐全
- Card 类型已有 `media / links / codeSnippets / quotes` 字段（Phase 2 已定义）

**新增依赖**（仅一个）：
- `react-markdown` + `rehype-sanitize`（Markdown 渲染 + 安全）

---

## 3. 任务清单

### P3-T1 · `/inbox` 路由骨架 + 列表视图

- `apps/web/src/app/inbox/page.tsx`（`'use client'`）
- 顶部 `<Toolbar region="inbox">`（红条 + "INBOX" + 卡片计数 Tag）
- 卡片列表：响应式网格（`grid-template-columns: repeat(auto-fill, minmax(280px, 1fr))`），gap 是 8 的倍数
- 空状态：包豪斯风格的"还没有卡片，创建第一张"提示
- 用 `useDb()` 拿 service + snap，`service.listInbox()` 渲染
- **验证**：`/inbox` 渲染，空状态可见，已有 localStorage 数据能显示

### P3-T2 · 卡片创建表单（多媒介）

- 创建表单组件 `apps/web/src/app/inbox/create-card-form.tsx`
- 字段：
  - 标题（Input，必填）
  - 正文（textarea，可选，placeholder "用 Markdown 写…"）
  - 链接（可加多条，每条一个 url 输入 + 删除按钮）
  - 代码片段（可加多条，language + code）
  - 引用（可加多条，text + attribution）
- "添加链接/代码/引用"用 Tag 或小 Button 触发展开对应输入区
- 提交：组装 `CaptureInput` → `service.create({...})`
- source 用 `{ kind: 'manual', deviceId: 'web' }`
- 提交后清空表单、列表实时刷新（useDb 已是响应式）
- **验证**：能创建带链接/代码/引用的卡片，刷新页面还在

### P3-T3 · 卡片详情 / 编辑 / 生命周期

- 卡片点击展开详情（Modal 或 inline 展开，推荐 Modal 用 `@cys-stift/ui` Modal）
- 详情显示：标题 / 正文（Markdown 渲染）/ 链接列表 / 代码片段（mono 字体 + 语法高亮占位）/ 引用块
- 编辑模式：标题/正文可改，"保存"调 `service.update`（CardService 已有 update via repo）
- 底部操作栏：
  - 归档 / 取消归档（`service.archive` / `unarchive`）
  - 软删（二次确认 Modal，`service.softDelete`）
- 归档视图：`/inbox?view=archived` 或同页切换 tab，显示已归档卡（红条不变，用 Tag 区分）
- **验证**：编辑保存生效、归档后从 inbox 消失进归档、软删二次确认

### P3-T4 · Markdown 渲染 + 安全

- 装 `react-markdown` + `rehype-sanitize`
- 正文用 `<ReactMarkdown rehypePlugins={[rehypeSanitize]}>` 渲染
- 渲染样式要符合包豪斯：标题用 Space Grotesk、代码块用 mono + 灰底、链接蓝色下划线、列表无圆点改方块（可选）
- **链接安全**：sanitize 默认拦 `javascript:`，但要确认；渲染的 `<a>` 加 `target="_blank" rel="noopener noreferrer"`
- **验证**：Markdown 正确渲染，`<script>` 不执行，`javascript:` 链接被拦

### P3-T5 · 首页入口 + 视觉验证 + 收尾

- `/` 首页加一个 "→ Inbox" 链接（Button 或大字链接，包豪斯风格）
- 视觉验证（硬要求，见审核标准 §6）：
  - `/inbox` 桌面 1440 + 移动 390 截图
  - 空状态 + 有 3 张卡（含多媒介）+ 编辑 Modal + 归档视图
  - 截图归档 `docs/design/screenshots/phase-3/`
  - README 笔记逐项打勾
- `pnpm --filter web build` exit 0
- changelog + decisions/phase-3 + MEMORY.md 索引
- `git commit` + `git tag v0.4.0-phase-3`

---

## 4. 验收清单

- [ ] `pnpm --filter domain test` 仍全绿（Phase 3 不改 domain，但要确认没破坏）
- [ ] `pnpm --filter web build` exit 0，`/inbox` 在静态产物里
- [ ] `/inbox` 在浏览器渲染，空状态正确
- [ ] 能创建带 链接 + 代码片段 + 引用 的卡片
- [ ] 创建后刷新页面，卡片还在（localStorage 持久化，Phase 2 已验证的机制）
- [ ] 卡片能编辑、归档、软删（二次确认）
- [ ] Markdown 正文正确渲染，`<script>` / `javascript:` 被拦
- [ ] 6 色 hex / 字体 / 8px 网格在 `/inbox` 仍对（视觉契约不破）
- [ ] 截图归档 `docs/design/screenshots/phase-3/` + README 笔记
- [ ] changelog + memory + commit + tag 四件套齐全
- [ ] `git status` 干净

---

## 5. 审核标准（智谱会逐项查，Ralph 第一轮就要达标）

> 详见 `docs/archive/ralph/README.md` §6。Phase 3 特别注意：

### 代码质量
- [ ] `/inbox` 页面是 `'use client'`，没误用 server 特性
- [ ] 没引入 spec 没有的依赖（只允许 `react-markdown` + `rehype-sanitize`）
- [ ] 组件层没写死 hex / px（grep 验证）
- [ ] CardService 调用走 `service.create/update/archive/softDelete`，不绕过

### 架构一致
- [ ] 没改 spec / 没破坏 domain 零依赖 / 没动 packages/db schema
- [ ] `/dev/db` 保留（dev 烟测），`/inbox` 是 production
- [ ] 没碰已 tag 的 Phase 0/1/2 产物

### 测试 + 视觉
- [ ] domain 测试仍全绿
- [ ] 截图覆盖：空态 / 多媒介卡片 / 编辑 Modal / 归档视图
- [ ] 视觉契约（6 色 / 字体 / 网格）未破

### 安全（Phase 3 重点）
- [ ] Markdown 经 `rehype-sanitize`
- [ ] 外链 `rel="noopener noreferrer"` + `target="_blank"`
- [ ] 软删二次确认

### Git 卫生
- [ ] Conventional Commits
- [ ] 无 console.log 残骸 / 死代码 / TODO
- [ ] `git status` 干净才能 `<promise>`

---

## 6. 风险

| 风险 | 处理 |
|---|---|
| localStorage 存多媒介 + Markdown 撑爆 5MB | MVP 文本为主，单卡 50k 字符上限（spec §4.2）；图片不上传；监控用量 |
| Markdown 渲染样式破坏包豪斯 | 自定义渲染组件（不套默认样式），标题走 Space Grotesk |
| react-markdown v9 + React 19 兼容 | 装时确认 peer dep；必要时锁版本 |
| 编辑态 vs 展示态切换混乱 | 用明确 `mode: 'view' | 'edit'` state，不混 |
| 归档/软删卡片在 listInbox 消失但 listAll 还在 | 这是预期（spec §4.7 索引设计），不是 bug |

---

## 7. 产出与汇报

完成后主动给出：

1. `pnpm --filter web build` 输出 + 产物大小
2. `/inbox` 截图（空态 / 多媒介 / 编辑 / 归档，桌面 + 移动）
3. 视觉对照笔记（逐项打勾）
4. 持久化再验证（创建多媒介卡 → 刷新 → 还在）
5. 下一步预告：Phase 4（Canvas / tldraw）

---

## 8. 完成信号

```xml
<promise>PHASE COMPLETE</promise>
```

**严格条件**：第 4 节验收清单全部 ✅ + 第 5 节审核标准全部满足 + `git status` 干净。任一不满足就**继续迭代，不输出假 promise**。
