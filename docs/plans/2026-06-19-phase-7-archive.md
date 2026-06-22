# Phase 7 实现计划 · Archive(网格 + 时间轴)

> 🟡 **待执行**(主模型手动执行 + 自审,见根 `CLAUDE.md` "Ralph 状态" + `docs/development/roadmap.md` §1)。
> 这是路线图 P7 行的实现计划。

| 字段 | 值 |
|---|---|
| 计划 | Phase 7:Archive — `/archive` production 路由 + 网格/时间轴双视图 + 多选批量操作(unarchive / 永久删除) |
| 创建 | 2026-06-19 |
| 范围决策 | **Lean**(仅 spec §8 Phase 7 段 + §5.4 Archive 视觉 + §5.2 archive→blue + 已知/后续里 "归档" 一段;标签筛选 / 全文搜索 / 复杂分组 / 归档入画布 留 P6.5c / P9+) |
| 依据 spec | §3.3 目录结构(`features/archive/` + `app/archive/`)/ §4.2 `archived`/`deletedAt`/`canvasPosition` 三态 / §5.2 archive→blue / §5.4 Archive 视觉骨架 / §8 Phase 7 段 / §6.12 静态导出限制 / §12 风险 #9(`[param]` 禁) |
| 上游交付 | Phase 3(`/inbox` + 多媒介表单 + 详情/编辑/归档)/ Phase 6(`CaptureHost` 已在 root layout)/ spec 路线图已对齐 |
| 下游交付 | P6.5e(unify manual capture)/ P6.5c(inbox→canvas send)/ P9(JSON 导出)前,先闭环归档的核心承诺 |
| 受众 | human + 任意 LLM(claude / gpt / gemini) |

---

## 0. 目标

兑现 spec §5.4 描述的 Archive 视觉骨架 + §8 Phase 7 段的双视图承诺:`/archive` production 路由(`'use client'`,静态导出),顶部 8px 蓝条 Toolbar(`region="archive"`),卡片网格视图(默认)+ 时间轴视图(按 `archivedAt` 分组),多选 + 浮动工具条(unarchive / 永久删除)。

**核心承诺**:在 `/inbox` 归档一张卡(走 `CardService.archive(id)`,Phase 3 已实现)→ 跨路由 `/archive` 看到该卡 → 多选 + 批量 unarchive / hardDelete → 状态全部走 service 不绕开。

---

## 1. 范围

### ✅ 本阶段做

#### 1.1 `/archive` 路由(`apps/web/src/app/archive/page.tsx`,`'use client'`,静态导出)
- spec §6.12 静态导出:`/archive` 是静态路由(无 `[param]`),视图/选择走客户端状态
- Toolbar `region="archive"`(蓝条,spec §5.2 / §5.3)
- 面包屑:`cy's stift / archive`(与 inbox 一致)
- 双视图 Tab:`grid` / `timeline`(本地 `<button>` + active 下边线,沿用 inbox 样式)
- 数据来源:`service.listAll().filter(c => c.archived && !c.deletedAt)`(与 inbox 的 archived tab 一致;Phase 3 closeout 已确认)
- 排序:按 `updatedAt` 倒序(以 `archive` 动作触发 `updatedAt = new Date()`,所以 = 归档时间倒序)
- 永久删除走 `service.softDelete(id)`(已实现,§4.2 `deletedAt` 时间戳)+ 二次确认 Modal(spec §5.3 Modal 复用);**不**新增 `hardDelete`(spec 没要求;P9 JSON 导出再考虑)
- 多选状态:本地 `Set<CardId>`;多选激活时浮动工具条浮在卡片网格底部中央(包豪斯:黑底白字按钮组,贴 §5.3 Toolbar 风格但更小)

#### 1.2 网格视图(默认)
- 复用 inbox 的 `CardTile` 视觉:**红条 → 蓝条**(因为 archive region 是蓝色)
- **更精确**:新建 `apps/web/src/features/archive/archive-card-tile.tsx`,复制 inbox `CardTile` 但:
  - 顶部 8px **蓝条**(与 inbox 红条区分)
  - 其他视觉(白底黑边 1px / 8px 圆角 / 标题字体 / preview / meta tag)与 inbox 一致
- 多选时:左上角 checkbox(本地 `<input type="checkbox">`,未触发时不显示)

#### 1.3 时间轴视图
- 按 `updatedAt` **按日**分组(`YYYY-MM-DD` ISO date slice),组标题用 mono caps 灰色 + 间距 24px
- 组内:单列垂直堆叠的 **行式卡片**(不是网格),每行:左侧 8px 蓝条 + 中间 title + 右侧 date+tag meta,类似 inbox 详情里 DetailSection 的节奏
- 比网格更省空间,适合"扫一眼归档"
- 复用同一 `CardTile` 但用 `variant="row"` 控制视觉

#### 1.4 多选 + 浮动工具条
- 状态:`Set<CardId>` + `selected: boolean`
- 顶部 Tab 右侧加 "Select" 切换按钮(ghost variant),激活后所有 tile 显示左上 checkbox
- 选中 ≥1 时浮动工具条显示(底部 24px fixed position,黑底白字 + 白底按钮组 + mono caps label "X selected")
- 浮动工具条按钮:`Unarchive`(蓝边框)/ `Soft-delete`(danger)/ `Clear`(ghost)
- 二次确认:软删/取消勾选用 inbox 已有的 `<Modal>` 二次确认

#### 1.5 首页入口
- `apps/web/src/app/page.tsx`:在 `Inbox` / `Canvas` / `Capture` 三个 nav 入口后追加 `Archive` 入口(蓝 region 条,与 inbox 红区分)
- 路由:`/archive`(静态)

### ❌ 本阶段不做(明确留后)

- 标签筛选 / 全文搜索 / 按媒介类型分组 / 按月/周折叠 → 留 P6.5+ 或 P9
- Archive 卡片入画布 → 留 P6.5c(inbox→canvas send 的反向同理可复用)
- `hardDelete` 真永久删除 → 留 P9 JSON 导出阶段(spec 没要求)
- 归档时间可视化(图表/统计) → 留后
- Archive 卡片直接编辑(跳 inbox 详情) → 已可通过 tile 进入 detail modal,无需额外路由

---

## 2. 前置(已就绪 / 已验证)

**Phase 0-6 已就绪,Phase 7 直接复用,domain / db 不动:**

- `CardService.archive(id)` + `CardService.unarchive(id)` + `CardService.softDelete(id)` —— **Phase 2/3 已实现**,4 个 vitest 覆盖(归档/取消归档/持久化/listInbox 排除)
- `Card.archived` + `Card.deletedAt` + `Card.updatedAt` + `Card.canvasPosition` —— spec §4.2 三态清晰
- `<Toolbar region="archive">` 蓝条 —— Phase 1 已支持(spec §5.2 / §5.3)
- `<Modal>` + `<Button>` + `<Tag>` —— Phase 1 组件库
- 卡片 Tile 视觉规范 —— Phase 3 inbox 已定(白底黑边 1px / 8px 圆角 / Space Grotesk 标题 / mono meta)
- `useDb()` hook —— Phase 2;`snap` 引用稳定性
- root layout 已挂 `<CaptureHost />` —— Phase 6;新路由自动享有全局快捷键
- 0 新依赖(沿用 react + @cys-stift/ui + domain + Phase 1-3 全部组件)

---

## 3. 任务清单

### P7-T1 · `/archive` 路由骨架
- 新建 `apps/web/src/app/archive/page.tsx`(`'use client'`):
  - `useDb()` 拿 service + snap
  - 视图状态:`view: 'grid' | 'timeline'` + `selected: Set<CardId>` + `selectMode: boolean`
  - 数据:`service.listAll().filter(c => c.archived && !c.deletedAt).sort((a,b) => +b.updatedAt - +a.updatedAt)`
  - Toolbar + Tab + 内容区(条件渲染 grid 或 timeline)+ 浮动工具条(`selectMode && selected.size > 0`)
  - **不**含 detail modal(避免触碰 tagged Phase 3 `CardDetail`;后续 P6.5b 统一抽 `features/card/`)
  - **不**做软删二次确认 Modal 内嵌(用 inbox 的 Modal 不重复;Phase 7 先做软删直走,等用户多次删卡再补二次确认)
- **简化版**:本阶段软删**走** `service.softDelete(id)` 但**不**二次确认(单一按钮触发);P7.5(若需要)再加二次确认。

### P7-T2 · ArchiveCardTile 组件(网格)
- 新建 `apps/web/src/features/archive/archive-card-tile.tsx`:
  - Props:`{ card: Card; selected: boolean; selectMode: boolean; onClick: () => void; onToggleSelect: () => void }`
  - 视觉:
    - 顶层 `<button className="tile">`(同 inbox)
    - 左侧 8px **蓝条**(用 `var(--color-blue)`)
    - 中间 title + preview(≤120 字符)+ meta(type tag + 媒介数 + ISO date)
  - selectMode 时左上 `<input type="checkbox">` 用 `position: absolute` 浮;非 selectMode 不渲染
  - 选中态:边框变蓝 2px(包豪斯:用 `--color-blue` 加 `--border-hairline` 升级)
- 全部 inline CSS(与 inbox/page.tsx 风格一致);所有颜色/间距走 token;hex grep 零命中

### P7-T3 · 时间轴视图
- 新建 `apps/web/src/features/archive/timeline.tsx`:
  - Props:`{ cards: Card[]; selected: Set<CardId>; selectMode: boolean; onOpen: (id: CardId) => void; onToggleSelect: (id: CardId) => void }`
  - 分组:用 `Map<string, Card[]>` key = `updatedAt.toISOString().slice(0,10)`,value = cards
  - 排序:Map 保持插入顺序(因为 cards 已按 updatedAt 倒序,Map 自然按日倒序)
  - 渲染:每组 `<section>` 顶部 `<h3 className="day-label">YYYY-MM-DD</h3>`(mono caps 灰色),组内单列堆叠 `<ArchiveRowCard>`(复用 tile 视觉但 row variant:横向,左侧 8px 蓝条 + 中间 title + 右侧 meta)

### P7-T4 · 多选 + 浮动工具条
- 浮动工具条位置:`position: fixed; bottom: 24px; left: 50%; transform: translateX(-50%)`
- 视觉:黑底白字 + 内部按钮组:`Unarchive`(蓝边框白底)/ `Soft-delete`(danger 复用 inbox `<Button variant="danger">`)/ `Clear`(ghost)
- 顶部 Toolbar 加 `<Button variant="ghost">Select</Button>` 切换 selectMode
- 浮动工具条出现条件:`selectMode && selected.size > 0`
- "Unarchive" 批量:`[...selected].forEach(id => service.unarchive(id))` + 清空 selected
- "Soft-delete" 批量:同上 + `service.softDelete(id)`
- "Clear":清空 selected(不删除)

### P7-T5 · 首页入口
- `apps/web/src/app/page.tsx`:`<Link href="/archive">` 加蓝条入口(与 inbox 红 / canvas 黑区分),文案 "Archive · 归档 · 已沉淀"
- 调整 home 布局:nav 三列变四列(Capture / Inbox / Canvas / Archive);移动端 grid 保留垂直堆叠

### P7-T6 · 视觉 + 截图
- 视觉契约(spec §5.4):
  - 顶部 8px 蓝条(Toolbar region="archive")
  - 卡片 Tile 左侧 8px 蓝条(与 inbox 红区分)
  - 网格视图:auto-fill grid,minmax(280px, 1fr)(沿用 inbox 间距)
  - 时间轴视图:日分组 + 行式卡片
- 截图脚本 `scripts/p7-shots.cjs`(参考 p6-shots.cjs 模式):
  1. `/archive` 空状态(无归档卡)→ 截图
  2. 在 `/inbox` 创建 3 张卡 + 归档其中 2 张 + 1 张保留在 inbox → 截图 inbox(1 张)
  3. 进 `/archive` 网格视图 → 截图(2 张蓝条卡)
  4. 切换时间轴视图 → 截图(日分组 + 2 行)
  5. 激活 Select 模式 → 多选 2 张 → 浮动工具条出现 → 截图
  6. 点 "Unarchive" 批量 → 浮动工具条消失 + 2 张回到 inbox → 截图 `/inbox` 3 张全在
  7. 归档 1 张 + 软删另 1 张(用浮动工具条 Soft-delete)→ `/archive` 只剩 0 张 → 截图空状态
  8. 移动端 390px 视口 → 截图(网格 + 时间轴)
- 归档 `docs/design/screenshots/phase-7/` + README 视觉对照笔记

### P7-T7 · 收尾六件套
- `docs/changelog.md` 追加 `## 2026-06-19 · phase 7 · archive`
- `docs/development/roadmap.md` §5 P7 行打 ✅ + 写 tag `v0.8.0-phase-7`
- `docs/decisions/2026-06-19-phase-7.md` + MEMORY 索引 + current-session 推进
- 根 `CLAUDE.md` 状态推进:Phase 7 ✅
- `git commit` (Conventional Commits)
- `git tag v0.8.0-phase-7`
- `git status` 干净

---

## 4. 验收清单

- [ ] `pnpm --filter domain test` 全绿(Phase 7 不改 domain,复用已有 archive/unarchive/softDelete 测试)
- [ ] `pnpm --filter db test` 全绿(Phase 7 不改 db)
- [ ] `pnpm --filter web build` exit 0,12 静态页(新增 `/archive`)
- [ ] `/archive` 路由存在 + Toolbar 顶部 8px 蓝条
- [ ] 网格视图默认显示,卡片 Tile 左侧 8px 蓝条
- [ ] 时间轴视图可切换,日分组 + 行式卡片
- [ ] 多选激活后 checkbox 显示 + 浮动工具条出现(选中 ≥1)
- [ ] 批量 Unarchive 走 `service.unarchive(id)`,卡回到 `/inbox`
- [ ] 批量 Soft-delete 走 `service.softDelete(id)`,卡从所有视图消失(`deletedAt` 标记)
- [ ] 首页有 Archive 入口(蓝 region 条)
- [ ] 6 色 token / 字体 / 8px 网格 在 `/archive` 仍对
- [ ] `features/archive/` + `app/archive/` hex grep 零命中
- [ ] 截图归档 + 视觉对照笔记
- [ ] changelog + memory + context + commit + tag + 根 CLAUDE.md 状态推进 六件套齐全
- [ ] `git status` 干净

---

## 5. 审核标准(主模型自审逐项查)

### 代码质量
- [ ] `features/archive/` 切片干净(archive-card-tile.tsx / timeline.tsx 内 host 组件),不散落到 app/inbox 或 app/canvas
- [ ] 不复制 inbox `CardDetail` 整套(避免触碰 tagged Phase 3);Archive 阶段只读 + 多选 + 批量,无 detail modal
- [ ] 组件层没写死 hex / px(`grep -rE '#[0-9a-fA-F]{3,6}' apps/web/src/features/archive/` 为空)
- [ ] 多选 Set 状态有清理路径(Select 切换 / Unarchive 后清空 / Soft-delete 后清空)
- [ ] 浮动工具条不阻挡卡片交互(`pointer-events` / `z-index` 合理)

### 架构一致
- [ ] 没改 spec / 没破坏 domain 零依赖 / 没动 packages/db schema
- [ ] 不新建路由 `[param]` 段(§6.12 静态导出限制)
- [ ] 没碰已 tag 的 Phase 0-6 产物(`inbox/page.tsx` 只读;若需新增 toolbar 引用也避免改 inbox)
- [ ] `/archive` 是 `'use client'`,静态路由(无 SSR)

### 测试 + 视觉
- [ ] domain + db 测试仍全绿
- [ ] `pnpm --filter web build` exit 0
- [ ] 截图覆盖:空 / 网格 / 时间轴 / 多选 / 批量 unarchive / 批量 soft-delete / 移动端
- [ ] 视觉契约(6 色 / 字体 / 网格 / 蓝条 region)未破
- [ ] Archive 8px 蓝条(顶部 Toolbar + 卡片 Tile 左侧)+ grid/timeline 双视图 + 多选浮动工具条

### 安全
- [ ] Soft-delete 走 service → 走 domain 校验链路(已有 vitest 覆盖)
- [ ] 不引入新的 user input 路径(批量操作为纯本地 Set 操作)

### Git 卫生
- [ ] Conventional Commits
- [ ] 无 console.log 残骸 / 死代码 / TODO
- [ ] `git status` 干净才能收尾

---

## 6. 风险

| 风险 | 处理 |
|---|---|
| 多选 Set 状态在 view 切换 / 卡片操作后不一致 | 切换 view 时保留 Set(用户可能在两种视图选);批量操作后 Set.clear();Select 关闭时也 Set.clear() |
| 时间轴日分组跨时区显示异常 | `toISOString().slice(0,10)` 永远 UTC;UI 显示同 UTC(避免本地时区偏移造成同卡不同日)——可在 P9 暴露本地时区选项 |
| 软删直接走(无二次确认)误删风险 | Phase 7 范围内软删不算高危(`deletedAt` 标记,DB 不真删除,`listAll` 还能查到);P7 留观,P9 导出前再加二次确认 |
| 浮动工具条 z-index 与 CaptureHost 的 Mini Input(z-index 200)冲突 | Mini Input 是模态(打开时其他不响应);浮动工具条 z-index 100 < 200,Modal 100 同级 → 打开 Modal 时浮动工具条仍在底层无影响 |
| Archive 详情编辑没有(避免触碰 tagged Phase 3) | 用户可去 inbox 详情;Archive 阶段最小承诺 |
| `service.listAll().filter(...)` 在大库里慢 | Phase 7 数据量小,O(n) 过滤够用;spec §12 风险 #4 提了 10 万级迁 Turso,本阶段不预防 |
| Tile 选中态蓝边框与背景蓝色混 | 选中态用 `--border-hairline` 升 2px 黑边 + 内部 checkbox 显示 + 蓝条不变;不用背景色区分 |

---

## 7. 产出与汇报

完成后主动给出:

1. `pnpm --filter web build` 输出 + 产物大小
2. `/archive` 截图(空 / 网格 / 时间轴 / 多选浮动工具条 / 移动端)
3. `/inbox` 截图(批量 unarchive 后状态)
4. 视觉对照笔记(逐项打勾)
5. **puppeteer 交互断言**:归档 2 → /archive 显示 2 → 切换时间轴 → 多选 → 批量 unarchive → /inbox 多 2 张
6. 下一步预告:**P6.5a 草稿自动保存**(路线图下一个)

---

## 8. 完成信号

```xml
<promise>PHASE COMPLETE</promise>
```

**严格条件**:第 4 节验收清单全部 ✅ + 第 5 节审核标准全部满足 + `git status` 干净。任一不满足就**继续迭代,不输出假 promise**。
