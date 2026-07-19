# 开发环境搭建

> macOS 与 Windows 双平台。命令一致（pnpm），前置工具链略有不同。
> **精确版本以仓库 manifest 为准** —— 根 [`package.json`](../../package.json)、Web [`apps/web/package.json`](../../apps/web/package.json) 与 Desktop [`apps/desktop/package.json`](../../apps/desktop/package.json) 锁定脚本和依赖；`pnpm-lock.yaml` 锁定解析结果。

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

### 文档与版本门禁

产品版本只改根 [`package.json`](../../package.json)；构建前的 `scripts/gen-version.mjs` 会同步 Web/Desktop manifest、Cargo metadata、Tauri 配置和 Web 的生成常量。提交前可运行：

```bash
pnpm docs:links
node scripts/gen-version.mjs
git diff --exit-code -- apps/web/src/lib/version.ts apps/web/package.json apps/desktop/package.json apps/desktop/src-tauri/Cargo.toml apps/desktop/src-tauri/Cargo.lock apps/desktop/src-tauri/tauri.conf.json
```

`docs:links` 只检查本仓库公开入口文档的相对链接；外部 provider/发行页链接不在离线检查范围内。

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
- **不要在同一工作树同时跑 `next dev` 和 `next build`**：两者共享 `apps/web/.next`。生产构建会重写开发服务器正在读取的 CSS/类型缓存，旧 dev 进程可能继续响应但丢失全局 token 样式。构建后请停止旧进程并重新启动；并行预览请使用另一份 worktree。

产品展示页的独立预览、静态导出和发布前检查见 [`showcase.md`](showcase.md)。

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

### 运行时验证(v0.53.1,首次 emulator 跑暴露的隐患)

构建链通≠运行正常。首次跑 Android Studio emulator(arm64-v8a Android 14)暴露 3 个运行时隐患,已修:

- **rustls ring provider**(致命闪退):Tauri 间接依赖 reqwest 走 rustls,安卓无 native-tls 后端 → 启动建 Client 时 panic `No rustls crypto provider is configured`。修:Cargo.toml 加 android-only `rustls = { default-features = false, features = ["std", "ring"] }`,lib.rs `run()` 开头 `rustls::crypto::ring::default_provider().install_default()`(用 ring 不用 aws_lc_rs,免 cmake)。
- **首页平台检测 hydration**:render 时直读 `detectIsMac()`/`isDesktop()` SSG 值与客户端首帧不符 → hydration failed。改 SSR-safe hooks(`lib/use-platform.ts` 的 `useIsMac`/`useIsMobile`/`useIsDesktop`,pre-mount 默认匹配 SSG,effect 纠正)。
- **移动端 UI 门控**:全局快捷键设置段 + CaptureHint 黄横幅 + inbox 空状态 ⌘ 提示 → 移动端隐藏(文案写死 ⌘,安卓无 Cmd 概念,误导)。

### 开发工作流(重要,免重踩)

- Android Studio **只用于** Device Manager(启动 AVD)+ Logcat;**绝不在 Studio 里点 Build/Sync**(launchd 给 GUI app 的 PATH 是 `/usr/bin:/bin` 最小集,不读 `/etc/paths.d` → Gradle daemon 找不到 pnpm/node)。
- 构建走 **系统 Terminal.app**(载 .zshrc → nvm → 完整 PATH):`source scripts/setup-android-env.sh && pnpm tauri android dev`。该脚本设 `JAVA_HOME=brew JDK 17`(与 Studio 的 JBR 不同 → 不复用 daemon → 全新终端 daemon 带完整 PATH)。
- `~/.gradle/init.gradle`:阿里云 Maven 镜像(public/google/gradle-plugin)+ 保留 originals 兜底(单镜像 5xx 不级联成全量失败)。
- Tauri CLI 2.1.0 `android dev` **无** `--target` flag(只有 `build` 有);ABI 按 connected device 自动判。
- reqwest/rustls 在安卓需手动装 crypto provider(见上)。

### 待续

- release 分发需签名 keystore(见 Tauri Android signing 文档)。
- WebView Canvas 性能 + OPFS 版本差异实机调优。
