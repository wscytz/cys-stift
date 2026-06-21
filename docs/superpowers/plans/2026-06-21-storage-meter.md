# 数据仪表盘 + 超配额保护 Plan(v0.26.3)

> **目标**:用户在 settings 页面看到 localStorage 用量(bar + %),超 80% 弹建议导出 + 清理,防"全丢"。

**不删任何文件,不破坏数据。**

---

## 改动文件

| 文件 | 改动 |
|---|---|
| `apps/web/src/lib/storage-usage.ts`(新) | `scanStorageUsage()` 扫所有 `cys-stift.*` key,按类型聚合,返回 `{ used, total, percent, byKey, warning }`。SSR-safe(返回 0)。 |
| `apps/web/src/components/storage-meter.tsx`(新) | 包豪斯横条(黑边 + 黄/红填充),显示 used / total / percent + per-key 列表。低于 60% 灰,60-80% 黄,80%+ 红 + 警告 |
| `apps/web/src/app/settings/page.tsx` | 顶部加 `<StorageMeter />`(settings 自然适合) |

不动数据、不动 store API、不动 i18n keys(`storage.*` 新增,zh/en)。

---

## 任务

### A1: storage-usage helper

- [ ] `scanStorageUsage()`:
  - 遍历 `localStorage`,过滤 key 以 `cys-stift.` 开头
  - 每个 key 读 `byteLength`(localStorage 字符串)
  - 按 key 前缀分类(`cards` / `media` / `canvas.` / 其他)
  - 计算 percent = used / total(total 用 navigator.storage.estimate() quota,fallback 5MB)
  - warning: percent >= 80 返回 `'critical'`,>= 60 返回 `'warn'`,else null
- [ ] `useStorageUsage()` hook: 用 useState + useEffect 周期刷新(每 5 秒,canvas 编辑/卡片创建时立即刷)
- [ ] build 验证类型

### A2: StorageMeter 组件

- [ ] 包豪斯横条(与现有 token 一致:黑边 + 灰底 + 黄/红填充)
- [ ] 顶部: `1.4 / 5 MB · 28%`(中文 `1.4 / 5 MB · 28%`)
- [ ] 中部: bar
- [ ] 下部: per-key 列表(折叠,可展开)
- [ ] 警告条(80%+):"存储接近上限,建议导出 JSON 备份并清理"
- [ ] i18n: `storage.title` / `storage.warning` / `storage.exportHint`

### A3: settings 接入

- [ ] settings/page.tsx 顶部(在 language 之前)加 `<StorageMeter />`
- [ ] build

### A4: e2e + commit

- [ ] 扩展 `scripts/f2-canvas-test.cjs`: 访问 settings 页,断言 `.storage-meter` 存在 + 百分比 > 0
- [ ] build + e2e 全过
- [ ] 单 commit `feat(storage): storage usage meter + overflow warning (v0.26.3)`
- [ ] changelog + decision record

---

## 风险

- `localStorage` 5-10MB 限制跨浏览器/操作系统(navigator.storage.estimate() 准确,fallback 5MB 安全)
- 扫所有 key 一次 ~微秒级,5 秒刷新无性能影响
- 不用清数据,纯只读展示
- e2e 只验证"渲染 + 有数字",不验证百分比特指(浏览器 localStorage 隔离)

---

## 完成标准

- settings 页面打开就有仪表盘
- 超过 80% 有红警告条 + 提示导出
- e2e 9/9 + 新增 1 个 storage assertion 通过