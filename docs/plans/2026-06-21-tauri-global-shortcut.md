# Tauri Global Shortcut Implementation Plan (Phase C)

**Goal:** 桌面端 app 在后台/失焦时,按 ⌘⇧Space(mac)/ Ctrl+Shift+Space(win)全局唤起 capture Mini Input。

**Architecture:** Rust 端 `tauri-plugin-global-shortcut` 注册快捷键,handler 里 show+focus 主窗口 + emit `global-capture-open` event。前端 CaptureHost 用 `window.__TAURI__.event.listen`(withGlobalTauri 注入,**不加 web npm 依赖**)接收 event → 打开 Mini Input。

**Scope:** MVP 硬编码 `CmdOrCtrl+Shift+Space`。动态配置(前端 settings 改 → Rust 重注册)defer。

---

## 改动文件

| 文件 | 改动 |
|---|---|
| `apps/desktop/src-tauri/Cargo.toml` | 加 `tauri-plugin-global-shortcut = "2"` |
| `apps/desktop/src-tauri/src/lib.rs` | setup 注册快捷键 + handler(show/focus + emit) |
| `apps/desktop/src-tauri/tauri.conf.json` | `app.withGlobalTauri: true` |
| `apps/desktop/src-tauri/capabilities/default.json` | 加 `global-shortcut:default`(保险) |
| `apps/web/src/features/capture/capture-host.tsx` | useEffect 监听 `global-capture-open` → 打开 Mini Input |

不动 web 的 package.json(用 withGlobalTauri 而非装 @tauri-apps/api),不动 domain/db/ui。

---

## 设计决策

### 为什么用 withGlobalTauri 而非装 @tauri-apps/api
- 装 @tauri-apps/api 到 web 包 → Next.js 静态导出 build 时需解析,且 web 也跑浏览器(非 tauri)需 try/catch 守卫,复杂
- withGlobalTauri:true 让 Tauri 注入 `window.__TAURI__`,前端 `window.__TAURI__?.event?.listen` 一行搞定,浏览器环境(undefined)自动 no-op
- web 包零新依赖

### 为什么硬编码 CmdOrCtrl+Shift+Space
- 跨平台:`CmdOrCtrl` Tauri 自动 mac=Cmd / win=Ctrl
- 与 web 端默认 captureShortcut 一致(settings 默认 modKey=meta + shift + Space)
- 动态配置(Rust 端跟随前端 settings)需 command + 状态同步,scope 大,defer

### handler 行为
show + focus 窗口(从最小化/失焦唤起)+ emit event。前端收到 → 打开 Mini Input(source.kind='shortcut')。

### 容错
plugin load / register 失败用 eprintln 警告,不 panic(快捷键被占用时 app 仍能启动,只是全局唤起失效)。

---

## 任务

### C1: Rust(Cargo.toml + lib.rs)
### C2: cargo check 验证 Rust 编译
### C3: tauri.conf.json + capabilities
### C4: capture-host.tsx 前端 listener
### C5: pnpm web build 验证前端
### C6: cargo tauri build 验证集成(慢,可选)
### C7: commit
### C8: changelog + decision record

---

## 验收
- cargo check exit 0
- pnpm web build exit 0
- cargo tauri build 产 .app(若跑)
- **全局唤起效果无法在无 GUI 环境实测**,交付代码 + 文档,用户在桌面 app 实测

## 已知风险
- macOS ⌘⇧Space 可能与系统/Spotlight 冲突(settings.captureHint 已提示)—— 用户实测,必要时改快捷键
- cargo tauri build 全量编译,5-10 分钟