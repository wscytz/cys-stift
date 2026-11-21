# cy's Stift

> 本地优先的灵感画布。
> 你的灵感,在画布上生长。

---

## 这是什么

**cy's Stift** 是一个本地优先的灵感工具。用 Swiss Editorial 式的克制与秩序(编辑栅格、1px 线层级、零装饰),帮你把一闪而过的想法接住、把散落的念头连成线、把反复出现的洞察沉淀为作品。

**核心信念**

1. **本地优先** —— 数据是用户的,不是云端的(本地 localStorage + OPFS,无 server,离线可用)。
2. **形随功能** —— 设计系统是约束,不是滤镜(Swiss Editorial v0.2:token 化、全 0 圆角、零阴影;legacy 6 色名冻结为别名)。
3. **特性即接口** —— 每个 feature 是可独立替换的"切片"。
4. **数据可迁移** —— 本地数据随时可导出为开放格式(JSON + Markdown + DSL),不做锁定。
5. **转义(画布 ↔ 文字 DSL 双向)** —— 可转义的结构化内容能压成一段文字(手绘笔迹与二进制媒体除外),文字也能在确认门后改画布;任何能读写文字的 AI(或人)都可以尝试提出画布编辑,稳定性取决于其语法遵循能力。这是核心卖点。

---

## 下载

最新版本为 [**v1.6.1**](https://github.com/wscytz/cys-stift/releases/tag/v1.6.1)(稳定版)。桌面安装包和 `SHA256SUMS.txt` 均从该 Release 页面下载。也可以直接用[网页版](https://wscytz.com/cys-stift/app/)体验(网页仅在显式部署后更新，不会自动跟随本地 main；数据留在浏览器本地)。网页版支持 `/canvas/?dsl=` 分享链接：链接只预填审核对话框，不会自动应用；URL 可能进入访问日志和浏览器历史，**不要把私密正文放进链接**，私密内容请在转义编辑器内直接粘贴。

| 平台 | 文件 | 说明 |
|---|---|---|
| **macOS**(Apple Silicon) | release 页面中的 `.dmg` | 拖到 Applications |
| **Windows** x64 | release 页面中的 NSIS `.exe` | 需 WebView2(Win11 自带;Win10 可单独安装) |
| **Android** | 本版本不提供 | 不在当前支持范围 |

> iPad/iOS 不做。Windows 安装包未经 Authenticode 签名，macOS 安装包为 ad-hoc 签名且未公证，系统可能显示“未知开发者/发布者”警告；安装前请先核对 Release 中的 SHA256。

`v1.6.1` 是当前稳定版:在 v1.6.0 基础上修复关系锚点不可解时写占位坐标的问题,语言与数据格式不变;仍包含 cys-dsl v10 显式删除、`?dsl=` 分享入口、AI 确认与导入/持久化加固、显式 SQLite 旧秒级迁移 API 与清洗器二进制门禁;保留全局正交走线求解器、DSL 手误提示与内核调试台。应用壳数据格式与用户设置兼容。签名/公证、实机无障碍(VoiceOver)、真实系统 200% 缩放、外部用户研究与真实 provider 配额/拒绝演练仍列为后续加固项;桌面安装器图标暂为旧一代。变更细节见 [Release notes](https://github.com/wscytz/cys-stift/releases) 与 [`docs/changelog.md`](docs/changelog.md);设计规范见 [`docs/design/swiss-editorial.md`](docs/design/swiss-editorial.md)。

---

## 特性

**捕获** —— 桌面端全局快捷键、应用内 Mini Input 与文件拖拽；浏览器端快捷键仅在页面内生效。

**inbox** —— 多媒介编辑(链接/代码/引用/媒体)+ 草稿自动保存 + 发送到画布。

**canvas(自研 Canvas 2D)** —— 6 种元素(card/arrow/freedraw/text/rect/frame)+ 多画布 + 视图持久化 + 关系箭头(straight/curve/elbow + 手绘识别)+ 工具栏(选择/手绘/文本/连接/橡皮)+ AI 排版 + 导出(图片 SVG/PNG/JPEG + Markdown + DSL)+ Outline / Minimap / 全局缩略图 + 双链 `[[]]` 自动建箭头 + **DSL 模态编辑器(转义,两卡选择可直接生成关系式 + 实时 diff/诊断/stale 恢复)** + 对齐分布 9 操作 + 画布模板 + 整理范式(思维导图/流程图/网格/紧凑 × 四方向)+ 焦点模式 + frame + 手绘规范化(保角 RDP + 贝塞尔平滑 + $1 形状识别)+ **关系式坐标 DSL**(right-of/below + 碰撞避让)+ **卡片密度模式**(紧凑/自适应/仅标题/副标题)+ 双击空白建卡 + **DSL sanitize 兜底**(AI 非法值不崩)。

**工作台** —— per-card 深度编辑(`/workbench` 库页 + 独立编辑页);画布 hover 只读速览,双击卡片或画布顶栏入口跳转工作台(当前版本无画布内右栏编辑器;旧 focusEdit 专注编辑态已移除,避免把独立工作台和画布焦点模式混为一谈)。

**Markdown 渲染** —— GFM(表格/任务列表/删除线)+ 代码高亮(Swiss Editorial 色板)+ **数学公式**(katex `$inline$`/`$$display$$`)+ 脚注 + 块引用 `((标题))` 嵌入(环检测)。

**全局图谱** —— `/graph` 跨画布语义签名力导向图(d3-force)+ 缩放条 + 触摸板手势(pinch 缩放/双指平移)。

**关系网络** —— 块引用 + 详情建/删关系 + 跨画布 backlinks + 智能关系推荐(本地四信号 + 可选 AI 语义)+ **wikilink `[[标题]]` 自动建 references 箭头**(跨画布 + 模糊匹配 Levenshtein≤2 + 重命名追踪)+ **AI 对话 agent** `/ask`(对话 → cys-dsl 块 → 确认门 before/after 缩略图)。

**AI** —— 多 provider(OpenAI / Anthropic / Ollama 本地;DeepSeek 等兼容端点走 OpenAI provider)+ AI 排版(诚实位移反馈:重排 N 张 / AI 认为已合理 / 未改动)+ AI 伴侣面板(发现 tab 本地预筛 + 对话 tab)+ **结构化输出重试闭环**(坏 DSL / Intent IR 自动重试喂回错误,maxAttempts=3)+ 失败样本采集(可导出调优)。

**可审计 AI 共编（Labs，默认关闭）** —— 选择卡片并确认发送范围后，本地 graph lint 与 AI 的 Logic / Ideas / Layout 建议按来源逐项审查；接受后仍需生成 ghost preview 再应用。三个 lane 的 accepted subset 合并为同一份不可变计划，使用可恢复事务、CommitReceipt 与 guarded Undo。该实验不改变 cys-dsl 版本，尚未取得外部用户验证，不能视为稳定版承诺。

**画板适配** —— 响应式(<1200 顶条汉堡抽屉 + <1024 画布侧栏收成纯图标 + canvas 断点归一)+ 触摸手势(双指 pinch zoom + 双指平移 + 触摸目标 44px)+ Android 运行时(rustls ring provider + 平台检测 SSR-safe hooks)。

**其他** —— 命令面板(⌘K)+ 标签管理 `/tags`(六色 canonical 调色板;改名/改色/删除/合并)+ 时间线 `/timeline`(全局)+ 全文搜索(title 加权 + 摘要)+ 软删恢复 + JSON 导出/导入(含画布几何 + freeform + 本机恢复点)+ 中英双语。

**可独立消费的文本内核** —— `packages/cys-dsl` 以 [`@wscytz/dsl`](https://www.npmjs.com/package/@wscytz/dsl) 发布，提供 `validate` / `render` / `roundtrip` CLI、SVG 与 JSON Canvas 输出；`canvas-engine` 仍为未单独发布的 workspace 包。npm 版、Release、网页和本地 main 可能不同，按所用版本的手册判断语法能力。DSL 是结构化状态交换，不替代含媒体与手绘的完整备份。

完整能力见最新 [Release notes](https://github.com/wscytz/cys-stift/releases) 与 [`docs/changelog.md`](docs/changelog.md)。

产品工作流展示见独立静态预览页 [wscytz.com/cys-stift](https://wscytz.com/cys-stift/)。(本地开发态的 `/showcase` 由 `pnpm dev` 起在 http://localhost:3000/showcase,供贡献者自查,不代表某个已发布版本。)

---

## 状态

**v1.6.1** — 最新稳定版,已在 GitHub Release 发布。核心闭环、恢复事务、cys-dsl v10 与跨平台构建流水线就绪;本版为 1.6.0 的补丁,修复关系锚点不可解时写占位坐标的问题,其余稳定面不变。签名/公证、实机无障碍(VoiceOver)与真实 provider 证据继续作为后续稳定版加固工作;桌面安装器图标换代在列。

DSL 的实现与内部稳定性验证已经具备，但“普通用户是否愿意学习并重复使用”仍是待外部研究验证的产品假设；README 和展示页不会把内部测试写成用户价值结论。

版本里程碑与变更历史见 [`docs/changelog.md`](docs/changelog.md) 与 [Release notes](https://github.com/wscytz/cys-stift/releases)；当前开发状态板(版本 / 能力 / 下一步 / 已知 debt)在私有仓 `cys-stift-docs` 维护,不随公开仓分发。

---

## 目录速览

```
cys-stift/
├── apps/
│   ├── web/             Next.js 15 (App Router) 应用壳,静态导出(无 server)
│   └── desktop/         Tauri v2 桌面壳(macOS / Windows / Android)
├── packages/
│   ├── canvas-engine/   自研 Canvas 2D 引擎(零业务依赖,框架无关 — 北极星:可剥离成独立包)
│   ├── cys-dsl/         画布 ↔ 文字双向转义 DSL(Peggy 解析器 + sanitize + 序列化,核心卖点)
│   ├── ui/              Swiss Editorial 设计系统 v0.2(token 三源;规范见 docs/design/swiss-editorial.md)
│   ├── db/              Drizzle ORM + SQLite schema
│   └── domain/          纯 TS 核心领域模型(零依赖)
├── docs/                用户向与开发向教学文档(user / development / changelog)
└── package.json
```

> 设计思考 / 实现计划 / 决策 / 审计 / spec / 当前状态板等**过程文档**在私有仓库 `cys-stift-docs` 维护,本地并排 clone 对照。

---

## 文档导航

| 你想知道什么 | 看哪里 |
|---|---|
| 用户指南 | [`docs/user/README.md`](./docs/user/README.md) |
| 转义手册(画布 ↔ DSL) | [`docs/user/transliteration.md`](./docs/user/transliteration.md) |
| 隐私说明(AI 隐私必读) | [`docs/user/privacy.md`](./docs/user/privacy.md) |
| 如何搭建开发环境 | [`docs/development/setup.md`](./docs/development/setup.md) |
| 阶段变更历史 | [`docs/changelog.md`](./docs/changelog.md) |
| 产品展示 / 核心工作流 | [wscytz.com/cys-stift](https://wscytz.com/cys-stift/) |
| 下载 / Release | [Releases](https://github.com/wscytz/cys-stift/releases) |

> 架构总览、设计 token 规则、AI 方向、状态板、决策记录、实现计划等过程文档在私有仓库 `cys-stift-docs`,不随公开仓分发。

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

Apache-2.0。见 [`LICENSE`](LICENSE)。
