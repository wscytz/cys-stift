# ADR-0005 · tldraw 作为画布渲染层

## 背景
画布是核心交互。需要缩放 / 平移 / 对齐 / 撤销等基础设施。

## 决策
**tldraw v3** 作为画布的渲染层 + 相机。Card 是自定义 `ShapeUtil`。**数据真相源是 SQLite 的 `cards.canvasPosition` 列**，不是 tldraw 自带 store。

## 后果
- ✅ 白板基础设施免写：缩放 / 平移 / 选中 / 撤销都现成
- ✅ 业务位置数据可被 Inbox / Archive 用 SQL 查询（不被 tldraw 黑盒挡住）
- ✅ tldraw 风险预案：仅用渲染层 + 相机，业务在自己手里，可平替
- ⚠️ 监听 tldraw `onChange` 防抖回写 DB（~300ms）——位置实时性轻微损耗
- ⚠️ tldraw 包体较大（~MB 级），首屏加载注意

状态：✅ 已设计（spec §6.3 / §6.11），Phase 4–5 落地
