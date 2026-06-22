# 2026-06-21 · 用户反馈 F3: AI 数据访问性 + 隐私设计

> 来源: 用户对话(2026-06-21 多次 round)
> 受众: 跨模型记忆 + 后续 phase 参考

## 反馈概览

本次对话涵盖 3 个主题:
1. AI 数据访问性(AI 看不看得到我们的数据,新功能开发时怎么跟进)
2. 隐私设计(隐私文档要写好,用户能看懂)
3. 手绘内容 + 多模态(怎么描述手绘内容,做不做多模态)

---

## Round 1: 用户引导 → AI 元素(早期)

> 用户原话:
> - "继续,等下我们考虑加现在最火的ai元素,我初步设想是先做ai访问可否的设置,然后ai可以方便(定制化处理)操作我们的软件"
> - "/Users/jinxunuo/Downloads/AFFiNE-0.26.3.zip 可以看看,欣赏下,这是一个成熟的软件项目"
> - "可以"(批准 AFFiNE 架构分析 + M3 方向)
> - "继续,卡了"

**理解**: 用户想要 AI 功能,但**首先**要能控制 AI 的访问(开启/关闭),然后 AI 操作要定制化。参考 AFFiNE 0.26.3 架构(Provider Factory + AI Actions)。

**行动**: 交付 M3(`v0.29.0-canvas-m3-ai` — 3 provider + /settings AI 面板 + 卡片 3 action + 画布 auto-relate)。

---

## Round 2: Notion 启发 → 可访问性(UI 层面)

> 用户原话:
> - "你知道notion吧,我想ai的访问性也要做好,这个计划里怎么说"

**理解(我的初判)**: 用户问 UI 可访问性(Notion 风格的命令面板 / 入口常驻 / 不打断等)。

**回答**: 我列了 3 层改进清单:
- Layer 1: app-menu 顶部加 "✨ AI" 入口 / toolbar 加 AI 菜单 / edit 模式也有 AI
- Layer 2: 取消按钮 / 进度占位符 / 错误诊断 / 光标插入 / diff review
- Layer 3: a11y(`aria-live` / `role="status"` / 键盘 Esc / 高对比度 / `⌘+⇧+A`)

**用户澄清**: 用户**不是**问 UI 可访问性,而是 **AI 对我们数据的访问性**(完全不同的概念)。

---

## Round 3: AI 数据访问性(真正的问题)

> 用户原话:
> - "其实我的意思是ai对于我们数据的访问性,当然你说的这个也是必要的"

**理解**: AI 现在能访问哪些 Card 字段 / 哪些 tldraw 形状?哪些应该能 / 哪些不应该能?**审计 AI 的视野**。

**回答**: 我列了 AI 数据访问矩阵:
- ✅ 现在能看:title / body / bound cards title+body
- ❌ 不能看:tags / media 二进制 / code snippets / quotes / links / 时间戳 / source / pinned / color / canvasPosition / archived / 软删除状态 / 画布自由形状 / 关系箭头 / 其他 workspace
- 🔒 严格不发:apiKey / 设备 ID / 其他 localStorage keys

**改 4 层清单**:
- Layer 1: prompts.ts 重构暴露全 Card 字段(~ 30 行)
- Layer 2: 加 `Card.tag`
- Layer 3: 媒体内容(已部分实现 — DOC 类型已 markitdown 转 md 写 body)
- Layer 4: 画布层结构

---

## Round 4: 自动化模式

> 用户原话:
> - "如果我们要做ai功能,我们开发新功能的时候,ai对于这些数据的访问都要做到跟进"
> - "还有就是我们的项目要做好是否可以访问这个隐私性的设计,这些文档做好相关说明"

**理解**: 
- 每个新功能 phase,AI 数据访问要**自动跟进**(用户最初期望自动化)
- 隐私设计文档要写好

**回答**: 我提议 3 种自动模式:
- A: Serializer(类似 JSON 序列化)
- B: Decorator / Metadata(类型注解)
- C: 显式 allowlist + lint 规则

**推荐 C**: 显式 allowlist + lint。

---

## Round 5: 用户决策 — 手动

> 用户原话:
> - "差不多,但是我的意思是不一定要自动也可以手动,就是每次都要往这块考虑下这样"
> - "你写好最终文档,集合我上面的意见"

**理解**: 
- **手动即可**,不强制自动化
- **每个 phase 都要考虑**这块(AI 该不该看新字段)
- **写好最终文档**整合所有意见

**行动**: 
- 决定用"显式 allowlist"模式,手动维护 `ai-context.ts`
- 不做自动化 codegen / reflection
- 写 4 个文档(用户隐私 / 开发隐私 / 决策档 / 反馈档)

---

## Round 6: 手绘内容(关键决策)

> 用户原话(第 1 次):
> - "我打算还是不做多模态暂时,因为现在这方面外围支持也不好,更好的方案还是做文字描述"
> - "有个难度的就是怎么描述手绘内容"

**理解**: 不做 vision 模型,但**手绘描述**是难题。

**我的初判**: 提了 3 种处理方式(忽略 / 文字注释 / 边界定义),推荐方式 1 + 2(手绘 = 装饰)。

> 用户原话(第 2 次,**修正**):
> - "抱歉,手绘这里我不是说不做,我们可以描述,比如对于一个类似线段,我们可以知道这大概是一个线段这样,这个可能在前期开发中要写好判定"

**理解(修正)**: 
- 手绘**可以做**,但走**纯文本几何描述**
- 比如一条线段 → 客户端识别 + 描述为 `line from (x1,y1) to (x2,y2)`
- **判定逻辑**写在客户端(tldraw shape type + 启发式),不在 AI 端
- **不**做 vision 解析像素

**行动**: 修正决策档 + 开发文档:
- "手绘 = 几何描述"作为核心设计原则
- 客户端启发式判定规则(line / rect / ellipse / note / draw 原笔触)
- 闭合 region 启发式 M3.1 不做(M3.2 评估)

---

## 最终决策(本次对话定稿)

### 1. AI 数据访问性

- **手动维护** `ai-context.ts` allowlist,不自动化
- **每个 phase 改 AI** 必走 `privacy-design.md` 第 7 节 check-list(12 项)
- **默认安全**: Card 新增字段不注册 → AI 看不到(漏改 = 收紧)
- **media 二进制永不外发**(即使将来有 vision,默认也只发 metadata)

### 2. 隐私文档

- **用户面向**:`docs/user/privacy.md`(中英 / UI 友好 / 字段表 / 开关步骤)
- **开发面向**:`docs/development/privacy-design.md`(技术 spec / 手动流程 / check-list / API 设计 / 测试要求)

### 3. 多模态

- ❌ **不做**(用户决策)
- 理由:本地优先边界 / token 成本 / 外围支持不成熟

### 4. 手绘内容

- ✅ **可以做**,但走**几何描述**
- 客户端启发式把 tldraw `draw` shape 简化成 line / rect / ellipse / note / draw 原笔触
- **闭合 region** M3.1 不做,M3.2 评估启发式准确率
- AI 不做 vision 解析像素

### 5. M3.1 路线(下个 phase)

- DSL 排版(文字描述布局)
- ai-context.ts 实现
- canvas-snapshot.ts 实现
- dsl-parser.ts 实现
- toolbar 加 "📐 AI 排版" 按钮
- ~ 400 行,1 个 phase

---

## 后续 phase 怎么用本反馈档

- **clear 后第一件事**: 读本档 + 读 `2026-06-21-ai-accessibility-design.md` 决策档
- **每个 phase 改 AI**: 走 `privacy-design.md` 第 7 节 check-list
- **加新 Card 字段**: 必查 `AI_CARD_FIELDS` allowlist
- **加新 AI action**: 必查 `prompts.ts` 模板 + 画布快照(若涉及形状)

---

## 关联文档

- 决策档:`docs/decisions/2026-06-21-ai-accessibility-design.md`
- 用户隐私:`docs/user/privacy.md`
- 开发隐私:`docs/development/privacy-design.md`
- M3 交付:`docs/decisions/2026-06-21-canvas-m3-ai.md`
- 早期反馈 F1 / F2:`docs/feedback/2026-06-19-*.md`(若有) / `docs/feedback/2026-06-21-f2-ux-feedback.md`