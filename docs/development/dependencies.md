# 开发依赖清单

> **权威依赖清单** —— 真相源是各包的 `package.json` / `Cargo.toml` / lockfile。本档给"装了什么 + 大致版本"的快速概览;精确版本**永远以 `package.json` 为准**(本档不逐字同步,避免漂移)。
> 怎么装见 [`setup.md`](setup.md)。两者互补,勿重复维护。
> 最后核对:2026-06-26(规范化轮)。

---

## 1. 系统级工具链(本机实测 2026-06-26)

| 工具 | 实测版本 | 检查命令 | 用途 |
|---|---|---|---|
| macOS | 26.5 · **arm64** | `sw_vers` / `uname -m` | Apple Silicon |
| Xcode Command Line Tools | 随系统 | `xcode-select -p` | Rust / Tauri 原生编译**必需** |
| Git | 2.50.1 | `git --version` | 版本控制 |
| Node.js | **24.16.0** | `node --version` | JS 运行时(`engines: node>=22`;本机 24 兼容) |
| pnpm | **9.15.0** | `pnpm --version` | workspace monorepo(`packageManager` 锁 `pnpm@9.15.0`) |
| Rust (rustc) | **1.96.0** | `rustc --version` | Tauri 桌面端编译 |
| Cargo | **1.96.0** | `cargo --version` | Rust 包管理 |
| rustup 工具链 | `stable-aarch64-apple-darwin` | `rustup show` | Rust 版本管理 |
| Homebrew | — | `brew --version` | mac 包管理(nvm 等经它) |
| Google Chrome | 系统装 | — | puppeteer-core e2e(脚本硬编码 Chrome 路径) |

> ⚠️ **Rust PATH**:rustup 代理二进制在 `~/.cargo/bin`,需 `source "$HOME/.cargo/env"` 才进 PATH。本机 `~/.zshrc` 已配。新 shell `cargo: command not found` 就是这行没 source。
>
> ⚠️ **Node 版本**:仓库**无 `.nvmrc`**;`engines: node>=22` 是硬要求(在根 `package.json`)。用 nvm 时手动 `nvm use 22+`。

---

## 2. pnpm workspace 包依赖矩阵

> 真相源:各包 `package.json`。下表是概览,版本以文件为准。

### 根 `package.json`
- **devDeps**:`prettier` · `puppeteer-core` · `typescript`
- `packageManager: pnpm@9.15.0` · `engines: node>=22`
- 脚本:`dev` / `build`(`pnpm -r build`) / `lint`(`pnpm -r lint`) / `test`(`pnpm -r test`) / `tauri` / `clean`

### `apps/web` — Next.js 静态导出
- **deps**:`@cys-stift/{canvas-engine,domain,ui}`(workspace) · `next` · `react` / `react-dom` · `react-markdown` · `rehype-sanitize` · `tailwindcss` · `eventsource-parser`(SSE 流式 AI) · `markitdownllm` · `pdfjs-dist`(PDF 文本抽取)
- **devDeps**:`@types/{node,react,react-dom}` · `@vitest/ui` · `jsdom` · `typescript` · `vitest`
- 脚本:`dev` / `build` / `start` / `lint`(`tsc --noEmit`) / `test`(`vitest run`)
- **已移除**:`@tldraw/tldraw`(画布已迁自研 Canvas 2D,见 ADR `docs/adr/2026-06-23-remove-tldraw.md`)、`better-sqlite3`(仅在 `packages/db`)

### `apps/desktop` — Tauri 壳
- **deps**:`@tauri-apps/api`
- **devDeps**:`@tauri-apps/cli`
- 脚本:`tauri` / `dev`(`tauri dev`) / `build`(`tauri build`)

### `packages/domain` — 纯逻辑(🚫 零依赖铁律)
- **deps**:无(domain 不 import 任何框架)
- **devDeps**:`typescript` · `vitest`
- 脚本:`build`(`tsc -b`) / `lint`(`tsc --noEmit`) / `test`(`vitest run`)

### `packages/db` — Drizzle + SQLite 持久化
- **deps**:`@cys-stift/domain`(workspace) · `better-sqlite3` · `drizzle-orm`
- **devDeps**:`@types/better-sqlite3` · `typescript` · `vitest`

### `packages/ui` — Bauhaus 设计系统(token + 组件)
- **deps**:`react` / `react-dom`
- **devDeps**:`@types/react` / `@types/react-dom` · `typescript`
- 脚本:`build` / `lint`(无 test —— 设计系统靠 `/design` 视觉契约 + build 验证)

### `packages/canvas-engine` — 自研画布引擎(🚫 零业务依赖)
- **deps**:无(引擎不 import domain/react/next;token 走注入式 `TokenResolver`)
- **devDeps**:`jsdom` · `typescript` · `vitest`
- 脚本:`build`(`tsc -b`) / `lint`(`tsc --noEmit`) / `test`(`vitest run`)
- ADR:`docs/adr/2026-06-23-canvas-engine-extract.md`

---

## 3. Rust 依赖(`apps/desktop/src-tauri/Cargo.toml`)

- `tauri`(features `[]`)
- `tauri-plugin-global-shortcut`(全局快捷键,用户可配置)
- `tauri-build`(build-dependency)
- `serde`(+ `derive`)· `serde_json`
- `edition = "2021"` · `rust-version = "1.77"`(本机 1.96 远超)

---

## 4. 测试

| 工具 | 范围 | 覆盖 |
|---|---|---|
| **vitest** | `packages/domain` + `packages/db` + `packages/canvas-engine` + `apps/web` | 纯逻辑 / SQLite 集成 / 引擎契约+纯函数 / web feature 单测(jsdom) |
| **puppeteer-core** | 根 `scripts/*.cjs` | e2e:截图 + 交互断言 + render-sweep(静态产物 pageerror 捕获) |

**测试规模**( indicative,以 `pnpm -r test` 实际输出为准,不在此硬编码怕漂移):
- domain:纯逻辑单元
- db:SQLite 集成 round-trip
- canvas-engine:引擎契约 + 几何/渲染/DSL 纯函数 + 交互矩阵
- web:feature 单测(ai / canvas / capture / export / store 等,jsdom env)

---

## 5. 验证命令(改完代码就跑)

```bash
# 单元测试(各包)
pnpm --filter domain test          # 纯逻辑
pnpm --filter db test              # SQLite 集成
pnpm --filter @cys-stift/canvas-engine test   # 引擎契约 + 纯函数
pnpm --filter web test             # web feature 单测(vitest, jsdom)

# 类型检查(各包 lint = tsc --noEmit)
pnpm -r lint                       # 全包 tsc;web 有少量预存在 __tests__ fixture 基线(已知噪音,见 polish-phase §B;判据=零新增)

# 静态导出(产品门)
pnpm --filter web build            # 必须 exit 0,产物在 out/

# 桌面端 Rust
cd apps/desktop/src-tauri && cargo check

# e2e(需先起 dev server)
pnpm --filter web dev --port 3016 &
node scripts/<name>-shots.cjs      # 或 scripts/render-sweep.mjs
```

> **web lint 基线说明**:`pnpm --filter web lint`(`tsc --noEmit`)有少量**预存在**错误,全在 `apps/web/src/**/__tests__/*.test.ts` 的 branded-id / color-token fixture 强转处(见 `docs/development/polish-phase.md` §B)。基线数字会随修复自然下降——**不硬编码进文档**;跑 `grep -cE 'error TS'` 对比改动前后即可。**不阻塞 build**(Next build 不类型检查测试文件;vitest 自有配置跑它们)。门禁判据是"零新增",不是"零错误"。
>
> **web 测试策略(policy)**:**不依赖 `@testing-library/react`**(非 devDep)。组件测试用 `react-dom/client`(`createRoot`)+ React 19 内置的 `act`,DOM 查询走 `querySelector('[data-testid=…]')`,点击走 `el.dispatchEvent(new MouseEvent('click',{bubbles:true}))`。参考样板:`apps/web/src/lib/__tests__/use-debounced-callback.test.tsx`。vitest 配了 `esbuild.jsx:'automatic'` 让无 `import React` 的组件可在测试渲染。

---

## 6. 关键约束(依赖相关)

- 🚫 **domain 零依赖**:`packages/domain/package.json` 无 deps 是刻意的(不许 import 任何框架)
- 🚫 **canvas-engine 零业务依赖**:不 import domain/react/next;token 走 `TokenResolver` 注入(可脱离 cys-stift 独立运行)
- 🚫 **静态导出纪律**:no SSR / no API routes / no Server Actions / no `[param]` 动态路由段
- 🚫 **不加未要求依赖**(YAGNI);要加先写 ADR
- ✅ Tauri 编译前提:mac=Xcode CLT / win=MSVC Build Tools「Desktop development with C++」+ WebView2
- ✅ store snapshot 引用稳定(`useSyncExternalStore` —— 数据变化才重新分配对象)
- ✅ 各包脚本对齐:`lint` = `tsc --noEmit`(全包统一),有测试的包 `test` = `vitest run`
