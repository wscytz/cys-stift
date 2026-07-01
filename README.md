# cy's Stift

> 本地优先的灵感画布。
> 灵感 3 秒记，画布上慢慢养。

---

## 这是什么

**cy's Stift** 是一个本地优先的灵感工具。用包豪斯式的克制与几何，帮你把一闪而过的想法接住、把散落的念头连成线、把反复出现的洞察沉淀为作品。

**核心信念**

1. **本地优先** —— 数据是用户的，不是云端的。
2. **形随功能** —— 包豪斯是约束，不是滤镜。
3. **特性即接口** —— 每个 feature 是可独立替换的"切片"。
4. **数据可迁移** —— 本地数据随时可导出为开放格式，不做锁定。

---

## 状态

**完整可用的本地优先灵感画布**(v0.43.0)。

捕获 / inbox(多媒介编辑)/ canvas(自研 Canvas 2D 画布 + 多画布 + 语义关系箭头 + 双链 + frame + 模板 + **整理范式(思维导图/流程图/网格/紧凑 × 四方向)** + 导出)/ 全局图谱(力导向 + 缩放条 + 触摸板手势)/ 块引用 / 标签 / 命令面板 / 时间线 / **画布 AI 伴侣面板(发现 + 对话,历史持久化)** / **AI 排版(诚实反馈 + 主动重排)** / AI(3 provider,DeepSeek/OpenAI/Ollama) 全部交付。桌面端可本地构建未签名 DMG。

**v0.43 打磨轮**(手测反馈六批 + 内测三修):关系箭头高倍放大不再消失(端点解析脱离视锥剔除)/ 图谱删卡不灰屏 + 触摸板 pinch 缩放双指平移 + 缩放条 + 卡详情 action 行常驻 + **加关系实时刷新**(freeform store 订阅通道)/ 伴侣对话历史持久化 + 缩略图不溢出 + 折叠非破坏性 / AI 排版"从来没改过布局"根因三合一(拓宽思考抑制 + 主动重排 prompt + 诚实位移反馈)/ 版本号单一可信源 + 主菜单实时显示 / 整理范式(策略 × 方向 × 间距)/ **鸟瞰图视口方框符号修**(委托引擎单一正解)/ **对比度**(二级文字 gray→black-soft + 图谱硬编码 hex→token)。

**画布 AI 伴侣面板**(v0.42):画布常驻 AI 浮面板。**发现** tab 本地预筛零成本常驻(重复 / 可关联 / 孤立卡)+ 选中定位 / 建立关联 / AI 深挖;**对话** tab = /ask agent 上画布,操作 live host + DSL 提议确认门。非破坏性,默认开。

**当前状态、版本里程碑、下一步、已知 debt 全见 [`docs/STATE.md`](docs/STATE.md)** — 单一可信源。历史见 [`docs/changelog.md`](docs/changelog.md)。

---

## 目录速览

```
cys-stift/
├── apps/
│   ├── web/             Next.js (App Router) 应用壳，静态导出
│   └── desktop/         Tauri v2 桌面壳
├── packages/
│   ├── ui/              包豪斯设计系统
│   ├── db/              Drizzle ORM + SQLite schema
│   ├── domain/          核心领域模型（Phase 2+）
│   └── config/          共享配置
├── docs/
│   ├── specs/   设计文档（定稿）
│   ├── plans/  阶段实现计划
│   ├── architecture/       架构总览
│   ├── adr/                架构决策记录
│   ├── design/             设计 token 文档
│   ├── development/        开发指南 / 变更日志
│   └── memory/             跨模型 / 跨会话记忆
├── .nvmrc               Node 22
├── .gitattributes       LF 强制
├── .editorconfig
├── .gitignore
├── .prettierrc
├── tsconfig.base.json
├── pnpm-workspace.yaml
└── package.json
```

---

## 文档导航

| 你想知道什么 | 看哪里 |
|---|---|
| 架构总览 | [`docs/architecture/overview.md`](./docs/architecture/overview.md) |
| 设计 token / 包豪斯规则 | [`docs/design/tokens.md`](./docs/design/tokens.md) |
| 如何搭建开发环境 | [`docs/development/setup.md`](./docs/development/setup.md) |
| 用户指南 / 隐私说明 | [`docs/user/`](./docs/user/) |
| 当前状态 / 版本里程碑 | [`docs/STATE.md`](./docs/STATE.md) |
| 阶段变更历史 | [`docs/changelog.md`](./docs/changelog.md) |
| 内部过程文档(设计思考/计划/决策) | 已迁移至私有仓库,见 [`docs/INTERNAL-DOCS.md`](./docs/INTERNAL-DOCS.md) |

---

## 开发

```bash
# 安装依赖
pnpm install

# 起 Next.js 开发服务器（mac/win 都一样）
pnpm dev
# → http://localhost:3000

# 构建静态产物（mac/win 都一样）
pnpm build

# 启动 Tauri 桌面壳（需要 Rust 工具链）
pnpm tauri dev
```

详见 [`docs/development/setup.md`](./docs/development/setup.md)。

---

## 许可

GPL-3.0-or-later。见 [`LICENSE`](LICENSE)。
