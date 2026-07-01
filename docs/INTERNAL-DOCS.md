# 内部文档(已迁移)

cy's Stift 的**过程文档**(设计思考 / 实现计划 / 决策记录 / 审计反馈)已迁移至私有仓库:

👉 **https://github.com/wscytz/cys-stift-docs**(private)

## 为什么拆分

代码公开,设计思考过程私有。本仓库(public)只保留**用户向文档**:

| 文档 | 内容 |
|---|---|
| [`STATE.md`](./STATE.md) | 当前状态 / 版本里程碑 / 下一步 |
| [`changelog.md`](./changelog.md) | 变更历史(newest-first) |
| [`user/`](./user/) | 用户指南 / 隐私说明 / 转义手册 |
| [`development/setup.md`](./development/setup.md) | 开发环境搭建 |
| [`design/tokens.md`](./design/tokens.md) | 设计 token 规则 |
| [`architecture/overview.md`](./architecture/overview.md) | 架构总览 |

## 私有仓库里有什么

`specs/`(设计契约)· `plans/`(实现计划)· `decisions/`(跨模型记忆)· `adr/`(架构决策)· `audit/`·`reviews/`·`feedback/`(审计评审)· `archive/`(归档)· `development/`(DoD / acceptance / privacy-design / polish-phase)· `design/`(design-system / interaction-language)· `superpowers/`· `screenshots/`

## 代码里的 `docs/` 引用

代码注释中仍可能引用 `docs/specs/...` / `docs/decisions/...` 等路径 —— 那些文档现在在私有仓库。本地两个仓库并排放置即可对照。
