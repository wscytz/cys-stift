# cy's Stift — 项目锚点

> 本文件在任何 `/compact` 或 `/clear` 后都会保留。它是唯一可靠的信息锚点。
> 详细内容在 `docs/` 下按需读取；这里只放**不可遗忘**的约束。

## 一句话

**cy's Stift** — 本地优先的灵感画布，包豪斯风格 UI。灵感 3 秒记，画布上慢慢养。

## 当前状态

- Phase 0 ✅ 脚手架 · Phase 1 ✅ 设计系统 · Phase 2 ✅ 数据层 · Phase 3 ✅ Inbox 业务 · Phase 4 ✅ Canvas 基础 · Phase 5 ✅ Canvas 完整 · Phase 6 ✅ 捕获入口 · Phase 7 ✅ Archive · P6.5a ✅ 草稿自动保存 · P6.5b ✅ Inbox 多媒介编辑 · P6.5c ✅ Inbox→Canvas Send · P6.5d ✅ 画布视图持久化 · P6.5e ✅ 统一手动 capture · P6.5f ✅ 图片上传 · P6.5g ✅ 菜单栏 + CaptureSinkRegistry · P6.5h ✅ 快捷键自定义 · Phase 8 ✅ Rust 就绪(2026-06-20:本就已装 cargo 1.96,根因是 PATH,cargo check 通过;待 tauri build/签名) · **Phase 9 ✅ JSON 导出 + 用户文档** · **Review ✅ bugfix #1+#3(import 原子性 + sink 竞态,v0.9.2)** · **Phase trash ✅ soft-delete 回收/恢复视图(/trash 路由 + domain restore/hardDelete + AppMenu Trash 入口,v0.10.0-trash)** · **Phase canvas-refactor ✅ useEffect 驱动 canvas-editor(关闭 review #4 #5,v0.11.0-canvas-refactor)**
- **30 轮路线图核心 spec §8 全部完成 + review 全部 5 项关闭**。Phase 8 Tauri:Rust 就绪(cargo 1.96),待 tauri build/签名。产品已是**完整可用的 web 应用**:捕获 / inbox(多媒介编辑)/ canvas(视图持久化 + useEffect 驱动)/ archive(网格+时间轴+多选)/ trash(软删恢复)/ settings(快捷键自定义+导出+导入)/ 用户文档。
- **✅ review findings 全部关闭**: #1 #2 #3 #4 #5(commit 649ba9f / f8b71dc / 即将)。见 `docs/memory/decisions/2026-06-19-review-findings.md`(原始)+ `2026-06-20-review-bugfixes.md`(#1+#3)+ `2026-06-20-trash.md`(#2)+ `2026-06-20-canvas-refactor.md`(#4+#5)。
- **执行模式**：主模型（Claude）按 plan 手动执行 + 自审;Ralph 自动循环已停用（见下方"Ralph 状态"）
- **下一个**：等用户诉求(新功能 / Phase 8)。候选:暗色模式 / 多画布 UI / 标签搜索 / OPFS(Phase 2.5)/ Phase 8 Tauri build(Rust 就绪)+ 签名公证(需 Apple 证书)
- 完整进度：`docs/development/changelog.md` + `docs/development/roadmap.md`（30 轮路线图）+ `docs/user/README.md`（用户指南）+ `docs/memory/context/current-session.md`（**clear 后第一份要读的交接档**）
- 任务流程参考：`docs/ralph/README.md`（已归档，见下）

## 技术栈（不可重新选型）

| 层 | 选择 |
|---|---|
| 包管理 | pnpm 9+ workspace monorepo |
| 前端 | Next.js 15 App Router + React 19 + TS strict + Tailwind v4，**静态导出，无 server** |
| 桌面 | Tauri v2 + Rust |
| 数据 | better-sqlite3 + Drizzle（Node 路径）；浏览器侧 in-memory + localStorage（Phase 2.5 换 wa-sqlite + OPFS） |
| 设计 | 6 原色 + 8px 网格 + Space Grotesk / Inter / JetBrains Mono |
| 测试 | vitest（domain + db）+ puppeteer-core（e2e） |

## 硬性禁止（任何模型、任何场景都适用）

- ❌ **不要修改** `docs/superpowers/specs/2026-06-19-cys-stift-design.md`（spec 是五轮审查定稿）
- ❌ 不要重新选型（换框架 / 换 ORM / 换数据库）—— 要改先写 ADR
- ❌ 不要在组件层写死颜色 hex / 像素值 —— 必须走 token（`@cys-stift/ui` 或 `@cys-stift/domain/tokens-local`）
- ❌ 不要破坏 `packages/domain` 的零依赖特性（它不 import 任何框架）
- ❌ 不要假装 build / test 通过 —— 必须实际跑命令看 exit code
- ❌ 不要添加用户没要求的依赖或"附赠功能"（YAGNI）
- ❌ 不要输出假 `<promise>` 来逃出循环 / 跳过验收

## 关键文件位置

| 想知道什么 | 看哪里 |
|---|---|
| 整体设计 / 数据模型 / 路线图 | `docs/superpowers/specs/2026-06-19-cys-stift-design.md` |
| 当前 phase 的实现计划 | `docs/superpowers/plans/` |
| Ralph 任务指南 + compact/clear 规则 | `docs/ralph/README.md`（已归档） |
| 架构决策记录 | `docs/adr/` |
| 设计 token 规则 | `docs/design/tokens.md` |
| 跨模型记忆 | `docs/memory/MEMORY.md` |
| 阶段变更历史 | `docs/development/changelog.md` |
| 开发环境搭建 | `docs/development/setup.md` |

## 验证命令（改完代码就跑）

```bash
pnpm --filter domain test     # domain 单元测试（必须全绿）
pnpm --filter db test         # db 集成测试（必须全绿）
pnpm --filter web build       # Next.js 静态导出（必须 exit 0）
```

## Ralph 状态（已停用）

> **2026-06-19 起，不再跑 Ralph 自动循环。** 改为主模型（Claude）按 phase plan 手动执行 + 自审。
>
> - `docs/ralph/README.md` **保留为归档**，内容（任务流程、审核标准、compact/clear 规则）仍可参考，但其中的"Ralph 是执行者 / 自动循环 / stop hook"描述**不再适用**。
> - Phase 3（Inbox）就是手动执行的第一个 phase，已完成并通过 GLM audit。
> - `scripts/audit-glm.sh` 保留：跨模型审核（GLM-5.2，Anthropic 兼容 endpoint）仍有用，需要时手动跑。
>
> **如果以后想重启 Ralph**：`docs/ralph/` + 各 plan 文件都在，重新接 stop hook 即可。

---

## Compact Instructions

> 任何上下文压缩（自动 / 手动 `/compact`）时，**必须完整保留**以下信息，不得省略：

1. **当前任务的核心目标与验收标准**（来自对应 phase 的 plan）
2. **已确认的技术选型与架构决策**（本文件"技术栈"表 + `docs/adr/`）
3. **明确标记为「不可修改」的文件**：spec、已 tag 的 phase 产物
4. **已验证无效、禁止重试的方案**（写在 `docs/memory/decisions/*-stuck.md`）
5. **当前 phase 进度**：哪个 task 在做、哪个完成、哪个卡住
6. **未落地的决策**：对话里讨论但还没写进文件的决定

可安全丢弃：早期调试日志、探索过程的失败尝试、已 supersede 的中间方案。

---

> 各包的局部纪律见对应目录的 `CLAUDE.md`。
> Ralph 已停用，但其任务流程/审核标准仍可在 `docs/ralph/README.md` 查到（归档状态）。
