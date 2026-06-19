# Phase 9 视觉 + 交互对照笔记

> 截图:`docs/design/screenshots/phase-9/`(2 张)

---

## 结论

**Phase 9 核心承诺达成(spec §1.2 信念4 "数据可迁移" + §8 Phase 9):`/settings` 加 Export JSON 按钮 → 下载开放格式 `.json`(`{version, exportedAt, app, cards, mediaAssets, drafts, settings}`)。用户文档 `docs/user/README.md`。** 兑现"本地数据随时可导出,不做锁定"。0 新依赖。

puppeteer 8/8 断言全过:
- ✓ 下载 1 个 `cys-stift-export-*.json`
- ✓ `version === 1`
- ✓ `app === "cy's Stift"`
- ✓ `cards.length === 2`(seed)
- ✓ `cards[0].title` 正确
- ✓ `mediaAssets` 1 key
- ✓ `settings.captureShortcut.code === 'KeyC'`
- ✓ `exportedAt` 是 ISO string

## 关键工程决策

1. **开放格式 JSON,版本化**(`version: 1`):任何工具可读;未来 schema 变更有迁移路径。
2. **导出范围**:cards + mediaAssets(必)+ drafts + settings(可选,全包)。
3. **浏览器原生下载**(`<a download>` + Blob URL):0 新依赖。
4. **纯函数 `buildExportPayload`**:可测试,不触发副作用;`downloadExport` 才触发下载。
5. **文件名时间戳**:`cys-stift-export-YYYY-MM-DD-HH-MM-SS.json`。
6. **用户文档 `docs/user/README.md`**:核心流程(捕获/inbox/canvas/archive/settings)+ 数据隐私 + 快捷键速查 + 已知限制。
7. **0 新依赖** + **domain/db 零改动**。

## 已知 / 后续

- 反向 import(JSON → 导入)→ 留后
- 录屏 → 留后(无录屏工具自动化)
- 更新日志页 `/changelog` 路由 → 留后(changelog.md 已存在)
- 导出格式 v2+ 迁移 → 留后

## 测试方式

```bash
pnpm --filter domain test
pnpm --filter db test
pnpm --filter web build
node scripts/p9-shots.cjs
```