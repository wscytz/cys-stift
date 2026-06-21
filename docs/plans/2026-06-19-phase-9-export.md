# Phase 9 实现计划 · JSON 导出 + 文档

> 🟡 **待执行**(主模型手动执行 + 自审,见 `docs/development/roadmap.md` §1)。
> 路线图 P9 行。

| 字段 | 值 |
|---|---|
| 计划 | P9:JSON 导出 + 用户文档 + 更新日志页 |
| 创建 | 2026-06-19 |
| 范围决策 | **Lean**(/settings 加 Export 按钮 + ExportService + 用户文档;录屏 + 反向 import 留后)|
| 依据 spec | §1.2 信念4 "数据可迁移,本地数据随时可导出为开放格式" / §8 Phase 9 |
| 上游交付 | Phase 2(schema 稳定)/ 全部 P6.5 |
| 下游交付 | 兑现"数据可迁移"核心信念;Phase 8 Tauri 同样导出路径 |

---

## 0. 目标

兑现 spec §1.2 信念4:**本地数据随时可导出为开放格式 JSON**。/settings 加 Export 按钮 → 下载 `.json`(`{version, exportedAt, cards, canvases, mediaAssets}`)。用户文档(`docs/user/`)。

---

## 1. 范围

### ✅ 本阶段做

#### 1.1 ExportService
- 新建 `apps/web/src/lib/export-service.ts`:
  - `exportJson(): { version: 1, exportedAt: string, cards, canvases, mediaAssets }`
  - 读 db-client cards + media-store assets(+ drafts / settings 可选)
  - 触发浏览器下载(`<a download>` + Blob URL)

#### 1.2 /settings 加 Export 按钮
- "Data" section:Export JSON 按钮 + 文件大小提示

#### 1.3 用户文档
- `docs/user/README.md`:核心流程(捕获 / inbox / canvas / archive / 导出)

### ❌ 本阶段不做

- 反向 import(JSON → 导入)→ 留后
- 录屏 → 留后(无录屏工具自动化)
- 更新日志页(`/changelog` 路由)→ 留后(changelog.md 已存在)
- 导出格式 v2+ 迁移 → 留后

---

## 2-7. (沿用模板)

---

## 完成信号

```xml
<promise>PHASE COMPLETE</promise>
```