# ADR-0003 · 本地优先 + WASM SQLite

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

状态：✅ 已设计（spec §3.4 / §6.2），Phase 2 落地
