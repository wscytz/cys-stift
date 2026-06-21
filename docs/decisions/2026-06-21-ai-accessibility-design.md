# 2026-06-21 · AI 可访问性 & 隐私设计(v0.30.0-ai-accessibility)

> 来源: 用户对话(2026-06-21 — AI 可访问性 + 隐私设计 + 多模态不做 + 手绘 = 几何描述 + DSL 排版 + 手动而非自动)。

## 设计

M3(2026-06-21 交付)加了 4 个 AI action,但**没**系统设计 AI 对项目数据的访问边界。本决策档定下:

1. **AI 数据访问模式** — 手动 allowlist,**不**自动化
2. **隐私文档双轨** — 用户面向 + 开发面向
3. **多模态不做** — 用户明确决策
4. **手绘 = 几何描述** — 用户修正(可以做,但走几何编码,不走 vision)
5. **M3.1 文字 DSL 排版** 范围升级 — 从"cards 列表"到"画布快照"
6. **未来扩展 / 不做清单**

### 关键决策

1. **手动 allowlist,不自动化** — 显式 `ai-context.ts` 文件列出 AI 可见字段,新增 Card 字段必须手动加入,否则 AI 看不到(默认安全:漏改 = 收紧,不漏数据)
2. **每个 phase 强制走 check-list** — `privacy-design.md` 第 7 节定义了 12 项 audit,phase 完成后开发者必须逐项回答
3. **画布快照 vs cards 列表** — M3.1 DSL 排版要从**整个画布**出发:卡片 + 箭头 + 手绘 + 矩形 + 便签全部序列化
4. **手绘内容可以做,但走几何描述** — 客户端启发式把 `tldraw draw shape` 简化成线 / 矩形 / 椭圆 / 便签,**不**做 vision 解析像素
5. **多模态(图像理解)不做** — 理由:本地优先边界、token 成本、外围支持不成熟
6. **不加密 API key(沿用 M3 决策)** — OS keychain 升级留 M4
7. **media 二进制永不外发** — 即使将来有 vision,默认也只发 `mediaKind` 元数据
8. **软删除的卡不在 AI 视野** — `deletedAt` 非空 → 跳过

### 不做(显式 defer)

- 自动 codegen / reflection 生成 AI context(用户决策:手动更安全)
- 多模态 vision 模型(GPT-4V / Claude Vision)— 用户决策
- AI 自动 audit 自己的 prompt(信任开发者 review)
- 闭合 region 启发式(M3.1 不做,M3.2 评估准确率)
- M3 范围内实装 ai-context.ts(M3.1 实现,M3 只交付架构 + 文档)
- 字段审计的 ESLint 插件(M4)
- OS keychain 加密 API key(M4)

## 用户原话归档(2026-06-21 对话)

完整对话上下文见 `docs/memory/feedback/2026-06-21-ai-feedback.md`。摘要:

1. **"我打算还是不做多模态暂时,因为现在这方面外围支持也不好,更好的方案还是做文字描述"** — 排除 vision
2. **"有个难度的就是怎么描述手绘内容"** — 识别手绘描述问题
3. **"我不是说不对,我们可以描述,比如对于一个类似线段,我们可以知道这大概是一个线段"** — 修正:手绘可做,但用几何描述
4. **"ai对于我们数据的访问性也要做好"** — 提出 AI 数据访问性问题
5. **"我们开发新功能的时候,ai对于这些数据的访问都要做到跟进"** — 提出跟进模式
6. **"不一定自动也可以手动,就是每次都要往这块考虑下"** — 决策:手动而非自动
7. **"我们项目要做好是否可以访问这个隐私性的设计,这些文档做好相关说明"** — 提出隐私文档
8. **"你写好最终文档,集合我上面的意见"** — 最终要求:整合所有意见到文档

## 文档交付清单

| 文档 | 受众 | 状态 |
|---|---|---|
| `docs/user/privacy.md` | 用户(打开 /settings 看到 AI 时) | ✅ v0.30.0 |
| `docs/development/privacy-design.md` | 开发(改 AI 的每个 phase) | ✅ v0.30.0 |
| `docs/memory/decisions/2026-06-21-ai-accessibility-design.md` | 跨模型记忆 | ✅ v0.30.0(本文档) |
| `docs/memory/feedback/2026-06-21-ai-feedback.md` | 用户原话归档 | ✅ v0.30.0 |
| `CLAUDE.md` | 主锚点 | ✅ 加 v0.30.0 记录 |
| `apps/web/CLAUDE.md` | web 锚点 | ✅ 加 AI 改动 check-list |
| `MEMORY.md` | 索引 | ✅ 加新条目 |
| `docs/development/changelog.md` | 历史 | ✅ v0.30.0 条目 |

**M3.1 实装任务(不在本 phase)**:
- `apps/web/src/features/ai/ai-context.ts`(allowlist + serializer,~ 80 行)
- `apps/web/src/features/ai/canvas-snapshot.ts`(画布快照,~ 80 行)
- `apps/web/src/features/ai/dsl-parser.ts`(DSL parser,~ 100 行)
- `apps/web/src/features/ai/__tests__/ai-context.test.ts`(unit tests)
- `apps/web/src/features/ai/prompts.ts` 改用 `serializeCardForAI` 替手写拼接
- `apps/web/src/features/canvas/canvas-toolbar.tsx` 加 "📐 AI 排版" 按钮
- 改 e2e 加反向断言(deviceId 不在 AI 请求体)
- ~ 400 行,1 个 phase

## 验收

- 8 个文档全部到位
- `pnpm --filter domain test` 26/26
- `pnpm --filter db test` 7/7
- `pnpm --filter web exec vitest run` 12/12(M3 单测未改)
- `pnpm --filter web build` exit 0(纯文档,代码无改动)
- `pnpm --filter web exec node scripts/m3-shots.cjs` 7/7

## 关联决策

- M3 交付:`docs/memory/decisions/2026-06-21-canvas-m3-ai.md`
- M3.1 路线(待 plan):DSL 排版 + ai-context.ts 实现
- M4 候选:OS keychain 加密 + ESLint 插件 + 闭合 region 启发式

## Self-Review

- **完整性**:8 个文档覆盖用户 / 开发 / 决策 / 反馈 / 索引 5 个层面,无遗漏
- **可执行性**:开发 check-list 12 项 + 单元测试模板 + e2e 反向断言,M3.1 实装时直接走
- **用户决策忠实**:
  - ✅ 手动而非自动(`privacy-design.md` §1.2)
  - ✅ 多模态不做(`privacy-design.md` §6)
  - ✅ 手绘 = 几何描述(`privacy-design.md` §7 + `privacy.md` §"手绘")
  - ✅ 隐私文档双轨(用户 + 开发)
- **未来友好**:`privacy-design.md` 第 10 节列了 M3.1 / M3.2 / M4 / 不做清单,后续 phase 直接对照
- **风险**:本 phase 是纯文档,**没**代码改动,**没**新 dep,**没**破坏性 → 极低风险