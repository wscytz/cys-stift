# ADR-0006 · Tauri 作为桌面壳

## 背景
需要桌面端分发（macOS + Windows）。Web 是主战场，但要原生体验。

## 决策
**Tauri v2**（Rust）+ WebView 包 web 静态产物。插件：global-shortcut / system-tray / fs / updater（陆续）。

## 后果
- ✅ 包体积 ~5MB、内存低、内存安全（vs Electron ~150MB）
- ✅ Web 代码零修改即可在桌面跑（同一份静态产物）
- ✅ 权限模型清晰（Rust capability 声明）
- ⚠️ Tauri Mobile 尚不成熟——移动端先 PWA 兜底
- ⚠️ 桌面端 = 静态导出 web；server-side 功能（Tauri 不需要）天然排除

状态：✅ Phase 0 壳就位（见 spec §6.4 / §8 Phase 8），Phase 6/8 深入
