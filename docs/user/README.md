# cy's Stift — 用户指南

> 本地优先的灵感画布。灵感 3 秒记,画布上慢慢养。

---

## 这是什么

**cy's Stift** 帮你把一闪而过的想法接住。所有数据存在你自己的机器上,不上云、不锁定。

三个核心动作:

1. **捕获**(Capture)—— 任何位置按快捷键,3 秒把灵感落库
2. **整理**(Inbox / Canvas)—— inbox 编辑多媒介;canvas 把卡片摆开连成线
3. **沉淀**(Archive / Export)—— 归档已沉淀的;随时导出开放格式 JSON

---

## 捕获

### 全局快捷键

- **mac**: `⌘ + ⇧ + Space`
- **win**: `Ctrl + ⇧ + Space`
- 任意路由(首页 / inbox / canvas / archive)按下 → 屏幕中央弹出 Mini Input
- 输入标题 → `Enter` 展开 body → `⌘/Ctrl + Enter` 保存
- `Esc` 关闭(草稿保留,下次打开恢复)

### 菜单栏

顶部菜单栏的 **Capture** 按钮 —— 同样打开 Mini Input(来源标记为 `menubar`)。

### 自定义快捷键

`/settings` → Capture shortcut —— 改 modifier / shift / key。

---

## Inbox

`/inbox` —— 卡片收件箱。

- **新建**:顶部表单,标题必填,body / links / code / quotes / 图片可选
- **详情**:点卡片 → view 模式看全部;`Edit` 改 title / body / links / code / quotes / media
- **归档**:`Archive` → 卡进 `/archive`(软删,可恢复)
- **发送到画布**:`Send to canvas` → 卡出现在 `/canvas`
- **草稿**:表单输入自动保存(关闭重开恢复)

---

## Canvas

`/canvas` —— tldraw 画布。

- **双击空白** → 在该位置建卡
- **点卡** → 详情(view/edit/archive/send to canvas)
- **拖卡** → 移动位置(自动写回 DB)
- **工具条**:`grid`/`free` 切换(或按 `g`)+ 缩放 `+`/`-`/`FIT`(或 `+ - 0 1`)
- **视图持久化**:zoom / pan / gridMode 跨刷新保留

---

## Archive

`/archive` —— 归档视图。

- **网格视图**(默认):卡片墙
- **时间轴视图**:按日分组
- **多选**:`Select` → 勾选 → 浮动工具条批量 `Unarchive` / `Soft-delete`

---

## Settings

`/settings` —— 配置。

- **Capture shortcut**:改全局快捷键
- **Data → Export JSON**:导出全部数据(卡片 / 媒体 / 草稿 / 设置)为开放格式 JSON

---

## 数据与隐私

- **本地优先**:所有数据在你浏览器 `localStorage`(key 前缀 `cys-stift.*`)
- **无 server**:静态导出应用,没有 API,没有云端
- **可迁移**:随时 Export JSON;格式版本化(`version: 1`),未来 schema 变更有迁移路径
- **桌面端**:Tauri 打包后(需 Rust),数据落 `~/Library/Application Support`(mac)/ `%APPDATA%`(win)

---

## 快捷键速查

| 动作 | 快捷键 |
|---|---|
| 全局捕获 | `⌘/Ctrl + ⇧ + Space`(可改) |
| Mini Input 保存 | `⌘/Ctrl + Enter` |
| Mini Input 取消 | `Esc` |
| Canvas snap/free | `g` |
| Canvas 缩放 | `+ - 0 1` |

---

## 已知限制

- 图片存储当前用 base64 inline localStorage(soft 500KB 建议);OPFS / Tauri fs 落盘留后续
- macOS `⌘+⇧+Space` 可能被 Spotlight 系统级拦截;浏览器内仍工作
- 多画布 UI 待后续(schema 已支持)
- 云同步不在 MVP(数据已同步就绪,接入 Yjs/Automerge 留后)

---

详见 [开发文档](../development/changelog.md) + [设计 spec](../superpowers/specs/2026-06-19-cys-stift-design.md)。