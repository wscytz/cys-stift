# Phase 6.5g 视觉 + 交互对照笔记

> 截图:`docs/design/screenshots/phase-6.5g/`(5 张)

---

## 结论

**Phase 6.5g 核心承诺达成(spec §5.5 + §7):全局 AppMenu(4 入口:Inbox / Canvas / Archive / Capture)+ CaptureSinkRegistry 抽象 + MenuCaptureSink。所有路由菜单可见,当前路由高亮;点 Capture dispatch CustomEvent → CaptureHost 开 Mini Input;`source.kind='menubar'`。** 0 新依赖。

puppeteer 6/6 断言全过:
- ✓ AppMenu 在 home 可见
- ✓ /inbox 高亮 Inbox
- ✓ /canvas 高亮 Canvas
- ✓ /archive 高亮 Archive
- ✓ 点 Capture → Mini Input 开
- ✓ save → `card.source.kind === 'menubar'`

## 关键工程决策

1. **CustomEvent `cys-stift:open-capture`**:AppMenu dispatch → CaptureHost listen。不引入 Zustand/event-bus 库,单实例 CaptureHost 是 open 状态唯一持有者。
2. **CaptureSinkRegistry**:模块单例 `Map<string, CaptureSink>` + `register/submit`;Phase 8 TauriCaptureSink 直接 `register('tauri', ...)`。
3. **`openKind: 'shortcut' | 'menubar'` 状态**:CaptureHost 追踪谁打开的,save 时用对应 `source.kind`。Phase 8 加 Tauri 快捷键同样模式。
4. **MenuCaptureSink 与 WebCaptureSink 对称**:都走 `service.fromCapture`,实现差异只在 source.kind。
5. **CaptureSinkRegistry 在 CaptureHost / inbox mount 时动态 import + register**:service 注入,组件 unmount 时 unregister。

## 已知 / 后续

- TauriCaptureSink(global-shortcut plugin + OS 级)→ Phase 8
- Webhook / mobile / alfred sink → 留后
- 菜单栏用户自定义 → P6.5h

## 测试方式

```bash
pnpm --filter domain test
pnpm --filter db test
pnpm --filter web build
node scripts/p6.5g-shots.cjs
```