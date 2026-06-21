# 2026-06-21 · v0.25.0-tauri-global-shortcut

> Phase C(战略级)。桌面端全局快捷键,app 后台/失焦也能唤起 capture。

## 背景

产品 slogan "灵感 3 秒记,随时记" 的"随时"前提:app 在后台也能唤起。Phase C 之前,⌘⇧Space 只在 app 前台时工作(web keydown listener,capture-host.tsx)。切到别的 app → 快捷键失效 → 桌面端沦为套壳浏览器,失去相对 web 的核心差异。

## 修复明细

### Rust 端

`apps/desktop/src-tauri/`

- `Cargo.toml`:`+tauri-plugin-global-shortcut = "2"`(cargo 解析到 v2.3.2,与 tauri 2.1.1 兼容)
- `src/lib.rs`:setup 里 `#[cfg(desktop)]` 注册全局快捷键
  - `app.handle().plugin(Builder::new().with_handler(...).build())` 加载 plugin + handler
  - handler:`ShortcutState::Pressed` 时 `window.show()` + `window.set_focus()`(主窗口)+ `app_handle.emit("global-capture-open", ())`
  - `app.global_shortcut().register("CmdOrCtrl+Shift+Space")`
  - plugin load / register 失败用 `eprintln!` 警告,**不 panic**(快捷键被占用时 app 仍启动,只是全局唤起失效)
- `tauri.conf.json`:`app.withGlobalTauri = true`
- `capabilities/default.json`:`+global-shortcut:default`

### 前端

`apps/web/src/features/capture/capture-host.tsx`

新增 useEffect 监听 Tauri event:
```ts
const tauri = (window as ...).__TAURI__
if (!tauri?.event?.listen) return  // 浏览器 no-op
tauri.event.listen('global-capture-open', () => {
  setOpenKind('shortcut')
  setOpen(true)
})
```

收到 event → 打开 Mini Input(source.kind='shortcut',与键盘快捷键一致)。

## 关键决策

### 为什么用 withGlobalTauri 而非装 @tauri-apps/api

两条路:
- **A. 装 @tauri-apps/api 到 web 包** → Next.js 静态导出 build 时需解析该包;web 也跑浏览器(非 tauri),需 try/catch 或 isTauri() 守卫;增加 web bundle + 一个只在桌面用的依赖
- **B. withGlobalTauri:true 注入 window.__TAURI__** → 前端 `window.__TAURI__?.event?.listen` 一行;浏览器环境 `__TAURI__` undefined 自动 no-op;**web 包零新依赖**

选 B。web 保持纯浏览器可跑(开发/预览不依赖 Tauri),桌面端 Tauri 注入 API。

### 为什么硬编码 CmdOrCtrl+Shift+Space

- `CmdOrCtrl` 是 Tauri 的跨平台修饰符(mac=Cmd / win=Ctrl)
- 与 web 端 settings 默认 captureShortcut(modKey=meta + shift + Space)一致 → 前台 web listener 和后台 Tauri 全局快捷键**同一个组合**,用户体验一致
- 动态配置(前端 settings 改快捷键 → 调 Rust command 重注册)需要:Rust 暴露 register/unregister command + 前端 settings 变化时调用 + 状态同步。scope 大,defer 到后续档

### 为什么 handler 三步(show + focus + emit)而非直接 Rust 创建卡片

- 卡片创建逻辑(domain fromCapture + captureSinkRegistry)在 web 端,Rust 不应重复
- Rust 只负责"唤起注意"(show/focus)+ "通知前端"(emit),前端收到后走统一的 Mini Input 流程(用户可输 title/body,source.kind 正确)
- 职责分离:Rust = 系统集成,web = 业务

### 为什么 plugin/register 失败不 panic

- 快捷键可能被 OS / 其他 app 占用(macOS Spotlight / 输入法)→ register 返回 Err
- 若 panic,app 启动失败,用户完全没法用
- eprintln 警告 + 继续 → app 正常启动,前台 web 快捷键仍工作,只是后台全局唤起失效
- 用户可在 settings 改快捷键(未来动态配置)或关掉冲突的 OS 快捷键

## 验收

- `cargo check` exit 0(tauri-plugin-global-shortcut v2.3.2 编译通过)
- `pnpm --filter web build` exit 0(前端 Tauri listener 类型正确,浏览器 no-op)
- `cargo tauri build`(release)exit 0 → 产 `cy's Stift.app` + `.dmg`
- ⚠️ **全局唤起效果未经 GUI 实测**(开发环境无 GUI 交互)。代码逻辑 + build 验证通过,实际"最小化/切后台后按 ⌘⇧Space 唤起"需用户在桌面 app 手动测

## 已知风险

- **macOS ⌘⇧Space 系统冲突**:Spotlight 默认 ⌘Space(不冲突),输入法 ⌃⌘Space(不冲突),但用户若自定义过系统快捷键可能撞。settings.captureHint 已提示。冲突时 register 失败 → eprintln → 前台仍可用
- **首次可能需权限**:macOS 全局快捷键用 RegisterEventHotKey(Carbon),通常不需辅助功能权限,但某些 macOS 版本可能弹"允许控制"。用户实测确认
- **Cargo.lock 变化**:加 tauri-plugin-global-shortcut + 10 个传递依赖(global-hotkey / x11rb 等,linux 路径),已 commit

## 不修复的发现(明确 defer)

- ⏸️ 动态快捷键配置(前端 settings → Rust command 重注册)
- ⏸️ 菜单栏/tray icon(Phase C 原提过,但全局快捷键已覆盖核心"后台唤起"需求,tray 留后续)
- ⏸️ 媒体入口 / OPFS(用户搁置)
- ⏸️ canvas body preview / 其他 backlog

## 已知遗留(明确 out of scope)

无 — Phase C 核心落地,动态配置 + tray 明确 defer。