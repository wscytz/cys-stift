# packages/domain — 纯 TS 业务规则

> 这个包是**零依赖**的纯 TypeScript 业务核心。任何 compact/clear 后这条纪律不变。

## 铁律

- **零框架依赖**：不 import react / next / drizzle / better-sqlite3。只 import 自己内部的模块。
- **颜色/字体 token** 从 `./tokens-local` 引用（镜像 `@cys-stift/ui`，保持同步）—— 不要 import `@cys-stift/ui`（会引入 react）。
- **纯函数为主**：service 层通过注入的 Repository 接口做副作用，domain 本身不直接读写存储。
- **Branded ID** 在边界用 codec（`./codec.ts`）转换，不要 `as CardId` 强转散落各处。
- **JSON 列** 的 parse/stringify 集中在 db 包的 codec，domain 只处理已解析的对象。

## 结构

```
src/
├── types.ts           所有领域类型（Card/Canvas/Workspace/MediaAsset/CaptureSource 等）
├── tokens-local.ts    ColorToken/Region/RegionToken（镜像 ui，零依赖）
├── codec.ts           branded ID 工厂 + generateId
├── services/          CardService / CanvasService / WorkspaceService（注入 Repository）
└── __tests__/         vitest 覆盖（每个 service ≥5 个测试）
```

## 改动检查清单

- [ ] 新增类型 → 同步更新 `tokens-local.ts`（若涉及颜色）和 spec §4
- [ ] 改 service → 加 vitest 覆盖
- [ ] `pnpm --filter domain test` 全绿
- [ ] 没引入任何 `import ... from 'react'` / `'drizzle-orm'` / `'better-sqlite3'`
