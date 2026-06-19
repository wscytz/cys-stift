# 开发环境搭建

> macOS 与 Windows 双平台。命令一致（pnpm），前置工具链略有不同。

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
