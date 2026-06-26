# AI 门槛降低 + 记录栏体验优化 — 设计

> 日期:2026-06-26 · 范围:apps/web · 关联:产品定位研究(转义楔子坐实)
> 状态:已通过 brainstorming,待 writing-plans 出实施计划

## 一、为什么做这个(Context)

产品定位研究坐实了楔子:**本地 + 画布 + 开放文本双向 DSL(转义)** 这个交叉点没有竞品。而且两根支柱在代码里都是真的:

- **转义**(`serializeCanvas` / `parseDsl` / `applyLayout`)已压测证明(R1-3:fuzz + 28 对抗输入 + 混合垃圾永不抛),并已产品化为 `DslDialog`(工具栏 DSL 按钮)。
- **BYOM**(`AIConfig = {provider, apiKey, baseUrl, model}`)三 provider 含 **Ollama(本地免费)**,自带连接测试。

但用户视角的两个核心入口仍有明显短板,这就是本 spec 的两条主线:

- **#2 降低 AI 门槛**:AI 对没配置的用户**完全隐形**(`aiEnabled=false` 时所有 AI 按钮被隐藏),点到了也是裸 `notConfigured` 报错;配置面板朴素不好看;默认 prompt 极简、输出质量一般。
- **#3 记录栏体验**:核心捕获栏(⌘⇧Space)很健壮(全局热键 + Tauri 全局快捷键 + 草稿自动存),但新人**不知道快捷键**;捕获后**静默进 inbox**、去向不明确、无法快速重定向;MiniInput 有非直观交互(Enter 展开正文)。

> 注:用户优先级 #1(DSL 模态编辑器)**已完成并加固**,不在本 spec 范围。

## 二、设计目标 / 非目标

**目标**
- 让"用上 AI"从"6 步配置 + 看不到入口"降到"一眼看到 ✨ AI、点了就引导"。
- 让没配 AI 的用户也能**发现 AI 存在**,并被引导完成(零成本)配置。
- 让默认 AI 输出开箱即用(prompt + 参数调好)。
- 让捕获保持"3 秒"速度,同时去向可见、可一键重定向。
- 让捕获快捷键对新人可发现。

**非目标(YAGNI,明确不做)**
- 不做 Ollama 自动探测向导(用户未选)。
- 不做"捕获时选去向"(违背 3 秒速度;用户选了 A)。
- 不做自动起标题 / 智能捕获(用户未选)。
- 不动转义/DSL 管线(已稳定)。
- 不动 AI 隐私字段白名单(R2 不变:`source.deviceId` / `media.dataUrl` / 软删除卡 / freedraw 点序列永不进 prompt)。

## 三、#2 降低 AI 门槛

### 3.1 AI 设置面板重做(2a · 解决"不好看")

**现状**:`apps/web/src/features/settings/ai-settings-panel.tsx` 是朴素 label/input 表单,`.set__*` 样式定义在 `app/settings/page.tsx`。

**改为**包豪斯处理(复用现有 token,零新依赖):
- 顶部 region 条 + `settings.ai` 标题 + lede。
- **三个 provider 做成可选卡片**:OpenAI / Anthropic / **Ollama(本地·免费)**。每张卡:
  - 一个原色点(用 6 色里的:black / blue / yellow——**不引入新色,禁止 green**)。
  - 一句话说明;Ollama 卡明确标「无需 API key」。
  - 选中态:2px 黑边 + 4px 黑偏移阴影(和 batch-bar / ai-popover 一致)。
- 字段分组(Base URL / 模型 / Key),`needsKey` 为 false(Ollama)时不渲染 Key 行。
- 明文警告做成正经 callout(⚠ + 边框),不是裸文字。
- 测试 + 保存做主按钮;测试结果在按钮旁显示延迟(`aiTestOk` 已有)。

**文件**:`ai-settings-panel.tsx`(重写 JSX + scoped styles);i18n 加 provider 卡片 label/description。

### 3.2 统一 ✨ AI 入口 + 优雅路由(2b · 核心,解决"用起来不顺手")

**核心洞察**:现在 `aiEnabled=false` 把所有 AI 按钮**隐藏**——没配的人看不到 AI 存在。这是门槛的根源。

**改动**:

1. **AI 永远可见**:card-detail 现有 3 个分散 AI 按钮(摘要 / 改写 / 翻译,`card-detail.tsx:535-575`,均 `aiEnabled && has(...)`)收敛成**一个 `✨ AI` 按钮**,且**不再被 `aiEnabled` 隐藏**。
2. **优雅路由**:点 `✨ AI` 时:
   - `getCurrentAI()` 返回 null(未配置 / 未启用)→ 渲染 **`AiSetupCard`**(新组件):迷你引导卡,高亮 Ollama 零成本路径 + 「去设置」按钮(跳 `/settings`)。
   - 否则 → 渲染 **`AiActionMenu`**(新组件):动作菜单(摘要 / 改写 / 翻译→en/zh),选一个走现有 `AIPopover` 流(不动 AIPopover / runAIAction)。
3. canvas 的 AI-layout 按钮(`page.tsx:613 onAILayout`)同样:永远可见;`handleAILayout` 内 `getCurrentAI()` 为 null 时改走 `AiSetupCard` 引导而非裸报错。

**新组件**:
- `apps/web/src/features/ai/ai-setup-card.tsx` — 未配置引导卡(card-detail / canvas 复用)。
- `apps/web/src/features/ai/ai-action-menu.tsx` — ✨ AI 动作菜单(摘要/改写/翻译)。

**复用不动**:`AIPopover`、`runAIAction`、`ai-actions.ts`、provider/stream 基础设施。

**路由判据**:`getCurrentAI()`(null = 不可用)为统一闸门。`aiEnabled` 不再用作"隐藏 AI",但仍表示"配置已启用"。计划阶段核对 `getCurrentAI()` 与 `aiEnabled` 的精确语义,保证未启用 vs 未配置 都正确落到引导卡。

### 3.3 prompt + 参数外围配置好(2c)

**现状**:`prompts.ts` 三动作(summarize / improveWriting / translate)的 system prompt 是极简英文;`ai-actions.ts` 调用时未显式设 temperature/maxTokens(走 provider 默认)。

**改为**:
- 调优 system prompt:更具体指令;输出语言跟随卡片 locale(translate 已有 targetLang;summarize/rewrite 跟随);去掉 "Here is…" 套话。
- 合理默认参数:summarize / translate 低 temp(~0.3,求稳),rewrite ~0.7(求活);maxTokens 设合理上限(避免失控长输出)。
- 设置面板加「高级」折叠:露出 temperature / maxTokens(可选填,空 = 默认)。存进 `AIConfig`(需扩字段 `temperature?` / `maxTokens?`,向后兼容)。
- `canvas-prompt.ts` 同步过一遍。

**文件**:`prompts.ts`、`ai-actions.ts`、`types.ts`(`AIConfig` 扩字段)、`ai-settings-panel.tsx`(高级折叠)、i18n。

## 四、#3 记录栏体验优化

### 4.1 唤起 / 发现(3a)

- **首屏一次性提示**:首次进 app 弹一个可关的小条「⌘⇧Space 随时记灵感」。`settings-store` 加 `seenCaptureHint: boolean` flag;关了/点过就不再弹。
- 空收件箱文案补「按 ⌘⇧Space 记下一个」(复用现有 empty state)。
- `shortcut-help-dialog.tsx` 补上捕获快捷键一行。

**文件**:`settings-store.ts`(flag)、一个首屏 hint 组件(挂在 layout 或 home)、`inbox` empty state、`shortcut-help-dialog.tsx`、i18n。

### 4.2 秒存 + 重定向(3b · 方案 A,用户已选)

**原则**:捕获永远秒存 inbox 不变(保"3 秒"),只让"去向"可见 + 可一键改。

**改动**:
- `toast-store.ts` 的 `Toast` 加可选 `actions?: { label: string; onClick: () => void }[]`。带动作的 toast 寿命延长(成功+动作 ~6s;仍可手动 dismiss)。`Toast` 渲染处(`app-menu.tsx` / toast 容器)加动作按钮样式(token 化)。
- `capture-host.tsx` 的 `onSubmit` 成功路径:用 `submit()` 返回的 `cardId` 推 success toast「✓ 已存入收件箱」+ 动作:
  - 「→ 当前画布」→ `service.moveToCanvas(cardId, {…})`(目标 = active canvas,沿用 timeline 页同款 z 计算)
  - 「→ 归档」→ `service.archive(cardId)`
  - 「打开」→ 打开该 card detail(路由/事件)
- 重定向动作失败(配额等)→ pushToast error(已有配额处理路径)。

**文件**:`toast-store.ts`、toast 渲染容器、`capture-host.tsx`、i18n。

### 4.3 UI / 交互打磨(3c)

- MiniInput:把"Enter 展开正文"从隐藏交互变成**可见 hint**(输入框下方提示);⌘↩ 提示更醒目;焦点管理顺一遍;视觉跟 capture region 红对齐。
- 不改语义(Enter 仍展开、⌘↩ 仍提交、Esc 仍取消),只改可发现性 + 视觉。

**文件**:`mini-input.tsx`、i18n。

## 五、数据流(关键路径)

**2b ✨ AI**:
```
用户点 ✨ AI  →  getCurrentAI() ?
                  ├─ null  → AiSetupCard(高亮 Ollama + 「去设置」)
                  └─ 有    → AiActionMenu(摘要/改写/翻译) → 选 → AIPopover(现有流)
```

**3b 捕获重定向**:
```
⌘⇧Space → MiniInput → submit → {cardId} → pushToast(success, actions)
                                              ├─ →画布 → service.moveToCanvas(cardId)
                                              ├─ →归档 → service.archive(cardId)
                                              └─ 打开  → open card detail
```

## 六、错误处理

- **2b**:未配置不是"错误",是**引导态**(AiSetupCard)。网络 / 配额错误仍走 AIPopover 现有 error 显示。
- **3b**:捕获本身已有配额处理(H2:失败保持 modal + 保留草稿)。重定向动作失败 → toast error。
- **toast actions**:动作执行后自动 dismiss 该 toast;失败推 error toast。

## 七、测试(TDD,每步红→绿)

- `toast-store`:新增 `actions` 字段;带动作 toast 寿命延长;动作点击触发回调。
- `AiSetupCard`:未配置时渲染、含「去设置」入口、高亮 Ollama。
- `AiActionMenu`:列出三动作;选择触发对应回调。
- `card-detail`:✨ AI 按钮**无论 aiEnabled 都可见**;未配置走 setup card,已配置走 menu。
- `prompts`:调优后的 prompt 形状(扩展现有 `prompts.test.ts`);输出语言跟随 locale。
- `capture-host`:成功 toast 携带 cardId + 三动作;重定向调用对应 service 方法(mock)。
- 首屏 hint:首次显示、dismiss 后 `seenCaptureHint` 持久、不再弹。

## 八、验证门(Definition of Done)

```bash
pnpm --filter web test       # 全绿(含新增红→绿测试,现有套件不回归)
pnpm -r lint                 # 零新增非基线错误(web ~25 fixture 基线)
pnpm --filter web build      # exit 0(静态导出)
```
- 手测:没配 AI → 看到 ✨ AI → 点 → 引导卡;配好 → 动作菜单;⌘⇧Space 捕获 → toast 带 →画布/→归档;首屏提示只弹一次。

## 九、约束(逐字遵守)

- spec `docs/specs/2026-06-19-cys-stift-design.md` 冻结不改。
- 静态导出(无 SSR / API routes / 动态路由);客户端组件标 `'use client'`。
- 颜色走 token,不写裸 hex;字体 `var(--font-mono)` 等;**6 色之内,禁止 green**。
- AI 隐私 R2 不变:不动 `AI_CARD_FIELDS` 白名单;`source.deviceId` / `media.dataUrl` / 软删除卡 / freedraw 点序列永不进 prompt;不用 vision 模型。
- packages/domain + packages/canvas-engine 零业务依赖(本轮只动 apps/web)。
- 不加用户没要求的依赖(YAGNI)。
- 不假装 build/test 通过——实际跑命令看 exit code。
