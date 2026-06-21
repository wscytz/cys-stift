# Phase 6.5a 视觉 + 交互对照笔记

> 截图:`docs/design/screenshots/phase-6.5a/`(6 张)
> 测试:puppeteer-core + 系统 Chrome 驱动 `apps/web` dev server(端口 3016)

---

## 结论

**Phase 6.5a 核心承诺达成(spec §5.5 "输入即保存草稿"):Mini Input + inbox CreateCardForm 任意字段变化防抖 500ms 写草稿 → 关闭/导航后重开恢复 → 提交成功(Cmd+Enter / Add to inbox)或 Clear 清除。草稿走独立 localStorage key(`cys-stift.drafts.v1`),与 cards 分离,不触发卡片列表重渲染。**

puppeteer 7/7 断言全过:
- ✓ Escape 关闭**保留**草稿(title = 草稿测试 A)
- ✓ 重开 Mini Input → 草稿恢复(title = 草稿测试 A)
- ✓ 更新成 B → 关闭 → 重开 → 最新(title = 草稿测试 B)
- ✓ Cmd+Enter 保存成功 → 草稿清除(capture present = false)
- ✓ 保存的卡进 `/inbox`(1 tile)
- ✓ CreateCardForm 输入 → 草稿保存(manual title = 表单草稿)
- ✓ 导航离开 → 回 `/inbox` → 表单草稿恢复
- ✓ 零 page error

---

## 6 张截图

| 文件 | 内容 |
|---|---|
| `01-mini-input-with-draft-a.png` | Mini Input 输入"草稿测试 A":红边 + 红条 + 标题 + 防抖 500ms 写入 localStorage |
| `02-mini-input-restored-a.png` | Escape 关闭后重开:标题"草稿测试 A"**已恢复**(autoFocus input)|
| `03-mini-input-restored-b.png` | 改成"草稿测试 B"关闭重开:最新草稿恢复 |
| `04-inbox-after-save.png` | Cmd+Enter 保存:草稿清除 + 卡进 `/inbox`(1 tile)+ 来源 manual |
| `05-form-with-draft.png` | CreateCardForm 输入"表单草稿":防抖保存,Title 字段值在 |
| `06-form-restored-after-nav.png` | 导航离开再回 `/inbox`:表单 Title"表单草稿"恢复 |

---

## 视觉契约(spec §5.5)

- [x] Mini Input 视觉不变(Phase 6 已定):居中 + 2px 红边 + 顶部 8px 红条 + Space Grotesk 标题输入
- [x] 草稿恢复**静默**(无 "restored draft" toast,保持极简)
- [x] CreateCardForm 视觉不变(Phase 3 已定)
- [x] 6 色 token / 字体 / 8px 网格 不破
- [x] `lib/draft-store.ts` + `lib/use-debounced-callback.ts` + `features/capture/` + `app/inbox/create-card-form.tsx` hex grep 零命中

---

## 关键工程决策

1. **草稿独立 localStorage key**(`cys-stift.drafts.v1`,与 `cys-stift.cards.v1` 分离):草稿变化不触发卡片列表重渲染(性能);草稿失败不影响卡片完整性。
2. **草稿不进 domain**:草稿是 web-local UI 状态,不是核心业务实体。spec §5.5 说 "SQLite + 本地状态",但浏览器端当前是 localStorage(Phase 2 决策),草稿跟 cards 走同样的 web-local 存储;Phase 8 Tauri 端草稿跟 Tauri fs 走(留后)。
3. **`Draft.payload: unknown`**:各消费方自己 cast 类型(capture = `{title, body}`,manual = 完整表单状态)。不污染 type 系统 + 不强制 domain 类型。
4. **防抖 500ms + `useDebouncedCallback` hook**:通用 hook,unmount cleanup timer;不在每次按键写 localStorage。
5. **Escape 保留 / 提交清除**:Escape 关闭不清草稿(用户可能误关);Cmd+Enter 保存成功 + Clear 显式 `draftStore.clear`。
6. **空草稿自动 clear**:所有字段空时 `draftStore.clear`(避免 stale 空记录)。
7. **snapshot 引用稳定**(同 db-client 模式):`useSyncExternalStore` 不炸。
8. **restore 用 `[ready]` deps**:hydration 后一次性填回,避免每次 draft 变化都覆盖用户输入。
9. **0 新依赖**:react + 现有组件库。
10. **CreateCardForm 改造不破坏 Phase 3 多媒介**:只加 useEffect 草稿读写 + 防抖 upsert,不动表单结构;p3 回归无 page error。

---

## 已知 / 后续

- Tauri fs 草稿落盘 → Phase 8(当前 localStorage 够用)
- 草稿版本历史 / 多草稿 → 留后(spec §5.5 单数 "草稿")
- 跨 tab 草稿同步(localStorage `storage` event)→ 留后
- 草稿手动清除按钮 → 留后(提交自动清)
- wa-sqlite 替换 localStorage → Phase 2.5

---

## 测试方式

```bash
pnpm --filter domain test   # 10 tests
pnpm --filter db test       # 7 tests
pnpm --filter web build     # exit 0,12 静态页
pnpm --filter web dev --port 3016 &
node scripts/p6.5a-shots.cjs   # 7/7 assertions pass
```
