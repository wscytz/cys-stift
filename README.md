# cy's Stift

> 本地优先的灵感画布。
> 你的灵感,在画布上生长。

---

## 这是什么

**cy's Stift** 是一个本地优先的灵感工具。用包豪斯式的克制与几何,帮你把一闪而过的想法接住、把散落的念头连成线、把反复出现的洞察沉淀为作品。

**核心信念**

1. **本地优先** —— 数据是用户的,不是云端的(本地 localStorage + OPFS,无 server,离线可用)。
2. **形随功能** —— 包豪斯是约束,不是滤镜(6 原色 + 8px 网格,不写死 hex/px)。
3. **特性即接口** —— 每个 feature 是可独立替换的"切片"。
4. **数据可迁移** —— 本地数据随时可导出为开放格式(JSON + Markdown + DSL),不做锁定。
5. **转义(画布 ↔ 文字 DSL 双向)** —— 整张画布能压成一段文字,文字也能反向改画布;任何 AI(或任何人)读写一段文字就能驱动画布编辑。这是核心卖点。

---

## 下载

最新版 [**v0.57.2**](https://github.com/wscytz/cys-stift/releases/tag/v0.57.2):

| 平台 | 文件 | 说明 |
|---|---|---|
| **macOS**(Apple Silicon) | `cys-stift_0.57.2_aarch64.dmg`(7.4M) | 拖到 Applications |
| **Windows** | `cys-stift_0.57.2_windows.zip` | 解压运行 .exe(需 WebView2,Win11 自带;Win10 手动装;CI 产出) |
| **Android**(arm64) | `app-universal-debug.apk`(241M) | debug 版(含符号,体积大);arm64 设备可装;安装时允许"未知来源" |

> iPad/iOS 不做。Windows 版走 CI(本地 macOS 不能 cross-compile)。Android release 签名版待 keystore 配置(debug 版功能完整,仅缺签名 + 体积大)。

---

## 特性

**捕获** —— 全局快捷键 + Mini Input + 文件拖拽,3 秒落库。

**inbox** —— 多媒介编辑(链接/代码/引用/媒体)+ 草稿自动保存 + 发送到画布。

**canvas(自研 Canvas 2D)** —— 6 种元素(card/arrow/freedraw/text/rect/frame)+ 多画布 + 视图持久化 + 关系箭头(straight/curve/elbow + 手绘识别)+ 工具栏(选择/手绘/文本/连接/橡皮)+ AI 排版 + 导出(图片 SVG/PNG + Markdown + DSL)+ Outline / Minimap / 全局缩略图 + 双链 `[[]]` 自动建箭头 + **DSL 模态编辑器(转义)** + 对齐分布 9 操作 + 画布模板 + 整理范式(思维导图/流程图/网格/紧凑 × 四方向)+ 焦点模式 + frame + 手绘规范化(保角 RDP + 贝塞尔平滑 + $1 形状识别)+ **关系式坐标 DSL**(right-of/below + 碰撞避让)+ **卡片密度模式**(紧凑/自适应/仅标题/副标题)+ 双击空白建卡 + **DSL sanitize 兜底**(AI 非法值不崩)。

**工作台** —— per-card 深度编辑(`/workbench` 库页 + canvas dock 编辑器 + **专注编辑态** ⤢ 二档:编辑器撑满 + 画布缩成可拖拽/收起的浮 minimap 预览)。

**Markdown 渲染** —— GFM(表格/任务列表/删除线)+ 代码高亮(Bauhaus 主题)+ **数学公式**(katex `$inline$`/`$$display$$`)+ 脚注 + 块引用 `((标题))` 嵌入(环检测)。

**全局图谱** —— `/graph` 跨画布语义三维签名力导向图(d3-force)+ 缩放条 + 触摸板手势(pinch 缩放/双指平移)。

**关系网络** —— 块引用 + 详情建/删关系 + 跨画布 backlinks + 智能关系推荐(本地四信号 + 可选 AI 语义)+ **wikilink `[[标题]]` 自动建 references 箭头**(跨画布 + 模糊匹配 Levenshtein≤2 + 重命名追踪)+ **AI 对话 agent** `/ask`(对话 → cys-dsl 块 → 确认门 before/after 缩略图)。

**AI** —— 多 provider(OpenAI / Anthropic / DeepSeek / Ollama 本地,零成本)+ AI 排版(诚实位移反馈:重排 N 张 / AI 认为已合理 / 未改动)+ AI 伴侣面板(发现 tab 本地预筛 + 对话 tab)+ **DSL 重试闭环**(AI 出坏 DSL 自动重试喂回错误,maxAttempts=3)+ 失败样本采集(可导出调优)。

**画板适配** —— 响应式(<1024 汉堡抽屉 + companion 覆盖 + canvas 断点归一)+ 触摸手势(双指 pinch zoom + 双指平移 + 触摸目标 44px)+ Android 运行时(rustls ring provider + 平台检测 SSR-safe hooks)。

**其他** —— 命令面板(⌘K)+ 标签墙 `/tags`(10 色)+ 时间线 `/timeline`(全局)+ 全文搜索(title 加权 + 摘要)+ 软删恢复 + JSON 导出/导入(含画布几何 + freeform)+ 中英双语。

完整能力见 [`docs/STATE.md`](docs/STATE.md)「当前能力」段。

---

## 状态

**v0.57.2** — 完整可用的本地优先灵感画布。lint 0 / test 1995 全绿(canvas-engine 539 + web 1456)/ build exit 0。

当前状态、版本里程碑、下一步、已知 debt 全见 [`docs/STATE.md`](docs/STATE.md) — 单一可信源。历史见 [`docs/changelog.md`](docs/changelog.md)。

---

## 目录速览

```
cys-stift/
├── apps/
│   ├── web/             Next.js 15 (App Router) 应用壳,静态导出(无 server)
│   └── desktop/         Tauri v2 桌面壳(macOS / Windows / Android)
├── packages/
│   ├── canvas-engine/   自研 Canvas 2D 引擎(零业务依赖,框架无关 — 北极星:可剥离成独立包)
│   ├── ui/              包豪斯设计系统(6 原色 + 8px 网格 + token)
│   ├── db/              Drizzle ORM + SQLite schema
│   └── domain/          纯 TS 核心领域模型(零依赖)
├── docs/                用户向文档(STATE / changelog / user / setup / tokens / architecture)
└── package.json
```

> 过程文档(设计思考 / 实现计划 / 决策 / 审计 / spec / plan)在私有仓库 `cys-stift-docs`,本地并排 clone 对照,见 [`docs/INTERNAL-DOCS.md`](docs/INTERNAL-DOCS.md)。

---

## 文档导航

| 你想知道什么 | 看哪里 |
|---|---|
| 架构总览 | [`docs/architecture/overview.md`](./docs/architecture/overview.md) |
| 设计 token / 包豪斯规则 | [`docs/design/tokens.md`](./docs/design/tokens.md) |
| 如何搭建开发环境 | [`docs/development/setup.md`](./docs/development/setup.md) |
| 用户指南 | [`docs/user/README.md`](./docs/user/README.md) |
| 隐私说明(AI 隐私必读) | [`docs/user/privacy.md`](./docs/user/privacy.md) |
| 转义手册(画布 ↔ DSL) | [`docs/user/transliteration.md`](./docs/user/transliteration.md) |
| 当前状态 / 版本里程碑 | [`docs/STATE.md`](./docs/STATE.md) |
| 阶段变更历史 | [`docs/changelog.md`](./docs/changelog.md) |
| AI 方向文档 | [`docs/ai-direction.md`](./docs/ai-direction.md) |
| 内部过程文档(已迁私有仓) | [`docs/INTERNAL-DOCS.md`](./docs/INTERNAL-DOCS.md) |

---

## 开发

```bash
# 安装依赖
pnpm install

# 起 Next.js 开发服务器
pnpm dev
# → http://localhost:3000

# 构建静态产物
pnpm build

# 启动 Tauri 桌面壳(需要 Rust 工具链)
pnpm tauri dev
```

详见 [`docs/development/setup.md`](./docs/development/setup.md)。验证门:`pnpm -r lint && pnpm -r test && pnpm --filter web build`(三者 exit 0)。

---

## 许可

GPL-3.0-or-later。见 [`LICENSE`](LICENSE)。
