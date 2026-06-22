---
status: superseded
superseded-by: better-sqlite3 + localStorage adapter
date: 2026-06-19
supersedes:
---

# ADR-0003 · 本地优先 + WASM SQLite

> **⚠️ SUPERSEDED(v0.37.0 review):** 原计划的 wa-sqlite/WASM SQLite 路线**未采用**。
> 实际实现:`packages/db` 用 **better-sqlite3**(Node 路径),`apps/web` 走 **in-memory + localStorage** adapter(画布快照用 OPFS)。wa-sqlite + OPFS 仍是 spec §3.4 的长期方向(Phase 2.5 留后),但截至今日未启用。本 ADR 保留以记录决策历史。**核心理念"本地优先、无 server、Web/Desktop 共用 domain"仍然成立并已落地**——只是 DB 驱动不同。

## 背景
产品信念是"数据是用户的"。需要 Web 和 Desktop 共用一份数据层代码。

## 决策
**所有业务逻辑 + 数据库都在客户端渲染进程内**。DB 用 `wa-sqlite` + Drizzle 的 wasm 驱动（`drizzle-orm/wasm`），同一份 schema 与查询代码两端通用。唯一差异是持久化适配器：Web 走 OPFS，Desktop 走 Tauri `fs`。

## 后果
- ✅ MVP 真本地优先——无 server，Next.js 静态导出
- ✅ Drizzle 类型化查询两端复用，零 SQL 重复
- ✅ 加云同步时 = 加 server + 同步引擎，**不动业务**
- ⚠️ wa-sqlite 整文件落盘，性能与 db 大小成正比——个人量级够用，超大再迁 Turso
- ⚠️ Tauri SQL 插件 / 服务端 libSQL 都不可用（前者 Drizzle 无驱动，后者与本地优先相悖）

状态：⚠️ superseded — wa-sqlite 路线未采用,实际用 better-sqlite3(Node)+ web localStorage。见上方更正注。
