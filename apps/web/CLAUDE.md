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
├── app/
│   ├── layout.tsx         根布局（字体加载）
│   ├── page.tsx           首页（占位）
│   ├── design/page.tsx    /design 视觉契约页
│   ├── dev/db/page.tsx    /dev/db 数据层烟测页（'use client'）
│   └── dev/min/page.tsx   /dev/min 诊断占位
├── lib/
│   └── db-client.ts       客户端 DB 单例（useDb hook）
└── styles/
    ├── globals.css        import tokens.css + tailwindcss
    └── tokens.css         （已移到 packages/ui，这里保留兼容）
```

## 改动检查清单

- [ ] `pnpm --filter web build` exit 0,静态产物在 `out/`
- [ ] 没有 `'use server'` / API routes / Server Actions
- [ ] 没有 `[param]` 动态路由段
- [ ] 客户端组件标了 `'use client'`
- [ ] `useDb()` 的 snapshot 引用稳定(数据变化才重新分配对象,否则 useSyncExternalStore 会炸)

## AI 改动 check-list(v0.30.0+ 必走)

> 完整版见 `docs/development/privacy-design.md` 第 7 节(12 项 audit)。简版:

**加新 Card 字段**:
- [ ] 在 `apps/web/src/features/ai/ai-context.ts` 的 `AI_CARD_FIELDS` 手动注册(默认安全:不注册 = AI 看不到)
- [ ] 敏感字段(source.deviceId / apiKey / 软删除状态)**永不**注册,改 `AI_REDACTED_FIELDS` 文档
- [ ] 大字段值(> 1KB / media 二进制)只发 metadata / count / kind

**加新 AI action / prompt**:
- [ ] `prompts.ts` 走 `serializeCardForAI(card)` / `serializeCardsForAI(cards)`,**不**手写拼接字符串
- [ ] 涉及画布形状时走 `snapshotCanvas(editor, canvasId)`,**不**直接遍历 tldraw shape
- [ ] `prompts.ts` 单测覆盖新模板
- [ ] e2e 加"AI 看不到 deviceId / apiKey / 软删除卡"的反向断言

**禁项**:
- ❌ 用 vision 模型(GPT-4V / Claude Vision)— v0.30.0 决策**永久不做**
- ❌ 把 `media.dataUrl` 进 prompt
- ❌ 自动 codegen 从 Card schema 生成 AI context

**改完必做**:
- [ ] `docs/user/privacy.md` 字段表更新
- [ ] `docs/development/privacy-design.md` ai-context.ts API 更新
- [ ] changelog 加隐私条目
- [ ] `MEMORY.md` 加索引(若有新 phase)

> 用户面向隐私说明:`docs/user/privacy.md`(必读,任何改 AI 的 commit 前都要 review 这份)
