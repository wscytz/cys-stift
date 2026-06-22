---
date: 2026-06-22
status: plan (路线 A 已选,待 spec 复审)
route: A — 渐进式自研
realizes: docs/plans/2026-06-22-canvas-strategy-tldraw-vs-self-build.md (§3.3)
research: docs/decisions/2026-06-22-canvas-research-drawio-archdiag-affine.md
audience: [claude, human]
---

# 画布自研 · 路线 A 实施计划(抽象层 → 双向 DSL → 自研渲染器 → 退役 tldraw)

> 这是 strategy plan §3.3 渐进路径的**具体落地**,不是新决策。
> 真正「替换 tldraw」这一步(Phase 2)才触发 CLAUDE.md 硬约束(ADR + spec §3.4/§6.x 五轮审查)。
> 本计划把那个门槛推到最晚、最安全的时间点。

## 0. 一句话与动机

**把画布从 tldraw 渐进迁移到自己拥有的 Canvas 2D 渲染器;特色是「几何/结构元素 = 双向文本 DSL,手绘/图片 = 向量存储」。**

动机(用户 6/22 确认):
1. tldraw **商用要付费(~几千刀)**;不商用要**遥测**(与本项目「隐私优先」姿态有张力)。
2. **主驱动**:自研画布有含金量——把画布做成自己的核心资产,是特色的一部分。

可行性关键:**我们不是重建 tldraw**(通用白板:数千形状/协作/深度历史)。我们建的是一个**窄画布**——元素集有限已知(卡片/几何/箭头/文本/手绘/图片),且**文本 DSL 是几何的可信源**,渲染器只是它的视图。⇒ 月级而非年级。参考:Excalidraw 与 BlockSuite 都用 Canvas 2D 就做出可用画布。

## 1. 需求(描述要求)

### 1.1 产品 / 特色需求
- **R1 双向文本 DSL**:画布上的几何/结构元素(卡片、箭头/关系、文本标签、矩形、椭圆、便签、线段)必须能 (a) 序列化为文本 DSL,(b) 从 DSL 重建,(c) AI 能读(画布→文本)、能写(文本→画布)、能局部改。round-trip 必须可测、可逆。
- **R2 元素分存储层**:手绘/涂鸦 → 向量(点序列 + 压感);图片 → 二进制/metadata。二者**不进文本 DSL**。
- **R3 包豪斯美学**:渲染由我们掌控,保持 spec §5 的几何/网格/原色方向(**无手绘风张力**——这是自研相比 fork Excalidraw 的优势)。
- **R4 隐私不变**:AI allowlist 不变(`source.deviceId` / `media.dataUrl` / 软删除卡 永不进 prompt);无 vision 模型。
- **R5 本地优先**:数据仍在 SQLite/OPFS + localStorage,离线可用。

### 1.2 架构需求
- **R6 画布抽象层**:定义引擎无关接口(`CanvasHost`)。业务代码(绑定 / DSL apply / 关系推断 / auto-relate / AI snapshot)**只依赖接口**,不直接 import `@tldraw/tldraw`。
- **R7 双 adapter**:`TldrawAdapter`(现有逻辑迁移过来,渐进退役)+ `SelfBuiltAdapter`(新建 Canvas 2D)。二者实现同一接口,可 feature-flag 切换。
- **R8 可信源不变**:DB `cards.canvasPosition` 仍是卡片几何的可信源(现状已是);自研渲染器只是视图。
- **R9 抽象层放 `apps/web`**(不放 `packages/domain`)——`domain` 零依赖铁律不破坏。

### 1.3 非需求(YAGNI 边界,明确不做)
- ❌ 不重建通用白板(tldraw 的全部形状种类 / 实时多人协作 / 深度历史)。
- ❌ 不上 WebGL(Canvas 2D + 视口剔除对本项目元素量级够;超大画布是未来问题)。
- ❌ 不做实时多人协作(Excalidraw 的 version+nonce 无-CRDT 协调留作**未来选项**,本期不实现)。
- ❌ 不改 spec §5 设计 token(包豪斯方向不变)。

## 2. 架构

### 2.1 三层
```
┌─ 数据层 ─────────────────────────────────────────────┐
│  文本 DSL(几何/结构元素可信源,R1)                     │
│  向量存储(手绘点序列,R2)+ 图片二进制/metadata        │
│  DB:卡片内容可信源(不变,R8)                          │
├─ 抽象层 CanvasHost(引擎无关接口,R6)─────────────────┤
│  元素 CRUD / 视口(pan/zoom)/ 选择 / 事件 / 序列化      │
├─ 渲染层(adapter,R7)─────────────────────────────────┤
│  TldrawAdapter(渐进退役)  SelfBuiltAdapter(Canvas 2D) │
└──────────────────────────────────────────────────────┘
```

### 2.2 元素模型(对齐 Excalidraw 扁平判别联合 — 见 research doc §5.1)
- `CanvasElement` 基类 + 判别 `type`:`card | rect | ellipse | note | line | arrow | text | freedraw | image`。
- `card` 仍映射 domain `CardId`,**只存几何 `{x,y,w,h,rotation}`**,内容从 `CardService` 实时读(沿用 card-shape-util F1.2/F1.3 现状,不退化)。
- `freedraw`:`{ points: number[][], pressures?: number[] }`(向量,R2)。
- `image`:metadata + 引用(二进制不进 DSL)。
- 内建 `version` 字段(为未来 reconcile 预留,本期不用)、`isDeleted`(软删,与 trash 一致)。

### 2.3 双向 DSL 语法(扩展现有 `dsl-parser.ts`)
现有(单向,AI→画布):
```
[card #id] @pos(300,400) @color(blue)
[free: rect at (100,200) size 300x400] @color(red)
[arrow #arr1] from #a to #b @label("references")
```
扩展:
- 加 `@rot(度)`(旋转)、可选语义类型标记。
- 新增 `serializeCanvas(elements) → DSL 文本`(画布→文本,补齐反向)。
- round-trip 单测:`parseDsl(serializeCanvas(es))` 等价于 `es`(几何集)。
- **手绘/图片不进 DSL**(`serializeCanvas` 对 freedraw/image 只输出 metadata/count,不发点序列——也守住 R4 隐私)。

## 3. 分阶段实施

> 每个 Task 验收前必跑:`pnpm --filter domain test` + `pnpm --filter db test` + `pnpm --filter web build` + `pnpm -r lint`,全部 exit 0,且现有功能不退化。

### Phase 0 — 抽象层 + 双向 DSL(**零 ADR**,纯重构 + 扩展)

> 逐步 TDD 实现计划见 `docs/plans/2026-06-22-canvas-self-build-phase0.md`(每步四件套:约束/测试/改动文件/验收)。
- **T0.1** 定义 `CanvasHost` 接口(元素 CRUD / 视口 / 选择 / 监听 / 序列化)。放 `apps/web/src/features/canvas/host/`。
- **T0.2** 把 `canvas-binding.ts` / `apply-layout.ts` / `card-shape-util.tsx` / `canvas-editor.tsx` 的 tldraw 调用重构到 `TldrawAdapter implements CanvasHost`。业务代码改依赖 `CanvasHost`。
- **T0.3** DSL 升级双向:`serializeCanvas()` + round-trip 测试 + 语法扩展(`@rot` 等)。
- **T0.4** AI 接入反向:prompts 可喂 `serializeCanvas()` 输出(走现有 allowlist)。
- **验收**:全绿 + 现有画布功能零退化 + 画布↔文本 round-trip 测试通过 + AI 看不到手绘点序列/deviceId/软删除卡(反向断言)。
- **产出价值**:双向 DSL 特色**立即上线**(仍在 tldraw 上),抽象层让引擎可替换。

### Phase 1 — 自研 Canvas 2D 渲染器(**feature-flag 并存**,不碰 spec)

> 基础骨架(SelfBuiltAdapter + 渲染 + 拖拽 + pan/zoom + `/dev/canvas-self`)的逐步 TDD 计划见 `docs/plans/2026-06-22-canvas-self-build-phase1-foundation.md`。freedraw/文本/arrow/打磨/Phase 2 各自另开 plan。
- **T1.1** `SelfBuiltAdapter` 骨架:Canvas 2D 画布 + 视口(pan/zoom)+ 渲染循环 + 视口剔除。
- **T1.2** 元素渲染 + 命中测试(点选/框选)+ 选择/拖拽/缩放 handle。
- **T1.3** pan/zoom(to-cursor)+ 手绘输入(点序列)+ 文本编辑(含 CJK IME)。
- **T1.4** arrow/关系渲染 + 绑定端点;与 `serializeCanvas` 双向打通。
- **T1.5** feature-flag(`/dev/canvas?engine=self`)内部 dogfood,与 tldraw 并存。
- **验收**:语义集元素(card/几何/箭头/文本/手绘)在自研渲染器上可用;交互达到「good enough」(选择/拖拽/缩放/pan/zoom/手绘/文本编辑无阻断 bug)。

### Phase 2 — 迁移 + tldraw 退役(**ADR + spec 五轮审查**)
- **T2.1** 写 ADR:为何移除 tldraw(许可 + 含金量 + 双向 DSL 已验证)+ 风险评估。
- **T2.2** spec §3.4/§6.x 修订草案(tldraw → 自研渲染器)→ **五轮审查**(spec 冻结,改要审查)。
- **T2.3** 主流程切自研渲染器;tldraw 移除(或保留为 opt-in fallback 一段时间)。
- **T2.4** 全量回归 + 交互平价验收 + bundle 体积对比(tldraw ~2MB chunk 应消失/缩小)。
- **验收**:审查通过 + 全绿 + 用户可接受度达标。

## 4. 门槛与约束(红线)
- **ADR + spec 五轮审查只在 Phase 2 触发**(移除 tldraw)。Phase 0/1 不改 spec、不换依赖,零门槛。
- `packages/domain` 零依赖不破坏(R9:抽象层在 web)。
- 颜色/像素走 token,不写死 hex(包豪斯 6 原色 + 8px 网格)。
- AI 隐私 allowlist 不变(R4);任何 AI 改动前 review `docs/user/privacy.md`。
- 不假装 build/test 通过——必跑命令看 exit code。

## 4.5 执行纪律(用户 6/22 钉死,贯穿所有 Phase)

> 用户原话:**「慢慢来;最重要的是写好约束和测试;步骤尽可能细致;然后做 review。」**

- **慢**:小步、可独立验收、不跳步。宁可多步,不要一大步。
- **约束先行**:每个 Task 先写明它必须守住的约束(spec 冻结 / `packages/domain` 零依赖 / token 不写死 hex / AI 隐私 allowlist / 不假装 build 过 / 静态导出无 server 无动态路由)。
- **测试先行(TDD-ish)**:每个 Task **先写或更新 vitest 测试** → 测试红 → 实现 → 测试绿,才算完成。画布交互测试用 puppeteer-core e2e。
- **步骤极致细致**:writing-plans 产出**逐步、可独立验收**的小步,每步带四件套(约束 / 测试 / 改动文件 / 验收命令)。
- **Review 闸**:每步完成 → 自审(placeholder / 一致性 / 范围 / 歧义)→ **用户 review** → 才进下一步。Phase 之间也设闸。

## 5. 风险与能力交代
| 风险 | 说明 | 缓解 |
|---|---|---|
| **交互打磨长尾** | tldraw 有数年交互细化(吸附/键盘/触摸/a11y/IME 边界)。自研能到「好用」,tldraw 级完美是迭代过程。 | feature-flag 并存,dogfood 达「good enough」才切;polish 持续迭代。 |
| **多月级 effort** | 无论谁做,这是分阶段多月工程。 | Phase 0 早产出价值(双向 DSL),不是全做完才有东西。 |
| **性能边界** | Canvas 2D + 视口剔除对几百~几千元素够;超大画布未来或需 WebGL。 | 本期明确不做 WebGL(YAGNI);加视口剔除 + 脏区重绘。 |
| **CJK 文本编辑** | 画布上中文输入法(IME)是已知难点。 | T1.3 单独验收 IME;参考 Excalidraw textWysiwyg 处理。 |
| **spec 审查不过** | Phase 2 五轮审查可能要求调整。 | Phase 0/1 先把能力和特色做实,给审查充分证据;审查是过程门槛不是能力门槛。 |

## 6. 与现有文档的衔接
- 实现:`docs/plans/2026-06-22-canvas-strategy-tldraw-vs-self-build.md`(§3.3 渐进路径)。
- 证据:`docs/decisions/2026-06-22-canvas-research-drawio-archdiag-affine.md`(四项目调研)。
- 反馈源:`docs/decisions/2026-06-22-developer-feedback.md`(第三点)。
- 获批后更新 `docs/STATE.md` 的「下一步」:从「proposal 未定」改为「路线 A 进行中(Phase N)」。

## 7. 验证命令(每步必跑)
```bash
pnpm --filter domain test     # domain 单测全绿
pnpm --filter db test         # db 集成全绿
pnpm --filter web build       # 静态导出 exit 0
pnpm -r lint                  # domain/db/ui tsc
```
