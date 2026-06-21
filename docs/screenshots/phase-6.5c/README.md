# Phase 6.5c 视觉 + 交互对照笔记

> 截图:`docs/design/screenshots/phase-6.5c/`(5 张)
> 测试:puppeteer-core + 系统 Chrome 驱动 `apps/web` dev server(端口 3016)

---

## 结论

**Phase 6.5c 核心承诺达成(spec §6.3 + Phase 4 §6.11):Inbox 详情 Modal 加 "Send to canvas" 按钮 → `CardService.moveToCanvas` 设 `canvasPosition` → 卡出现在 `/canvas`(Phase 4 tldraw binding 自动渲染 Card shape)→ 跨刷新保留 → inbox 列表隐藏(spec §6.11 行为:`listInbox` 排除 canvasPosition 卡)。**

puppeteer 6/6 断言全过:
- ✓ 详情 Modal view mode 显示 "Send to canvas" 按钮
- ✓ 点击后 `card.canvasPosition = {canvasId: "default-canvas", x:100, y:100, w:200, h:80, z:0}` 写入
- ✓ 详情按钮变成 "on canvas" disabled badge
- ✓ 跳 `/canvas` tldraw 渲染 1 个 Card shape(`[class*="tl-shape"][data-shape-type="card"]`)
- ✓ 跨刷新保留(1 个 shape)
- ✓ `/inbox` 列表隐藏该卡(spec §6.11 行为,canvasPosition 卡不在 inbox)
- ✓ 零 page error

---

## 5 张截图

| 文件 | 内容 |
|---|---|
| `01-detail-with-send-button.png` | Inbox 详情 view:标题 "Send-to-canvas card" + 按钮组 [Edit] [Archive] **Send to canvas** [Soft-delete] |
| `02-detail-on-canvas.png` | Send 后详情:按钮变 disabled + "on canvas" 蓝 tag |
| `03-canvas-with-card.png` | `/canvas` 渲染 Card shape(NOTE tag + "Send-to-canvas card" 标题,白底黑边 8px 圆角)|
| `04-canvas-after-reload.png` | 跨刷新后 Card shape 仍在 |
| `05-inbox-after-send.png` | `/inbox` 列表空(spec §6.11:canvasPosition 卡不在 inbox) |

---

## 视觉契约(spec §5.3 + §6.3)

- [x] 按钮组沿用 Phase 3 inbox Modal 风格(Edit / Archive / Soft-delete 三件套 + 第四按钮 "Send to canvas")
- [x] "Send to canvas" 用 primary variant(强调)
- [x] "on canvas" 状态用蓝 tag(spec §5.2 archive→blue;canvasPosition 卡视觉一致)
- [x] Card shape 沿用 Phase 4 视觉(白底黑边 8px 圆角 + Space Grotesk 标题 + NOTE tag)
- [x] 6 色 token / 字体 / 8px 网格 不破
- [x] `app/inbox/` hex grep 零命中

---

## 关键工程决策

1. **复用 `CardService.moveToCanvas`**:Phase 2 已实现,不重写;调用时传 `CanvasPosition { canvasId, x, y, w, h, z }`。
2. **`DEFAULT_CANVAS_ID` 从 `features/canvas/default-canvas` 引用**:避免 magic string,features/canvas 单向依赖(Card → default-canvas,无反向)。
3. **z 计算 `Math.max(...existing.map(c => c.canvasPosition?.z ?? 0)) + 1`**:简单实现,避免 z 冲突;并发竞态 MVP 可接受,P6.5+ 优化。
4. **位置 x/y 用 `100 + (z % 5) * 40`**:阶梯式排布,避免多张卡重叠;后续 P6.5+ 可做智能定位。
5. **详情状态用 `service.get(id)` 更新**(不用 stale state):`onSendToCanvas` 后显式 setDetail 用新 Card 对象,触发 CardDetail re-render 显示 "on canvas" badge。
6. **`inbox` 列表隐藏 on-canvas 卡**:Phase 2 `listInbox` 真相(`!c.canvasPosition && !c.archived && !c.deletedAt`);spec §6.11 行为;**已知 UX 限制**:用户从 inbox send 后只能去 `/canvas` 找回,后续 P9 导出可补充。
7. **Canvas dblclick 路径不动**:Phase 4 实现的"画布双击建卡"路径与新路径并存,不冲突。
8. **domain / db 零改动**:`moves a card to canvas` vitest 已覆盖 listInbox / listOnCanvas 互斥断言,无需新增 test。
9. **0 新依赖**:沿用 react + `@cys-stift/ui` + 现有 service。

---

## 已知 / 后续

- **UX 限制**:inbox→canvas send 后卡从 inbox 隐藏,只能去 `/canvas` 找回;后续 P9 导出 + "All cards" 中心视图可补
- 多画布 UI(spec §4.9 schema 已支持)→ P6.5+
- "Send to canvas" 撤销动作 → 留后
- 智能定位到画布空白区 → 留后(MVP 阶梯式排布)
- Canvas dblclick 路径入 inbox 入口(画布卡返回 inbox)→ 留后
- 并发 z 计算竞态 → 留后
- inbox 详情 Modal 的 "Open on canvas" 链接(当前 "on canvas" badge 是 disabled,无 link)→ 留 P6.5+

---

## 测试方式

```bash
pnpm --filter domain test   # 10 tests
pnpm --filter db test       # 7 tests
pnpm --filter web build     # exit 0,12 静态页
pnpm --filter web dev --port 3016 &
node scripts/p6.5c-shots.cjs   # 6/6 assertions pass
```