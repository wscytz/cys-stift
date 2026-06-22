# Review bugfix #1 + #3 · import 不一致 + sink 注册竞态

**日期**:2026-06-20
**状态**:✅ 完成
**tag**:`v0.9.2-review-bugfixes`
**执行模式**:主模型(Claude)按 plan 手动执行 + 自审(承接 [`2026-06-19-review-findings.md`](2026-06-19-review-findings.md) 的建议优先级 #1 + #3)

---

## 一句话

修掉 self-review 发现的两个真 bug:① `importFromJson` 部分写入失败留下半旧半新状态(加 snapshot + 全量回滚);② capture sink 动态 import 在 unmount 后 resolve 注册 phantom sink(加 `cancelled` flag)。**0 新依赖,domain/db 零改动。**

## 范围

按 [`docs/plans/2026-06-20-review-bugfixes.md`](../../plans/2026-06-20-review-bugfixes.md) 全部完成。

### ✅ 做了

- **Bug #1** — `apps/web/src/lib/export-service.ts`(`importFromJson`):写入段重写为先序列化全部 `{key,value}`、再快照旧值、再写、失败逐条回滚。序列化抛错 / 写入抛错都返回 `ok:false` 且**任何 key 不被半覆盖**。
- **Bug #3** — `apps/web/src/app/inbox/page.tsx`(manual sink)+ `apps/web/src/features/capture/capture-host.tsx`(shortcut + menubar 两 sink):effect 内加 `let cancelled = false`,cleanup 置 true,`.then` 回调 `if (cancelled) return`,杜绝 phantom sink。
- `scripts/import-rollback-shots.cjs`(新):#1 回滚 e2e(monkeypatch `setItem` 让 media key 抛 QuotaExceeded → 断言 cards 回滚 + UI 报错 + happy path 仍写)。
- `docs/design/screenshots/review-import-rollback/`(新):失败态截图。
- **domain / db 零改动** + **0 新依赖**。

### ❌ 没做(显式留后,见 findings)

- **#2 soft-delete 无恢复入口** — 产品决策 + domain 需新增 `restore`/`hardDelete` + 新 UI(tab/route)。**等用户明确要做**。
- **#4 `editor.dispose` 猴补丁 / #5 `editor.store.listen` 无 filter** — 都在 `canvas-editor.tsx`,留到下次动 canvas 时一起重构成 `useEffect` 驱动。

## 核心承诺验证

| 断言 | 结果 |
|---|---|
| #1 写入失败 → cards 回滚到原值 | ✓ |
| #1 NEW 卡在失败后不存在 | ✓ |
| #1 失败时 UI 显示 error | ✓ |
| #1 happy path 仍写 NEW 卡 | ✓ |
| #3 三入口回归(快捷键/手动/menubar) | ✓ 全过 |
| domain 11 tests | ✓ 全绿 |
| db 7 tests | ✓ 全绿 |
| web build exit 0(12 静态页) | ✓ |
| 零 page error | ✓ |

## 关键工程决策

1. **#1 选瞬态内存快照 + 回滚,不引入持久化 `cys-stift.backup.v1`**:持久 backup key 会引入"何时清除"的生命周期,留下陈旧副本的 footgun。瞬态快照已完整闭合数据损坏漏洞,符合 YAGNI(用户导入前已被提示先 Export)。"导入后可撤销"是独立 feature,另开。
2. **#1 序列化前置**:先 `JSON.stringify` 全部待写项(可能抛循环引用),序列化阶段抛错 → 任何 key 都没被碰 → 直接返回错误,避免"序列化中途某条抛错但前面的 setItem 已落地"。
3. **#1 回滚本身容错**:回滚的 setItem/removeItem 各自 try/catch(best-effort);恢复更小的旧值极少再抛 quota。
4. **#3 标准 React `cancelled` 模式**:一个 flag 守一个 effect 内的全部 dynamic import(capture-host 有 2 个);`setFallbackService` 同步执行不受影响。
5. **#3 不致命但必修**:service 是单例 + 回路由会覆盖,phantom sink 不丢卡;但逻辑是错的(泄漏),修了才干净。
6. **0 新依赖** + **domain/db 零改动** + **没碰 spec**。

## 验收

- ✅ `pnpm --filter domain test` 11 全绿
- ✅ `pnpm --filter db test` 7 全绿
- ✅ `pnpm --filter web build` exit 0
- ✅ `node scripts/import-rollback-shots.cjs` 全断言通过
- ✅ `node scripts/p6-shots.cjs` / `p6.5e` / `p6.5g` 回归全过(#3 三入口)
- ✅ 静态导出纪律(no SSR / no API routes / no `[param]` / no `'use server'`)不破

## 后续(findings 剩余)

- **#2** soft-delete 回收/恢复视图(产品决策)
- **#4 #5** canvas-editor 脆弱点(下次动 canvas)
- UX 洞(批量 soft-delete 二次确认 / send-to-canvas 反向 / archive tile no-op / OPFS 真实落盘)
