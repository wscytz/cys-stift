# 开发依赖清单

> **权威依赖清单** —— 本机实测版本(2026-06-20)。`/compact` 或 `/clear` 后读此档 + [`setup.md`](setup.md)(怎么装)即可重建环境。
> 本档列「装了什么 + 精确版本」;`setup.md` 列「怎么装」。两者互补,勿重复维护。

---

## 1. 系统级工具链(本机实测)

| 工具 | 实测版本 | 检查命令 | 用途 |
|---|---|---|---|
| macOS | 26.5 · **arm64** | `sw_vers` / `uname -m` | Apple Silicon |
| Xcode Command Line Tools | 26.5 | `xcode-select -p` | Rust / Tauri 原生编译**必需** |
| Git | 2.40+ | `git --version` | 版本控制 |
| Node.js | **24.16.0** | `node --version` | JS 运行时(`engines: node>=22`;`.nvmrc` 锁 22,本机 24 兼容) |
| pnpm | **9.15.0** | `pnpm --version` | workspace monorepo(`packageManager` 锁 `pnpm@9.15.0`) |
| Rust (rustc) | **1.96.0** | `rustc --version` | Tauri 桌面端编译 |
| Cargo | **1.96.0** | `cargo --version` | Rust 包管理 |
| rustup 工具链 | `stable-aarch64-apple-darwin` | `rustup show` | Rust 版本管理 |
| Homebrew | 5.1.14 | `brew --version` | mac 包管理(nvm 等经它) |
| Google Chrome | 系统装 | `/Applications/Google Chrome.app/...` | puppeteer-core e2e(脚本硬编码此路径) |

> ⚠️ **Rust PATH**:rustup 代理二进制在 `~/.cargo/bin`,需 source `~/.cargo/env` 才进 PATH。本机 `~/.zshrc` 已含 `source "$HOME/.cargo/env"`(2026-06-20 修正)。若新 shell `cargo: command not found`,就是这行没配上。

---

## 2. pnpm workspace 包依赖矩阵

### 根 `package.json`
- **devDeps**:`prettier 3.3.3` · `puppeteer-core 23.10.4` · `typescript 5.6.3`
- `packageManager: pnpm@9.15.0` · `engines: node>=22` · 脚本:`dev` / `build` / `test` / `tauri` / `clean`

### `apps/web` — Next.js 静态导出
- **deps**:`@cys-stift/{db,domain,ui}`(workspace) · `@tldraw/tldraw 3.15.6` · `better-sqlite3 11.5.0` · `next 15.0.3` · `react` / `react-dom 19.0.0` · `react-markdown 9` · `rehype-sanitize 6` · `tailwindcss 4.0.0-beta.3`
- **devDeps**:`@types/better-sqlite3 7.6.11` · `@types/node 22.9.0` · `@types/react` / `@types/react-dom 19.0.0` · `typescript 5.6.3`
- ⚠️ **无 vitest**(web 验证靠 `build` + puppeteer e2e)

### `apps/desktop` — Tauri 壳
- **deps**:`@tauri-apps/api 2.1.1`
- **devDeps**:`@tauri-apps/cli 2.1.0`
- 脚本:`tauri` / `dev` / `build`(根 `pnpm tauri` 转发到此)

### `packages/domain` — 纯逻辑(🚫 零依赖铁律)
- **deps**:无(domain 不 import 任何框架)
- **devDeps**:`typescript 5.6.3` · `vitest 2.1.5`

### `packages/db` — SQLite 持久化
- **deps**:`@cys-stift/domain`(workspace) · `better-sqlite3 11.5.0` · `drizzle-orm 0.36.4`
- **devDeps**:`@types/better-sqlite3 7.6.11` · `typescript 5.6.3` · `vitest 2.1.5`

### `packages/ui` — 设计系统(token + 组件)
- **deps**:`react` / `react-dom 19.0.0`
- **devDeps**:`@types/react` / `@types/react-dom 19.0.0` · `typescript 5.6.3`

---

## 3. Rust 依赖(`apps/desktop/src-tauri/Cargo.toml`)

- `tauri 2.1.1`(features `[]`)
- `tauri-build 2.0.3`(build-dependency)
- `serde 1.0`(+ `derive`)· `serde_json 1.0`
- `edition = "2021"` · `rust-version = "1.77"`(本机 1.96 远超)

**Phase 8 待加(按需,非 build 前提)**:`tauri-plugin-global-shortcut` · `tauri-plugin-updater`

---

## 4. 测试工具

| 工具 | 版本 | 范围 | 覆盖 |
|---|---|---|---|
| vitest | 2.1.5 | `packages/domain` + `packages/db` | domain 11 tests · db 7 tests(纯逻辑 / SQLite 集成) |
| puppeteer-core | 23.10.4 | 根 `scripts/p*-shots.cjs` | web e2e:截图 + 交互断言(`p6`/`p6.5*`/`p7`/`p9`/`p9.1`/`import-rollback`) |

---

## 5. 验证命令(改完代码就跑)

```bash
pnpm --filter domain test     # 11 tests(纯逻辑,快)
pnpm --filter db test         # 7 tests(SQLite 集成)
pnpm --filter web build       # 静态导出,必须 exit 0
# 桌面端:
cd apps/desktop/src-tauri && cargo check   # Rust 编译验证
# e2e(需先起 dev server):
pnpm --filter web dev --port 3016 &
node scripts/<pN>-shots.cjs
```

---

## 6. 关键约束(依赖相关)

- 🚫 **domain 零依赖**:不许 import 任何框架(`packages/domain/package.json` 无 deps 是刻意的)
- 🚫 **静态导出纪律**:no SSR / no API routes / no Server Actions / no `[param]` 动态路由段
- 🚫 **不加未要求依赖**(YAGNI);要加先写 ADR
- ✅ Tauri 编译前提:mac=Xcode CLT / win=MSVC Build Tools「Desktop development with C++」+ WebView2
- ✅ snapshot 引用稳定(`useSyncExternalStore`)
