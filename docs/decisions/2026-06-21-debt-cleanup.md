# 2026-06-21 · v0.31.0-debt-cleanup(P1)

> 来源: 总推进 Roadmap(P1 详细) — 用户决策 2026-06-21"技术债优先"。

## 设计

P1 是**零行为变化**的重构 + 清理,把 v0.30.0 之前积压的债还清,为 P2-P3(P2 测试覆盖 + P3 B6 offload)铺路。

### 关键决策

1. **零行为变化** — 用户视角无任何 UI / 功能差异。所有改动都是 internal refactor。
2. **B8 修正** — `__canvasEditor` global 全项目**零读取**(grep 确认),**保留**(e2e 17 处引用)但加明确注释说明它是 diagnostic + e2e 友好 hook。**`__cardService` 改走 React Context**(`CardServiceContext` 已存在),relation-panel 和 auto-relate 不再读 global,`card-service-access.ts` 整个文件删除。
3. **canvas-editor.tsx 拆分** — 347→166 行,3 个 bridge 各自独立(`canvas-view-persistence-bridge.tsx` / `canvas-editor-binding-bridge.tsx` / `canvas-double-click-bridge.tsx`)。每个 bridge 是 null-returning 组件,各自独立 useEffect,可单测。
4. **canvas-snapshot-store 单测** — 9 个 it 锁住行为(save→load 往返 / corrupt JSON / SSR no-op / quota 异常 / canvas 隔离 / remove),为 P3 B6 offload 改造铺安全网。
5. **顺带修预存 bug** — db-client.ts 缺 `rehydrateCards` 导出(M3.2 commit 引入的 import 找不到,build 断)。v0.27.1 review-hardening 决策档声称存在该函数,实际 refactor 时丢失。**新增该函数**,用现有 `loadSnapshot()` 复用 Date 重建逻辑。

### 修正原 plan 的点

- **P1.1 "删 __canvasEditor" 取消**: grep 发现 e2e 17 处使用,生产代码删了 e2e 全断。改为"保留 global + 加注释说明",e2e 不动。
- **P1.2 "改 __cardService 为 context" 范围缩小**: 只删 `card-service-access.ts` + 改调用方,**canvas-editor.tsx 仍 set global**(给 e2e 用)。
- **新加 db-client.ts rehydrateCards 修复**: 不在原 plan 范围,但是 M3.2 引入的 build 阻塞,**必修才能让 P1.3 build 通过**。

### 不做(显式 defer)

- `__canvasEditor` global 不删(P1.1 修正后)
- canvas-editor.tsx 进一步拆(166 行已足够清晰,不再拆)
- canvas-snapshot-store 改 OPFS(P3 范围,本 phase 仅单测锁行为)
- web 单测覆盖率(P2 范围)

## 验收

- **代码行数**:
  - canvas-editor.tsx: 347 → **166 行**(主组件从 4 组件降到 1 组件)
  - 3 个 bridge 文件:view-persistence(53)+ editor-binding(59)+ double-click(111)= **223 行**
  - canvas-snapshot-store 单测:**9 个 it**(覆盖 save / load / remove / corrupt JSON / quota / canvas 隔离)
- **测试**:
  - domain 26/26 ✅
  - db 7/7 ✅
  - web vitest 12 + 9 = **21/21** ✅
  - web build exit 0 ✅
- **e2e 回归**:
  - m1-relations 7/8(1 个预存 bug — "badges=[]" — 与本次无关,clean main 上也 fail)
  - m3-shots 7/7 ✅
  - canvas-refactor PASS ✅

## 交付文件清单

| 文件 | 状态 |
|---|---|
| `apps/web/src/features/canvas/canvas-editor.tsx` | 改: 347→166 行,只留 CanvasEditor |
| `apps/web/src/features/canvas/canvas-view-persistence-bridge.tsx` | 新建: 53 行 |
| `apps/web/src/features/canvas/canvas-editor-binding-bridge.tsx` | 新建: 59 行 |
| `apps/web/src/features/canvas/canvas-double-click-bridge.tsx` | 新建: 111 行 |
| `apps/web/src/features/canvas/auto-relate.ts` | 改: `autoRelate(editor, cardIds, service)` 签名加 service,删 `__cardService` global 读取 |
| `apps/web/src/features/canvas/canvas-toolbar.tsx` | 改: `CanvasToolbar` 加 `service` prop,删 `useCardService` hook(改用 prop) |
| `apps/web/src/features/canvas/relation-panel.tsx` | 改: 删 `getCardById`,改 `useCardService()` + `serviceRef` |
| `apps/web/src/features/canvas/card-service-access.ts` | **删** |
| `apps/web/src/lib/db-client.ts` | 改: 新增 `rehydrateCards` 导出,修复预存 build 阻塞 |
| `apps/web/src/lib/__tests__/canvas-snapshot-store.test.ts` | 新建: 9 个 it |

## 关联决策

- 总推进 Roadmap:`/Users/jinxunuo/.claude/plans/serialized-floating-fog.md`
- M3 交付:`docs/memory/decisions/2026-06-21-canvas-m3-ai.md`
- v0.30.0 AI 可访问性:`docs/memory/decisions/2026-06-21-ai-accessibility-design.md`

## Self-Review

- **P1.1 修正**: 原 plan 假设 `__canvasEditor` 零读取可删,grep 反驳。改保留 + 加注释,e2e 不动。
- **db-client.ts 修复**: 不在 plan 范围但是 M3.2 引入的 build 阻塞,必修才能让后续 phase build 通过。
- **风险**: 拆分 canvas-editor.tsx 涉及 onMount 内联逻辑,需保证 4 个 bridge 的 useEffect 正确接续生命周期。已通过 m1 / m3 / canvas-refactor e2e 验证。
- **预存 bug**: m1 e2e "badges=[]" 测试在 clean main 上也 fail,不是本次引入,**记入后续 phase 修复清单**。

## Acceptance Gate

```bash
pnpm --filter domain test       # 26/26 ✅
pnpm --filter db test           # 7/7 ✅
pnpm --filter web exec vitest run   # 21/21 ✅
pnpm --filter web build         # exit 0 ✅
```