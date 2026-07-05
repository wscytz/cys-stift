# cy's Stift — 用户指南

> 本地优先的灵感画布。**你的灵感,在画布上生长**。

---

## 这是什么

**cy's Stift** 帮你把一闪而过的想法接住,在画布上自由组织。所有数据存在你自己的机器上,不上云、不锁定。

四个核心动作:

1. **捕获**(Capture)—— 任何位置按快捷键,3 秒把灵感落库
2. **整理**(Inbox / Canvas / Workbench)—— inbox 编辑多媒介;canvas 把卡片摆开 + 加便签/标注/箭头连关系;工作台给单卡一个深度编辑空间
3. **沉淀**(Archive / Export)—— 归档已沉淀的;随时导出开放格式 JSON
4. **共享**(本地 app)—— 桌面端打包 `.app` / `.dmg`(mac)/ `.exe`(win),安卓 `.apk`;桌面全局快捷键后台也工作

---

## 捕获

### 全局快捷键

- **mac**: `⌘ + ⇧ + Space`
- **win/linux**: `Ctrl + ⇧ + Space`
- 任意路由(首页 / inbox / canvas / archive)按下 → 屏幕中央弹出 Mini Input
- **桌面 app 后台也工作**:切换到别的 app 后按快捷键,cy's Stift 自动唤回前台并弹出 Mini Input(不需要先切回 app;安卓无系统全局热键,走 AppMenu)
- 输入标题 → `Enter` 展开 body → `⌘/Ctrl + Enter` 保存
- `Esc` 关闭(草稿保留,下次打开恢复)

### 菜单栏

顶部菜单栏的 **Capture** 按钮 —— 同样打开 Mini Input(来源标记为 `menubar`)。

### 搜索快捷键

`⌘/` / `Ctrl+/` —— 跳到搜索页(全文搜索所有卡片)。

### 自定义快捷键

`/settings` → Capture shortcut —— 改 modifier / shift / key(桌面)。

---

## Inbox

`/inbox` —— 卡片收件箱(Active / Archived 两个标签)。

- **新建**:顶部表单,标题必填,body / links / code / quotes / 图片可选
- **详情**:点卡片 → view 模式看全部;`Edit` 改 title / body / links / code / quotes / media
- **置顶**:卡片右上角 ★ 按钮 — 标为重要,列表自动置顶(所有视图一致)
- **归档**:`Archive` → 卡进 `/archive`(软删,可恢复)
- **发送到画布**:`Send to canvas` → 卡出现在 `/canvas` 的画布上
- **草稿**:表单输入自动保存(关闭重开恢复)

---

## Canvas(高自由画布)

`/canvas` —— 自研 Canvas 2D 无限画布,灵感卡 + 自由元素共存。

### 三种创建方式

1. **双击空白** → 在该位置建灵感卡(带 body 预览 + 类型标签 + pinned 黄星)
2. **底部工具栏** → 选工具(选择/手绘/文本/连接/橡皮),点画布拖出
3. **键盘快捷键**:`v`/`p`/`t`/`c`/`e`(对应 5 个工具)

### 工具栏(包豪斯)

底部居中浮动,5 个 SVG 线条图标(跨平台一致渲染):

| 工具 | 快捷键 | 图标 |
|---|---|---|
| 选择 | `v` | ↖ |
| 手绘 | `p` | ✎ |
| 文本 | `t` | T |
| 连接 | `c` | → |
| 橡皮 | `e` | ⌫ |

> **矩形 / 箭头怎么画?** 用**手绘**工具画一笔,系统自动识别(置信度高时弹「转为矩形 / 转为箭头」按钮)。画什么像什么,一笔成形 —— 手绘存储时还会自动 RDP 简化 + 贝塞尔平滑(存储/导出瘦身,五视图一致)。

### 箭头连接

- 选**连接**工具 → 从一张**灵感卡边缘**拖到另一张 → 自动绑定两端(端点会"吸附"到 card)
- 自由元素之间也可以连
- 选中箭头按 Delete 删除

### 灵感卡行为

- 渲染查 CardService(单一数据源)→ inbox 改 title/body,画布**实时更新**,不需 reload
- 拖卡 → 位置自动写回 DB
- body preview 显示卡片正文前几行(折叠式)
- pinned 卡带黄星 + 黄左边条

### 自由元素

- 文本 / 手绘 → 全部**持久化**(refresh 后还在)
- 灵感卡 + 自由元素在同一画布共存,无冲突
- 画布文档 snapshot 自动存(用户操作变化时)
- 视图(zoom/pan/grid)持久化与画布内容独立

### 多画布

`/canvas` 顶部画布切换器 —— 切换 / 新建 / 重命名 / 删除画布。每个画布独立文档 + 视图。

### 视图与工具

- **snap / free** 切换(`g`):snap 模式网格对齐,free 模式自由
- **缩放**:`+`/`-`/`0`(100%)/`1`(fit) + 顶部 ZoomGroup
- **视图持久化**:zoom / pan / gridMode 跨刷新保留

### 专业布局工具

- **对齐分布**:选中 ≥2 元素,浮动工具条 9 操作(左/中/右/上/中/下对齐 + 水平/垂直均分)。单步可 undo
- **自动布局**:工具栏 **⇅** 按钮 → dagre 分层布局。选中 ≥2 卡局部布局,否则整张画布。环自动断开,freeform 不参与
- **整理范式**:策略(思维导图/流程图/网格/紧凑)× 方向 × 间距,一键应用
- **焦点模式**:`⌘.` 隐藏画布 chrome(工具栏/侧栏/面板),只留画布与退出按钮;`Esc` 退出。深度工作免干扰
- **模板**:侧栏模板入口,4 预设 + 自建。模板即 DSL 文本,**📥 导入**按钮可粘贴名字 + DSL 建自定义模板(跨设备文字迁移)

### Frame

- **frame** 是底层容器元素(几何包含语义,契合语义关系身份),走 DSL / Outline / 侧栏「框住选中」按钮创建
- **双击 frame 空白边框区** → 重命名

### 进阶:转义(画布 ↔ 文字 DSL)

画布不只能用鼠标改——**整张画布能压成一段文字,文字也能反向改画布**。所以任何 AI(或任何人)读写一段文字就能驱动画布编辑。

- 工具栏 **「DSL」按钮** → 模态看 / 编 / 应用画布文本(不门控 AI,所有用户可用)
- AI 排版按钮:把画布文字喂 AI,AI 回一段 DSL 自动重排
- 复制 DSL 跨实例粘贴 = 交换格式

完整语法 + 价值演示 + 边界见 **[转义手册](transliteration.md)**。

---

## Workbench(工作台 · per-card 深度编辑)

`/workbench` —— 单卡深度编辑空间。inbox 的 CardDetailModal 适合快速改;工作台给长文 / 复杂修改一个沉浸式空间。

- **库页**:默认画布 / 自定义标签 / 堆叠分区,快速跳到要编辑的卡
- **编辑器**:富 Markdown 编辑器(toolbar + split 预览,GFM 表格 / 任务列表 / 代码高亮 / 数学公式 / 脚注 实时预览)
- **画布侧 dock**:画布展开工作台 dock,不用离开画布就能深度编辑当前卡
- **专注编辑态**:dock 头部 **⤢** 按钮 → 编辑器撑满,画布缩成可拖拽 / 可收起的浮 minimap 预览(收起剩一个小角不碍事)。给长文全屏沉浸空间,画布仍作被动参考常驻一角;再按 ⤢ 退出

---

## Markdown 渲染(卡片 body)

卡片 body 支持完整 Markdown 渲染(inbox 详情 / canvas 卡片 / 工作台编辑器预览三处一致):

- **GFM**:表格 / 任务列表 checkbox / 删除线 / 自动链接
- **代码高亮**:Bauhaus 语法主题(黑底白字代码块 + 彩色关键字)
- **数学公式**:`$inline$` 行内 + `$$display$$` 独立块(katex 渲染,字体本地打包不走 CDN)
- **脚注**:`[^1]` 引用号 + 文末脚注区
- **块引用**:`((标题))` 嵌入另一张卡的正文(环检测 + 找不到时显 missing 标记)

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

## 命令面板(⌘K)

`⌘K` 全局面板,快速跳转 + 搜卡。

- **空输入**:显示跳转项(各路由)+ **最近编辑**(按更新时间倒序前 8)
- **有输入**:跳转项 includes 过滤 + 卡片搜索前 8
- **点最近编辑/搜索结果智能开卡**:卡在画布 → 跳 `/canvas/?card=ID` 居中 + 选中 + 开详情;不在画布(inbox)→ 开详情 modal

---

## Graph(全局图谱)

`/graph` —— 跨所有画布的语义关系图谱。d3-force 力导向布局,双链 `[[]]` 与手画的关系 arrow 都在这里聚合成知识网络。每条边按关系类型显示语义三维签名(线型 + 箭头形 + 颜色)。

---

## 标签墙(`/tags`)

`/tags` —— 标签云 + 卡网格。10 色固定调色板,点标签看该标签下所有卡。

---

## Timeline(时间线)

`/timeline` —— 全局本地视图,跨 inbox/canvas/archive 所有非删除卡按 `capturedAt`(想法诞生时间)倒序 + 按捕获日分组。每张卡带「现在在哪」徽标(inbox / 在画布X / 已归档)。

---

## Settings

`/settings` —— 配置。

- **本地存储仪表盘**:实时显示 localStorage 用量。**60% 黄 / 80% 红**警告 → 建议导出 JSON 备份。防"刷新全丢"的关键防线
- **Capture shortcut**:改全局快捷键(桌面)
- **Language**:中/英切换,实时刷新
- **Appearance / Theme**:Light / Dark / Follow system
- **AI provider**:OpenAI / Anthropic / DeepSeek / Ollama(本地)等多 provider + 多 profile
- **实验室区**:vision / autoCurate / autoTag / autoCapture / agentToolCalling 五个实验室,默认关,确认门 + 守卫
- **Data → Export JSON**:导出全部数据为开放格式 JSON(包含 cards / media / drafts / settings / canvases / freeform 几何)
- **Data → Import JSON**:从 JSON 备份恢复(覆盖当前,二次确认)

---

## 数据与隐私

- **本地优先**:所有数据在客户端(Web:浏览器 localStorage + OPFS;桌面:Tauri 落盘)
- **无 server**:静态导出应用,没有 API,没有云端
- **可迁移**:随时 Export JSON;格式版本化,未来 schema 变更有迁移路径
- **桌面端**(Tauri):数据落 `~/Library/Application Support/com.cys-stift.desktop/`(mac)/ `%APPDATA%/com.cys-stift.desktop/`(win)
- **AI 隐私**:AI 只看显式 allowlist 的卡片字段;`source.deviceId` / `media.dataUrl` / 软删除卡 永不进 prompt(见 [隐私说明](privacy.md))

---

## 快捷键速查

| 动作 | 快捷键 |
|---|---|
| 全局捕获(桌面前台/后台) | `⌘/Ctrl + ⇧ + Space` |
| 搜索页 | `⌘/` / `Ctrl+/` |
| 命令面板 | `⌘K` |
| Mini Input 保存 | `⌘/Ctrl + Enter` |
| Mini Input 取消 | `Esc` |
| Canvas 工具(v/p/t/c/e) | 见工具栏表 |
| Canvas snap/free | `g` |
| Canvas 缩放 | `+`/`-`/`0`/`1` |
| Canvas 焦点模式 | `⌘.` |
| 删除选中 shape | `Delete` / `Backspace` |

---

## 已知限制

- **macOS 全局快捷键**:`⌘+⇧+Space` 可能被 Spotlight 系统级拦截,需在系统设置改键
- **安卓全局快捷键**:安卓无系统级全局热键概念,捕获走 AppMenu
- **多设备同步**:不在 MVP(数据 schema 已支持,接入 Yjs/Automerge 留后)
- **视频 / PDF / Excel**:未支持(用户搁置)

---

详见 [开发文档](../changelog.md) + [设计 spec](../specs/2026-06-19-cys-stift-design.md)。
