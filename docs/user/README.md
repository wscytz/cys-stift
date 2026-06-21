# cy's Stift — 用户指南

> 本地优先的灵感画布。**灵感 3 秒记,画布上慢慢养**。

---

## 这是什么

**cy's Stift** 帮你把一闪而过的想法接住,在画布上自由组织。所有数据存在你自己的机器上,不上云、不锁定。

四个核心动作:

1. **捕获**(Capture)—— 任何位置按快捷键,3 秒把灵感落库
2. **整理**(Inbox / Canvas)—— inbox 编辑多媒介;canvas 把卡片摆开 + 加便签/标注/箭头连关系
3. **沉淀**(Archive / Export)—— 归档已沉淀的;随时导出开放格式 JSON
4. **共享**(本地 app)—— 桌面端可打包成 `.app` / `.dmg`,全局快捷键在后台也工作

---

## 捕获

### 全局快捷键

- **mac**: `⌘ + ⇧ + Space`
- **win/linux**: `Ctrl + ⇧ + Space`
- 任意路由(首页 / inbox / canvas / archive)按下 → 屏幕中央弹出 Mini Input
- **桌面 app 后台也工作**:切换到别的 app 后按快捷键,cy's Stift 自动唤回前台并弹出 Mini Input(不需要先切回 app)
- 输入标题 → `Enter` 展开 body → `⌘/Ctrl + Enter` 保存
- `Esc` 关闭(草稿保留,下次打开恢复)

### 菜单栏

顶部菜单栏的 **Capture** 按钮 —— 同样打开 Mini Input(来源标记为 `menubar`)。

### 搜索快捷键

`⌘/` / `Ctrl+/` —— 跳到搜索页(全文搜索所有卡片)。

### 自定义快捷键

`/settings` → Capture shortcut —— 改 modifier / shift / key。

---

## Inbox

`/inbox` —— 卡片收件箱(Active / Archived 两个标签)。

- **新建**:顶部表单,标题必填,body / links / code / quotes / 图片可选
- **详情**:点卡片 → view 模式看全部;`Edit` 改 title / body / links / code / quotes / media
- **置顶**(v0.24.0):卡片右上角 ★ 按钮 — 标为重要,列表自动置顶(所有视图一致)
- **归档**:`Archive` → 卡进 `/archive`(软删,可恢复)
- **发送到画布**:`Send to canvas` → 卡出现在 `/canvas` 的画布上
- **草稿**:表单输入自动保存(关闭重开恢复)

---

## Canvas(高自由画布,v0.26.x)

`/canvas` —— tldraw 无限画布,灵感卡 + 自由元素共存。

### 三种创建方式

1. **双击空白** → 在该位置建灵感卡(带 body 预览 + 类型标签 + pinned 黄星)
2. **底部工具栏** → 选便签/文本/矩形/椭圆/箭头/手绘/橡皮,点画布拖出
3. **键盘快捷键**:`v`/`d`/`r`/`o`/`a`/`n`/`t`/`e`(对应 8 个工具)

### 工具栏(包豪斯)

底部居中浮动,8 个 SVG 线条图标(跨平台一致渲染):

| 工具 | 快捷键 | 图标 |
|---|---|---|
| 选择 | `v` | ↖ |
| 手绘 | `d` | ✎ |
| 矩形 | `r` | ▭ |
| 椭圆 | `o` | ◯ |
| 箭头 | `a` | → |
| 便签 | `n` | ☰ |
| 文本 | `t` | T |
| 橡皮 | `e` | ⌫ |

### 箭头连接

- 选箭头工具 → 从一张**灵感卡边缘**拖到另一张 → 自动绑定两端(端点会"吸附"到 card shape)
- 自由元素之间也可以连(便签→矩形等)
- 选中箭头按 Delete 删除

### 灵感卡行为

- 渲染查 CardService(单一数据源)→ inbox 改 title/body,画布**实时更新**,不需 reload
- 拖卡 → 位置自动写回 DB
- body preview 显示卡片正文前几行(折叠式)
- pinned 卡带黄星 + 黄左边条

### 自由元素

- 形状(矩形/椭圆)/便签/文本/手绘 → 全部**持久化**(refresh 后还在)
- 灵感卡 + 自由元素在同一画布共存,无冲突
- 画布文档 snapshot 自动每 0.5 秒存(用户操作变化时)
- 视图(zoom/pan/grid)持久化与画布内容独立

### 多画布

`/canvas` 顶部画布切换器 —— 切换 / 新建 / 重命名 / 删除画布。每个画布独立文档 + 视图。

### 视图与工具

- **snap / free** 切换(`g`):snap 模式网格对齐,free 模式自由
- **缩放**:`+`/`-`/`0`(100%)/`1`(fit) + 顶部 ZoomGroup
- **视图持久化**:zoom / pan / gridMode 跨刷新保留

---

## Archive

`/archive` —— 归档视图。

- **网格视图**(默认):卡片墙
- **时间轴视图**:按日分组
- **多选**:`Select` → 勾选 → 浮动工具条批量 `Unarchive` / `Soft-delete`
- **批量软删二次确认**:误删保护(必须输入 `delete` 字面才能确认)

---

## Trash

`/trash` —— 软删除的卡(30 天内可恢复,默认永久删除需在 trash 列表操作)。

- **Restore** → 恢复卡到原 view(自动按 archived / canvasPosition 归位)
- **Delete forever** → 永久删除(二次确认 `delete` 字面)

---

## Search

`/search` —— 全路由全文搜索(title / body / links / code / quotes)。

- 实时结果(边输入边搜)
- pinned 卡结果前置
- 点击结果 → 详情 modal
- 快捷键:`⌘/` / `Ctrl+/`

---

## Settings

`/settings` —— 配置。

- **本地存储仪表盘**(v0.26.3):实时显示 localStorage 用量。**60% 黄 / 80% 红**警告 → 建议导出 JSON 备份。防"刷新全丢"的关键防线
- **Capture shortcut**:改全局快捷键
- **Language**:中/英切换,实时刷新
- **Appearance / Theme**:Light / Dark / Follow system
- **Data → Export JSON**:导出全部数据为开放格式 JSON(包含 cards / media / drafts / settings)
- **Data → Import JSON**:从 JSON 备份恢复(覆盖当前)

---

## 数据与隐私

- **本地优先**:所有数据在浏览器 `localStorage`(key 前缀 `cys-stift.*`)
- **无 server**:静态导出应用,没有 API,没有云端
- **可迁移**:随时 Export JSON;格式版本化(`version: 1`),未来 schema 变更有迁移路径
- **桌面端**(Tauri):数据落 `~/Library/Application Support/com.cys-stift.desktop/`(mac)/ `%APPDATA%/com.cys-stift.desktop/`(win)
- **存储限额**:浏览器 5-10MB(超则在 settings 仪表盘看到 + 警告)

---

## 快捷键速查

| 动作 | 快捷键 |
|---|---|
| 全局捕获(前台) | `⌘/Ctrl + ⇧ + Space` |
| 全局捕获(后台,仅桌面 app) | 同上 — Tauri 全局快捷键 |
| 搜索页 | `⌘/` / `Ctrl+/` |
| Mini Input 保存 | `⌘/Ctrl + Enter` |
| Mini Input 取消 | `Esc` |
| Canvas 工具(v/d/r/o/a/n/t/e) | 见工具栏表 |
| Canvas snap/free | `g` |
| Canvas 缩放 | `+`/`-`/`0`/`1` |
| 删除选中 shape | `Delete` / `Backspace` |

---

## 已知限制

- **图片存储**:当前用 base64 inline localStorage(单图 500KB 软警告);OPFS / Tauri fs 留后续(v0.25.x roadmap)
- **macOS 全局快捷键**:`⌘+⇧+Space` 可能被 Spotlight 系统级拦截,需在系统设置改键
- **多设备同步**:不在 MVP(数据 schema 已支持,接入 Yjs/Automerge 留后)
- **视频 / PDF / Excel**:未支持(用户搁置,等 OPFS 落地)

---

详见 [开发文档](../development/changelog.md) + [设计 spec](../superpowers/specs/2026-06-19-cys-stift-design.md)。