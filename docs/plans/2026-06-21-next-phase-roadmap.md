# 下一步计划 — 2026-06-21 复审后路线

> v0.27.1 复审硬化完成,全部 18 项发现关闭。domain 26/26、db 7/7、web build 0、e2e 8/8、CI 就位。

## 当前状态

| 维度 | 真相 |
|---|---|
| Web 功能 | 完整:capture / inbox / canvas / archive / trash / settings / search / dark-mode / i18n / import-export |
| Web 数据层 | 手搓 in-memory + localStorage,5MB 配额上限,无流式,无事务 |
| Canvas 关系 | v0.27.0 M1:4 种类型(blocks/references/derived-from/related-to),arrow 原生持久 |
| 工程门禁 | CI 就位(GitHub Actions:domain/db test + web build)、typecheck gate 就位 |
| 桌面端 | Tauri .app 可本地构建(未签名),`packages/db` 为 Tauri 预留但从未接入 |
| 已知债务 | B6(主线程序列化卡顿)、packages/db 无消费者、z-order 不持久、5MB 配额无 canvas 端提示 |

## 两条路线(二选一)

### 路线 A:上架优先(推荐)

**目标**:把已完工的 web 功能**签出可分发桌面应用**。

1. **Tauri 签名公证** — 获取 Apple Developer 证书,签名 `.app`,生成公证 `.dmg`,提交 Sparkle 自动更新。不碰功能代码,只走 Apple 流程。
2. **CEF/webview smoke** — 起一版 Tauri production build,跑全量手动验收(inbox→canvas→archive→trash→export→import→dark-mode→i18n),验证 webview 没有破坏任何 web 行为。
3. **如果签名阻塞** — 先出 Windows/Linux build(无需证书),出 `brew cask` / `winget` manifest。

**不出新功能,只出分发**。工作量:Apple 证书申请等待为主,技术端 1-3 天。

### 路线 B:存储现代化

**目标**:把 localStorage 换成 IndexedDB/OPFS,消除 5MB 配额上限和主线程序列化卡顿。

1. **B6 修复** — 快照序列化迁 `requestIdleCallback` 或 Web Worker(当前 500ms 防抖里同步 `JSON.stringify`,300+ shape Canvas 会卡 1-3s)
2. **迁移到 IndexedDB** — 卡片、媒体、设置走 IndexedDB;快照走 OPFS(流式写,解锁大画布)。web 侧 API 保持 `CardRepository` 接口,不变 UI。
3. **决定 `packages/db` 去留** — 若 Tauri 走 Rust `tauri-plugin-sql`,则 `packages/db`(better-sqlite3+Drizzle)使命结束,可归档;若 Tauri 走 Node sidecar,则接入。
4. **Canvas 配额指示器** — 在画布页加轻量 toast,当 `canvasSnapshotStore.save` 失败时提示用户导出或清理。

**不破坏 UI,换存储底层**。工作量:3-5 天。

## 建议

**先 A 后 B**。理由:
- A 不写代码(只签名+smoke),不引入新 bug,产出是"能发给别人的桌面应用"
- B 是深层存储迁移,风险高,不该在签名前做 —— 改存储引入的 bug 可能阻塞发版
- A 期间如果 Apple 证书卡住,可以转向 B

## 当前最值得修的零散项(任何路线都可以先做)

| 优先级 | 项 | 工作量 |
|---|---|---|
| P1 | Canvas 配额提示:快照写入失败时在画布页轻 toast | 30 行 |
| P1 | z-order:写回 listener 同时把 tldraw page index 写入 DB `z`,使 bring-to-front 跨 reload 持��� | 10 行 |
| P2 | `packages/db` 清单:正式记 ADR,标注为"Tauri 预留,web 未使用",关掉 CLAUDE.md 里的歧义 | 1 份文档 |
| P2 | 字幕/标签:arrow 的 label 现在可用,但字体是 tldraw 默认,考虑在 relation-panel 选类型时同时设 `font: 'draw'` 匹配 Bauhaus | 1 行 |
| P3 | 暗色模式下的 tldraw 色彩:arrow color palette 在暗色底上有些色不够对比,可设 `labelColor: 'light-*'` 系列 | 几行 |

## 验收门禁(不变)

```bash
pnpm --filter domain test    # 26/26 (含 tsc --noEmit)
pnpm --filter db test        # 7/7  (含 tsc --noEmit)
pnpm --filter web build      # exit 0
```
