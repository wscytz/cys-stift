# Plan · review bugfix #1 + #3(2026-06-20)

> 承接 `docs/decisions/2026-06-19-review-findings.md` 的建议优先级。
> 本档是实施前计划;完成记录见 `docs/decisions/2026-06-20-review-bugfixes.md`。

## 背景

spec §8 路线图 13 个 phase 完成后做了一轮 self-review,发现 3 真 bug + 2 风险。findings 建议:#1 #3 先修(快、纯逻辑、低风险),#2 是产品决策,#4 #5 留到动 canvas。本计划只做 #1 + #3。

---

## Bug #1 — Import 部分失败留下不一致状态

**文件**:`apps/web/src/lib/export-service.ts`(`importFromJson`,原 133-163)

四个 store 在同一个 try 里顺序 `setItem`。cards 写成功后 media 抛 quota → catch 返回 `ok:false`,但 cards 已被覆盖成导入版本,无回滚。

**修法**(snapshot + 全量回滚,不引入持久 backup key):
1. 先序列化全部 `{key, value}`(序列化可能抛,此时任何 key 还没被碰)。
2. 快照每个待写 key 的旧 raw 值。
3. 顺序写。任一抛错 → 逐条回滚(旧值 null 的 removeItem)→ 返回 `ok:false`。
4. 全成功才 `ok:true`。

**决策**:用瞬态内存快照而非 `cys-stift.backup.v1` 持久 key —— 避免陈旧副本 footgun + 符合 YAGNI。

## Bug #3 — sink 注册竞态

**文件**:`apps/web/src/app/inbox/page.tsx`(manual)+ `apps/web/src/features/capture/capture-host.tsx`(shortcut + menubar)

`void import(...).then(register)` 在 unmount 后才 resolve → cleanup 的 unregister 是 no-op → 注册 phantom sink。

**修法**:effect 内 `let cancelled = false`,cleanup 置 true,`.then` 里 `if (cancelled) return`。

---

## 不在范围(defer)

- #2 soft-delete 恢复入口(产品决策 + domain 需 `restore`/`hardDelete` + 新 UI)
- #4 / #5 canvas-editor 脆弱点(下次动 canvas)
- 其余 UX 洞

## 纪律

- 实跑 exit code:domain test / db test / web build(必须 exit 0)
- commit main + tag `v0.9.2-review-bugfixes`,Conventional Commits
- closeout 四件套:本档 + changelog + decisions + (MEMORY + 根 CLAUDE.md + current-session)
- 不改 spec / 不选型 / 不加依赖 / 组件层不写死 hex

## 验证

1. `pnpm --filter web build` exit 0
2. `pnpm --filter domain test && pnpm --filter db test` 回归绿
3. `node scripts/import-rollback-shots.cjs`:#1 回滚断言(monkeypatch media key setItem 抛错 → cards 不变 + UI 报错;happy path 仍写)
4. `node scripts/p6-shots.cjs` / `p6.5e` / `p6.5g`:#3 三入口回归
