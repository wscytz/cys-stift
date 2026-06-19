# cy's Stift · 架构总览

> 摘自 [`docs/superpowers/specs/2026-06-19-cys-stift-design.md`](../superpowers/specs/2026-06-19-cys-stift-design.md) §3。本页只放"地图"，完整推理与权衡见 spec。

---

## 仓库

pnpm monorepo：

- `apps/web` — Next.js (App Router) 应用壳，**静态导出**，无 server
- `apps/desktop` — Tauri v2 桌面壳（包 web 静态产物 + `fs` 落盘）
- `packages/ui` — 包豪斯设计系统 + React 组件（Phase 1+）
- `packages/db` — Drizzle ORM + WASM SQLite schema（Phase 2+）
- `packages/domain` — 纯 TS 业务规则（Phase 2+）
- `packages/config` — 共享 tsconfig / eslint / tailwind preset

---

## 数据流

```
┌─────────────────────────────────────────┐
│  UI (React + Bauhaus components)         │
└────────────┬────────────────────────────┘
             │  直接 import 调用（无 RPC）
             ▼
┌─────────────────────────────────────────┐
│  Domain (packages/domain)                │  纯业务规则（渲染进程内）
└────────────┬────────────────────────────┘
             │  Repository 接口
             ▼
┌─────────────────────────────────────────┐
│  Repository (packages/db)                │
│   - Drizzle + WASM SQLite (wa-sqlite)    │  单一驱动，Web/Desktop 通用
└────────────┬────────────────────────────┘
             │  持久化适配器（唯一平台差异）
             ▼
   ┌─────────┴─────────┐
   ▼                   ▼
 Web: OPFS        Desktop: Tauri fs

MVP 全在客户端渲染进程内，无 server、无 tRPC。
```

---

## 核心架构原则

1. **本地优先**——SQLite 在渲染进程内（WASM），Web/Desktop 共用一套代码。
2. **DB 为唯一真相源**——tldraw 的画布状态防抖回写到 SQLite（见 spec §6.11）。
3. **路由避开动态段**——`output: 'export'` 不支持 `[id]`；画布/卡片选择走客户端状态（§6.12）。
4. **特性即接口**——`features/capture/` 是 CaptureSink 接口的多种实现，新增入口不动核心。
5. **未来同步层**——schema 已同步就绪（墓碑 + updatedAt）；tRPC 等加 server 时再回归。

---

## 路线图（10 个阶段）

| Phase | 名称 | 状态 |
|---|---|---|
| 0 | 脚手架 | ✅ 进行中 |
| 1 | 设计系统 | 待办 |
| 2 | 数据层（domain + db） | 待办 |
| 3 | Inbox（CRUD + 多媒介） | 待办 |
| 4 | Canvas 基础（tldraw 集成） | 待办 |
| 5 | Canvas 完整（网格 / 自由） | 待办 |
| 6 | 捕获入口（全局快捷键 + 菜单栏） | 待办 |
| 7 | Archive | 待办 |
| 8 | Tauri 生产打包 + 签名 | 待办 |
| 9 | 文档、导出与可发现性 | 待办 |

详见 [`../superpowers/specs/2026-06-19-cys-stift-design.md` §8](../superpowers/specs/2026-06-19-cys-stift-design.md#8-开发路线图)。
