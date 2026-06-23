# spec §3.4/§6.x 修订(tldraw → 自研 Canvas 2D)— 五轮审查计划 + 启动提示词

> 本文件是**审查会话的输入**。新开一个对话,把「§ 启动提示词」整段粘给那个 Claude 即可。
> 日期:2026-06-23。配套 ADR:`docs/adr/2026-06-23-remove-tldraw.md`(已 accepted)。

---

## 0. 为什么要这次审查

代码侧路线 A 已收口:tldraw 完全移除,主路由 `/canvas` 跑自研 Canvas 2D 渲染器
(SelfBuiltAdapter 实现 CanvasHost 接口)。但 **spec `docs/specs/2026-06-19-cys-stift-design.md`
仍写 tldraw**——spec 与代码现状不一致。

CLAUDE.md 硬约束:**spec 是五轮审查定稿,冻结,改动必须再走五轮审查**。ADR 决定了「移除 tldraw」
这件事(技术决策),但 ADR 明确把 **spec 文本修订**留给独立的五轮审查——就是这次。

**这次审查的产出 = 对 spec 的一组精确修订(tldraw → 自研渲染器),经五轮把关后落地。**
不是重新决定要不要移除 tldraw(那已由 ADR 定),而是**把 spec 文本改正确、改完整、不引入新矛盾**。

---

## 1. 审查范围(spec 里全部 14 处 tldraw 触点)

`docs/specs/2026-06-19-cys-stift-design.md` 现有 tldraw 出现处(行号以审查时实际为准,grep 核对):

| # | 行 | 章节 | 现状 | 修订方向 |
|---|---|---|---|---|
| 1 | 71 | §2 决策表 Q5 | 技术栈 `Next.js + SQLite + Tauri + tldraw` | 改 `+ 自研 Canvas 2D 渲染器`(或去掉 tldraw 名) |
| 2 | 154 | §3.3 目录注释 | `canvas/ # 画布(tldraw 封装)` | 改 `# 画布(自研 Canvas 2D + CanvasHost 抽象)` |
| 3 | 544 | §5.4 Canvas 样式 | `... + tldraw 渲染` | 改 `+ 自研 Canvas 2D 渲染` |
| 4 | 572 | §6.3 画布 | `tldraw v3 Custom Shape API(Card 作为 ShapeUtil)` | 改为自研:CanvasElement 模型 + CanvasHost 接口 + SelfBuiltAdapter |
| 5 | 573 | §6.3 | `不选 Excalidraw / Konva / React Flow` | 保留(选型理由仍成立)或补一句「最终自研」 |
| 6 | 574 | §6.3 | `风险预案:tldraw 只用渲染层 + 相机` | 改为自研后该预案已兑现/不再适用 |
| 7 | 593 | §6.7 状态管理 | `画布内部:tldraw store` | 改 `自研 adapter 内部状态(elements Map + view + 选区 + undo 栈)` |
| 8 | 607 | §6.11 标题 | `tldraw 持久化策略(关键)` | 改 `画布持久化策略(关键)` |
| 9 | 609 | §6.11 正文 | `Card 是 tldraw 的自定义 Shape` | 改 `Card 是 CanvasElement(kind='card')` |
| 10 | 611 | §6.11 | `转成 tldraw shapes → 注入 editor` | 改 `转成 CanvasElement → host.upsert` |
| 11 | 612 | §6.11 | `监听 tldraw onChange` | 改 `host.onUserChange` |
| 12 | 613 | §6.11 | `tldraw 的序列化快照...undo/redo` | 改自研:freeform 元素走 canvas-freeform-store;undo=adapter 内 50 步栈 |
| 13 | 656 | §7 roadmap Phase 4 | `tldraw 集成 + Card shape` | 历史记录——加注「后路线 A 自研替换,见 ADR」或保留+脚注 |
| 14 | 731,736 | §9 风险表 | `tldraw 不满足需求` / `tldraw ↔ DB 双写` | 更新为自研后的风险姿态(DB 仍唯一真相源仍成立) |

**关联但本次不在 spec 内的事实**(供审查者验证一致性):
- 自研后新增能力:几何元素双向 DSL、手绘向量、**关系箭头语义三维签名**(线型+箭头形+颜色,
  这是 vs tldraw/excalidraw 的特色)、IME 文本编辑、freeform 持久化、选区事件。
- 持久化双轨:card 几何→DB(`cards.canvasPosition`,单一真相源,**不变**);
  freeform(text/freedraw/arrow/rect)→`canvas-freeform-store`(per-canvas OPFS 主+localStorage 回退)。
- bundle:/canvas 649kB→176kB。

---

## 2. 五轮审查的轮次定义(本项目方法论)

spec 当初是「五轮复查」定稿(见 `docs/decisions/2026-06-19-design-finalized.md`)。本次沿用,
**每轮一个独立视角,逐轮收敛**:

- **第 1 轮 · 完整性**:14 处触点是否全部覆盖?有没有遗漏的 tldraw 残留措辞(grep 兜底)?
  修订后 spec 是否还自洽引用(如 §6.11 被其它章节引用的地方)?
- **第 2 轮 · 准确性**:每处改写是否**精确对应代码现状**?(对照 SelfBuiltAdapter / CanvasHost /
  canvas-binding / canvas-freeform-store 实际实现,不能写成想象的设计)
- **第 3 轮 · 一致性 / 无新矛盾**:改动是否与 spec 其它未改章节冲突?(如 §3.4 数据访问、§4 数据模型
  `canvasPosition`、§6.12 静态导出约束)是否引入「spec 说 A、代码做 B」的新缝隙?
- **第 4 轮 · 约束符合**:是否守住硬约束?——packages/domain 零依赖、Bauhaus 6 原色、静态导出无 server、
  AI 隐私 allowlist、不写死 hex。修订**只动 tldraw 相关措辞**,不趁机扩大改动面(YAGNI)。
- **第 5 轮 · 跨模型 / 用户终审**:跨模型审(可选 `scripts/audit-glm.sh` GLM 跨审)+ **用户拍板**。
  spec 是定稿文档,最终由用户确认才落地。

> 轮次不是死板的——可由审查者(你,新对话的 Claude)对 spec 草案逐轮自审,把每轮发现记下来,
> 形成「修订 diff + 五轮记录」交给用户终审。用户是第 5 轮的最终关。

---

## 3. 工作流(新对话里怎么做)

1. **读输入**:本文件 + spec 全文 + ADR + STATE.md「debt 收口」段 + CLAUDE.md 硬约束。
2. **核对触点**:`grep -n tldraw docs/specs/2026-06-19-cys-stift-design.md` 对齐第 1 节的 14 处。
3. **对照代码**:读 `apps/web/src/features/canvas/host/{canvas-host.ts,self-built-adapter.ts}`、
   `canvas-binding.ts`、`canvas-freeform-store.ts`、`relation-types.ts`——确保改写贴合实现。
4. **出修订草案**:给出每处的「原文 → 新文」精确 diff(不直接改 spec,先给草案让用户看)。
5. **逐轮自审**:按第 2 节五轮,每轮记录发现并修正草案。
6. **交用户终审**:把「修订 diff + 五轮记录」呈给用户。**用户批准后**才实际改 spec 文件。
7. **落地**:改 spec → 在 spec 顶部版本说明 / `docs/decisions/` 记一条「2026-06-xx spec 画布章节修订」
   → 更新 STATE.md(把「spec 五轮审查」从未完成移除)。

**重要纪律**:
- ❌ 审查阶段**不要直接改 spec 文件**——先出 diff 草案,五轮过完 + 用户批准才落地(spec 冻结铁律)。
- ❌ 不要借机改 tldraw 无关的 spec 内容(只动画布渲染器相关措辞)。
- ❌ 不假装某轮通过——每轮要有实质发现或明确「本轮无问题,理由 X」。
- ✅ 改写要可被代码验证(指得出对应文件/符号)。
- ✅ commit 署名 cy,无 Claude footer(项目惯例)。

---

## 4. 验收标准

- spec 内 `grep tldraw` 仅剩**有意保留的历史记录**(如 §7 Phase 4 历史 + 脚注指向 ADR),无「描述现状」的 tldraw。
- 每处修订有代码依据,审查者能指出对应实现文件。
- 五轮记录完整(每轮发现 + 处置)。
- 与未改章节无新矛盾(尤其 §3.4 / §4 canvasPosition / §6.11 引用方 / §6.12 静态导出)。
- 用户终审批准。
- STATE.md 更新:画布自研路线 A「唯一未完成:spec 五轮审查」→ 标记完成。

---

## § 启动提示词(把下面整段粘到新对话)

```
我要对 cy's Stift 的 spec 做一次正式的「五轮审查」修订:把画布渲染器从 tldraw 改为
自研 Canvas 2D。代码侧已收口(tldraw 移除,主路由跑 SelfBuiltAdapter),但 spec
`docs/specs/2026-06-19-cys-stift-design.md` 仍写 tldraw,需要修订到位。

请先读这份审查计划:`docs/plans/2026-06-23-spec-review-tldraw-to-selfbuilt.md`
(里面有 14 处待修订触点清单、五轮轮次定义、工作流、验收标准、纪律)。

再读:spec 全文、`docs/adr/2026-06-23-remove-tldraw.md`、`docs/STATE.md` 的「debt 收口」段、
根 `CLAUDE.md` 的硬约束、以及这些实现文件以确保改写贴合代码:
apps/web/src/features/canvas/host/canvas-host.ts、self-built-adapter.ts、
apps/web/src/features/canvas/canvas-binding.ts、apps/web/src/lib/canvas-freeform-store.ts、
apps/web/src/features/canvas/relation-types.ts。

铁律:
- spec 冻结——审查阶段【不要直接改 spec 文件】,先给我「原文→新文」的精确 diff 草案。
- 五轮过完 + 我批准后,才实际落地改 spec。
- 只动 tldraw / 画布渲染器相关措辞,不借机改别的(YAGNI)。
- 每轮要有实质发现或明确「本轮无问题 + 理由」,不许假装通过。
- 改写必须可被代码验证(指得出对应文件/符号)。
- commit 署名 cy,无 Claude footer。

请先:① grep 核对 spec 里全部 tldraw 触点,对齐计划第 1 节的 14 处(有出入告诉我);
② 对照代码确认每处该改成什么;③ 产出第一版「修订 diff 草案」给我看。
先不要跑五轮,先把草案做出来,我们一处处对。
```

---

## 附:审查时可能踩的坑(提前提示新对话的 Claude)

- **§6.11 是被引用的**:§4.7 索引、§3.4 持久化思路都提到「同 §6.11」。改 §6.11 标题/内容时要保证引用仍成立。
- **§3.4 本身几乎不涉及 tldraw**:它讲 WASM SQLite 数据访问,只是 tldraw 被列在「影响」里。
  ADR 标题写「§3.4/§6.x」其实重心在 §6.x;§3.4 大概率只需极小改动甚至不改——审查时确认。
- **card 几何仍走 DB**:这是不变量,别把它写成「freeform store 存 card」。freeform store 只存非 card。
- **关系箭头是特色**:修订 §6.3 时值得点出自研带来的特色(语义三维签名),但别堆细节——spec 是设计层。
- **roadmap Phase 4 是历史**:它记录「当时怎么做的」,不必抹掉,加脚注指向 ADR 更诚实。
