
---

# 2026-06-20 · 实际执行(v0.22.6) · 仅 deviceId C

> 本轮只恢复了重构 C(deviceId + checksum)。重构 B(workspaceId)和 A(异步 Repository)因 reset 丢失,暂未重做。

## 修复明细

### 重构 C — deviceId + checksum(完成)

- 新建 `apps/web/src/lib/device-id.ts`:`getDeviceId()` 生成/持久化 UUID(`crypto.randomUUID`,fallback 手动 v4)
- `apps/web/src/lib/media-store.ts`:`MediaAssetData` 加 `checksum` 字段,`contentHash()` SHA-1 `crypto.subtle.digest` 异步计算
- 6 处 `deviceId: 'web'` 替换:
  - `inbox/page.tsx`(1)→ `getDeviceId()`
  - `canvas-editor.tsx`(1)→ `getDeviceId()`
  - `capture-host.tsx`(2)→ `getDeviceId()`
  - `menu-capture-sink.ts`(1)→ `getDeviceId()`
  - `dev/db/page.tsx`(1)→ 保留 `'web-dev'`(dev 烟测页)
- 全 build exit 0 + domain 26/26 + db 7/7

### 重构 B(workspaceId) + 重构 A(异步 Repository)

- **未恢复**,decision doc 保留但代码待重写。

## 当前产品状态

基于 v0.15 基线 + 22 个 commit 重建后:
- ✅ 中文 i18n(全部页面双语 + ZH/EN 切换器)
- ✅ card.type 中英标签
- ✅ 全文搜索(/search 路由 + ⌘K 快捷键)
- ✅ deviceId + checksum
- ✅ 画布折叠 + 高度修 + 品牌图标 + `.app` + `.dmg`
- ❌ workspaceId(domain 类型字段 + codec)
- ❌ Repository 异步化(service 全 async)
- ❌ v0.19 search-canvas-preview(body preview + canvas shape locale 刷新)
- ❌ audit-bugfixes(5 个真 bug,除 trash Modal 已修外其余未修)
