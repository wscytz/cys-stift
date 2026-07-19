# apps/web — Next.js 静态导出应用壳

> 这里是用户看到的 UI。纪律是**记住我们是静态导出、无 server**。

## 铁律

- **静态导出**（`next.config.ts` 的 `output: 'export'`）：**没有 SSR / 没有 API routes / 没有 Server Actions**。
- **动态路由会炸**：`output: 'export'` 下 `[id]` 段构建期无法枚举 → 构建失败。画布/卡片选择走**客户端状态**（Zustand 或 React state），不放进 URL 路径。（spec §6.12）
- **用 server 的东西 = 错误**：任何 `'use server'`、`cookies()`、`headers()`、`fetch` 到自己的 API route 都不可用。
- **客户端数据**走 `src/lib/db-client.ts`（in-memory + localStorage，Phase 2.5 换 wa-sqlite）。`useDb()` hook 已处理 SSR/客户端 hydration。
- **组件从 `@cys-stift/ui` 引用**，不在这里重造。颜色/字体走 token，不写死。
- **dev 烟测页**放 `/dev/*`（如 `/dev/db`），production 路由放根级（`/`、`/design`、未来的 `/inbox`）。

## 结构

```
src/
├── app/                        Next.js App Router 路由(全部静态导出,'use client')
│   ├── layout.tsx              根布局(字体 + i18n + capture host 挂载)
│   ├── page.tsx                首页(home)
│   ├── inbox/                  inbox 编辑
│   ├── canvas/                 自研画布页(核心)
│   ├── archive/                归档(网格/时间轴)
│   ├── trash/                  软删恢复
│   ├── search/                 全文搜索(⌘K)
│   ├── timeline/               全局时间线(P10)
│   ├── settings/               设置(快捷键/主题/AI/导入导出)
│   ├── design/                 /design 视觉契约页
│   └── dev/                    dev 烟测页(production 不含)
├── features/                   按特性切(feature-sliced,ADR 0002)
│   ├── ai/                     AI provider + isAIReady 门控 + AiSetupCard/AiActionMenu + DSL serialize/parse/apply + locale-aware prompts + canvas-snapshot
│   ├── canvas/                 画布交互:host adapter / 关系 / outline / minimap / dsl-dialog / 导出(图片+MD+DSL)/ wiki-links / backlinks / canvas-overview
│   ├── capture/                捕获入口(mini input / 快捷键 / 文件拖拽 / capture-hint 首次提示 / capture-redirect toast 重定向)
│   ├── card/                   卡片详情/编辑(统一 ✨ AI 入口)
│   ├── archive/                归档视图组件
│   └── settings/               设置面板(AI provider 卡片 + 高级折叠)
├── lib/                        横切:store(localStorage 状态)+ 纯工具
│   ├── db-client.ts            客户端 DB 单例(useDb hook)
│   ├── *-store.ts              canvas / canvas-freeform / canvas-view / draft / media / settings / toast store
│   ├── export-service.ts       JSON 全量备份往返(含画布几何)
│   ├── i18n/                   中英双语
│   └── safe-href.ts / serialize-card.ts / group-by-day.ts 等纯函数
└── styles/
    └── globals.css             直接 import @cys-stift/ui/tokens.css + tailwindcss
```

## 改动检查清单

- [ ] `pnpm --filter web build` exit 0,静态产物在 `out/`
- [ ] 没有 `'use server'` / API routes / Server Actions
- [ ] 没有 `[param]` 动态路由段
- [ ] 客户端组件标了 `'use client'`
- [ ] `useDb()` 的 snapshot 引用稳定(数据变化才重新分配对象,否则 useSyncExternalStore 会炸)
- [ ] **组件测试用 `react-dom/client` + `act`,不用 `@testing-library/react`**(非 devDep;样板见 `lib/__tests__/use-debounced-callback.test.tsx`)

## AI 改动 check-list(v0.30.0+ 必走)

> 完整版见 `docs/development/privacy-design.md` 第 7 节(12 项 audit)。简版:

**加新 Card 字段**:
- [ ] 在 `apps/web/src/features/ai/ai-context.ts` 的 `AI_CARD_FIELDS` 手动注册(默认安全:不注册 = AI 看不到)
- [ ] 敏感字段(source.deviceId / apiKey / 软删除状态)**永不**注册,改 `AI_REDACTED_FIELDS` 文档
- [ ] 大字段值(> 1KB / media 二进制)只发 metadata / count / kind

**加新 AI action / prompt**:
- [ ] **AI 入口永远可见**:不靠 `aiEnabled` 隐藏按钮;经 `isAIReady(getCurrentAI())`(`features/ai/ai-settings-provider.tsx`)单闸门 → 未就绪弹 `AiSetupCard`(引导,高亮 Ollama 零成本),就绪弹 `AiActionMenu` 走 `AIPopover`。新 AI 入口照此路由。
- [ ] `prompts.ts` 走 `serializeCardForAI(card)` / `serializeCardsForAI(cards)`,**不**手写拼接字符串
- [ ] 涉及画布形状时走 `snapshotCanvas(host, service, canvasId)` / `formatCanvasSnapshot(snapshot)`(`features/ai/canvas-snapshot.ts`,AI 快照路径),**不**手写遍历 `CanvasElement`(`canvas-dsl.ts` 的 `serializeCanvas` 是 DSL 文本路径,不带卡片内容)
- [ ] `prompts.ts` 单测覆盖新模板
- [ ] e2e 加"AI 看不到 deviceId / apiKey / 软删除卡"的反向断言

**禁项**:
- ❌ 把 `media.dataUrl` 进 prompt；当前没有已接入的 vision consumer
- ❌ 自动 codegen 从 Card schema 生成 AI context

**实验室 / Labs**:
> 当前没有已注册 consumer，Settings 只显示空状态；历史 labs 设置仅兼容读取，不代表功能已实现。
- 不新增没有真实 consumer 的伪开关。
- 未来若重新引入 vision，必须同时具备显式用户授权、provider 能力校验、代码级不可绕过守卫、独立隐私说明和反向测试。
- 即使未来启用 vision，仍禁止发送 deviceId / apiKey / 软删卡；默认 AI 路径继续只发媒体 metadata。

**改完必做**:
- [ ] `docs/user/privacy.md` 字段表更新
- [ ] `docs/development/privacy-design.md` ai-context.ts API 更新
- [ ] changelog 加隐私条目
- [ ] `MEMORY.md` 加索引(若有新 phase)

> 用户面向隐私说明:`docs/user/privacy.md`(必读,任何改 AI 的 commit 前都要 review 这份)
