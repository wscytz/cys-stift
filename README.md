# cy's Stift

> 本地优先的灵感画布。
> 灵感 3 秒记，画布上慢慢养。

---

## 这是什么

**cy's Stift** 是一个本地优先的灵感工具。用包豪斯式的克制与几何，帮你把一闪而过的想法接住、把散落的念头连成线、把反复出现的洞察沉淀为作品。

**核心信念**

1. **本地优先** —— 数据是用户的，不是云端的。
2. **形随功能** —— 包豪斯是约束，不是滤镜。
3. **特性即接口** —— 每个 feature 是可独立替换的"切片"。
4. **数据可迁移** —— 本地数据随时可导出为开放格式，不做锁定。

---

## 状态

**完整可用的本地优先灵感画布**(v0.37.0 stable)。

捕获 / inbox(多媒介编辑)/ canvas(tldraw 自由画布 + 多画布 + 关系箭头 + AI 排版 + 导出)/ archive / trash / search / 标签 / AI(3 provider) 全部交付。桌面端可本地构建未签名 DMG。

**当前状态、版本里程碑、下一步、已知 debt 全见 [`docs/STATE.md`](docs/STATE.md)** — 单一可信源。历史见 [`docs/changelog.md`](docs/changelog.md)。

---

## 目录速览

```
cys-stift/
├── apps/
│   ├── web/             Next.js (App Router) 应用壳，静态导出
│   └── desktop/         Tauri v2 桌面壳
├── packages/
│   ├── ui/              包豪斯设计系统
│   ├── db/              Drizzle ORM + SQLite schema
│   ├── domain/          核心领域模型（Phase 2+）
│   └── config/          共享配置
├── docs/
│   ├── specs/   设计文档（定稿）
│   ├── plans/  阶段实现计划
│   ├── architecture/       架构总览
│   ├── adr/                架构决策记录
│   ├── design/             设计 token 文档
│   ├── development/        开发指南 / 变更日志
│   └── memory/             跨模型 / 跨会话记忆
├── .nvmrc               Node 22
├── .gitattributes       LF 强制
├── .editorconfig
├── .gitignore
├── .prettierrc
├── tsconfig.base.json
├── pnpm-workspace.yaml
└── package.json
```

---

## 文档导航

| 你想知道什么 | 看哪里 |
|---|---|
| 整体设计 / 数据模型 / 路线图 | [`docs/specs/2026-06-19-cys-stift-design.md`](./docs/specs/2026-06-19-cys-stift-design.md) |
| 当前阶段的实现计划 | [`docs/plans/`](./docs/plans/) |
| 架构总览 | [`docs/architecture/overview.md`](./docs/architecture/overview.md) |
| 为什么这样设计 | [`docs/adr/`](./docs/adr/) |
| 设计 token / 包豪斯规则 | [`docs/design/tokens.md`](./docs/design/tokens.md) |
| 如何搭建开发环境 | [`docs/development/setup.md`](./docs/development/setup.md) |
| 跨会话上下文 | [`docs/memory/`](./docs/memory/) |
| 阶段变更历史 | [`docs/changelog.md`](./docs/changelog.md) |

---

## 开发

```bash
# 安装依赖
pnpm install

# 起 Next.js 开发服务器（mac/win 都一样）
pnpm dev
# → http://localhost:3000

# 构建静态产物（mac/win 都一样）
pnpm build

# 启动 Tauri 桌面壳（需要 Rust 工具链）
pnpm tauri dev
```

详见 [`docs/development/setup.md`](./docs/development/setup.md)。

---

## 许可

TBD（项目不盈利，长期保持开放优先）。
