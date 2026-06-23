# cy's Stift — 设计文档

> **本地优先的灵感画布。**
> 用包豪斯式的克制与几何，帮你把一闪而过的想法接住、把散落的念头连成线、把反复出现的洞察沉淀为作品。

| 字段 | 值 |
|---|---|
| 项目名 | **cy's Stift**（cy = wscytz；Stift = 德语"笔"） |
| 创建日期 | 2026-06-19 |
| 状态 | 草案，已对齐 Q1–Q13 |
| 路径 | `~/projects/cys-stift` |
| 维护者 | cy（@wscytz） |
| 受众 | 人类 + 任意 LLM（Claude / GPT / Gemini / …） |

---

## 1. 产品定位

### 1.1 一句话叙事
> **"灵感 3 秒记，画布上慢慢养。"**

### 1.2 核心信念
1. **本地优先** —— 数据是用户的，不是云端的。
2. **形随功能** —— 包豪斯是约束，不是滤镜。
3. **特性即接口** —— 每个 feature 是可独立替换的"切片"。
4. **数据可迁移** —— 本地数据随时可导出为开放格式（JSON / Markdown），不做锁定。云同步是叠加层，不是逃生口。

### 1.3 MVP 范围

#### ✅ 明确做
- 单用户、本地 SQLite 存储
- **Inbox（收件箱）** 视图
- **Canvas（画布）** 视图 —— 8px 网格 + 自由模式
- **Card 实体**（标题/正文/图片/链接/代码/引用）
- **Capture 入口** —— 全局快捷键 + 菜单栏兜底 + 接口预留
- 完整 **Bauhaus 设计系统**（6 个原色 token / Space Grotesk + Inter / 8px 网格）
- **跨平台工程化**（macOS + Windows 均可开发）

#### ❌ 明确不做（但接口已留）
- 用户系统 / 登录
- 云同步
- 第三方 API 接入
- 协作 / 实时多人
- 移动端原生
- 暗色模式（预留 token）
- i18n（预留 hook）
- 商业化（订阅 / 付费）
- AI 自动连接 / 自动归档（接口预留）
- 全文搜索 UI（基础 LIKE 可用，FTS 视 wa-sqlite 构建支持）

### 1.4 MVP 用户流程与边界裁决

走查核心动线后，这几处明确成"有意识的取舍"，避免实现时各自发挥：

- **建卡**：默认进 Inbox；画布上**双击空白可直接建卡**（`CaptureInput.canvasPosition`，见 §4.8）。
- **多画布**：MVP **单画布**（默认画布）；schema 支持多画布，多画布 UI 留后。
- **归档**：`archived=true` 的卡从 Inbox / Canvas **隐藏**，进 Archive 视图；`canvasPosition` **保留**（取消归档回到原位）。
- **删除**：MVP 软删（`deletedAt` 墓碑），**无 Trash UI**——删除需二次确认，误删只能靠 JSON 导出 / 原始 DB 恢复。Trash UI 留后。（如对此取舍有异议，可在实现前提。）
- **渲染安全**：Markdown 必须经 `rehype-sanitize`；链接只允许 `http`/`https`（防 `javascript:` 注入）。粘贴进来的外部内容同样适用。

---

## 2. 核心决策记录（Q1–Q13）

| # | 决策点 | 选择 | 备注 |
|---|---|---|---|
| Q1 | 先聚焦哪个核心功能 | **A. 卡片（Card）** | 信息聚合的最小单元 |
| Q2 | 卡片能装什么 | **B. 多媒介** | 标题 + 正文 + 图片 + 链接 + 代码 + 引用 |
| Q3 | 卡的来源 | **B. 快速捕获为主** | 全局快捷键 → mini input → Inbox → Canvas |
| Q4 | 画布的"无限"感 | **C. 网格无限** | 强网格默认 + 自由模式可选 |
| Q5 | 技术栈 | **A. Next.js + SQLite + Tauri + 自研 Canvas 2D 渲染器** | 客户端 local-first（无 server） |
| Q6 | 基座范围 | **C. 基座 + 快速捕获 + 包豪斯设计系统** | |
| Q7 | 包豪斯原色 + 可换色 | **功能区划 + 红色默认 + 可重映射** | token 集固定 6 色 |
| Q8 | 字体 | **B. Space Grotesk + Inter** | |
| Q9 | 网格颗粒度 | **B. 8px 基础网格** | |
| Q10 | 捕获入口 | **C. 全局快捷键 + 菜单栏兜底 + 接口预留** | CaptureSink 接口 |
| Q11 | 架构 | **B. 特性切片（Feature-sliced）** | |
| Q12 | 项目名 | **cy's Stift** | |
| Q13 | 工程化 | **A. 完整脚手架** | pnpm / .gitattributes / .editorconfig / .nvmrc |

---

## 3. 架构总览

### 3.1 仓库结构（pnpm monorepo）

```
~/projects/cys-stift/
├── apps/
│   ├── web/                      # Next.js (App Router) 应用壳，静态导出；无 server
│   └── desktop/                  # Tauri 桌面壳子（包 web 静态产物 + fs 落盘）
├── packages/
│   ├── ui/                       # Bauhaus 设计系统 + React 组件
│   ├── db/                       # Drizzle ORM + SQLite schema + migrations
│   ├── domain/                   # 核心领域模型（Card / Inbox / Canvas / Capture）
│   └── config/                   # 共享配置（tsconfig / eslint / tailwind preset）
├── docs/                         # 文档与记忆
│   ├── architecture/             # 架构图、模块边界
│   ├── adr/                      # Architecture Decision Records
│   ├── memory/                   # 跨模型 / 跨会话记忆
│   ├── design/                   # Bauhaus tokens & 设计系统
│   ├── development/              # 开发指南、变更日志
│   └── specs/        # 设计文档（本文件）
├── .gitignore
├── .gitattributes                # 强制 LF
├── .editorconfig
├── .nvmrc                        # Node 22 LTS
├── pnpm-workspace.yaml
├── package.json
└── README.md
```

### 3.2 分层数据流

```
┌─────────────────────────────────────────┐
│  UI (React + Bauhaus components)         │  ← 用户看到
└────────────┬────────────────────────────┘
             │  直接 import 调用（无 RPC）
             ▼
┌─────────────────────────────────────────┐
│  Domain (packages/domain)                │  ← 纯业务规则（渲染进程内）
│   - Card / Inbox / Canvas / Capture      │
└────────────┬────────────────────────────┘
             │  Repository 接口
             ▼
┌─────────────────────────────────────────┐
│  Repository (packages/db)                │
│   - Drizzle + WASM SQLite (wa-sqlite)    │  ← 单一驱动，Web/Desktop 通用
└────────────┬────────────────────────────┘
             │  持久化适配器（唯一平台差异）
             ▼
   ┌─────────┴─────────┐
   ▼                   ▼
 Web: OPFS        Desktop: Tauri fs（db 文件落盘）

注：MVP 全在客户端渲染进程内，无 server、无 tRPC。
    未来加同步 server 时，tRPC 回归为「同步层」协议，不贯穿 MVP。
```

### 3.3 Feature-sliced 在 apps/web 的落地

```
apps/web/src/
├── app/                          # Next.js 路由壳
│   ├── (workspace)/              # 路由组（带侧栏）
│   │   ├── inbox/
│   │   ├── canvas/                # 当前画布 id 走客户端状态（见 §6.12）
│   │   └── archive/
│   └── api/                      # 仅未来 webhook 捕获用（MVP 静态导出，无 server）
├── features/
│   ├── capture/                  # 捕获入口
│   ├── card/                     # 卡片 CRUD
│   ├── canvas/                   # 画布（自研 Canvas 2D + CanvasHost 抽象）
│   └── archive/                  # 归档视图
├── entities/
│   ├── card/
│   ├── canvas-state/
│   └── capture-source/
├── shared/
│   ├── ui/                       # 多从 packages/ui 消费
│   ├── lib/                      # 工具函数
│   └── config/                   # 全局配置
└── styles/
    └── tokens.css                # Bauhaus tokens 注入
```

### 3.4 本地优先数据访问（核心架构）

cy's Stift 是**单运行时**应用：所有业务逻辑与数据访问都在**客户端渲染进程**内，Web 与 Desktop 共用同一份代码。

**数据库：渲染进程内 WASM SQLite**

- 用 `wa-sqlite` + Drizzle 的 wasm 驱动（`drizzle-orm/wasm`），同一份 schema 与查询代码在 Web 和 Desktop 都跑。
- **为什么不用 Tauri SQL 插件 / 不用 libSQL server 端**：Drizzle 没有 Tauri 驱动（会退回手写 SQL，丢类型）；server 端 libSQL 又需要一个 server（与本地优先相悖）。WASM SQLite 是唯一让「同一份 Drizzle 代码双端通用」的路。

**唯一的双端差异：持久化适配器**

| 平台 | DB 实例位置 | 落盘方式 |
|---|---|---|
| Web（PWA / dev） | 渲染进程 | OPFS（Origin Private File System） |
| Desktop（Tauri） | 渲染进程 | Tauri `fs` 插件把 db 文件写到 OS 数据目录 |

DB 内存实例与磁盘文件的同步策略：防抖写回（同 §6.11 思路）。

（注：OPFS 需 secure context——HTTPS 或 localhost；Tauri 桌面走 `fs` 插件不受此限。）

**对技术栈的影响**

1. **MVP 无 server、无 tRPC**：UI 直接 import 并调用 `packages/domain` 的服务函数，数据通过 Repository 读写。
2. **Next.js 降级为静态导出应用壳**（`output: 'export'`）：只用路由 + 组件，**不**用 SSR / API routes / Server Actions。
3. **tRPC 推迟到「同步层」**：未来加云同步 server 时，tRPC 作为客户端 ↔ 同步 server 的协议回归，不贯穿 MVP。
4. **`domain` / `db` 仍是 framework-agnostic 的纯 TS 包**：未来无论迁 Turso 还是加 server，都是换驱动 / 加同步层，不动业务。

---

## 4. 核心数据模型

> **这是整个项目最难换的部分**，花最多笔墨。

### 4.1 实体关系

```
Workspace  ──1:n──  Canvas  ──1:n──  Card  ──1:n──  MediaAsset
                       ▲                  │
                       └── (可选) ─────────┘

Card  ──1:1──  CaptureSource （嵌入字段，非独立表）

关系澄清：
- Card : Canvas       =  n:1   （一张卡最多属于一个画布；canvasPosition 可选 → 未上画布即在 Inbox）
- Card : MediaAsset   =  1:n   （一张卡可含多个媒体）
- Card : CaptureSource = 1:1   （Card.source 嵌入字段，不建独立表）
- Workspace : Canvas  =  1:n   （经 Canvas.workspaceId）

注：若未来要让一张卡出现在多个画布，需引入 `cards_canvases` 关联表——当前 MVP 不支持。
```

### 4.2 Card

```ts
export type CardId = string & { __brand: 'CardId' }
export type CanvasId = string & { __brand: 'CanvasId' }
export type WorkspaceId = string & { __brand: 'WorkspaceId' }
export type MediaAssetId = string & { __brand: 'MediaAssetId' }

export interface Card {
  id: CardId

  // ── 必填 ──────────────────────────────
  title: string              // 最长 200 字符
  body: string               // Markdown，最长 50_000 字符
  type: CardType             // 决定默认渲染

  // ── 多媒介 ────────────────────────────
  media: MediaRef[]          // 图片 / 附件引用
  links: LinkPreview[]       // 链接预览缓存
  codeSnippets: CodeBlock[]  // 代码片段
  quotes: Quote[]            // 引用

  // ── 来源追溯 ──────────────────────────
  source: CaptureSource      // 从哪儿来
  capturedAt: Date           // 捕获时间（≠ 创建时间）
  createdAt: Date            // 入库时间
  updatedAt: Date

  // ── 画布定位（可选）──────────────────
  canvasPosition?: {
    canvasId: CanvasId
    x: number                // 8px 网格坐标
    y: number
    w: number
    h: number
    z: number                // 图层顺序
    rotation?: number        // 自由模式下可旋转
  }

  // ── 元数据 ────────────────────────────
  color?: ColorToken         // red / yellow / blue / black / white / gray
  pinned: boolean            // 钉在画布上
  archived: boolean          // 归档

  // ── 软删 ──────────────────────────────
  deletedAt?: Date
}
```

**关键约束**：`canvasPosition` 可选。卡片先在 Inbox"暂住"，拖到画布上才生成坐标。从数据模型上**强制**"捕获 ≠ 整理"工作流。

### 4.3 Canvas

```ts
export interface Canvas {
  id: CanvasId
  workspaceId: WorkspaceId
  name: string
  createdAt: Date
  updatedAt: Date

  view: {
    zoom: number             // 默认 1.0
    pan: { x: number; y: number }
    gridMode: 'snap' | 'free'
    gridSize: 8              // 8px 固定
  }
}
```

**画布不存"卡列表"**，只存视图状态 + 过滤条件。卡的归属是 `Card.canvasPosition` 的责任。

### 4.4 CaptureSource（discriminated union）

```ts
export type CaptureSource =
  | { kind: 'shortcut';     shortcutId: string; deviceId: string }
  | { kind: 'menubar';      deviceId: string }
  | { kind: 'paste';        deviceId: string; originalApp?: string }
  | { kind: 'drag-drop';    deviceId: string; fileCount: number }
  | { kind: 'webhook';      endpoint: string; externalId?: string }
  | { kind: 'manual';       deviceId: string }
  | { kind: 'unknown' }
// 注：deviceId = 安装级 UUID，首次运行生成并持久化；未来同步时复用为 nodeId（见 §4.10）。
```

### 4.5 MediaAsset

```ts
export interface MediaAsset {
  id: MediaAssetId
  cardId: CardId

  kind: 'image' | 'file'
  mimeType: string
  byteSize: number
  width?: number
  height?: number

  storage: {
    backend: 'local-fs'      // Desktop=OS 数据目录；Web=OPFS（无真实路径，relPath 仅作逻辑键）；未来可加 s3/r2
    relPath: string          // Desktop：相对 OS 数据目录（mac ~/Library/.../cys-stift/media；win %APPDATA%/cys-stift/media）
    checksum: string         // SHA-256
  }

  createdAt: Date
}
```

### 4.6 Workspace

```ts
export interface Workspace {
  id: WorkspaceId
  name: string
  defaultCanvasId: CanvasId
  regionColorMap?: Partial<Record<Region, RegionToken>>   // 用户重映射（见 §5.2）；MVP 用默认值，换色 UI 留到设置阶段
  createdAt: Date
}
```

MVP 只有一个默认 workspace，但 schema 预留。`regionColorMap` 字段随 schema 一起建（前向兼容），换色 UI 不在 MVP。

### 4.7 SQLite Schema（核心 Drizzle 表）

```ts
export const cards = sqliteTable('cards', {
  id: text('id').primaryKey(),
  workspaceId: text('workspace_id').notNull(),

  title: text('title').notNull(),
  body: text('body').notNull().default(''),
  type: text('type').notNull().$type<CardType>(),

  mediaJson: text('media_json').notNull().default('[]').$type<MediaRef[]>(),
  linksJson: text('links_json').notNull().default('[]').$type<LinkPreview[]>(),
  codeSnippetsJson: text('code_snippets_json').notNull().default('[]').$type<CodeBlock[]>(),
  quotesJson: text('quotes_json').notNull().default('[]').$type<Quote[]>(),

  sourceJson: text('source_json').notNull().$type<CaptureSource>(),

  capturedAt: integer('captured_at', { mode: 'timestamp' }).notNull(),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),

  canvasId: text('canvas_id'),
  canvasX: real('canvas_x'),
  canvasY: real('canvas_y'),
  canvasW: real('canvas_w'),
  canvasH: real('canvas_h'),
  canvasZ: integer('canvas_z'),
  canvasRotation: real('canvas_rotation'),

  color: text('color').$type<ColorToken>(),
  pinned: integer('pinned', { mode: 'boolean' }).notNull().default(false),
  archived: integer('archived', { mode: 'boolean' }).notNull().default(false),
  deletedAt: integer('deleted_at', { mode: 'timestamp' }),
})

// 索引
// idx_cards_workspace_inbox: (workspace_id, archived, deleted_at) WHERE canvas_id IS NULL
// idx_cards_canvas:          (canvas_id, canvas_z) WHERE canvas_id IS NOT NULL
// idx_cards_captured_at:     (workspace_id, captured_at DESC)
```

### 4.8 辅助类型定义（补全）

```ts
// ── 卡片类型（决定默认渲染的主媒介；字段仍可混存）──
export type CardType = 'note' | 'image' | 'link' | 'code' | 'quote'
// 默认 'note'。其它类型只影响渲染优先级，不代表"只能放这种内容"。

// ── 多媒介相关 ──
export interface MediaRef {           // 引用 MediaAsset
  assetId: MediaAssetId
  caption?: string
  order: number
}

export interface LinkPreview {        // 链接抓取缓存
  url: string
  title?: string
  description?: string
  ogImageUrl?: string
  fetchedAt: Date
}
// 注：MVP 不抓取 OG（浏览器 CORS + 无 server），仅存 url；OG 抓取留待同步层 / 代理。

export interface CodeBlock {
  language: string                    // 'typescript' | 'bash' | ...
  code: string
  caption?: string
}

export interface Quote {
  text: string
  attribution?: string               // 出处 / 作者
  sourceUrl?: string
}

// ── 颜色 token：与功能区原色集统一（见 §5.2）──
export type ColorToken = RegionToken  // 即 red | yellow | blue | black | white | gray

// ── 捕获输入（CaptureSink.submit 的入参）──
export interface CaptureInput {
  title?: string
  body?: string
  type?: CardType                     // 缺省 'note'
  media?: Array<{                     // 入参阶段尚无 assetId，是原始内容
    kind: 'image' | 'file'
    fileName: string
    mimeType: string
    bytes?: ArrayBuffer
    localPath?: string               // 桌面端拖入文件时
  }>
  links?: string[]
  codeSnippets?: CodeBlock[]
  quotes?: Quote[]
  source: CaptureSource
  canvasPosition?: {          // 传了 = 直接在画布上建卡（双击空白）；不传 = 进 Inbox
    canvasId: CanvasId
    x: number; y: number; w: number; h: number; z: number
    rotation?: number
  }
}
```

### 4.9 canvases 表（补全 §4.7）

```ts
export const canvases = sqliteTable('canvases', {
  id: text('id').primaryKey(),
  workspaceId: text('workspace_id').notNull(),
  name: text('name').notNull(),
  viewJson: text('view_json').notNull().$type<Canvas['view']>(),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
})
// idx_canvases_workspace: (workspace_id, updated_at DESC)
```

### 4.10 同步就绪性（前瞻）

当前 schema 已为未来云同步埋好"形状"：软删 `deletedAt`（墓碑）、`updatedAt`（最后修改时间）。未来接入 CRDT 同步时，通过迁移补两个列即可：每记录 `version`（向量时钟）与 `nodeId`（设备标识，复用 §4.4 的安装级 UUID）。结论：**加同步 = 加列 + 同步引擎，不需要重构现有表**。

**搜索**：MVP 不做全文搜索 UI；基础查询可用 `body`/`title` 的 LIKE，FTS5 视 wa-sqlite 构建是否含此扩展再加。这样后期加搜索不需要回填历史数据。

### 4.11 数据边界注意事项

SQLite ↔ TypeScript 有两处边界，实现时必须显式处理（spec 里的类型是"目标形状"，不是自动转换）：

1. **Branded ID**：`CardId` 等品牌类型在 DB 边界会退回 `string`。读出时要用 codec / zod 重新打标（或 Drizzle 自定义 `$transform`），否则品牌类型形同虚设、到处 `as CardId`。
2. **JSON 列**：`mediaJson` 等用 `text` 存 JSON，Drizzle 的 `.$type<>()` **只是类型断言，不自动 parse**。读写要手动 `JSON.parse` / `JSON.stringify`；建议在 repository 层封装 codec，避免重复 stringify / 转义 bug。

---

## 5. UI 与设计系统（包豪斯）

### 5.1 Design Tokens

```ts
export const tokens = {
  color: {
    red:    { DEFAULT: '#D40000', soft: '#FFE5E5' },
    yellow: { DEFAULT: '#FFCE00', soft: '#FFF8DC' },
    blue:   { DEFAULT: '#003F7F', soft: '#E0EBF5' },
    black:  { DEFAULT: '#0A0A0A', soft: '#2B2B2B' },
    white:  { DEFAULT: '#FAFAFA', soft: '#FFFFFF' },
    gray:   { DEFAULT: '#8C8C8C', soft: '#D9D9D9' },
  },

  font: {
    display: '"Space Grotesk", system-ui, sans-serif',
    body:    'Inter, system-ui, -apple-system, sans-serif',
    mono:    '"JetBrains Mono", "SF Mono", monospace',
  },

  fontSize: {
    xs: '12px', sm: '14px', base: '16px', lg: '20px',
    xl: '24px', '2xl': '32px', '3xl': '48px', '4xl': '64px',
  },

  space: { 0: '0', 1: '8px', 2: '16px', 3: '24px', 4: '32px',
           5: '40px', 6: '48px', 8: '64px', 10: '80px', 12: '96px', 16: '128px' },

  border: { none: '0', hairline: '1px solid', thick: '2px solid' },
  radius: { none: '0', sm: '2px', md: '4px', full: '9999px' },
  shadow: { none: 'none',
            sm:   '0 1px 0 0 currentColor',
            md:   '2px 2px 0 0 currentColor' },  // Bauhaus 经典位移阴影
}
```

### 5.2 功能区 → 颜色映射

```ts
export type RegionToken = 'red' | 'yellow' | 'blue' | 'black' | 'white' | 'gray'
export type Region = 'capture' | 'inbox' | 'canvas' | 'archive' | 'system'

export const defaultRegionColor: Record<Region, RegionToken> = {
  capture: 'red',     // 灵感火花
  inbox:   'red',     // 同上
  canvas:  'black',   // 工作区，沉稳
  archive: 'blue',    // 已沉淀
  system:  'gray',    // 系统 UI
}
```

**规则**：用户可重映射 region → token，但**不能新增 token**（保持包豪斯原色集）。

### 5.3 核心组件

| 组件 | 包豪斯特征 |
|---|---|
| `Button` | 单线边框 + 几何形 + 位移阴影 |
| `Input` | 极简下划线，聚焦变红 |
| `Card` | 白底 + 单线黑边 + 8px 微圆角 + Space Grotesk 标题 |
| `Tag` | 纯文字 + 颜色 token |
| `Toolbar` | 左侧 8px 宽**色条**标识当前区域 |
| `Modal` | 全屏 50% 黑遮罩 + 白底单线主体 |
| `Tooltip` | 黑底白字 + 2px 圆角 + 200ms 缓动 |

### 5.4 三个视图的视觉骨架

- **Inbox**：8px 红条顶部 + 卡片网格（snap 8px，240px 固定宽）
- **Canvas**：8px 黑条顶部 + 8px 点阵网格背景 + 自研 Canvas 2D 渲染
- **Archive**：8px 蓝条顶部 + 网格视图（默认）+ 时间轴视图

### 5.5 Mini Input（捕获弹窗）

- 全局快捷键（默认，可在设置改）：`Cmd+Shift+Space`（mac）/ `Ctrl+Shift+Space`（win）
- 居中浮层，红边框强调
- 输入即保存草稿（SQLite + 本地状态）

### 5.6 暗色模式

MVP **不做**。预留 token 抽象，未来加。

---

## 6. 关键技术决策

### 6.1 前端
- **Next.js 15 + App Router + React 19 + TypeScript (strict)**
- 不选 Vite（生态薄）；不选 SvelteKit（React 画布生态最厚）

### 6.2 数据层
- **Drizzle ORM + WASM SQLite（wa-sqlite，渲染进程内）**——机制见 §3.4
- 不选 Prisma（runtime 重，黑盒，且无浏览器/wasm 优先路径）
- 不选 raw SQL（长期缺类型）
- 未来无痛迁 Turso（libSQL 协议）或 Postgres（Drizzle schema 写法是标准 SQL）

### 6.3 画布
- **自研 Canvas 2D 渲染器**：`CanvasElement`（`kind: card | arrow | freedraw | text | rect`）为统一模型，业务依赖引擎无关的 `CanvasHost` 接口，主路由以 `SelfBuiltAdapter` 实现；关系箭头用「语义三维签名」（线型 + 箭头形 + 颜色）区分卡片间关系性质。
- 不选 Excalidraw / Konva / React Flow（语义不匹配或开发量大）
- 风险预案（已兑现）：渲染层 + 相机自研，业务全在自己手里（见 ADR 2026-06-23）

### 6.4 桌面壳
- **Tauri v2 + Rust**
- 插件：`global-shortcut` / `system-tray` / `fs` / `updater`（未来）
- 不选 Electron（包体积 / 内存 / 安全性）

### 6.5 样式
- **Tailwind CSS v4 + CSS Variables**
- 包豪斯几何规则用 Tailwind preset 锁住

### 6.6 通信
- **MVP 无 RPC**：UI 在渲染进程内直接 import 调用 `packages/domain`（见 §3.4）。
- **tRPC v11 推迟到同步层**：未来加云同步 server 时作为客户端 ↔ server 协议，不在 MVP 引入。
- Next.js 以静态导出运行，**不用** SSR / API routes / Server Actions。

### 6.7 状态管理
- **客户端数据**：直接读 Repository（WASM SQLite），变更后用轻量订阅 / 事件刷新 UI（TanStack Query 可选作缓存层）
- **客户端 UI 状态**：Zustand
- **画布内部**：自研 adapter 内部状态（`CanvasElement` Map + `CanvasView` + 选区 + undo/redo 栈；与 DB 的同步见 §6.11）

### 6.8 校验
- **Zod 4** —— schema 同时给 Drizzle / tRPC / 表单用

### 6.9 测试
- **Vitest**（domain 层必须有覆盖）
- **Playwright**（Inbox → Canvas 主路径 E2E）
- 不写"为覆盖率而覆盖率"的测试

### 6.10 包管理 / Node
- **pnpm 9+**
- **Node 22 LTS**（`.nvmrc` 锁定）

### 6.11 画布持久化策略（关键）

Card 是 `CanvasElement`（`kind='card'`），但**卡片几何的数据真相源是 SQLite 的 `cards.canvasPosition` 列**，不是画布内部状态。绑定方式：

- **加载**：从 DB 读卡片 → 转成 `CanvasElement`（`kind='card'`）→ `host.upsert`（`applyWithoutEcho`，不触发回写监听）。
- **编辑**：监听 `host.onUserChange`，**防抖（~300ms）后**写回 DB 的 `canvasX/Y/W/H/Z/rotation`。
- **卡片几何 vs undo/redo**：DB 是单一真相源；画布内部状态仅用于 undo/redo（adapter 内 50 步快照栈）。
- **freeform 元素**（`text` / `freedraw` / `arrow` / `rect`）：不进 DB，per-canvas 持久化到 `canvas-freeform-store`（OPFS 主 + localStorage 回退），与 `.cystift` 导出同源（`host.getElements()` ↔ `host.upsert` 往返）。

这样 Inbox / Archive 能用 `canvas_id IS NULL` 直接查询（见 §4.7 索引），不被画布内部状态挡住。

### 6.12 路由与静态导出

Next.js `output: 'export'` **不能**为运行时才知道的参数（如 canvasId）做动态路由——`[canvasId]` 段在构建期无法枚举，会导致构建失败或 404。因此：

- **画布选择用客户端状态**（Zustand），URL 保持 `/canvas`，不把 id 放进路径。
- 同理，卡片详情走客户端状态 / 模态，不做 `/card/[id]`。
- 真要深链时，用 query param（`/canvas?id=xxx`）+ 客户端读取。

---

## 7. 接口预留：CaptureSink

```ts
// packages/domain/src/capture/sink.ts
export interface CaptureSink {
  submit(input: CaptureInput): Promise<{ cardId: CardId }>
}

// 多个实现：
// - features/capture-tauri/      → 桌面端全局快捷键
// - features/capture-menubar/    → 桌面端菜单栏
// - features/capture-webhook/    → 浏览器扩展
// - features/capture-mobile/     → 未来移动端 widget
// - features/capture-alfred/     → 未来 Alfred 工作流
// - features/capture-manual/     → 在 Inbox 里直接新建
```

新入口 = 加一个 `features/capture-*/` 文件夹，**不动核心**。

---

## 8. 开发路线图

| Phase | 名称 | 交付物 |
|---|---|---|
| **0** | 脚手架 | 可跑的 Next.js + Tauri 空壳 + 完整文档 |
| **1** | 设计系统 | Bauhaus tokens + Storybook 化组件库 |
| **2** | 数据层 | Domain 模型 + Drizzle schema + 迁移 |
| **3** | Inbox | 创建 / 查看 / 删除卡片（含多媒介） |
| **4** | Canvas 基础 | ~~tldraw 集成 + Card shape~~（后由路线 A 自研 Canvas 2D 替换，见 ADR 2026-06-23） |
| **5** | Canvas 完整 | 网格 / 自由模式、缩放、对齐 |
| **6** | 捕获入口 | 全局快捷键 + 菜单栏 + mini input |
| **7** | Archive | 网格 / 时间轴视图 |
| **8** | Tauri 打包 | 桌面端可分发安装包 |
| **9** | 文档、导出与可发现性 | 用户文档 + **JSON 导出**（兑现 §1.2 信念4）+ 录屏 + 更新日志 |

**排序说明**：Tauri 壳在 Phase 0 就能 `pnpm tauri dev` 跑起来，所以 Phase 6 的全局快捷键可在 Tauri dev 模式下测试。Phase 8 **不是"让 Tauri 跑起来"**，而是**生产打包 + 签名 + 公证 + 分发**。

每阶段交付：
- 可运行的 build
- 简短 demo（截图 / 录屏 / 文件清单）
- 阶段总结文档（追加到 `docs/changelog.md`）

---

## 9. 文档与记忆系统

### 9.1 `docs/memory/` 三类文件

```
docs/memory/
├── MEMORY.md                 # 索引
├── decisions/                # 长期决策（已落地）
│   └── YYYY-MM-DD-<slug>.md
├── context/                  # 当前会话上下文
│   └── current-session.md
└── reference/                # 外部资源
    └── README.md
```

### 9.2 触发规则

| 触发 | 写到哪 |
|---|---|
| 用户说"记住 X" / "以后都 Y" | `decisions/` + 索引 |
| 完成一个阶段 | `decisions/YYYY-MM-DD-phase-N.md` |
| 跨会话延续 | `context/current-session.md` |
| 外部资源 | `reference/README.md` |

### 9.3 跨模型可读
- 纯 Markdown，无 Claude 私有格式
- frontmatter 标注 `audience: [claude, gpt, gemini, human]`
- 中文为主，关键术语中英对照

---

## 10. Git 约定

- **默认分支**：`main`
- **功能分支**：`feat/<slug>` / `fix/<slug>` / `docs/<slug>` / `chore/<slug>`
- **提交规范**：Conventional Commits
- **不 squash**（保留阶段历史）
- **阶段 tag**：`v0.1.0-phase-0` 形式

---

## 11. 跨平台工程化

| 风险点 | 提前处理 |
|---|---|
| 路径分隔符 | `path.join()` / `path.posix` |
| 换行符 | `.gitattributes` 强制 LF |
| Node 版本 | `.nvmrc` = `22`；README 给 win nvm-windows 指引 |
| 大小写 | 目录 / 文件全小写连字符 |
| Tauri 编译 | 各自平台编译各自产物，CI 留位 |
| 数据目录 | 用 OS 规范路径（mac: `~/Library/Application Support`；win: `%APPDATA%`），不写死 `~/` |
| 截图工具 | mac `screencapture` / win `nircmd`（文档化） |

---

## 12. 风险与回退预案

| 风险 | 触发条件 | 回退方案 |
|---|---|---|
| 自研渲染器交互打磨长尾 | 对齐成熟画布产品的细化打磨 | 持续迭代；测试 + 冒烟兜底；若长期不达标可再评估开源替代（见 ADR 2026-06-23） |
| Tauri Mobile 不成熟 | 后期做移动 | PWA 兜底，等 Tauri Mobile |
| SQLite 单文件过大 | 卡片超 10 万 | 迁移 Turso（libSQL 协议兼容），schema 不变 |
| pnpm monorepo 复杂度 | 包依赖混乱 | 退回单包结构 |
| 同步 / CRDT 冲突 | 接入云同步时 | schema 已同步就绪（§4.10），用 Yjs / Automerge，逐表启用 |
| 画布状态 ↔ DB 双写 | 位置数据不一致 | DB 为唯一真相源 + `onUserChange` 防抖回写（§6.11） |
| Drizzle 无 Tauri SQL 驱动 | 桌面端 DB 访问 | **已决**：渲染进程内 WASM SQLite，单一 Drizzle 驱动（见 §3.4） |
| WASM SQLite 性能 | 卡片量极大 | 个人量级够用；超大时迁 Turso（libSQL 协议） |
| 静态导出 + 动态路由 | 想用 `/canvas/[id]` 深链 | 画布 / 卡片选择走客户端状态（§6.12） |
| JSON 列 / Branded ID 边界 | 读写时类型错乱 / 序列化 bug | repository 层封装 codec（§4.11） |
| OG 链接预览抓取 | 浏览器 CORS + 无 server 抓不到 | MVP 仅存 url，OG 抓取留同步层 / 代理（§4.8） |
| wa-sqlite 整文件落盘 | 数据量大时每次写回开销大 | 防抖 + 个人量级可接受；超大迁 Turso |

---

## 13. 验证策略

每个阶段结束前，主动给出：
1. **可跑的命令** —— `pnpm dev` / `pnpm build` 验证
2. **可见的产物** —— 截图 / 录屏 / 文件清单
3. **下一阶段任务清单** —— 具体到每个 PR

绝不"默默推进"。

---

## 14. 下一步

1. 写完本文档 → 自审 → 交用户审
2. 用户批准 → 调 **writing-plans** skill，写实现计划
3. 实现计划批准 → 进入 Phase 0（脚手架）
