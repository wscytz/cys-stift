# Definition of Done · 验证门 + 提交纪律

> **用途**:代码改完 → "可以 commit"之间的标准门。任何会话 / subagent 改完代码照这份跑一遍。
> 这是根 `CLAUDE.md`「不假装 build/test 通过」的**可操作落地**。
>
> **分工**:这份只管"改完怎么验证 + 怎么提交"。**该不该改**见 [`polish-phase.md`](polish-phase.md)(判据);**当前状态**见 [`STATE.md`](../STATE.md);**装了什么**见 [`dependencies.md`](dependencies.md)。

---

## 一、验证门(改了什么 → 跑什么,全过才算 done)

各包脚本已规范化:`lint` = `tsc --noEmit`(全包统一)、有测试的包 `test` = `vitest run`。

| 改了 | 必跑(全 exit 0,除注明基线) |
|---|---|
| `packages/domain` | `pnpm --filter domain test` · `pnpm --filter domain lint` |
| `packages/db` | `pnpm --filter db test` · `pnpm --filter db lint` |
| `packages/canvas-engine` | `pnpm --filter @cys-stift/canvas-engine test` · `… lint` |
| `apps/web`(逻辑/组件/页面) | `pnpm --filter web test` · `pnpm --filter web lint` · **`pnpm --filter web build`**(产品门) |
| `apps/desktop`(Rust) | `cd apps/desktop/src-tauri && cargo check` |
| 跨包 / 不确定 | 全量:`pnpm -r test` · `pnpm -r lint` · `pnpm --filter web build` |

### 门禁判据(关键,容易踩)

- **test**:必须全绿(exit 0)。新功能先写**红测试**(TDD),再实现到绿。
- **lint**(`tsc --noEmit`):
  - domain / db / ui / canvas-engine:**必须 exit 0**。
  - **web 允许 ~25 个 `__tests__/*/​*.test.ts` fixture 基线**(branded-id / color-token 强转;已知噪音,见 [`polish-phase.md`](polish-phase.md) §B)。**判据 = 零新增**——跑完对比基线,多出来的才算回归。不阻塞 build(Next build 不类型检查测试文件;vitest 自有配置跑它们)。
- **build**(`pnpm --filter web build`):**必须 exit 0**(静态导出)。任何 web 改动的硬产品门。
- **e2e / render-sweep**(可选,涉及渲染/路由/交互时):`node scripts/render-sweep.mjs`(静态产物捕 pageerror),或 `scripts/<name>-shots.cjs`。

### 铁律:不假装通过

- **实跑命令看 exit code**,不猜、不 paraphrase、不输出假承诺跳过验收。
- 跳过的步骤**明说**("这步没跑,因为只改了文档"),不能默认过了。
- 门没过 → 继续改到过,不要"先 commit 待会补验证"。

---

## 二、提交纪律

- **一个逻辑变更一个 commit**:功能 + 其测试一起;纯文档单独 commit;不把多个无关改动堆一个 commit。
- **验证在提交前**:§一 的门过了才 commit。**不**先 commit 再验证。
- **commit 命令**:`git -c user.name=cy -c user.email=cy@stift.local commit -m "…"`,**无 Claude footer**。
- **push 走 SSH**:`git@github.com:wscytz/cys-stift.git`(已在 origin)。
- **message**:conventional 前缀(`feat` / `fix` / `docs` / `refactor` / `test` / `chore` / `perf`)+ 简述;正文写 **what + why**(尤其"为什么这么改",非只"改了什么")。
- **过程文档不入公共仓**:`docs/plans/` · `docs/decisions/` · `docs/superpowers/` 已 gitignored。

---

## 三、文档收尾(触发这些类目时必须同步,否则下一轮漂移)

> 这一条是 2026-06-26 规范化轮的教训(见 `docs/changelog.md`):大迁移后代码变了文档没跟上 = 准则漂移。

- **加/改 Card 字段** → `apps/web/src/features/ai/ai-context.ts` allowlist(默认安全:不注册 = AI 看不到)+ `docs/user/privacy.md` + `docs/development/privacy-design.md`。
- **加/改依赖** → 不加用户没要求的依赖(YAGNI);确实要加先写 ADR + 更新 `dependencies.md`(**指向 package.json,不硬编码版本**)。
- **状态变化**(新功能 / 新阶段 / bug 修复轮) → `docs/STATE.md`「下一步」(newest-first)+ `docs/changelog.md`(newest-first)。
- **加 CanvasElement kind / 改 DSL** → **五视图都要对齐**(实时渲染 / SVG / PNG / .cystift / DSL 文本)+ `packages/canvas-engine` 测试 + round-trip 断言。这是"五视图一致"承诺的硬要求。
- **加 i18n 文案** → `apps/web/src/lib/i18n/messages.ts` zh + en 都加(`MessageKey` 自动推断)。
- **改 token / 颜色** → `packages/ui` tokens.css + tokens.ts 双源同步;组件层不写裸 hex。

---

## 四、subagent 编排(大任务可选)

主模型**拆 + 审 + commit**;subagent **执行 TDD(先红后绿),不 commit**。主模型审 diff + 独立跑 §一 的门,过了才以 cy 身份提交。详见 [`polish-phase.md`](polish-phase.md) §三。

---

## 速查(贴在显示器边)

```
改完 → 跑该包 test + lint → web 改动加 build → 全 exit 0(web lint 零新增即可)
     → 一个逻辑一个 commit → cy 身份提交无 footer → SSH push
     → 触发 §三 类目则同步文档
```
