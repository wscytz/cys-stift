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
5. **转义(画布 ↔ 文字 DSL 双向)** —— 整张画布能压成一段文字,文字也能在确认门后改画布;任何 AI(或任何人)读写一段文字就能提出画布编辑。这是核心卖点。

---

## 下载

当前稳定版为 [**v1.0.0**](https://github.com/wscytz/cys-stift/releases/tag/v1.0.0)。桌面安装包和 `SHA256SUMS.txt` 均从该 Release 页面下载：

| 平台 | 文件 | 说明 |
|---|---|---|
| **macOS**(Apple Silicon) | release 页面中的 `.dmg` | 拖到 Applications |
| **Windows** x64 | release 页面中的 NSIS `.exe` | 需 WebView2(Win11 自带;Win10 可单独安装) |
| **Android** | 1.0.0 不提供 | 不在本次稳定版支持范围 |

> iPad/iOS 不做。Windows 安装包未经 Authenticode 签名，macOS 安装包为 ad-hoc 签名且未公证，系统可能显示“未知开发者/发布者”警告；安装前请先核对 Release 中的 SHA256。

`v1.0.0` 冻结核心工作流、数据格式、cys-dsl v4 和 AI 修改确认门。外部 5-8 人研究、VoiceOver、真实系统 200% 缩放、代表性设备安装升级以及真实 provider 配额/拒绝演练没有在发布前伪装成已完成证据，列为发布后加固项。

---

## 特性

**捕获** —— 全局快捷键 + Mini Input + 文件拖拽,3 秒落库。

**inbox** —— 多媒介编辑(链接/代码/引用/媒体)+ 草稿自动保存 + 发送到画布。

**canvas(自研 Canvas 2D)** —— 6 种元素(card/arrow/freedraw/text/rect/frame)+ 多画布 + 视图持久化 + 关系箭头(straight/curve/elbow + 手绘识别)+ 工具栏(选择/手绘/文本/连接/橡皮)+ AI 排版 + 导出(图片 SVG/PNG + Markdown + DSL)+ Outline / Minimap / 全局缩略图 + 双链 `[[]]` 自动建箭头 + **DSL 模态编辑器(转义,两卡选择可直接生成关系式 + 实时 diff/诊断/stale 恢复)** + 对齐分布 9 操作 + 画布模板 + 整理范式(思维导图/流程图/网格/紧凑 × 四方向)+ 焦点模式 + frame + 手绘规范化(保角 RDP + 贝塞尔平滑 + $1 形状识别)+ **关系式坐标 DSL**(right-of/below + 碰撞避让)+ **卡片密度模式**(紧凑/自适应/仅标题/副标题)+ 双击空白建卡 + **DSL sanitize 兜底**(AI 非法值不崩)。

**工作台** —— per-card 深度编辑(`/workbench` 库页 + canvas 右栏编辑器);画布 hover 只读速览,双击或侧栏入口进入工作台。当前版本已移除旧的 focusEdit 专注编辑态,避免把独立工作台和画布焦点模式混为一谈。

**Markdown 渲染** —— GFM(表格/任务列表/删除线)+ 代码高亮(Bauhaus 主题)+ **数学公式**(katex `$inline$`/`$$display$$`)+ 脚注 + 块引用 `((标题))` 嵌入(环检测)。

**全局图谱** —— `/graph` 跨画布语义三维签名力导向图(d3-force)+ 缩放条 + 触摸板手势(pinch 缩放/双指平移)。

**关系网络** —— 块引用 + 详情建/删关系 + 跨画布 backlinks + 智能关系推荐(本地四信号 + 可选 AI 语义)+ **wikilink `[[标题]]` 自动建 references 箭头**(跨画布 + 模糊匹配 Levenshtein≤2 + 重命名追踪)+ **AI 对话 agent** `/ask`(对话 → cys-dsl 块 → 确认门 before/after 缩略图)。

**AI** —— 多 provider(OpenAI / Anthropic / DeepSeek / Ollama 本地,零成本)+ AI 排版(诚实位移反馈:重排 N 张 / AI 认为已合理 / 未改动)+ AI 伴侣面板(发现 tab 本地预筛 + 对话 tab)+ **DSL 重试闭环**(AI 出坏 DSL 自动重试喂回错误,maxAttempts=3)+ 失败样本采集(可导出调优)。

**可审计 AI 共编（Labs，默认关闭）** —— 选择卡片并确认发送范围后，本地 graph lint 与 AI 的 Logic / Ideas / Layout 建议按来源逐项审查；接受后仍需生成 ghost preview 再应用。三个 lane 的 accepted subset 合并为同一份不可变计划，使用可恢复事务、CommitReceipt 与 guarded Undo。该实验不改变 DSL v4，尚未取得外部用户验证，不能视为 1.0.0 稳定承诺。

**画板适配** —— 响应式(<1024 汉堡抽屉 + companion 覆盖 + canvas 断点归一)+ 触摸手势(双指 pinch zoom + 双指平移 + 触摸目标 44px)+ Android 运行时(rustls ring provider + 平台检测 SSR-safe hooks)。

**其他** —— 命令面板(⌘K)+ 标签墙 `/tags`(六色 canonical 调色板)+ 时间线 `/timeline`(全局)+ 全文搜索(title 加权 + 摘要)+ 软删恢复 + JSON 导出/导入(含画布几何 + freeform + 本机恢复点)+ 中英双语。

完整能力见 [`docs/STATE.md`](docs/STATE.md)「当前能力」段。

产品工作流展示：本地应用内 [`/showcase`](http://localhost:3000/showcase/)；独立静态预览页为 [wscytz.com/cys-stift](https://wscytz.com/cys-stift/)。两者展示 **1.0.0** 的核心能力边界。

---

## 状态

**1.0.0** — 首个稳定版(版本源见根 `package.json`)。核心闭环、恢复事务、DSL v4 与跨平台构建流水线已冻结；签名/公证、实机无障碍与真实 provider 证据继续作为发布后加固工作。

DSL 的实现与内部稳定性验证已经具备，但“普通用户是否愿意学习并重复使用”仍是待外部研究验证的产品假设；README 和展示页不会把内部测试写成用户价值结论。

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
| 如何预览 / 部署产品展示页 | [`docs/development/showcase.md`](./docs/development/showcase.md) |
| 用户指南 | [`docs/user/README.md`](./docs/user/README.md) |
| 隐私说明(AI 隐私必读) | [`docs/user/privacy.md`](./docs/user/privacy.md) |
| 转义手册(画布 ↔ DSL) | [`docs/user/transliteration.md`](./docs/user/transliteration.md) |
| 当前状态 / 版本里程碑 | [`docs/STATE.md`](./docs/STATE.md) |
| 产品展示 / 核心工作流 | [`/showcase`](http://localhost:3000/showcase/) |
| 独立静态预览页 | [wscytz.com/cys-stift](https://wscytz.com/cys-stift/) |
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
