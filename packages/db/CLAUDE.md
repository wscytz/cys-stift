# packages/db — Drizzle + SQLite 持久化

> 这个包是 domain 和真实存储之间的翻译层。纪律是**边界 codec 集中、不散落**。

## 铁律

- **Drizzle + better-sqlite3**（Node 路径）。**不要**换成 libsql async 或 wa-sqlite（除非走 ADR）。
- **schema 是唯一真相**：`src/schema.ts` 定义四张表（workspaces/canvases/cards/media_assets），与 spec §4.7/§4.9 对齐。
- **codec 集中在 `src/codec.ts`**：行 ↔ domain 实体转换、branded ID 重建、JSON 列 parse/stringify。**不要在 repository 里直接 parse JSON**。
- **Drizzle 的 `.$type<>()` 只是类型断言，不自动 parse** —— 记住这点，所有 JSON 列走 codec 的 `parseJson`/`stringifyJson`。
- **Repository 实现 `@cys-stift/domain` 的接口**（CardRepository 等），不自己定义新接口。
- **DDL 用 `applySchema()` 手写**（Phase 2 选择，migration 机器等 schema 真有 v2 再上）。

## 结构

```
src/
├── schema.ts          Drizzle 四表定义
├── codec.ts           行 ↔ domain 转换 + JSON helper
├── drizzle-client.ts  createMemoryDb / createFileDb + applySchema DDL
├── repositories.ts    SqliteCard/Canvas/WorkspaceRepository
└── __tests__/         集成测试（round-trip / JSON 列 / canvasPosition / 软删）
```

## 改动检查清单

- [ ] 改 schema → 改 codec → 改 repository → 加测试，按这个顺序
- [ ] `pnpm --filter db test` 全绿
- [ ] 没在 repository 里直接 `JSON.parse`（都走 codec）
- [ ] branded ID 出边界都经过 `toCardId()` 等 codec
