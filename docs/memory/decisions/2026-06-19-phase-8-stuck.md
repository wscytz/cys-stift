# Phase 8 · Tauri 打包 — STUCK(需 Rust 工具链)

**日期**:2026-06-19
**状态**:🟡 STUCK — 骨架已就位(Phase 0),实际构建阻塞于 Rust 工具链
**执行模式**:主模型(Claude)按 plan 手动执行 + 自审(30 轮路线图第 11 轮)

---

## 一句话

Phase 8 Tauri 打包**无法在当前环境完成**:本机无 `rustc` / `cargo`。Phase 0 已搭好完整骨架(`apps/desktop/src-tauri/`),装 Rust 后跑 `pnpm tauri build` 即可。本阶段**不写未经验证的 Rust 代码**(诚实原则)。

## 卡在哪

```
$ rustc --version → command not found
$ cargo --version → command not found
```

Phase 8 路线图范围:
- `apps/desktop/src-tauri/Cargo.toml` 完整依赖(加 `@tauri-apps/plugin-global-shortcut`)
- `tauri.conf.json`:bundle 配置(mac .dmg + win .msi)
- 代码签名:mac `codesign` + `notarytool` 骨架
- 自动更新骨架:`@tauri-apps/plugin-updater`
- CI:GitHub Actions 矩阵

**以上全部需要 `cargo build` 验证**。无 Rust 写出来就是未经验证的代码,违反"不要假装 build 通过"铁律。

## 已就位(Phase 0)

```
apps/desktop/
├── package.json
└── src-tauri/
    ├── Cargo.toml              ✅ 基础依赖(tauri 2.x)
    ├── Cargo.lock
    ├── tauri.conf.json         ✅ 基础配置
    ├── build.rs
    ├── capabilities/default.json
    ├── icons/                  ✅ 完整图标集
    └── src/
        ├── main.rs             ✅ 入口
        └── lib.rs              ✅ lib
```

## 下一步(用户装 Rust 后)

1. **装 Rust**:`curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh`
2. **验证**:`cd apps/desktop/src-tauri && cargo check`
3. **加全局快捷键 plugin**:
   - `Cargo.toml` 加 `tauri-plugin-global-shortcut = "2"`
   - `lib.rs` 注册插件 + `register("Cmd+Shift+Space", ...)`
   - JS 侧加 `TauriCaptureSink implements CaptureSink`(`features/capture-tauri/`)→ `captureSinkRegistry.register('tauri', ...)`
4. **打包**:`pnpm tauri build`(mac 出 `.dmg` / win 出 `.msi`)
5. **签名 + 公证**(mac):需要 Apple Developer 证书 + teamId
6. **CI**:GitHub Actions `macos-latest` + `windows-latest` 矩阵

## 已尝试方案

无(环境阻断,不是代码问题)。

## 建议

- **短期**:跳过 Phase 8,继续 Phase 9(JSON 导出 + 文档,纯 web 可完成)
- **中期**:用户在本机装 Rust 后单独跑 Phase 8(估计 8-10 轮工作量,但需人工 + Apple 证书)
- **替代**:用 PWA 兜底(spec §12 风险 #2),先不做桌面端

## 路线图影响

Phase 8 STUCK 不阻断 Phase 9(导出不依赖 Tauri)。Phase 9 完成后,产品已是**完整可用的 web 应用**(PWA-friendly);桌面端是锦上添花。

详见 `docs/development/roadmap.md` §3.5 失败模式 + 根 `CLAUDE.md` 硬性禁止"假装 build 通过"。