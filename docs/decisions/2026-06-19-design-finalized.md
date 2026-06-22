# 2026-06-19 · 设计定稿

> 五轮复查后的 spec 定稿。

## 关键决策

- **全 local-first**：SQLite 跑在渲染进程内（WASM wa-sqlite + Drizzle wasm 驱动），Web/Desktop 共用一套代码，唯一差异是落盘方式（OPFS / Tauri fs）。
- **MVP 无 server**：Next.js 静态导出当应用壳；tRPC 等加云同步 server 时再回归。
- **包豪斯设计 token**：6 个原色 + 8px 网格 + Space Grotesk + Inter；功能区可换色但不能新增 token。
- **画布**：tldraw 渲染层 + 相机，业务位置数据存 SQLite 列（DB 为唯一真相源）。
- **路由**：避开动态段（`[id]` 与静态导出冲突），画布 / 卡片选择走客户端状态。

## 已澄清的取舍

- 多画布：MVP 单画布，schema 支持多画布，UI 留后
- Trash：MVP 无回收站 UI，删除需二次确认 + 导出兜底
- OG 抓取：MVP 不做（浏览器 CORS + 无 server），仅存 url
- 暗色模式 / i18n / 搜索 UI：MVP 不做，预留 token / hook / schema

## 链接

- spec: `docs/specs/2026-06-19-cys-stift-design.md`
- Phase 0 计划: `docs/plans/2026-06-19-phase-0-scaffold.md`
- 路线图: spec §8
