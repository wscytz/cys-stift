# Phase 6.5h 视觉 + 交互对照笔记

> 截图:`docs/design/screenshots/phase-6.5h/`(3 张)

---

## 结论

**Phase 6.5h 核心承诺达成(spec §5.5 "可在设置改"):`/settings` 路由 + web-local settings store + CaptureHost 读 settings 的 capture 快捷键。默认 ⌘+⇧+Space,可改成 ⌘+⇧+C 等。** 0 新依赖,domain/db 零改动。

puppeteer 5/5 断言全过:
- ✓ /settings 默认显示 `⌘+⇧+Space`
- ✓ 改成 `⌘+⇧+C`
- ✓ localStorage 持久化(`captureShortcut.code === 'KeyC'`)
- ✓ 按新组合(Ctrl+Shift+C)打开 Mini Input
- ✓ 零 page error

## 关键工程决策

1. **web-local settings store**(同 draft/canvas-view 模式):localStorage key `cys-stift.settings.v1`;Phase 8 Tauri 读相同 shape。
2. **CaptureHost 接受 meta OR ctrl**(跨平台):`sc.modKey` 只是用户偏好 label,实际匹配 `e.metaKey || e.ctrlKey`。
3. **`useSettings` + keydown deps 含 `sc.code`**:改 code → listener re-bind,无需刷新。
4. **下拉式 UI**(不是录制式):MVP 简单;录制式 + 冲突检测留后。
5. **0 新依赖** + **domain / db 零改动**。

## 已知 / 后续

- 冲突检测(快捷键被浏览器/系统占用)→ 留后
- 录制式捕获(按下即设)→ 留后
- canvas 快捷键(`+ - 0 1 g`)自定义 → 留后
- Tauri 端读 settings → Phase 8

## 测试方式

```bash
pnpm --filter domain test
pnpm --filter db test
pnpm --filter web build
node scripts/p6.5h-shots.cjs
```