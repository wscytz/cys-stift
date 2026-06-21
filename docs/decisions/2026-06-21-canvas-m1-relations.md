# 2026-06-21 · v0.27.0-canvas-m1-relations

> 来源: [`docs/reviews/2026-06-21-canvas-deep-review.md`](../../reviews/2026-06-21-canvas-deep-review.md) "M1 最小可行" 段。给 tldraw arrow 加语义关系类型,卡片显示连接数。

## 设计

关系类型(blocks / references / derived-from / related-to)只映射到 tldraw arrow 的**原生** props:`color` / `dash` / `arrowheadEnd` / `labelColor`。**不 fork tldraw、不加持久化层** —— 所有视觉都在 arrow record 里,F1.5 snapshot(canvas-editor.tsx:147-155)已在自动保存。

类型回填:`inferRelationType` 按 arrow 当前 props 反查 registry;用户手动改色则匹配不到 → 面板显示无高亮(= custom)。

**`applyRelationType` 不写 `richText` label**:tldraw 3.15 的 arrow `richText` prop 拒绝通过 `updateShape` 部分更新(validator 报 `Unexpected property`,schema 在 3.15.6 是 create-only)。Label 由面板按钮文本 + `inferRelationType` 反查承担(用户总能看见当前类型名)。后续若需要 arrow 上的可见 label,用 `editor.createArrow({ ..., label: toRichText(...) })` 重建。

## 交付

- `relation-types.ts`:4 内置类型 registry + `applyRelationType`(一次 updateShape)+ `inferRelationType`(反查)
- `relation-panel.tsx`:选中单个 arrow 时浮出 4 类型按钮,`useValue` 响应选择,按钮加 `data-relation-id` 便于 e2e 选择器
- `card-shape-util.tsx`:卡片左下角 `× N` 徽标(N = `getBindingsToShape(cardId,'arrow')` distinct arrow 数)
- `canvas/page.tsx`:挂 `<RelationPanel>`
- i18n:`relation.*` 双语 key
- e2e:`scripts/m1-relations-shots.cjs`(两卡+绑定箭头+选 Blocks+reload 持久 + 徽标 + infer 反查,8/8)

## 验证中遇到的真问题(留备忘)

1. tldraw 3.15 arrow `richText` prop 不可 partial update(`updateShape` 报 schema 错)。**解决**:不写 richText,视觉签名足够。
2. e2e 按钮点击无反应。**根因**:i18n 默认 `zh`,按钮渲染为 `阻塞`,e2e 用英文 `Blocks` 选择 → 找不到按钮。**解决**:按钮加 `data-relation-id="blocks"` 数据属性,e2e 与 locale 解耦。
3. tldraw 3.15 arrow 不允许在 `start`/`end` props 里直接挂 binding 对象(validator 报 `props.start.type: Unexpected property`)。**解决**:先 `createShape` 建普通 arrow,再用 `editor.createBinding({ type:'arrow', fromId, toId, props: { terminal, normalizedAnchor, isPrecise, isExact, snap } })` 分别绑两端。

## 不做(显式 out-of-scope)

- 基数标记(1/N)、一对多箭头束、按关系类型手势 —— tldraw schema 不支持,需 fork(review 明列阻塞项)
- 关系类型用户自定义(YAGNI;4 内置够 MVP)
- arrow 上的可见 richText label(3.15 schema 限制,改用 panel 按钮文本 + 反查)
- pinned ★ 与徽标右下角重叠 —— 徽标已挪左下避免冲突

## 验收

- domain 26/26 + db 7/7 + web build exit 0
- e2e:8 passed, 0 failed(两卡+绑定+Blocks 点击+徽标+reload 视觉持久+反查高亮)
