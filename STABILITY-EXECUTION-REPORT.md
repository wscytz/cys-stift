# STABILITY-EXECUTION-REPORT

## 1. 执行身份

| 字段 | 结果 |
|---|---|
| 开始 commit | `482dfbe` |
| 实现 HEAD | `0d11c30` |
| 分支 | `main`，相对 `origin/main` ahead 9，未 push |
| safety ref | `safety/pre-stability-20260718T112213Z` |
| pre-stability bundle | `/Users/jinxunuo/projects/cys-stift-pre-stability-20260718T112213Z.bundle`，`git bundle verify` PASS |
| bundle SHA-256 | `8ee8959ba1a3d9acc16ade2b710ab2e9b8005493dffc6ff229058cd517abac35` |
| 环境 | macOS 26.5; Node 24.16.0; pnpm 9.15.0; Rust/Cargo 1.96.0 |
| 预览版本 | `1.0.0-preview.1` |
| 执行日期 | 2026-07-18 |

## 2. 批次 commits

| Lane | Commit | 关闭 findings | 主要结果 | 状态 |
|---|---|---|---|---|
| A 安全/恢复 | `a720da6` | N01-N04 | CI 覆盖、secret redaction、replace/merge transaction、media validation | PASS |
| B DSL v4 | `776b866` | N05-N07, N15-N16 | Peggy v4、共享 ID/quoted string、relational solve、truthful ApplyReport | PASS |
| C Canvas | `e77bd58`, `f1fa391`, `e56166d` | N10-N14, N17, N21 | freedraw 拐点、真实箭头 route、pointer/history/render/eraser | PASS |
| D Desktop | `b90e4bb` | N18 | 快捷键 native-first 两阶段提交与回滚 | PASS |
| E UI/a11y | `643b42f` | N08, N19-N20, N24 | 对象树、键盘 command bus、菜单契约、44px、动态高度 | PASS |
| F 文档/版本 | `096b082` | N09, N22-N23 | DSL/隐私真值、断链门、统一版本源、preview 版本 | PASS |
| 产品 UX | `0d11c30` | UX review P1/P2 子集 | Canvas rail 收纳、DSL quick-start/preview、任务导航、Ask starters、Markdown 卡片摘要 | PASS |

## 3. N01-N24

| ID | 状态 | 修复 commit | 证据 |
|---|---|---|---|
| N01 | PASS | `a720da6` | CI/workspace test scripts + final all gates |
| N02 | PASS | `a720da6` | export/archive tests + cross-profile exact-key 0 hits |
| N03 | PASS | `a720da6` | replace/merge/rollback tests + Profile B stale data removed |
| N04 | PASS | `a720da6` | malicious/legal media validation tests |
| N05 | PASS | `776b866` | DSL quote/backslash round-trip tests |
| N06 | PASS | `776b866` | colon ID endpoint tests |
| N07 | PASS | `776b866` | persistence failure reports failed; no ghost/success side effects |
| N08 | PASS | `643b42f` | DOM object outline and keyboard selection/open/move/delete/undo |
| N09 | PASS | `096b082` | public DSL/privacy docs match v4 and settings v2 |
| N10 | PASS | `e77bd58` | freedraw true-corner regression tests |
| N11 | PASS | `e56166d` | straight/curve pointer lifecycle tests |
| N12 | PASS | `e56166d` | hover pointer does not pollute active pointers |
| N13 | PASS | `f1fa391` | marquee/hit-test uses visual arrow route |
| N14 | PASS | `e56166d` | card-height sync uses current frame state |
| N15 | PASS | `776b866` | empty-host arrow request ID preserved |
| N16 | PASS | `776b866` | post-solve validation and bounded relational coordinates |
| N17 | PASS | `e56166d` | lazy history prevents no-op undo entries |
| N18 | PASS | `b90e4bb` | Rust + web transactional shortcut tests |
| N19 | PASS | `643b42f` | touch target gate and 16-case UI audit |
| N20 | PASS | `643b42f` | menu arrows/Home/End/Escape/Tab/focus restore tests |
| N21 | PASS | `e56166d` | continuous eraser sweep regression tests |
| N22 | PASS | `096b082` | `pnpm docs:links`: 5 public Markdown entries PASS |
| N23 | PASS | `096b082` | generator syncs web/desktop/Cargo/Tauri/version.ts and is idempotent |
| N24 | PASS | `643b42f` | flex + `100dvh`; canvas bitmap absolute fill; responsive audit |

## 4. 自动门

Final single-run evidence: `/Users/jinxunuo/projects/cys-stability-evidence/20260718T155210Z/gates-all`.

| 命令 | Exit | 结果 |
|---|---:|---|
| `pnpm install --frozen-lockfile` | 0 | lockfile up to date |
| `pnpm -r lint` | 0 | all workspace lint PASS |
| `pnpm -r test` | 0 | web 128 files / 1629 tests; domain 82 tests; canvas-engine PASS |
| `pnpm --filter web build` | 0 | 22 static routes generated |
| `pnpm --filter desktop tauri build --debug` | 0 | debug `.app` and DMG generated |
| `pnpm --filter desktop build` | 0 | release `.app` and `1.0.0-preview.1` DMG generated |
| `pnpm docs:links` | 0 | 5 Markdown files PASS |
| `git diff --check` | 0 | PASS |
| version generator repeat check | 0 | idempotent |
| Lane E current gate | 0 | `/Users/jinxunuo/projects/cys-stability-evidence/20260718T152923Z/gates-E` |
| Lane F current gate | 0 | `/Users/jinxunuo/projects/cys-stability-evidence/20260718T152424Z/gates-F` |

`STABILITY-EVIDENCE-SUMMARY.md` also includes early baseline/superseded failed rows. The final `gates-all` directory is the authoritative current-HEAD gate result.

## 5. UI、桌面与键盘验收

- Current UI audit: `/Users/jinxunuo/projects/cys-stability-evidence/20260718T154800Z/ui-audit-current`.
- Chrome 149; `/`, `/canvas`, `/settings`, `/ask`; 390x844, 768x1024, 1024x768, 1440x900.
- 16 cases, 0 failures, no horizontal overflow, no visible button below 44px, no console failure.
- Browser journey verified Canvas `更多` menu, DSL Canvas/Text bridge, quick-start insertion and parse preview, Home quick capture, and AppMenu `/ask` route.
- Keyboard Canvas object tree journey and menu focus contract passed in browser/tests. A human VoiceOver listening pass is still an owner acceptance item; the semantic object tree and live announcements are present.
- Release bundle: `/Users/jinxunuo/projects/cys-stift/apps/desktop/src-tauri/target/release/bundle/dmg/cys-stift_1.0.0-preview.1_aarch64.dmg`.
- Debug bundle: `/Users/jinxunuo/projects/cys-stift/apps/desktop/src-tauri/target/debug/bundle/dmg/cys-stift_1.0.0-preview.1_aarch64.dmg`.

## 6. 跨 profile 恢复

Evidence: `/Users/jinxunuo/projects/cys-stability-evidence/20260718T154000Z/recovery/recovery-report.json`.

| 字段 | 结果 |
|---|---|
| Profile A 数据 | 1 card; 2 canvases; 1 freeform; 1 view; 1 template; 1 sample; 1 conversation; 1 media |
| Profile A UI export | PASS |
| API key 静态扫描 | A 0 hits; B 0 hits |
| Profile B replace import | PASS; stale card/template/sample/conversation/freeform removed |
| B 再导出 canonical diff | Equal after ignoring `exportedAt` |
| Profile B secret | Empty by design; must be re-entered |
| 注入写失败后的 rollback | PASS; prior cards byte-equal; injected title absent |

Profile A and Profile B used distinct temporary Chrome user-data directories. This was not a same-localStorage round trip.

## 7. 产品使用逻辑

- Canvas first viewport keeps high-frequency actions visible; canvas management/template/help moved to accessible `更多` menu.
- DSL is still v4 engine-backed, now exposed as Canvas <-> Text with self-contained examples and parse preview before Apply.
- Inbox/archive/search-family card previews strip Markdown markers and preserve readable line structure; full detail still uses sanitized rich Markdown.
- Home capture is an actual action, `/ask` is in primary navigation, dev archive is production-hidden, Ask has starter prompts and safe clear confirmation.
- AI still requires explicit proposal/apply confirmation; no direct destructive AI mutation was introduced.

## 8. 发布判断

```text
Decision: LOCAL GO CANDIDATE for 1.0.0-preview.1 owner acceptance
Reason: code, all automated gates, UI audit, desktop bundles, secret scan and cross-profile recovery pass on the current local commits.
Required before public release: owner visual/VoiceOver acceptance and real pushed PR CI.
Push/tag/release performed: NO
```

