# Phase 2 实现计划 · 数据层（本地优先 + WASM SQLite）

| 字段 | 值 |
|---|---|
| 计划 | Phase 2：数据层 |
| 创建 | 2026-06-19 |
| 依据 spec | §3.4（本地优先数据访问）/ §4（核心数据模型）/ §4.11（数据边界）/ §6.2（数据层）/ ADR-0003 |
| 上游交付 | Phase 1（设计系统） |
| 下游交付 | Phase 3（Inbox CRUD 业务逻辑）必须先有 domain + repository |

---

## 0. 目标

把 spec §4 的领域模型**真正落地为可运行的本地优先数据层**——不再是占位包，业务方（Phase 3）能直接调用。

**核心承诺**：UI 创建一张 Card → 写进 WASM SQLite → 刷新页面 → 数据仍在（Web OPFS / Desktop Tauri fs 落盘）。**无 server**。

---

## 1. 范围

### ✅ 本阶段做

- **packages/domain** 从占位升级：
  - 类型：`Card` / `Canvas` / `Workspace` / `MediaAsset` / `CaptureSource` / `CaptureInput` / `LinkPreview` / `CodeBlock` / `Quote` / `MediaRef` / `CardType` 等全部 spec §4 定义
  - Branded ID 类型 + codec（DB 边界出入转换，spec §4.11 第 1 条）
  - JSON codec（spec §4.11 第 2 条）—— 防止双 stringify / parse 漏
  - 服务函数：`CardService.create / list / get / update / delete` / `CanvasService` / `WorkspaceService` 等
  - 单元测试（vitest，spec §6.9 要求 domain 层必须有覆盖）

- **packages/db** 从占位升级：
  - Drizzle schema：`cards` / `canvases` / `workspaces` / `media_assets` 四张表（spec §4.7 / §4.9）
  - Repository 接口（domain 不直接 import drizzle）
  - `MemoryRepository`：dev/测试用，纯内存
  - `WebRepository`：OPFS 持久化适配器（wa-sqlite in renderer + 整文件落盘）
  - `DesktopRepository`：Tauri fs 持久化适配器（wa-sqlite in renderer + Rust 落盘）
  - 三个 Repository 在 `apps/web` 端通过运行时检测自动选择（`typeof window !== 'undefined'` + `window.__TAURI__` 探测）

- **/dev/db 烟测页面**：`apps/web/src/app/dev/db/page.tsx`
  - 列出当前所有 Card
  - 表单可创建 Card（标题 + 正文）
  - 删除按钮
  - **重载页面验证持久化**

### ❌ 本阶段不做（留给后续 phase）

- 真实媒体上传 / 文件存盘 — Phase 3+ 业务
- 捕获入口（全局快捷键 / 菜单栏）— Phase 6
- tldraw 集成 / 画布位置 — Phase 4
- 归档 / 软删 UI（schema 字段已就位） — Phase 7
- 多画布 UI（schema 支持） — Phase 4+

---

## 2. 前置

- Node 22 + pnpm 9
- Phase 1 完成（packages/ui 组件可用）

---

## 3. 任务清单

### P2-T1 · packages/domain（纯 TS，零框架）

- `src/types.ts`：所有 spec §4 的接口 + branded ID 类型 + 辅助类型（CardType / MediaRef / LinkPreview / CodeBlock / Quote / ColorToken / CaptureInput / CanvasPosition）
- `src/codec.ts`：DB 边界出入的转换工具：
  - `toCardId(string)` / `fromCardId(CardId)` —— branded 工厂
  - `toCanvasId(string)` / `fromCanvasId(CanvasId)`
  - `toWorkspaceId` / `toMediaAssetId`
  - `serializeJson<T>(value: T): string` / `parseJson<T>(text: string): T` —— 防止双重序列化
- `src/services/card-service.ts`：
  - `create(input: CaptureInput): Card`
  - `getById(id: CardId): Card | null`
  - `listInbox(): Card[]`
  - `listOnCanvas(canvasId: CanvasId): Card[]`
  - `archive(id: CardId): void`
  - `softDelete(id: CardId): void`
- `src/services/canvas-service.ts` / `workspace-service.ts` 简化版（MVP 单 workspace 单 canvas）
- `src/repositories/types.ts`：`CardRepository` / `CanvasRepository` / `WorkspaceRepository` 接口（domain 只依赖接口）
- `src/index.ts`：re-export 全部
- 测试：`src/__tests__/card-service.test.ts`（vitest）—— 创建 / 列出 / 归档 / 软删 / canvasPosition 进出

**验证**：`pnpm --filter domain test` 全绿

### P2-T2 · packages/db

- `src/schema.ts`：Drizzle 四张表（spec §4.7 / §4.9 / §4.6 含 regionColorMap）
- `src/drizzle-client.ts`：Drizzle wasm 驱动初始化（wa-sqlite）
- `src/repositories/`：
  - `memory-repository.ts` —— Map 后端，测试用
  - `web-repository.ts` —— wa-sqlite + OPFS 落盘（防抖整文件写回）
  - `desktop-repository.ts` —— wa-sqlite + Tauri `invoke('plugin:fs|write_file')` 落盘
- `src/persistence/`：
  - `opfs.ts` —— Web 端 OPFS 读写
  - `tauri-fs.ts` —— Desktop 端 fs 插件调用
  - 共同接口：`PersistenceAdapter { read(): Promise<Uint8Array | null>; write(data: Uint8Array): Promise<void>; }`
- `src/codec.ts`：Drizzle 行 ↔ domain 实体转换（含 branded ID 重建 + JSON 列 parse）
- `src/index.ts`：re-export

**注意**：wa-sqlite 在浏览器跑需要 OPFS sync access handle 或异步 API。Phase 2 选**异步 OPFS**（兼容性更好）。整文件落盘用**防抖 500ms**。

**验证**：
- `pnpm --filter db build` 通过
- `pnpm --filter domain test` 通过（用 memory repository）

### P2-T3 · /dev/db 烟测页

- `apps/web/src/lib/db-provider.tsx`：React context 选择 repository（运行期检测）
- `apps/web/src/app/dev/db/page.tsx`：
  - 显示"当前 backend: web-opfs | desktop-tauri | memory"
  - 表单：标题 + 正文 → 点 Create → 写入
  - 列表：所有 inbox cards + 数量
  - 每条：Delete / Archive 按钮
- 启动时自动 seed 一条 workspace + 一条 canvas（MVP 默认）

**验证**：
- 浏览器打开 `localhost:3000/dev/db`
- 创建几条 card，刷新页面，**它们还在**（OPFS 持久化成功）
- 用 Tauri 弹窗打开 desktop 端，同样操作，刷新，**它们还在**（Tauri fs 持久化成功）

### P2-T4 · 视觉 + 持久化验证（关键）

- Chrome headless 截 `/dev/db`（desktop + mobile）
- 截三态：**空状态** / **有 3 张卡** / **创建后**
- 创建一条 card，刷新，重截——确认持久化
- Tauri 弹窗内截图（启动 → 创建 → 关闭 → 重启 → 数据还在）
- 写一份持久化报告：`docs/design/screenshots/phase-2/README.md`

### P2-T5 · 收尾

- `docs/development/changelog.md`
- `docs/memory/decisions/2026-06-19-phase-2.md` + 更新 MEMORY.md
- `git commit` + `git tag v0.3.0-phase-2`

---

## 4. 验收清单

- [ ] `pnpm --filter domain test` 全绿（≥5 个测试覆盖 Card 生命周期）
- [ ] `pnpm --filter db build` 通过
- [ ] `pnpm --filter web build` 静态产物 OK
- [ ] `/dev/db` 页面在 web 显示
- [ ] **核心承诺**：浏览器刷新后 card 仍在（OPFS 持久化）
- [ ] **核心承诺**：Tauri 重启后 card 仍在（fs 持久化）
- [ ] 6 色 hex 仍对（设计系统未受影响）
- [ ] 视觉截图归档到 `docs/design/screenshots/phase-2/`

---

## 5. 风险

| 风险 | 处理 |
|---|---|
| wa-sqlite OPFS API 复杂（sync handle vs async） | 用 async OPFS；防抖 500ms 落盘 |
| wa-sqlite 编译产物体积大 | 仅 web bundle 包含；用 dynamic import 懒加载 |
| Tauri fs 调用权限 | 桌面端 scope 限制在 OS 数据目录（spec §11） |
| 跨域 IndexedDB fallback | OPFS 不可用时 fallback 到 IDB（spec §3.4 注） |
| 序列化双重 stringify | 集中 codec，service 层只传对象 |
| Drizzle wasm driver 与 TypeScript 类型推断 | 必要时手动写 codec，不依赖 drizzle 的自动转换 |

---

## 6. 产出与汇报

完成后主动给出：

1. `pnpm test` 输出
2. `/dev/db` 截图（空态 / 有数据 / 创建后）
3. **持久化证据**：刷新前后数据对比截图
4. 下一步预告：Phase 3（Inbox 业务）
