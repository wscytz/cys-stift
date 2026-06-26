# AI 隐私设计 & 数据访问规范(开发面向)

> 本文给后续每个 phase 改 AI 功能时的**强制 check-list**。  
> 用户面向说明见 `docs/user/privacy.md`,决策背景见 `docs/decisions/2026-06-21-ai-accessibility-design.md`。

---

## 设计原则(三条,不可妥协)

### 1. 显式 allowlist

**默认不发送**任何字段。每个字段必须**显式**加入 `ai-context.ts` 的 allowlist 才会被发送给 AI。

新增 Card 字段 → 不在 allowlist → AI 看不到。这是**正确的默认**:
- 漏改 = 数据安全(收紧了)
- 漏改 ≠ 漏数据

### 2. 手动,不自动化

不用 codegen / reflection / runtime introspection 自动从 Card schema 生成 AI context。**每个字段手动决定**是否给 AI 看。

理由(用户决策,2026-06-21):
- 自动化让人**不思考**字段含义;手动决策强迫每次都问"AI 该不该看这个?"
- 自动化的边界不好界定(`media.dataUrl` 是图片二进制,要不要给?自动工具可能误给)
- 字段语义往往包含隐私考量(如 `source.deviceId`),自动化不会知道

### 3. 本地优先 & 最小暴露

- 不启用 AI → 零网络请求
- 启用 AI → **只**发当前操作的卡 / 卡列表 / 画布快照的**结构化描述**
- 不发 media 二进制 / API key / 软删除的卡 / 其他 workspace

---

## 手动 AI Context 流程

每个 phase 改 Card 字段,都要走这个流程:

### Step 1:识别新增字段

域层 (`packages/domain/src/types.ts`) 加了新字段:

```ts
export interface Card {
  // ... 旧字段 ...
  tag?: string[]              // ← M3.1 新增
  priority?: 'low' | 'med' | 'high'  // ← M4 新增
}
```

### Step 2:决策(每个字段独立判断)

每个新字段问三个问题:

| 问题 | 是 | 否 |
|---|---|---|
| 给 AI 看这个字段**对用户有价值吗**? | → 继续 Step 3 | 跳过(默认安全) |
| 有没有**敏感信息**(设备 ID / 加密 key / 二进制)? | → 加入但 redact / 不发原始值 | 正常发送 |
| 字段值会不会**很大**(>1KB / 包含 media 二进制)? | → 只发 metadata,不发原始值 | 正常发送 |

### Step 3:在 `ai-context.ts` 注册

```ts
// apps/web/src/features/ai/ai-context.ts
export const AI_CARD_FIELDS = {
  // 旧字段(已有)
  title: { kind: 'text' as const, include: (c: Card) => c.title },
  body: { kind: 'text' as const, include: (c: Card) => c.body },
  
  // 新字段(M3.1 加的)
  tag: { kind: 'list' as const, include: (c: Card) => c.tag ?? [] },
  
  // 新字段(M4 加的,只发 metadata,不发 device ID)
  priority: { kind: 'enum' as const, include: (c: Card) => c.priority ?? 'med' },
  
  // 敏感字段(显式不发)
  // source.deviceId 不在 allowlist → AI 永远看不到
} as const
```

### Step 4:测试要求

每个新加的 AI context 字段必须有单测:

```ts
// apps/web/src/features/ai/__tests__/ai-context.test.ts
describe('AI_CARD_FIELDS allowlist', () => {
  it('includes title', () => {
    expect(serializeCardForAI({ title: 'X', ... } as Card)).toContain('Title: X')
  })
  it('does NOT include deviceId', () => {
    const card = { ..., source: { kind: 'manual', deviceId: 'secret' } } as Card
    expect(serializeCardForAI(card)).not.toContain('secret')
  })
})
```

### Step 5:e2e 反向断言

e2e 加一条:**全字段扫描,确保 AI 输入里没有"应该被排除"的字段名**。

---

## ai-context.ts API 设计(M3.1 待实现)

```ts
// apps/web/src/features/ai/ai-context.ts (计划中)
'use client'

import type { Card, CanvasId } from '@cys-stift/domain'

type FieldKind = 'text' | 'list' | 'enum' | 'date' | 'count' | 'redacted'

interface FieldDef<T> {
  /** What kind of value this is. 'redacted' means we acknowledge the
   *  field exists but never send its value (useful for documentation). */
  kind: FieldKind
  /** Sample function: pull the AI-visible value out of the card.
   *  Return undefined to skip this field for this card. */
  include: (card: Card) => T | undefined
}

/**
 * SINGLE SOURCE OF TRUTH for "what AI sees about a card".
 *
 * Every field is listed explicitly. New Card fields require an explicit
 * entry here (or they remain invisible to AI — the safe default).
 *
 * If you add a field to `Card` and forget to register it here:
 *   - AI still works (just doesn't see the new field)
 *   - The unit test in __tests__/ai-context.test.ts catches the gap if
 *     you run `pnpm test`
 *   - The check-ai-context script (optional, see §6) can lint this
 */
export const AI_CARD_FIELDS = {
  // ── Text content ──
  title:         { kind: 'text', include: (c) => c.title },
  body:          { kind: 'text', include: (c) => c.body },
  
  // ── Timestamps ──
  capturedAt:    { kind: 'date', include: (c) => c.capturedAt?.toISOString().slice(0, 10) },
  
  // ── Visual hints ──
  color:         { kind: 'enum', include: (c) => c.color },
  pinned:        { kind: 'enum', include: (c) => c.pinned ? 'yes' : undefined },
  
  // ── Position ──
  canvasId:      { kind: 'enum', include: (c) => c.canvasPosition?.canvasId },
  
  // ── Structured attachments ──
  links:         { kind: 'list', include: (c) => 
                    c.links.length ? c.links.map(l => l.title || l.url) : undefined },
  code:          { kind: 'list', include: (c) => 
                    c.codeSnippets.length 
                      ? c.codeSnippets.map(s => `[${s.language}] ${s.code}`) 
                      : undefined },
  quotes:        { kind: 'list', include: (c) => 
                    c.quotes.length 
                      ? c.quotes.map(q => `${q.text}${q.attribution ? ' — ' + q.attribution : ''}`) 
                      : undefined },
  
  // ── Media (metadata only, never binary) ──
  mediaCount:    { kind: 'count', include: (c) => c.media.length },
  mediaKinds:    { kind: 'list',  include: (c) => 
                    c.media.length ? c.media.map(m => m.kind) : undefined },
  
  // ── Capture source (metadata only — NO deviceId) ──
  sourceKind:    { kind: 'enum', include: (c) => c.source?.kind },
  
  // ── Future fields added here, never auto-detected ──
  // tag:           { kind: 'list', include: (c) => c.tag },
  // priority:      { kind: 'enum', include: (c) => c.priority },
} as const satisfies Record<string, FieldDef<unknown>>

/** Fields explicitly NOT sent to AI. Listed here for documentation;
 *  serves as the negative-test reference. */
export const AI_REDACTED_FIELDS = [
  'source.deviceId',         // privacy: per-device tracking id
  'media[].assetId',         // opaque id, not useful to AI
  'media[].dataUrl',         // image/pdf binary — never sent
  'deletedAt',               // soft-deleted cards not in AI scope
  'apiKey',                  // settings — never in prompts
  'captureShortcut',         // settings — irrelevant
] as const

/** Serialize a single card into the structured text block that goes
 *  into the AI's `user` prompt. Returns '' if the card is soft-deleted
 *  or no fields have values. */
export function serializeCardForAI(card: Card): string {
  if (card.deletedAt) return ''  // soft-deleted cards are invisible
  const lines: string[] = []
  for (const [name, def] of Object.entries(AI_CARD_FIELDS)) {
    const value = def.include(card)
    if (value === undefined || value === null) continue
    if (Array.isArray(value) && value.length === 0) continue
    lines.push(`${name}: ${Array.isArray(value) ? value.join(', ') : value}`)
  }
  return lines.join('\n')
}

/** Serialize N cards for a multi-card prompt (DSL layout, auto-relate).
 *  Each card gets a `[card #id]` header for DSL reference. */
export function serializeCardsForAI(cards: Card[]): string {
  return cards
    .filter((c) => !c.deletedAt)
    .map((c) => `[card #${c.id}]\n${serializeCardForAI(c)}`)
    .join('\n\n')
}
```

---

## 画布快照序列化(DSL 排版用)

画布上的非卡片形状(箭头 / 手绘 / 矩形 / 便签) 也需要序列化。

### 实现(已落地,2026-06-24)

> ⚠️ 本节原写于 M3 规划期(tldraw 时代、`CanvasSnapshot` 计划接口、手绘发点序列)。**现状已变**:
> - 画布已迁**自研 Canvas 2D**(`packages/canvas-engine`),序列化走 `host.getElements()`(`CanvasElement[]`),不再有 tldraw `editor`。
> - 生产函数是 `apps/web/src/features/ai/canvas-dsl.ts` 的 `serializeCanvas` / `formatCanvasSnapshot`(非计划中的 `canvas-snapshot.ts`)。
> - **R2 隐私收紧(最终决策)**:freedraw **点序列永不外发** AI;只发**抽象形状描述符**(见下)。本节下方已据此更新;若与旧描述冲突,以下方 + `docs/user/privacy.md` 为准。

序列化输入 = `CanvasElement` 统一模型(5 个 active kind:card / arrow / freedraw / text / rect;legacy ellipse/line/note/image 仅读旧画布;frame 2026-06-26 加)。每个 kind 一行 DSL:

```ts
// apps/web/src/features/ai/canvas-dsl.ts(已实现)

// 伪示意:每元素一行;card 内容(title/body)从 CardService 取,几何从 element 取
function serializeElement(el: CanvasElement, getCardInfo?): string
function formatCanvasSnapshot(host: CanvasHost, getCardInfo, canvasId): string
```

**freedraw 的 R2 安全形状描述**(本地跑 `classifyFreedraw` + `$1` recognizer,失败退化仅位置不抛):
- `shape`:离散标签 `circle` / `rect` / `triangle` / `check` / `arrow` / `unknown`
- `shapeConfidence`:0..1
- `features`:4 个标量比例 `{ straightness, closure, elongation, pointCount }`
- **绝不**输出 `meta.points`(绝对坐标点序列)——这是 R2 硬边界,有反向断言测试守护(多点 freedraw 序列化结果不含内部点坐标)

判定**全程本地**(`$1` recognizer,Wobbrock UIST 2007;resample/rotate/scale/translate/GSS),点数据留在引擎存储,不进任何 prompt 文本。

### 序列化输出例(当前 DSL 格式)

```
Canvas: my-project (5 cards, 3 arrows, 2 free shapes)

[card #a1] @pos(200, 300) @size(240, 120) @color(blue)
  title: Architecture
  body: System overview...

[card #a2] @pos(700, 400) @size(240, 120) @color(red)
  title: Implementation
  body: ...

[arrow #arr1] from #a1 to #a2 @label("references")

[freedraw #f1] @pos(300, 100)
  shape: circle (85%)
[rect #r1] @pos(900, 200) @size(160, 80) @color(black)
```

> freedraw 行**只**带位置 + 形状描述符注释(`# ...` 行 parser 跳过,round-trip 安全)。**绝不**出现点序列。card 行的 title/body 来自 CardService(单一可信源),几何来自 element。

---

## DSL 输出(AI 写的格式)

AI 看到的输入(snapshot)→ 输出 DSL → 客户端 `parseDsl` + `applyLayout` 应用。手写解析器(~150 行,在 `apps/web/src/features/ai/dsl-parser.ts`),跳过 `#` 注释行。

```
[card #a1] @pos(300, 400) @size(240, 120) @color(blue)
[arrow #arr1] from #a1 to #a2 @label("references") @type(references)
[rect #r1] @pos(500, 100) @size(160, 80) @color(black)
```

**约束**(设计性,非 bug):
- **card update-only**:AI 不能 `[card #new]` 建卡(卡片内容来自 CardService 单一可信源);只能更新已存在 card 的几何/color。
- **freedraw 单向**:AI 看得到 freedraw 的形状描述,但 DSL 不能创建/改 freedraw(R2:点序列不外发 → 无法还原)。
- **arrow 端点必须存在**:`from`/`to` 指向不存在的 card → 该 op 静默跳过(per-op try/catch 容错)。

---

## 多模态(图像理解)不做

**用户决策(2026-06-21)**:
- ❌ GPT-4V / Claude Vision / 任何 vision 模型
- 理由:本地优先边界、token 成本、外围支持不成熟
- 替代:图像卡片的 `mediaKind: 'image'` 元数据给 AI,**二进制永不外发**

---

## 手绘内容 = 抽象形状描述(非点序列)

> **R2 隐私最终决策(2026-06-24,永久)**:freedraw 的**点序列永不外发** AI。只发**抽象形状描述符**。本节据此更新;早期"编码成坐标点序列发给 AI"的描述**已废止**。

**可以给 AI 看的**(抽象、不可逆推原图):
- `shape`:离散标签 `circle` / `rect` / `triangle` / `check` / `arrow` / `unknown`
- `shapeConfidence`:0..1
- `features`:4 个标量比例 `{ straightness, closure, elongation, pointCount }`

**永不外发的**:
- ❌ `meta.points`(绝对坐标点序列)——R2 硬边界
- ❌ 像素 / vision 解析(永久不做 vision 模型)

**方式**(全程本地):
- 客户端本地跑 `classifyFreedraw`(启发式 arrow/decoration)+ `$1` recognizer(Wobbrock UIST 2007;认圈/方/三角/对勾,score≥0.7 认否则 unknown)
- 输出离散 shape 标签 + 标量 features,写进 snapshot 的 `# shape: circle (85%)` 注释行
- 点数据留在引擎存储,不进任何 prompt 文本(有反向断言测试:多点 freedraw 序列化结果不含内部点坐标)

```
[freedraw #f1] @pos(300, 100)
  shape: circle (85%)
  ↑ 本地 $1 识别:像圆圈 85% → 只发标签 + 标量,点序列留在本地
```

---

## 字段审计 check-list(每个 phase 必走)

phase 完成后,改 AI 的开发者**必须**回答这些问题:

### 新字段相关
- [ ] 加了新 Card 字段吗? → 在 `AI_CARD_FIELDS` 注册了吗?(否则默认安全:AI 看不到)
- [ ] 新字段是否含敏感信息? → 加入 `AI_REDACTED_FIELDS` 文档,或加进 allowlist 但用 `kind: 'redacted'`
- [ ] 新字段值大小? → 如果 > 1KB 或包含二进制,**只**发 metadata / count / kind

### 新 action 相关
- [ ] 加了新 AI action(summarize / layout / cluster / etc.)? → 在 `prompts.ts` 注册新模板
- [ ] 新 action 用到 cards 列表吗? → 走 `serializeCardsForAI(cards)`,**不要**手写拼接字符串
- [ ] 新 action 需要画布快照吗? → 走 `snapshotCanvas(editor, canvasId)`,**不要**直接遍历 tldraw shape

### 媒体相关
- [ ] 新代码读 `media.dataUrl` 然后传给 AI? → **禁止**,改成只发 `media[i].kind`
- [ ] 新代码用 vision 模型(GPT-4V / Claude Vision)? → **禁止**(M3 决策)

### 测试相关
- [ ] `ai-context.test.ts` 加了反向断言吗?(新字段**不**在 allowlist 时,AI 看不到)
- [ ] `prompts.ts` 单测覆盖了新模板吗?
- [ ] e2e 加了"AI 看不到 X 字段"的反向断言吗?

### 文档相关
- [ ] `docs/user/privacy.md` 表更新了吗?(用户可见字段列表)
- [ ] `docs/development/privacy-design.md` 第 4 节 ai-context.ts API 更新了吗?
- [ ] changelog 加了隐私相关条目吗?

---

## 测试要求

### 单元测试(必做)

```ts
// apps/web/src/features/ai/__tests__/ai-context.test.ts

describe('AI_CARD_FIELDS allowlist', () => {
  it('sends title and body', () => { /* ... */ })
  it('sends structured fields (links/code/quotes)', () => { /* ... */ })
  it('redacts source.deviceId', () => {
    const card = { source: { kind: 'manual', deviceId: 'SECRET' } } as Card
    expect(serializeCardForAI(card)).not.toContain('SECRET')
  })
  it('omits soft-deleted cards', () => {
    const card = { deletedAt: new Date(), title: 'gone' } as Card
    expect(serializeCardForAI(card)).toBe('')
  })
  it('omits media binary', () => {
    // even if a Card somehow has dataUrl, never send it
    const card = { media: [{ assetId: 'x', kind: 'image', dataUrl: 'data:image/png;base64,...' } as any] } as Card
    const out = serializeCardForAI(card)
    expect(out).not.toContain('data:image')
    expect(out).toContain('mediaCount: 1')
  })
})

describe('serializeCardsForAI', () => {
  it('filters deleted', () => { /* ... */ })
  it('prefixes each card with [card #id]', () => { /* ... */ })
})
```

### E2E(可选,推荐)

```js
// scripts/m3-shots.cjs 加一段
console.log('\n[8] AI context: deviceId never leaks')
// 在 /settings 启用 AI + 在 inbox 输入一张卡含 source.deviceId
// 通过 chrome devtools 截取 fetch 请求体,验证 deviceId 不在 prompt 里
```

---

## 隐私相关 changelog 强制项

每个 phase 如果涉及 AI 改动,changelog 必须包含:
- 哪些**新字段**加入了 AI allowlist
- 哪些**新字段**明确不发(加入 redacted 列表)
- 哪些**新 action** 用了 AI(列出)
- 用户可见的隐私表是否更新

---

## 未来扩展(避免提前 over-design)

### M3.1
- ai-context.ts 实现
- DSL parser
- canvas-snapshot.ts 实现
- 启发式:直线 / 矩形 / 椭圆 / 便签识别

### M3.2
- 闭合 region 启发式(评估准确率,不满意就不做)
- AI 找重复 / cluster

### M4
- OS keychain 加密 API key
- 字段审计的 ESLint 插件(自动检查 Card 新字段是否注册)

### 不做(决策)
- 自动化 codegen(用户决策:手动更安全)
- 多模态 vision 模型(用户决策:不做)
- AI 自动 audit 自己的 prompt(用户决策:信任开发者 review)

---

## 相关文档

- 用户面向:`docs/user/privacy.md`
- 决策档:`docs/decisions/2026-06-21-ai-accessibility-design.md`
- 用户反馈原话:`docs/feedback/2026-06-21-ai-feedback.md`
- M3 交付:`docs/decisions/2026-06-21-canvas-m3-ai.md`
- M3 后续路线:同上决策档末尾

---

## 改本文档的 trigger

**以下情况必须更新本文档**:
- 加新 Card 字段 → 更新 §4 ai-context.ts API + §7 check-list
- 加新 AI action → 更新 §3 流程 + §5 DSL 输出
- 改隐私边界(新增"不发送"或"开始发送")→ 更新 §2 原则 + 用户文档
- 加新 provider → 更新 §2 原则 + 用户文档