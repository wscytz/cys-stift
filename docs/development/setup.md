# 开发环境搭建

> macOS 与 Windows 双平台。命令一致（pnpm），前置工具链略有不同。
> **精确版本清单见 [`dependencies.md`](dependencies.md)** —— 本档讲「怎么装」,dependencies.md 讲「装了什么 + 精确版本」。

---

## 1. 通用前置

| 工具 | 版本 | 检查 |
|---|---|---|
| Git | 2.40+ | `git --version` |
| Node | 22 LTS | `node --version`（用 nvm / nvm-windows 锁定） |
| pnpm | 9+ | `pnpm --version`（推荐 `corepack enable && corepack prepare pnpm@9 --activate`） |

跨平台铁律（见 spec §11）：

- 路径用 `path.join()` / `path.posix`，不写死 `/` 或 `\`
- 换行符 `.gitattributes` 强制 LF（仓库已配）
- 目录 / 文件全小写连字符
- 数据目录用 OS 规范路径（mac: `~/Library/Application Support`；win: `%APPDATA%`），不写死 `~/`

---

## 2. macOS

```bash
# 1) Command Line Tools
xcode-select --install

# 2) Rust（Tauri 需要）
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y

# 3) Node 22
brew install nvm
mkdir -p ~/.nvm
# 把 nvm 配置加到 ~/.zshrc（参考 nvm 官方）
nvm install 22
nvm use 22

# 4) pnpm
corepack enable
corepack prepare pnpm@9 --activate

# 5) 项目依赖
cd ~/projects/cys-stift
pnpm install

# 6) 验证
pnpm --filter web dev   # → http://localhost:3000
pnpm tauri dev          # → 弹窗
```

截图：`screencapture -i screenshot.png`（交互选区）。

---

## 3. Windows

```powershell
# 1) Rust：先装 rustup（https://rustup.rs），再装 MSVC 工作负载
#    Visual Studio Build Tools 2022 — 选 "Desktop development with C++"
#    或在已有 VS 里装该工作负载

# 2) Node 22：用 nvm-windows（https://github.com/coreybutler/nvm-windows）
nvm install 22
nvm use 22

# 3) pnpm
corepack enable
corepack prepare pnpm@9 --activate

# 4) WebView2 Runtime
#    Win11 自带；Win10 需手动装（https://developer.microsoft.com/microsoft-edge/webview2）

# 5) 项目依赖
cd path\to\cys-stift
pnpm install

# 6) 验证
pnpm --filter web dev
pnpm tauri dev
```

截图：可装 `nircmd`（命令行截图）或直接 `Win+Shift+S`。

---

## 4. 跨平台常见坑

- **路径**：Tauri fs 插件的 scope 配置需分别按 mac/win 的 OS 数据目录写（spec §11）
- **大小写**：仓库目录全小写，Windows 不敏感但 mac/Linux 敏感，**统一小写**最稳
- **行尾**：仓库强制 LF，不要让 IDE 改 CRLF
- **Tauri 编译**：各自平台编译各自产物，CI 用 GitHub Actions 双平台构建（Phase 8 引入）

---

## 5. Android（平板，可选）

> Tauri 2 支持 Android（v0.49+ 构建链打通）。架构友好：web 数据层 localStorage+OPFS 不依赖 better-sqlite3；Pointer Events 统一输入；`__TAURI__` 守卫已就位；桌面专属的 global-shortcut 已 `cfg(desktop)` 守卫。

### 一次性工具链（macOS，~2.2GB，均免 sudo）

```bash
# JDK 17（formula；temurin cask 是 .pkg 要 sudo 密码，避开）
brew install openjdk@17
# Android SDK cmdline-tools（提供 sdkmanager / adb）
brew install --cask android-commandlinetools
# SDK 组件（NDK 27 + platform-tools + android-34 + build-tools）
yes | sdkmanager "platform-tools" "platforms;android-34" "build-tools;34.0.0" "ndk;27.0.12077973"
# Rust 4 个 android targets（国内 rust-static 慢可配 RUSTUP_DIST_SERVER 镜像）
rustup target add aarch64-linux-android armv7-linux-androideabi i686-linux-android x86_64-linux-android
```

### 环境变量（每个跑 tauri android 的 shell 都要有）

```bash
source scripts/setup-android-env.sh   # 设 JAVA_HOME / ANDROID_HOME / NDK_HOME / PATH
```

长期用把同样的 export 写进 `~/.zshrc`。脚本里是 Mac Homebrew 路径（`JAVA_HOME=/opt/homebrew/opt/openjdk@17`、`ANDROID_HOME=/opt/homebrew/share/android-commandlinetools`、`NDK_HOME=$ANDROID_HOME/ndk/27.0.12077973`）。

### 初始化 + 构建

```bash
pnpm tauri android init                            # 生成 gen/android（gitignored）
pnpm tauri android build --debug --target aarch64  # 出 apk（arm64-v8a，安卓平板主流）
```

产物：`apps/desktop/src-tauri/gen/android/app/build/outputs/apk/universal/debug/app-universal-debug.apk`（debug 含符号 ~118M；release 小得多）。

`--target` 限 ABI（`aarch64`/`armv7`/`i686`/`x86_64`）。安卓平板绝大多数 arm64，`aarch64` 即可装；加 `armv7` 覆盖老设备；`x86_64` 主要模拟器用（下载慢，非平板可跳）。

### 装到设备

```bash
adb install -r <apk 路径>   # USB 调试连平板
```

### 已知（构建链已通，运行时适配待续）

- 全局快捷键是桌面概念（已 `cfg(desktop)` 守卫，安卓不注册）；设置页的快捷键配置段在安卓应 platform 守卫隐藏（目前 `invoke update_shortcut` 在安卓会 error，前端 catch no-op 不崩，但 UI 该隐藏）。
- release 分发需签名 keystore（见 Tauri Android signing 文档）。
