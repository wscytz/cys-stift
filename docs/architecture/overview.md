# cy's Stift · 架构总览

> 摘自 [`docs/specs/2026-06-19-cys-stift-design.md`](../specs/2026-06-19-cys-stift-design.md) §3。本页只放"地图",完整推理与权衡见 spec。
> **当前状态/版本进度见 [`../STATE.md`](../STATE.md)** — 本页只描述结构,不跟踪进度。

---

## 仓库

pnpm monorepo:

- `apps/web` — Next.js 15 (App Router) 应用壳,**静态导出**(`output: 'export'`),无 server
- `apps/desktop` — Tauri v2 桌面壳(包 web 静态产物 + 全局快捷键 + 未来 `fs` 落盘);同一代码链出 **Android APK**(`cfg(desktop)` 守卫桌面专属能力,安卓走 AppMenu/通知替代全局热键)
- `packages/canvas-engine` — 自研 Canvas 2D 引擎(零业务依赖,框架无关,token 注入;独立测试套 + README。北极星:可剥离成独立包,见 `canvas-engine-extractable` 记忆)
- `packages/ui` — 包豪斯设计系统 + React 组件
- `packages/db` — Drizzle ORM + better-sqlite3 schema(Node 路径;web 走 localStorage + OPFS 适配器)
- `packages/domain` — 纯 TS 业务规则(零依赖,Repository 接口注入)

---

## 数据流

```
┌─────────────────────────────────────────┐
│  UI (React 19 + Bauhaus components)      │
└────────────┬────────────────────────────┘
             │  直接 import 调用(无 RPC / 无 server)
             ▼
┌─────────────────────────────────────────┐
│  Domain (packages/domain)                │  纯业务规则(渲染进程内)
└────────────┬────────────────────────────┘
             │  Repository 接口
             ▼
┌─────────────────────────────────────────┐
│  Repository (packages/db / apps/web/lib) │
│   - Node: Drizzle + better-sqlite3       │
│   - Web (现行): in-memory + localStorage │
│   - 画布快照: OPFS(异步,localStorage fallback)
└────────────┬────────────────────────────┘
             │  持久化适配器(唯一平台差异)
             ▼
   ┌─────────┴─────────┐
   ▼                   ▼
 Web: localStorage   Desktop: Tauri fs (未来)
      + OPFS

MVP 全在客户端渲染进程内,无 server、无 tRPC。
```

> **ADR-0003** 原计划 wa-sqlite/WASM SQLite,实际回退为 better-sqlite3(Node)+ web localStorage。ADR 已标 superseded。Phase 2.5 换 wa-sqlite + OPFS 为长期留后(spec §3.4),目前画布快照已先行用 OPFS。

---

## 核心架构原则

1. **本地优先**——数据在客户端,Web/Desktop/Android 共用一套 domain 代码,离线可用。
2. **Card 为唯一真相源**——画布上的 card 元素只存几何 + cardId 引用,内容渲染查 CardService;inbox/archive 编辑实时反映到画布。
3. **路由避开动态段**——`output: 'export'` 不支持 `[id]`;画布/卡片选择走客户端状态(spec §6.12)。
4. **特性即接口**——`features/capture/` 是 CaptureSink 接口的多种实现,新增入口不动核心。
5. **AI 隐私 allowlist**——AI 只看 `AI_CARD_FIELDS` 显式注册的字段;`source.deviceId` / `media.dataUrl` / 软删除卡 永不外发(见 `docs/development/privacy-design.md`)。

---

## 路线图

spec §8 的 10 阶段核心 + 后续加固/功能 phase 全部已交付或进行中。
**完整版本里程碑见 [`../STATE.md`](../STATE.md)**,历史见 [`../changelog.md`](../changelog.md),路线见 [`../development/roadmap.md`](../development/roadmap.md)。

详见 [`../specs/2026-06-19-cys-stift-design.md` §8](../specs/2026-06-19-cys-stift-design.md#8-开发路线图)。
