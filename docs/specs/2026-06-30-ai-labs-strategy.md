# AI 实验室分层策略 — 设计契约

> 2026-06-30 · 状态:草案待审
> 范围:AI 能力分层(默认开 vs 实验室)+ 实验室基础设施扩展 + 新实验室规划。

## 1. 动机

AI 能力越来越多,混在一起会出现两类问题:
- **用户被自动改数据**:破坏性 AI(合并/删卡/自动建卡)若默认开,用户可能不知情丢数据。
- **隐私升级无感**:某些能力需发比 allowlist 更敏感的数据(如 media.dataUrl),用户该显式同意。

需要一套**分层策略 + 实验室基础设施**:默认能力零门槛可用(产品核心承诺),实验室能力默认关 + 确认门 + 代码守卫(用户显式接受风险)。

## 2. 分层判据

进实验室的四个信号(命中任一即进实验室):

1. **隐私升级** — 发比 allowlist 更敏感的数据(如 media.dataUrl / 全量卡片正文)
2. **自动副作用不可控** — AI 不经用户逐次确认直接改数据
3. **破坏性** — 可能删/合并/覆盖用户数据
4. **新颖不稳定** — 输出不可预测、可能误导用户

**默认开**的反向判据:只读 allowlist + 用户确认/可撤销 + 稳定 + 符合核心承诺。

**永不做**(无论是否实验室):违背 R2 铁律(deviceId / apiKey / 软删卡进 prompt)。

## 3. 分层表

### 默认开(已稳定)

| 能力 | 现状 | 理由 |
|---|---|---|
| 卡片 summarize/rewrite/translate | ✅ | 只读 allowlist + 用户存盘确认 |
| AI 排版 | ✅ | 主动触发 + 诊断反馈 + 可撤销 |
| AI cluster 找相似 | ✅ | 只加关系不删卡 + 可撤销 |
| AI 关系候选推荐 | ✅ | 只读 + 一键建确认 |
| /ask agent | ✅ | DSL 提议 + 确认门(不直接改) |
| auto-relate(本地关键词) | ✅ | 纯本地零 AI |

### 实验室(默认关 + 确认门 + 代码守卫)

| 能力 | 现状 | 进实验室信号 | 风险说明 |
|---|---|---|---|
| vision(看图/OCR/画布视觉/图转 DSL) | 🟡骨架 | 隐私升级 | media.dataUrl 进 prompt,可能外发图片二进制 |
| AI 自动整理(归类/合并近重复卡) | 🔴规划 | 破坏性 + 自动副作用 | AI 可能合并/删除卡,数据丢失风险 |
| AI 自动建卡(对话/剪贴板生成卡) | 🔴规划 | 自动副作用 + 不可预测 | AI 自动生成内容,可能产生垃圾卡 |
| AI 自动打标签 | 🔴规划 | 自动副作用 | 自动改卡片 tags,低破坏但仍自动改 |
| /ask tool-calling 主动检索 | 🔴规划 | 不可预测 + 多轮外发 | AI 主动多轮查卡,token 不可控 |

### 默认开(规划中,稳定后)

| 能力 | 现状 | 理由 |
|---|---|---|
| /ask 画布侧边栏 | 🔴二期 | 同 /ask 确认门机制 |
| 对话持久化/历史摘要 | 🔴二期 | 纯实现,无隐私增量 |

## 4. 实验室基础设施设计

### 4.1 labs 类型扩展

`settings.labs` 从单字段扩展为多实验室对象:

```ts
labs?: {
  visionLab?: boolean
  autoCurateLab?: boolean
  autoCaptureLab?: boolean
  autoTagLab?: boolean
  agentToolCallingLab?: boolean
}
```

向后兼容:旧 settings 无字段 → 默认全关(labs = {})。

### 4.2 统一守卫 hook

每个 lab 一个 `useXxxLabEnabled()` hook(复刻 `useVisionLabEnabled` 模式),代码层守卫 — 关时路径完全不可达(非仅 UI 隐藏):

```ts
export function useLabEnabled(lab: LabId): boolean {
  const settings = useSettings()
  return Boolean(settings.labs?.[lab])
}
```

统一 `useLabEnabled(labId)` 替代每 lab 一个 hook(减少重复)。`LabId` 联合类型约束合法 id。

### 4.3 /settings 实验室区统一渲染

一个 `<LabToggle lab={...} />` 组件,每个 lab:
- 标题 + 一句话说明
- **风险说明**(开启会发生什么 + 可能的副作用)
- 开关 + **不可撤销确认门**(首次开启弹确认,说明「此功能可能 X,确认开启?」)
- 关闭即时生效

### 4.4 实验室注册表

集中定义所有实验室的元数据(避免散落):

```ts
const LAB_REGISTRY: Record<LabId, LabMeta> = {
  visionLab: { title, riskNote, confirmMessage },
  autoCurateLab: { ... },
  ...
}
```

`<LabToggle>` 从注册表读元数据渲染。新加 lab 只改注册表 + 类型,不改 UI。

## 5. 实施顺序

1. **基础设施**(L-T1):labs 类型扩展 + `useLabEnabled` hook + `LAB_REGISTRY` + `<LabToggle>` 组件 + /settings 实验室区改造(把现有 visionLab 迁到统一框架)
2. **autoCurateLab**(L-T2):AI 自动整理 — 实验室第一个新功能。价值最高(灵感攒多必须整理),破坏性所以必须实验室 + 确认门 + 可撤销。
3. **autoTagLab**(L-T3):AI 自动打标签 — 低风险高价值。
4. **agentToolCallingLab**(L-T4):/ask tool-calling 升级 — 等 /ask 真用稳了再做。
5. **autoCaptureLab**(L-T5):AI 自动建卡 — 最激进,最后做。

## 6. 验收(基础设施 L-T1)

- [ ] labs 类型支持多字段,向后兼容
- [ ] `useLabEnabled(labId)` 守卫生效(关时路径不可达)
- [ ] `<LabToggle>` 从注册表渲染,新 lab 只改注册表
- [ ] 现有 visionLab 迁到统一框架,行为不变
- [ ] 每个实验室有风险说明 + 确认门
- [ ] build exit 0 + 全量测试绿

## 7. 风险

- **实验室功能本身的 R2**:即使进实验室,R2 铁律不变(deviceId/apiKey/软删卡永不发)。实验室只放宽「默认 allowlist」之外的**用户显式同意的**数据(如 vision 的 media.dataUrl),且每种放宽单独守卫。
- **autoCurate 破坏性**:合并/删卡前必须可撤销(进 undo 历史)+ 确认门 + 软删而非硬删(可从回收站恢复)。
- **实验室滥用**:避免「什么功能都往实验室塞」——默认开是产品承诺,实验室是例外。每个实验室功能定期 review 是否稳定后转默认开。
