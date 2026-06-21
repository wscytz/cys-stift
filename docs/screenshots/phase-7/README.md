# Phase 7 视觉 + 交互对照笔记

> 截图:`docs/design/screenshots/phase-7/`(8 张)
> 测试:puppeteer-core + 系统 Chrome 驱动 `apps/web` dev server(端口 3016)

---

## 结论

**Phase 7 核心承诺达成(spec §5.4 + §8 "Archive"):`/archive` production 路由,顶部 8px 蓝条 Toolbar(`region="archive"`)。网格视图(默认)+ 时间轴视图(按 `updatedAt` 按日分组)双视图。多选模式 + 浮动工具条批量 unarchive / soft-delete。所有操作走 `CardService` 不绕开 domain。**

puppeteer 8/8 断言全过:
- ✓ 首页有 Archive 入口(蓝 region 条)
- ✓ `/archive` 空态:`No archived cards.`
- ✓ 网格视图显示 2 张归档卡(蓝条 tile)
- ✓ 时间轴视图按日分组(day label = `2026-06-19`)
- ✓ 多选激活后 checkbox 显示(2 个)
- ✓ 浮动工具条出现,标签 `2 selected`
- ✓ 批量 Unarchive 后 archived count = 0,卡回到 `/inbox`
- ✓ `/inbox` 显示全部 3 张卡(批量还原正确)
- ✓ 零 page error

---

## 8 张截图

| 文件 | 内容 |
|---|---|
| `01-home-with-archive-entry.png` | 首页 nav 四入口:Capture(红)/ Inbox(红箭头)/ Canvas(黑)/ **Archive(蓝)** ← 新增 |
| `02-archive-empty.png` | `/archive` 空态:蓝 64×8 region 条 + `archive` eyebrow + `No archived cards.` 标题 |
| `03-archive-grid.png` | 网格视图:顶部蓝 Toolbar + 面包屑 + grid/timeline tab + 2 张蓝条 tile(NOTE 蓝 tag + media 红 tag) |
| `04-archive-timeline.png` | 时间轴视图:日分组标题 `2026-06-19` + 行式卡片(横向:蓝条 + 标题 + meta) |
| `05-archive-multi-select.png` | 多选激活:checkbox 显示 + 选中态 2px 蓝边框 + 黑底白字浮动工具条 `2 SELECTED` + Unarchive/Soft-delete/Clear |
| `06-archive-after-unarchive.png` | 批量 Unarchive 后:归档空态(`archived=0`),浮动工具条消失 |
| `07-inbox-after-bulk-unarchive.png` | `/inbox` 显示 3 张卡(2 张批量还原 + 1 张从没归档)|
| `08-archive-mobile-grid.png` | 390px 视口:网格自适应单列 |

---

## 视觉契约逐项打勾(spec §5.2 / §5.3 / §5.4)

- [x] **8px 蓝条** 顶部 Toolbar(`region="archive"` → `--color-blue`)
- [x] **8px 蓝条** 卡片 Tile 左侧(与 inbox 红条区分,§5.2 archive→blue)
- [x] 网格视图:`auto-fill, minmax(280px, 1fr)`(沿用 inbox)
- [x] 时间轴视图:日分组 + 行式卡片
- [x] 多选:checkbox + 选中态蓝边框 + 浮动工具条(黑底白字)
- [x] 6 色 token:`--color-blue`(archive)/ `--color-red`(media tag)/ `--color-black`(floater)/ `--color-white`(tile 底)/ `--color-gray`(meta / label)/ `--color-gray-soft`(分隔)
- [x] 字体:Space Grotesk(tile title / floater label 显示)/ Inter(body)/ JetBrains Mono(crumbs / tab / time / label)
- [x] 8px 节奏:`--space-1` ~ `--space-5` 间距 token,无写死 px
- [x] 边框:tile `--border-hairline` 1px;选中态升 2px
- [x] `features/archive/` + `app/archive/` hex grep **零命中**

---

## 关键工程决策

1. **`features/archive/` 切片干净**:仅 `archive-card-tile.tsx`(tile + row variant)+ `timeline.tsx`(日分组);路由 `app/archive/page.tsx` 持有状态;不触碰 tagged Phase 3 `inbox/page.tsx`(只读引用,未改)。
2. **复用 `CardService` 已有方法**:archive/unarchive/softDelete 全是 Phase 2/3 已实现 + vitest 覆盖。Phase 7 **domain / db 零改动**,纯 web 层新增。
3. **Tile + Row 双 variant 共用一个组件**:`ArchiveCardTile` 用 `variant` prop 切换视觉(网格横向卡片 vs 时间轴行式),共用蓝条/meta/选中态逻辑。避免两个组件重复 CSS。
4. **多选 Set 状态**:`Set<CardId>` + 不可变更新(`new Set(prev)` 删/加);切换 selectMode / 批量操作后 `clearSelected()` 防泄漏。
5. **浮动工具条 z-index 50** < CaptureHost Mini Input 200 < Modal 100 同级;打开 Modal 时浮动工具条在底层无影响(它只在 selectMode + selected.size>0 显示,与 Modal 互斥)。
6. **时间轴日分组用 UTC ISO date**:`updatedAt.toISOString().slice(0,10)` 永远 UTC,避免本地时区偏移造成同卡不同日;UI 显示同 UTC(P9 暴露本地时区选项)。
7. **批量 soft-delete 不二次确认**(Phase 7 Lean):软删只标 `deletedAt`,DB 不真删(`listAll` 还能查到);P9 导出前再加二次确认交互。
8. **Archive 不开 detail modal**:避免复制 inbox `CardDetail`(tagged Phase 3);用户归档后想编辑 → unarchive 回 inbox。tile onClick 当前 no-op(留位,P6.5b 抽 `features/card/` 后统一)。
9. **首页 Archive 入口用蓝箭头**:`home__nav-link--archive` 复用 `home__nav-link` 网格 + 覆盖 arrow 背景为蓝 + hover 阴影蓝,与 inbox 红 / canvas 黑 三色分明。
10. **0 新依赖**:沿用 react + `@cys-stift/ui`(Toolbar/Tag/Button/Card)+ domain + Phase 1-3 全组件。

---

## 已知 / 后续

- Archive tile 点击 no-op(无 detail modal)→ P6.5b 抽 `features/card/` 共享 detail modal 后接通
- 批量软删无二次确认 → P9 JSON 导出前补
- 时间轴日分组固定 UTC → P9 暴露本地时区
- 标签 / 全文搜索 / 按媒介类型分组 → 留 P6.5+ 或 P9
- Archive 卡片入画布 → P6.5c inbox→canvas send 的反向复用

---

## 测试方式

```bash
# 1. 单元测试(domain + db 零改动,复用已有)
pnpm --filter domain test   # 10 tests
pnpm --filter db test       # 7 tests

# 2. 静态导出
pnpm --filter web build     # exit 0,12 静态页(新增 /archive)

# 3. puppeteer 交互断言(需 dev server 在 :3016)
pnpm --filter web dev --port 3016 &
node scripts/p7-shots.cjs   # 8/8 assertions pass
```
