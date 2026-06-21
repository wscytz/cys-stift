# Ralph 交接文件 — session-handoff

> **用途**：Ralph 超长周期（过夜 / 百轮级）迭代时，用这个模板把当前进度落地，
> 然后 `/clear` 重置上下文，下一轮读本文件继续。比反复 compact 保真度高。
>
> **位置**：复制本模板到 `docs/ralph/session-handoff.md`，填写后 `git commit`。
> 每次交接**覆盖** session-handoff.md（它是"当前快照"，不是历史档案；历史在 git log + memory/decisions）。

---

# 复制以下内容到 session-handoff.md 并填写

```markdown
---
phase: 3
task: Inbox 业务
iteration: 12
handoff_at: 2026-06-20T03:14:00Z
context_usage: 78%
---

# 交接快照

## 当前任务
<!-- 一句话：在做什么 phase 的什么 task -->

## 已完成（本 session）
<!-- 列出本 session 落地的 task，附 commit hash -->
- [x] T1 · xxx (`abc1234`)
- [x] T2 · xxx (`def5678`)

## 进行中（下一轮接手这里）
<!-- 当前正在做但没完成的 task，精确到"下一步具体动作" -->
- [ ] T3 · yyy
  - 下一步：给 CardService 加 archive 方法 + vitest

## 待办（本 phase 剩余）
<!-- 还没开始的 task -->
- [ ] T4 · zzz
- [ ] T5 · 视觉验证 + commit + tag

## 关键决策（本 session 做的）
<!-- 影响后续的决策，重要的同步写一份到 docs/memory/decisions/ -->
- 决定 X，因为 Y（commit `abc1234`）

## 已验证无效的方案（禁止重试）
<!-- 踩过的坑，避免下一轮重走 -->
- ❌ 方案 A：试过，因为 B 不行。改用 C。

## 卡住的点 / 阻塞
<!-- 如果有，写清楚；没有就写"无" -->
- 无 / 或：xxx 阻塞，需要操作员介入决定

## 下一轮第一件事
<!-- 明确告诉接手的自己/模型：先读哪三个文件 -->
1. 根 `CLAUDE.md`
2. `docs/superpowers/plans/<current-phase>.md`
3. 本文件
然后：<!-- 具体动作 -->

## 验证状态
<!-- 跑过的验证命令 + 结果 -->
- `pnpm --filter domain test`: ✅ 6/6
- `pnpm --filter web build`: ❌ 卡在 xxx，下一轮先修这个
```

---

## 使用流程

1. Ralph 完成一个里程碑 / 上下文到 70–80% / 主动想重置
2. 复制本模板到 `docs/ralph/session-handoff.md`，**如实填写**
3. `git add docs/ralph/session-handoff.md && git commit -m "chore: ralph handoff at phase N iter M"`
4. `/clear`（彻底重置，CLAUDE.md 自动重载）
5. 下一轮第一句话：`读 docs/ralph/session-handoff.md，继续迭代`
6. 模型读 handoff + CLAUDE.md + 当前 phase plan，无缝接手

## 规则

- **保真优先**：handoff 是显式落地，比 LLM 摘要可靠。宁可多写一句也别省。
- **覆盖不追加**：session-handoff.md 永远是"当前快照"。历史靠 git log + memory/decisions。
- **commit 前必填完**：空字段 = 下一轮瞎猜。卡住就写"卡在 xxx"，不要留空。
- **clear 前必 commit**：未 commit 的 handoff 在 clear 后丢失。
