# Ralph Loop — cy's Stift 任务总指南

> ⚠️ **2026-06-19 起已停用（归档保留）**
>
> Ralph 自动循环不再运行。当前执行模式是**主模型（Claude）按 phase plan 手动执行 + 自审**。
> 本文档内容（任务流程、审核标准 §6、compact/clear 规则 §4.7）**仍有参考价值**，但其中：
> - "Ralph 是执行者 / `/ralph-loop` 命令 / stop hook 自动循环" → **不再适用**
> - "智谱 GLM 独立审核" → 仍可用（`scripts/audit-glm.sh`），但改为**按需手动触发**，不再绑定循环
> - 审核标准 §6 → **仍然适用**，主模型自审时照此逐项检查
>
> 详见根 `CLAUDE.md` 的 "Ralph 状态" 章节。如要重启 Ralph，本文档 + 各 plan 仍在，接回 stop hook 即可。
>
> ---
>
> **下方为原文档（归档，未删改内容）：**
>
> **给 Ralph 看的任务描述。** Ralph 在 MiniMax 下循环跑（操作员 ccswitch 配置）；**每个 phase 的产物会被智谱 GLM 在独立对话里审核**。本文档跟"用什么模型跑 ralph"无关——它只描述任务。
>
> **关键** 因为 Ralph 会被审核，prompt 必须把**审核标准**说清楚，让 Ralph 第一轮就交出能过审的产物，避免循环浪费。
>
> **信息锚点**：根 `CLAUDE.md` 是任何 compact/clear 后唯一可靠保留的文件。所有硬约束写在那里 + 各目录级 `CLAUDE.md`。本指南负责**任务流程**，CLAUDE.md 负责**不变约束**。
>
> **上下文管理**：见第 4 节步骤 7（compact/clear/handoff 规则）。短周期靠微压缩，超长周期用「交接文件 + clear」。

---

## 0. 用法

```bash
# 推荐：把某个 phase 的 plan 作为 prompt 来源
/ralph-loop "$(cat docs/superpowers/plans/<phase>.md)" \
  --completion-promise "PHASE COMPLETE" \
  --max-iterations 30
```

Ralph 的 stop hook 会无限次把这段 prompt 喂回模型。模型通过读这份文档 + `git log` + 仓库文件重建上下文。

---

## 1. 项目是什么

**cy's Stift**：本地优先的灵感画布，包豪斯风格 UI。

- **设计文档**：`docs/superpowers/specs/2026-06-19-cys-stift-design.md`（五轮审查定稿）
- **路线图**：10 个 phase，spec §8
- **当前进度**：`docs/development/changelog.md`
- **架构决策**：`docs/adr/`
- **跨模型记忆**：`docs/memory/MEMORY.md` 索引 + `decisions/` 详情

### 跑 Ralph 之前先做的事

```bash
cd ~/projects/cys-stift
git status           # 确认 working tree 干净
git log --oneline -10
cat docs/development/changelog.md | tail -30
```

Ralph 接手时只读到三件事：git 历史、文件内容、这份 prompt。**没有对话历史**——所以这份文档要自包含。

---

## 2. 仓库结构（必读）

```
cys-stift/
├── apps/
│   ├── web/             Next.js 15 (App Router), 静态导出, 无 server
│   └── desktop/         Tauri v2 桌面壳
├── packages/
│   ├── ui/              Bauhaus 设计系统 (Button/Input/Card/Tag/Toolbar/Modal/Tooltip + tokens)
│   ├── db/              Drizzle + SQLite (better-sqlite3) + Repository 接口
│   ├── domain/          纯 TS 业务规则 + 6 vitest
│   └── config/          共享 tsconfig / eslint / tailwind preset
├── docs/
│   ├── superpowers/specs/  设计文档（唯一真相源）
│   ├── superpowers/plans/ 每个 phase 的实现计划
│   ├── adr/             架构决策记录
│   ├── design/          Bauhaus token 文档
│   ├── development/     setup + changelog
│   ├── memory/          跨模型记忆
│   ├── ralph/           本目录
│   └── architecture/    架构总览
├── scripts/             一次性脚本
├── .gitignore  .gitattributes  .editorconfig  .nvmrc  .prettierrc  tsconfig.base.json
├── pnpm-workspace.yaml
└── package.json
```

---

## 3. 核心技术栈（不要重新选）

| 层 | 选择 | 说明 |
|---|---|---|
| 包管理 | pnpm 9+ workspace | monorepo |
| 前端 | Next.js 15 App Router + React 19 + TS strict + Tailwind v4 | 静态导出 |
| 桌面 | Tauri v2 + Rust | WebView 包静态产物 |
| 数据 | better-sqlite3 + Drizzle (Node) | wa-sqlite + OPFS / Tauri fs 是 Phase 2.5 |
| 设计 | 6 原色 + 8px 网格 + Space Grotesk/Inter/JetBrains Mono | 详见 `docs/design/tokens.md` |
| 测试 | vitest (domain + db) + puppeteer-core (e2e) | |
| 工程化 | .nvmrc=22 / .gitattributes LF / .editorconfig / .prettierrc | |

**禁止**重新选型。如果觉得选错了，先写 ADR 解释为什么改，再动。

---

## 4. 跑 Ralph 的工作流程（每个迭代）

### 步骤 1 — 理解任务

读取：
- 本文档（第 5、6 节）
- `docs/superpowers/plans/<current-phase>.md`（具体 phase 计划）
- `docs/superpowers/specs/2026-06-19-cys-stift-design.md`（对应章节）
- 最近 10 条 `git log --oneline`

### 步骤 2 — 写 todo

用 TaskCreate 拆任务，沿用 plan 里已经写好的清单。

### 步骤 3 — 实现

- 严格按 plan
- domain 保持零依赖
- 设计 token 从 `@cys-stift/ui` 或 `@cys-stift/domain/tokens-local` 引用，**不要写 hex / px**
- 改 schema → 改 codec → 改 service → 改 UI → 改测试

### 步骤 4 — 验证

每个 phase 的验收清单在 plan 文件里：

```bash
pnpm --filter domain test
pnpm --filter db test
pnpm --filter web build
python3 -m http.server 3002 --directory apps/web/out &
# 视觉验证：截屏存到 docs/design/screenshots/phase-N/
```

### 步骤 5 — 自审 + 收尾

- 更新 `docs/development/changelog.md`
- 追加 `docs/memory/decisions/2026-06-19-phase-N.md`
- 更新 `docs/memory/MEMORY.md` 索引
- `git add -A && git commit -m "feat(...): phase N ..."`
- `git tag -a v0.X.0-phase-N -m "..."`

### 步骤 6 — 决定是否停

见第 8 节。

### 步骤 7 — 上下文管理（compact / clear）

Ralph 是多轮连续迭代，**反复压缩的信息衰减风险远大于收益**。按周期长度选策略：

| 周期 | 策略 |
|---|---|
| **常规（≤10 轮）** | 完全不手动 compact。依赖原生微压缩（每轮自动清理旧工具输出）即可。 |
| **中长（10–20 轮）** | 每完成 1 个子任务里程碑，执行 1 次带保留指令的 compact，**全程不超过 2 次**。 |
| **超长（过夜 / 百轮级）** | **禁止连续 compact**。用「交接文件 + clear」方案（见下）。 |

#### 手动 compact 的正确姿势

只在**任务里程碑、逻辑断点**执行，**必须带保留指令**，禁止裸 `/compact`：

```
/compact 重点保留：当前 phase 目标、已完成 task、未完成 task、已验证无效的方案、卡住的点。丢弃：早期调试日志、探索过程、已 supersede 的中间方案。
```

**保留项默认遵循根 `CLAUDE.md` 的 Compact Instructions 章节**——那里定义了 6 类必须保留的信息。

#### 超长周期：交接文件 + clear

1. 每完成一个里程碑（或上下文到 70–80%），把当前进度写入 `docs/ralph/session-handoff.md`（用 `session-handoff.template.md` 模板）
2. `git add docs/ralph/session-handoff.md && git commit -m "chore: ralph handoff at <phase>"`
3. 执行 `/clear`（**不是 compact**——彻底重置，保真度更高）
4. 下一轮第一件事：读 `docs/ralph/session-handoff.md` + 根 `CLAUDE.md` + 当前 phase plan，继续迭代

> 为什么 clear 比 compact 好：clear 后 `CLAUDE.md` 原样重载（信息锚点不丢），交接文件是显式落地（信息保真），没有 LLM 摘要的有损环节。

#### 绝对禁止

- ❌ 每轮 / 每次操作后 compact（信息失真快速累积）
- ❌ 任务执行中途（读文件→改代码→跑测试链路中间）compact
- ❌ 连续多次无间隔 compact（摘要偏差指数级放大）
- ❌ 在 ralph hook 里加自动 compact / 设固定轮次强制 compact
- ❌ 用 clear 替代 compact 做日常空间释放（任务连续性会断）—— clear 只配合交接文件用

---

## 5. 当前进度（手动维护）

> Ralph 不假设上下文，每次重读这段知道轮到哪个 phase。

- ✅ **Phase 0** — 脚手架（`v0.1.0-phase-0`，commit `ae2d5dc`）
- ✅ **Phase 1** — 设计系统（`v0.2.0-phase-1`，commit `fc10050`）
- ✅ **Phase 2** — 数据层（`v0.3.0-phase-2`，commit `bb81af5`）
- ✅ **Phase 3** — Inbox 业务（`v0.4.0-phase-3`，commit `284be2a`，GLM audit pass）— **Ralph 停用前最后一个 phase；此 phase 及之后改主模型手动执行**
- ⏳ **Phase 4** — Canvas 基础（tldraw 集成）（**下一个**）
- 🔒 Phase 5–9 锁着

---

## 6. 审核标准（智谱会看这些）

> 这是**最关键的一节**。每个 phase 的产物会在独立对话里被智谱 GLM 严格审核。Ralph 必须让第一轮产物就达到这些标准，不要让循环浪费在"先粗后精"上。

### 6.1 代码质量审核

- [ ] TypeScript strict 模式无 any / `@ts-ignore` 兜底（除非有 ADR）
- [ ] 公开 API 有清晰的 props 类型（不暴露 internal）
- [ ] 函数纯度：domain 层无副作用；副作用集中在 service + repository 层
- [ ] 错误处理：捕获后要么 rethrow 要么显式 ignore，不静默吞
- [ ] Branded ID 在 DB 边界正确 codec（spec §4.11）
- [ ] JSON 列手动 parse/stringify（不用 `$type` 当 parse）

### 6.2 架构一致性审核

- [ ] **没引入 spec 没有的新依赖**（package.json diff 要审）
- [ ] **没碰 `docs/superpowers/specs/`**（spec 是定稿，要改走 5 轮审查）
- [ ] 没破坏 packages/domain 的零依赖特性
- [ ] 没在组件层写死颜色 / 像素（grep 验证）
- [ ] 没跳过 ADR 改 schema / 改架构
- [ ] 没新增用户没要求的"附赠功能"（YAGNI）

### 6.3 测试覆盖

- [ ] domain 包每个 service 至少 5 个 vitest（覆盖 happy path + 边界）
- [ ] db 包集成测试覆盖 JSON 列 / canvasPosition / 软删
- [ ] web 端 build 通过 + 视觉截图归档

### 6.4 视觉与文档（硬要求）

- [ ] **每个 phase 截屏归档**到 `docs/design/screenshots/phase-N/`
- [ ] README 笔记逐项打勾（spec 对应章节 vs 实际）
- [ ] 6 色 hex 与 spec §5.1 截图标注对比无差异
- [ ] 字体正确加载（标题是 Space Grotesk 不是 fallback）
- [ ] 8px 间距节奏视觉可辨
- [ ] changelog + memory + commit + tag 四件套齐全

### 6.5 Git 卫生

- [ ] 提交信息符合 Conventional Commits
- [ ] 没有合并 master / main 进来（除非 phase 间）
- [ ] 没有 `console.log` 调试残骸 / 死代码 / TODO 注释
- [ ] `git status` 干净才能 promise

---

## 7. 阶段详细任务（Phase 3 placeholder）

Phase 3 = Inbox 业务：用 packages/domain + db 做真正的卡片 CRUD + 列表视图。

- 复用 Phase 1 的 components
- 用 packages/db 的 SqliteCardRepository（已是 better-sqlite3 + drizzle）
- 加 `apps/web/src/app/inbox/page.tsx`
- 加 `apps/web/src/lib/inbox-client.ts`
- 视觉验证：截图归档到 `docs/design/screenshots/phase-3/`

---

## 8. 完成信号

```xml
<promise>PHASE COMPLETE</promise>
```

**严格条件**（智谱审核要逐项查）：

1. plan 里所有 task ✅
2. `pnpm --filter {domain,db} test` exit 0
3. `pnpm --filter web build` exit 0
4. 截图归档（视觉契约 6 色 / 字体 / 网格都对）
5. changelog / memory / commit / tag 四件套齐全
6. `git status` 干净
7. 第 6 节审核标准全部满足

**只要一条不满足就不输出 promise**。Ralph 循环会继续，下一轮重读一切。

---

## 9. Ralph 的纪律

### 永远不要

- ❌ 跳过验证直接 commit
- ❌ 输出假 promise 来逃出循环
- ❌ 重新选型 / 改 schema 不写 ADR
- ❌ 写死颜色 / 像素值
- ❌ 假装 build 通过（必须实际跑命令看 exit code）
- ❌ 改 spec 文件
- ❌ 添加未要求的依赖

### 应该

- ✅ 改任何文件前先读 spec 对应章节
- ✅ domain 层零依赖，纯函数
- ✅ 测试和实现一起写
- ✅ 每个 phase 视觉验证（截图 + 笔记）
- ✅ 用 git history 看上一 phase 怎么做的
- ✅ 写 memory/decisions 记录重要决策
- ✅ grep 验证"组件层无硬编码颜色"

### 卡住怎么办

如果 5 轮迭代还没进展：
1. 读 `docs/development/changelog.md` 全文
2. 跑 `pnpm test` / `pnpm build` 看哪条挂了
3. `git log` 看上一 phase 怎么做的
4. 写 `docs/memory/decisions/YYYY-MM-DD-<phase>-stuck.md` 说明阻塞
5. **不要碰 `<promise>`**

如果跑完 `--max-iterations` 还没完成：
- Ralph 自动停
- 看 git log + memory 留下什么
- 写 "what got done / what's left" 给操作员
- **不要**自动追加 iterations——必须人工介入

---

## 10. 紧急停止

```bash
/cancel-ralph
```

清掉 `.claude/ralph-loop.local.md`、禁用 stop hook。**任何"我要接管"的时刻立刻用**。

---

## 附：为什么这份 prompt 这么长

Ralph 是**自引用循环**——每轮都重读这份 prompt。短 prompt 看着简洁，但会让模型缺乏上下文、每轮都要重新摸索，**反而浪费循环**。

把这文档当一份**新人入职手册**：它第一次接手时读，30 轮后还是读这一份。文档越长，每轮越省事。