# Phase 2 视觉 + 持久化对照笔记

> 截图：`docs/design/screenshots/phase-2/`（4 张）
> 测试：puppeteer-core + 系统 Chrome 驱动
> 服务：`apps/web/out` 经 `python3 -m http.server 3002`

---

## 结论

**Phase 2 核心承诺达成**：UI 写一张卡 → 跨刷新 → 数据仍在。Puppeteer 自动化验证 session A 写 3 张卡 → session B（同 context 模拟"刷新"）→ 3 张卡完整保留。

---

## 4 张截图

| 文件 | 状态 |
|---|---|
| `01-empty.png` | 初始空态：4 个 counter（inbox/archived/soft-deleted/total）全 0，Create 表单可见 |
| `02-three-created.png` | 创建 3 张卡后：inbox=3, total=3，列表渲染 3 张卡（每张显示 ID 截断、type、capturedAt ISO 时间、Archive / Soft-delete 按钮）|
| `03-after-refresh.png` | 模拟刷新（同 context 重新 navigate）后：3 张卡完整保留，counter 一致 |
| `04-mobile.png` | 390px 视口：响应式正常 |

---

## 持久化证据（puppeteer 自动断言）

```
session A inbox titles: [ '网格即内存', '包豪斯 = 约束即自由', '凌晨 3 点的产品想法' ]
session B inbox titles (after "refresh"): [ '网格即内存', '包豪斯 = 约束即自由', '凌晨 3 点的产品想法' ]

✅ persistence confirmed (titles match after refresh)
```

Puppeteer 在同一 browser context 内：
1. 打开 `/dev/db/`
2. 用 UI 输入 3 张卡的 title + body，点击 Create 三次
3. 截图 → 写断言
4. 导航到 `about:blank` 再回到 `/dev/db/`（模拟"刷新"）
5. 重新读取 inbox 标题数组 → 与步骤 2 完全一致

由于单 browser context 共享 `localStorage`，且 `useDb()` 钩子在 mount 时从 localStorage 重新加载 → 数据 round-trip 成立。

---

## 视觉对照笔记

### 6 色 token 仍对
- INBOX counter 左侧 8px 红条 = `var(--color-red)` ✅
- ARCHIVED counter 左侧 8px 蓝条 = `var(--color-blue)` ✅
- SOFT-DELETED 灰条 = `var(--color-gray)` ✅
- TOTAL 黑条 = `var(--color-black)` ✅

### 字体 + 网格
- "Data layer round-trip" 标题 Space Grotesk 大字号 ✅
- "DEV · DB SMOKE" eyebrow 灰色 mono caps ✅
- 表单下划线、卡片边框、所有间距符合 8px 节奏 ✅

### 组件复用
- Toolbar（system 灰条）
- Tag（smoke 红 / localstorage 蓝）
- Card（"Create a card"、"Inbox (3)"）
- Input（under-line focus 变红）
- Button（primary / ghost）

---

## 与 spec 的差距（已知 / 后续 phase）

| 项 | 现状 | 计划中 | 后续 phase |
|---|---|---|---|
| 存储后端 | localStorage (web) | wa-sqlite + OPFS / Tauri fs | Phase 2.5（重构 db-client.ts 持久化层） |
| MediaAsset 真实落盘 | 仅 schema 字段 | 真实文件字节存到 OS 数据目录 | Phase 3+ 业务用 |
| tldraw 画布位置 | 仅字段，未渲染 | 在 tldraw 画布上拖拽 | Phase 4 |
| LinkPreview 抓取 | 不抓（spec §4.8 已声明） | 同步层加代理 | 同步层 |
| Tauri 端验证 | 未跑（mac 端 Tauri 起环境时间太长，Phase 2 优先 web 证据） | Tauri fs 落盘 | Phase 2.5 / Phase 6/8 |

## 关键工程决策

1. **better-sqlite3 而非 wa-sqlite**：wa-sqlite 在 Next.js 客户端无原生 binding（需 WASM + OPFS 复杂）。Phase 2 用 better-sqlite3 跑通 drizzle schema + 集成测试，**纯 Node 路径**（packages/db）。前端 db-client 走 in-memory + localStorage（spec §3.4 第一条："Repository 接口在 domain，存储适配器按运行时注入"——这个原则已经演练，Phase 2.5 替换 in-memory 后端为 wa-sqlite 即可）。

2. **`useDb()` hydration 处理**：`useSyncExternalStore` 在 SSR/客户端必须返回稳定引用。修了一个 N+1 小时的 hydration bug 后端：snapshot object 在 `_cards` 引用变化时才 new。

3. **dev/min 占位路由保留**：诊断用，与 /dev/db 并存。
