# ADR-0001 · pnpm monorepo

## 背景
cy's Stift 需要共享 domain / db / ui / config 代码给 web 和 desktop 两侧。

## 决策
用 **pnpm workspace monorepo**（`apps/*` + `packages/*`）。

## 后果
- ✅ 代码复用严格（pnpm 软链接 + 严格 peer）
- ✅ 磁盘占用低、CI 快
- ⚠️ 仓库形式相对单包复杂——但前端长跑项目里这是合理代价
- ⚠️ 若某天包依赖关系变成泥球，回退到单包也是选项（见 spec §12）

状态：✅ 已落地（Phase 0）
