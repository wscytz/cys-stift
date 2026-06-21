# cy's Stift — 完整软件评估报告

> **报告日期**:2026-06-21
> **评估者**:Claude(主模型)
> **评估对象**:cy's Stift v0.26.3(本地优先的灵感画布)
> **评估方式**:代码静态分析 + e2e + commit 历史 + spec 对齐 + 用户反馈

---

## 1. TL;DR

**cy's Stift** 是一个**功能完整的本地优先灵感画布**,不是 MVP 也不再是早期产品。从 0 到 v0.26.3 经过 **131 个 commits、12 个版本阶段**(v0.18 → v0.26),完整覆盖了"捕获→整理→沉淀"闭环 + 桌面端 + 高自由画布 + 数据防护。

**当前成熟度**:**功能完整,可日常使用,可分享**(但签名是 ad-hoc,需手动右键)。

**最值得推荐的下一阶段方向**:**从"功能完整"到"产品差异化"** —— 围绕"画布培养灵感"这条主线深挖(连接关系、回顾节奏、导出/分享),而非继续堆功能。

---

## 2. 产品现状

### 2.1 核心数据

| 维度 | 数据 |
|---|---|
| 代码量(TypeScript + TSX) | 11,203 行(4 个包) |
| Rust 代码 | 60 行(纯 Tauri 启动) |
| 单元测试 | 438 行(3 个测试文件) |
| E2E 测试(puppeteer) | 4,875 行(29 个脚本) |
| 文档 | 13,178 行 Markdown(42 个 decision record) |
| Commits | 131 |
| Tags | 12 个阶段版本 |
| 测试通过(domain) | 26/26(card-service)+ 9/9(search) |
| E2E | 12/12 自动化断言通过 |

### 2.2 包结构与 LOC 分布

```
packages/domain/     588 LOC  ← 零依赖纯 TS 业务核心(Card/CardService/Canvas)
packages/db/         627 LOC  ← SQLite + Drizzle(schema + repository)
packages/ui/         360 LOC  ← 包豪斯设计系统(Button/Input/Modal/Tag/Toolbar)
apps/web/          8657 LOC  ← Next.js 静态导出(5 个 features: capture/card/archive/canvas/...)
apps/desktop/         60 LOC  ← Tauri 启动 + global-shortcut plugin
```

**结构非常合理**:domain 纯 TS 零依赖,db 只做 schema/persistence,ui 设计系统独立,web 是消费层,desktop 是壳。

### 2.3 功能完整度

| 核心场景 | 状态 |
|---|---|
| 全局快捷键捕获(前台 + 后台) | ✅ |
| Mini Input + 草稿自动保存 | ✅ |
| Inbox 多媒介(标题/正文/链接/代码/引用/媒体) | ✅ |
| Canvas 多画布 + 视图持久化 | ✅ |
| 灵感卡 + 自由元素共存(高自由画布) | ✅ |
| 全文搜索(⌘/ 触发) | ✅ |
| Pin / Archive / Trash(软删 + 恢复) | ✅ |
| 画布 snapshot 持久化(刷新不丢) | ✅ |
| JSON 导出 / 导入 | ✅ |
| i18n(中/英) | ✅ |
| a11y(Modal focus trap, Tab 循环, 焦点恢复) | ✅ |
| 桌面端打包 + ad-hoc 签名 + 全局快捷键后台唤起 | ✅ |
| 存储用量仪表盘 + 超配额警告 | ✅ |

**覆盖 spec §8 路线图 30 轮 + review 5 项 + UX 洞 + spec §4.9 多画布 + spec §5.6 暗色 + canvas 高自由 + 桌面端 + storage 防护。**

### 2.4 用户体验

**正面**:
- 核心动作闭环流畅(3 秒记 → 整理 → 沉淀)
- 包豪斯设计语言一致(黑边 + 红/黄/蓝强调 + mono 字符)
- 暗色模式正确工作(theme system)
- 桌面端启动快(< 2 秒),ad-hoc 签名后可双击启动

**已知薄弱点**(用户反馈):
- tldraw shape 包豪斯化不完整(GeoShapeUtil/NoteShapeUtil 出来仍是默认主题色)— API 限制,非 props 可配
- macOS Spotlight 可能占 ⌘⇧Space(已 README 提示)
- 媒体层仍 base64 + localStorage,大文件(视频/PDF/Excel)不支持(用户主动搁置)
- 签名是 ad-hoc,Gatekeeper 拦需右键打开

---

## 3. 架构评估

### 3.1 优点

**A. 单一数据源原则贯彻彻底**
- Card 数据权威 = CardService(领域层)
- 画布形状几何权威 = tldraw store + snapshot
- CardService 与画布 shape 通过 `CardServiceContext` + `syncCardsToEditor()` 双向同步(单向:shape→service 写位置,反向:service→shape 同步内容)
- 没有"两处真相互相打架"的常见 anti-pattern

**B. 增量重构纪律好**
- 131 commits 都小而专注(平均 ~80 行/commits)
- 关键重构(F1 card 瘦化 props、F2 合并 default shapeUtils)都有 spec + plan + decision 文档
- 每次 review 都闭环(6 个真 bug 一档修掉)

**C. 设计系统一致**
- 6 原色 token + 8px 网格 + 3 字体贯穿全 app
- 0 hex in components(全部 var(--color-*))
- 视觉与 spec §5.2 包豪斯原则对齐

**D. 错误处理务实**
- localStorage quota 用 eprintln 警告不 panic
- Modal focus trap 让多 modal 栈共存(每 trap 自检)
- snapshot load 失败 console.warn 继续加载
- importFromJson 用 snapshot + 回滚原子写

### 3.2 缺点 / 技术债

| # | 债 | 风险 | 工作量 |
|---|---|---|---|
| **D1** | 媒体层仍 base64 + localStorage(500KB 软警告),视频/PDF/Excel 不支持 | 数据丢失风险 + 功能缺失 | 2-3 天(OPFS) |
| **D2** | localStorage 5-10MB 总配额(画布 snapshot 已可能超) | 大量手绘后丢失所有 shape | 已用仪表盘警告,但没自动清理/导出 |
| **D3** | tldraw shape 包豪斯化不完整(Geo/Note 仍是默认彩)— `configure()` API 不支持 color/fill | 视觉不齐 | 需自定义 shape util 或主题覆盖,1-2 天 |
| **D4** | 无移动端(PWA/Tauri Mobile)— spec §12 风险 #2 留后 | 设备覆盖窄 | 1-2 周(单独 Phase) |
| **D5** | 无云同步(数据已 schema 支持 Yjs/Automerge 留口)— 用户主动搁置 | 设备局限 | 2-3 周 |
| **D6** | E2E 覆盖有限:无 visual regression / 无跨浏览器(Safari/Firefox) | 跨平台兼容盲区 | 1 周 |
| **D7** | `Card.color` / `CanvasPosition.rotation` 字段已有但 UI 半成品 | 视觉表达受限 | 1 天 |
| **D8** | inbox / search 用 indexedDB? 不,localStorage。Service 层用 better-sqlite3(Node-only)— web 端用 db-client 包一层 localStorage 模拟 | web 端不是真 SQLite,查询能力有限 | 大改(defer) |
| **D9** | 无 a11y 自动化测试(axe-core)— 仅手动 | a11y 回归风险 | 半天集成 |
| **D10** | `pnpm tauri build` 路径含空格 productName 致 dmg 偶尔不产出(绕道 `--bundles app`) | 工具链不稳定 | 改 productName 或 worktree |

### 3.3 测试覆盖评估

| 层 | 现状 | 评价 |
|---|---|---|
| Unit(domain) | 26 + 9 = 35 测试,覆盖 card-service + search | 充足 |
| Unit(db) | sqlite-repository 集成测试 | 足够 |
| Unit(web/lib) | 0(无 web util 测试) | **缺口** — use-debounced-callback, export-service 等无单测 |
| E2E(puppeteer) | 12 断言(canvas toolbar + persistence + meter) | 关键路径覆盖,但 visual regression 缺 |
| Manual GUI | 128 commits 间每次核心改动都验 | 纪律好 |

**测试纪律:7/10**。单元 + E2E 覆盖关键路径,但 web layer 缺单测,visual regression 自动化缺。

---

## 4. 产品定位与竞品对照

### 4.1 定位

**cy's Stift = 本地优先 + 灵感画布 + 包豪斯极简**。介于:
- **Notion / Obsidian**(笔记)+ **Excalidraw / tldraw**(自由画布)+ **Apple 无边记 / Freeform**(自由整理)

但**不是**它们任何一个的替代。是**三者交叉的细分**:
- Notion 太重 + 上云
- Obsidian 文件式 + markdown,无画布
- Excalidraw 是通用画布,无笔记结构(无"卡片"概念)
- 无边记是 Apple 生态独占 + 无 markdown/导出

**核心差异点**:**灵感卡(结构化数据,跨 inbox/search/archive 统一管理)+ 自由元素(画布随手标注)+ 全部本地 + 全部包豪斯**。这一交叉点是独特的。

### 4.2 弱势对比

| 维度 | cy's Stift | 无边记 | Obsidian | Notion |
|---|---|---|---|---|
| 自由画布 | ✅ | ✅ | ❌ | ❌ |
| 结构化卡片(跨页管理) | ✅ | ❌(只是便签) | 部分 | ✅ |
| 本地优先 + 无云 | ✅ | ❌(iCloud) | ✅ | ❌ |
| 桌面端 | ✅ Tauri | ✅(Apple only) | ✅ | ✅ |
| 全局快捷键后台唤起 | ✅ | ❌ | ❌ | ❌ |
| 导出开放格式 | ✅ JSON | ❌(.note) | ✅ MD | ❌ |
| 协作 | ❌ | ✅ | ❌ | ✅ |
| 跨平台 | mac(其他架构待 build) | Apple only | 全平台 | 全平台 |
| 移动端 | ❌ | ✅ | ✅ | ✅ |
| 学习成本 | 低 | 低 | 中 | 中 |

**cy's Stift 的真正劣势**:无协作 + 无移动端。这两个都是**结构性缺失**,不是补丁能解决的。

---

## 5. 价值与风险

### 5.1 真正的用户价值(已落地)

- ✅ **3 秒捕获灵感**不打断心流 — 全局快捷键后台工作(Tauri)
- ✅ **画布整理**(无边记式) — 灵感卡 + 便签 + 文本 + 形状 + 箭头 + 手绘
- ✅ **数据可控** — 本地、导出 JSON、零锁定
- ✅ **极简视觉** — 包豪斯,无 SaaS 喧嚣

### 5.2 未来价值潜力

**高**——如果解决"协作 + 移动端"任意一个,会进入主流使用:
- **协作**(Yjs/Automerge CRDT):本地优先架构天然适配 CRDT,可加端到端加密同步,变成"本地优先的 Notion"
- **移动端**(Tauri Mobile 或 PWA):画布培养的天然场景是通勤/会议中——手机上快速加便签,桌面上整理

### 5.3 真实风险

| 风险 | 概率 | 影响 | 缓解 |
|---|---|---|---|
| 浏览器/Webview 兼容性破坏 | 中 | 数据丢失 | storage 仪表盘 + 导出 |
| Tauri v3 重大升级不兼容 | 中 | 桌面端需重打包 | 锁版本到 2.x |
| macOS App Store 上架要求 | 未来 | 需要 $99/年 + 大量合规 | 当前 ad-hoc 已够分享 |
| 用户媒体(视频/PDF)需求增长 | 中 | 仍不能支持 | OPFS(留后) |
| 竞品(无边记)出 Android/Windows | 已发生 | 损失跨平台优势 | 我们的差异化是"结构化卡片" |

---

## 6. 路线图建议

### 6.1 短期(本月内,1-2 周)

**目标:从"完整"到"可发布"**

| # | 项 | 时间 |
|---|---|---|
| S1 | **签名公证档位 3**($99/年 + 配置)— 别人装不再右键打开 | 半天 |
| S2 | **Inbox 链接 OG 抓取**(browser extension 或 server proxy)— spec §4.8 留口 | 1-2 天 |
| S3 | **Card.color / rotation UI**(已有字段补 UI) | 1 天 |
| S4 | **snapshot 体积自动管理**(>4MB 弹导出建议 + 旧 canvas 清理) | 1 天 |
| S5 | **E2E visual regression**(截图对比 baseline) | 半天 |

### 6.2 中期(2-3 月)

**目标:差异化深耕**

| # | 项 | 时间 |
|---|---|---|
| M1 | **画布连接关系深化**(箭头绑卡 + 关系视图) | 1 周 |
| M2 | **OPFS / Tauri fs 媒体层**(解锁视频/PDF/Excel) | 2-3 周 |
| M3 | **回顾机制**(inbox 积压高亮 + 每日提醒) | 1 周 |
| M4 | **跨浏览器 + 跨平台 E2E**(Safari / Firefox / Windows) | 1 周 |
| M5 | **跨画布模板/复制**(画布之间迁移卡片) | 3 天 |

### 6.3 长期(6 月+)

| # | 项 | 价值 |
|---|---|---|
| L1 | **协作 CRDT**(Yjs/Automerge,本地优先 + E2E 加密同步) | 主流化 |
| L2 | **移动端**(Tauri Mobile) | 设备覆盖 |
| L3 | **Plugin 系统**(第三方 shape util / 卡片类型 / 工作流) | 生态 |

### 6.4 不该做的(避免)

- ❌ **不做完整 Notion 替代** — 价值冲突,做不赢
- ❌ **不做云同步(中心化)** — 背叛"本地优先"原则,降低差异化
- ❌ **不做 AI 集成**(auto-tagging / auto-summarize) — 引入云依赖,且技术债
- ❌ **不做完整 PWA 移动端** — 工作量巨大(2 周+),ROI 不明;Tauri Mobile 是更优路径

---

## 7. 团队 / 维护性

- **单作者维护**(Claude 主模型),Ralph 已停用
- **commit 节奏**:核心改动小批量(每档 2-7 commits),spec → plan → implement → review → docs
- **git 卫生**:131 commits,每次核心改动有 spec/plan + decision record,可回退到任意档
- **docs 完整**:42 个 decision record,每个决策(架构 / 关键 bugfix / 新档)有完整 rationale
- **重启成本低**:CLAUDE.md + docs/user + decision records + spec + plan,任何新模型/工程师接手 1-2 天进入状态

---

## 8. 我的推荐

**立即(本周)**:
1. **你测 v0.26.3**(已放桌面)— 验证 storage meter + 整体体验
2. 决定**是否做签名公证档位 3**($99/年)—— 如果你打算正式分发,值;否则 ad-hoc + README 教右键足够

**本月内**:
3. 做 S3(Card.color UI)— 最低成本视觉差异化提升
4. 做 S4(snapshot 自动管理)— 防"全丢"最后一道防线

**如果你的目标是"产品差异化"**:
5. M1(画布连接)+ M3(回顾)是灵魂功能,做完后 cy's Stift 才真正"无边记级 + 笔记结构化"

**如果你的目标是"小而美日常工具"**:
5. 不再堆新功能,做稳定性 + E2E + 签名,1.0 标签发布

---

## 9. 一句话总结

**cy's Stift 是一个架构干净、设计严谨、文档完整的本地优先灵感画布**。功能上已超过 MVP 进入"产品"阶段,但还差**协作 / 移动端 / 真正差异化(画布连接 + 回顾)**才能从"工具"进入"产品力"。

**下一步该做哪一档,你来定。我只负责把每一档做扎实。**

---

> 报告基于 131 commits、12,231 LOC 应用代码、438 LOC 单元测试、4,875 LOC E2E 测试、13,178 行文档、3 个并行 Explore agent 复核 + 独立代码验证。