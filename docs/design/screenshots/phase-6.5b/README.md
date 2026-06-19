# Phase 6.5b 视觉 + 交互对照笔记

> 截图:`docs/design/screenshots/phase-6.5b/`(6 张)
> 测试:puppeteer-core + 系统 Chrome 驱动 `apps/web` dev server(端口 3016)

---

## 结论

**Phase 6.5b 核心承诺达成(spec §4.2 字段完整性 + Phase 3 closeout 已知/后续):Inbox 详情 Modal 编辑模式**完整暴露** links / codeSnippets / quotes 编辑器(Phase 3 只暴露 title + body,违反 spec §4.2)。抽 `ListEditor` / `CodeEditor` / `QuoteEditor` 到 `features/card/editors.tsx` 共享切片,CreateCardForm + CardDetail 双消费。Phase 3 "intentionally not exposed (Phase 3 MVP)" hint 移除。0 新依赖。**

puppeteer 7/7 断言全过:
- ✓ View 渲染原始 links/code/quotes(草稿级断言)
- ✓ Edit mode 暴露 **3 个 editor**(.le 块各一)
- ✓ Phase 3 hint 移除
- ✓ Title 改成 "Edited title"
- ✓ Link 替换为 "https://edited.example"
- ✓ Code 加到 2 个(ts + rust)
- ✓ Quote attribution 改成 "New attribution"
- ✓ 跨刷新保留
- ✓ 零 page error

---

## 6 张截图

| 文件 | 内容 |
|---|---|
| `01-inbox-with-multi-media-card.png` | Inbox 列表:1 张多媒介卡(NOTE 红 tag + 3 MEDIA 蓝 tag)|
| `02-detail-view.png` | 详情 view:Meta + Markdown body + Links(蓝下划线) + Code(黑底)+ Quotes(红左边)|
| `03-detail-edit-mode-with-editors.png` | Edit 模式:Title Input + Body textarea + Link editor(蓝左边,× 删除)+ Code editor(ts + const a = 1)+ Quote editor(Original quote + Original author)|
| `04-detail-edit-modified.png` | 改后:Title = "Edited title" / Link = "https://edited.example" / 2 个 code(ts + rust `fn main() { println!("hi"); }`)|
| `05-detail-after-save.png` | Save 后详情 view:渲染新内容(Edited title / 新 link / 2 code)|
| `06-inbox-after-reload.png` | 跨刷新后 inbox 列表仍显示编辑后内容 |

---

## 视觉契约(spec §4.2 / Phase 3 → 6.5b 升级)

- [x] 编辑器视觉继承 Phase 3 CreateCardForm(蓝左边 / 红 × 按钮 / 蓝下划线 add)
- [x] 详情 Modal 整体视觉(Phase 3 已定)不变
- [x] 6 色 token / 字体 / 8px 网格 不破
- [x] `features/card/` + `app/inbox/` hex grep 零命中

---

## 关键工程决策

1. **editors 抽到 `features/card/editors.tsx`**:CreateCardForm + CardDetail 双消费,避免重复。
2. **editorStyles 导出共享 CSS 字符串**:每个 consumer 注入 `<style>{editorStyles}</style>`,避免在多组件堆 .le* CSS。
3. **draftLinksToPayload / draftCodesToPayload / draftQuotesToPayload**:草稿→typed payload 转换集中到 editors 模块,CreateCardForm + CardDetail 共用。
4. **`onSave` 扩 5 字段 patch**:title + body + links + codeSnippets + quotes(原 Phase 3 只传 title + body,3 类媒介走 card.*)。
5. **state 同步 useEffect deps 加 3 字段**:`[card.id, card.title, card.body, card.links, card.codeSnippets, card.quotes]` —— 打开不同卡 / 外部 update 时 5 state 全重置。
6. **`CardService.update` 白名单已含 3 字段**(Phase 3 实现,无需扩 domain);`update can swap multi-media arrays` vitest 已覆盖全 3 字段(无需新增 test)。
7. **Phase 3 hint 移除**:"Editing links / code / quotes is intentionally not exposed here (Phase 3 MVP)" 删了。
8. **Canvas CardDetailModal 不动**:Phase 4 自己的简化版 detail(只 title + body),避免触碰 tagged Phase 4;后续 P6.5+ 统一。
9. **Archive tile onClick 不接通**(P6.5b Lean 排除):不引入 query string 处理 + 静态导出 hash vs search 复杂性。
10. **0 新依赖** + **domain / db 零改动**。

---

## 已知 / 后续

- Canvas `CardDetailModal` 多媒介编辑 → 后续 P6.5+ 统一(避免触碰 tagged Phase 4)
- Archive tile onClick 接通 → 后续 P6.5+ 或独立 phase
- Edit-mode 草稿(P6.5a 草稿)→ 后续 P6.5+
- Edit 模式实时预览(Markdown)→ 留后
- Edit `<textarea>` 升级 monospace 文本编辑器 → 留后

---

## 测试方式

```bash
pnpm --filter domain test   # 10 tests
pnpm --filter db test       # 7 tests
pnpm --filter web build     # exit 0,12 静态页
pnpm --filter web dev --port 3016 &
node scripts/p6.5b-shots.cjs   # 7/7 assertions pass
```