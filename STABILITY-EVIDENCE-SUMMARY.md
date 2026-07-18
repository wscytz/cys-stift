# Stability Evidence Summary

Generated: 2026-07-18T15:55:09.802Z

Executed gates: 28; PASS: 26; FAIL: 2.

## Command Evidence

| Lane | Gate | Exit | Seconds | Command | Log |
|---|---|---:|---:|---|---|
| baseline | install | 0 | 0 | `pnpm install --frozen-lockfile` | /Users/jinxunuo/projects/cys-stability-evidence/20260718T112226Z/gates-baseline/logs/install.log |
| baseline | lint-all | 0 | 2 | `pnpm -r lint` | /Users/jinxunuo/projects/cys-stability-evidence/20260718T112226Z/gates-baseline/logs/lint-all.log |
| baseline | test-all | 0 | 13 | `pnpm -r test` | /Users/jinxunuo/projects/cys-stability-evidence/20260718T112226Z/gates-baseline/logs/test-all.log |
| baseline | web-build | 0 | 12 | `pnpm --filter web build` | /Users/jinxunuo/projects/cys-stability-evidence/20260718T112226Z/gates-baseline/logs/web-build.log |
| baseline | tauri-debug | 1 | 31 | `pnpm --filter desktop tauri build --debug` | /Users/jinxunuo/projects/cys-stability-evidence/20260718T112226Z/gates-baseline/logs/tauri-debug.log |
| A | web-security-tests | 0 | 1 | `pnpm --filter web test -- export-service build-archive-payload safe-href card-detail` | /Users/jinxunuo/projects/cys-stability-evidence/20260718T114106Z/gates-A/logs/web-security-tests.log |
| A | web-build | 0 | 10 | `pnpm --filter web build` | /Users/jinxunuo/projects/cys-stability-evidence/20260718T114106Z/gates-A/logs/web-build.log |
| B | web-dsl-tests | 0 | 1 | `pnpm --filter web test -- dsl apply-layout canvas-host-builder agent-confirm-card` | /Users/jinxunuo/projects/cys-stability-evidence/20260718T121502Z/gates-B/logs/web-dsl-tests.log |
| B | web-build | 0 | 11 | `pnpm --filter web build` | /Users/jinxunuo/projects/cys-stability-evidence/20260718T121502Z/gates-B/logs/web-build.log |
| C | canvas-tests | 0 | 3 | `pnpm --filter @cys-stift/canvas-engine test` | /Users/jinxunuo/projects/cys-stability-evidence/20260718T122914Z/gates-C/logs/canvas-tests.log |
| D | web-desktop-contract-tests | 0 | 2 | `pnpm --filter web test -- settings capture` | /Users/jinxunuo/projects/cys-stability-evidence/20260718T130722Z/gates-D/logs/web-desktop-contract-tests.log |
| D | cargo-tests | 0 | 0 | `cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml` | /Users/jinxunuo/projects/cys-stability-evidence/20260718T130722Z/gates-D/logs/cargo-tests.log |
| D | web-desktop-contract-tests | 0 | 1 | `pnpm --filter web test -- settings capture` | /Users/jinxunuo/projects/cys-stability-evidence/20260718T130921Z/gates-D/logs/web-desktop-contract-tests.log |
| D | cargo-tests | 0 | 1 | `cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml` | /Users/jinxunuo/projects/cys-stability-evidence/20260718T130921Z/gates-D/logs/cargo-tests.log |
| E | web-accessibility-tests | 0 | 5 | `pnpm --filter web test -- self-canvas canvas` | /Users/jinxunuo/projects/cys-stability-evidence/20260718T134534Z/gates-E/logs/web-accessibility-tests.log |
| E | web-build | 1 | 11 | `pnpm --filter web build` | /Users/jinxunuo/projects/cys-stability-evidence/20260718T134534Z/gates-E/logs/web-build.log |
| E | web-accessibility-tests | 0 | 5 | `pnpm --filter web test -- self-canvas canvas` | /Users/jinxunuo/projects/cys-stability-evidence/20260718T140754Z/gates-E/logs/web-accessibility-tests.log |
| E | web-build | 0 | 10 | `pnpm --filter web build` | /Users/jinxunuo/projects/cys-stability-evidence/20260718T140754Z/gates-E/logs/web-build.log |
| F | web-build | 0 | 10 | `pnpm --filter web build` | /Users/jinxunuo/projects/cys-stability-evidence/20260718T152424Z/gates-F/logs/web-build.log |
| F | diff-check | 0 | 0 | `git diff --check` | /Users/jinxunuo/projects/cys-stability-evidence/20260718T152424Z/gates-F/logs/diff-check.log |
| E | web-accessibility-tests | 0 | 6 | `pnpm --filter web test -- self-canvas canvas` | /Users/jinxunuo/projects/cys-stability-evidence/20260718T152923Z/gates-E/logs/web-accessibility-tests.log |
| E | web-build | 0 | 20 | `pnpm --filter web build` | /Users/jinxunuo/projects/cys-stability-evidence/20260718T152923Z/gates-E/logs/web-build.log |
| all | install | 0 | 0 | `pnpm install --frozen-lockfile` | /Users/jinxunuo/projects/cys-stability-evidence/20260718T155210Z/gates-all/logs/install.log |
| all | lint-all | 0 | 3 | `pnpm -r lint` | /Users/jinxunuo/projects/cys-stability-evidence/20260718T155210Z/gates-all/logs/lint-all.log |
| all | test-all | 0 | 17 | `pnpm -r test` | /Users/jinxunuo/projects/cys-stability-evidence/20260718T155210Z/gates-all/logs/test-all.log |
| all | web-build | 0 | 11 | `pnpm --filter web build` | /Users/jinxunuo/projects/cys-stability-evidence/20260718T155210Z/gates-all/logs/web-build.log |
| all | tauri-debug | 0 | 37 | `pnpm --filter desktop tauri build --debug` | /Users/jinxunuo/projects/cys-stability-evidence/20260718T155210Z/gates-all/logs/tauri-debug.log |
| all | diff-check | 0 | 0 | `git diff --check` | /Users/jinxunuo/projects/cys-stability-evidence/20260718T155210Z/gates-all/logs/diff-check.log |

## Finding Evidence Status

> Command success does not automatically close a finding. Add commit and behavior evidence manually.

| ID | Sev | Lane | Finding | Status | Commit / evidence |
|---|---|---|---|---|---|
| N01 | P1 | A | CI 跳过 web 与 canvas-engine 测试 | NOT EVIDENCED | |
| N02 | P1 | A | Export/archive 携带 API key | NOT EVIDENCED | |
| N03 | P1 | A | 覆盖导入未删除缺失数据 | NOT EVIDENCED | |
| N04 | P1 | A | 导入媒体链接未验证 | NOT EVIDENCED | |
| N05 | P1 | B | Arrow label quote/backslash 往返损坏 | NOT EVIDENCED | |
| N06 | P1 | B | 冒号 ID 在端点中截断 | NOT EVIDENCED | |
| N07 | P1 | B | 持久化失败仍报告 applied | NOT EVIDENCED | |
| N08 | P1 | E | 画布无对象级键盘/辅助技术路径 | NOT EVIDENCED | |
| N09 | P1 | F | DSL/隐私文档事实错误 | NOT EVIDENCED | |
| N10 | P2 | C | 折角检测 off-by-one | NOT EVIDENCED | |
| N11 | P2 | C | Straight arrow 无法再次拖弯 | NOT EVIDENCED | |
| N12 | P2 | C | Hover pointer 污染 active pointers | NOT EVIDENCED | |
| N13 | P2 | C | Marquee 忽略真实 arrow route | NOT EVIDENCED | |
| N14 | P2 | C | 卡高同步后当前帧仍渲染旧对象 | NOT EVIDENCED | |
| N15 | P2 | B | 空 host 新建 arrow 丢失请求 ID | NOT EVIDENCED | |
| N16 | P2 | B | 关系求解绕过坐标上限 | NOT EVIDENCED | |
| N17 | P2 | C | No-op 产生空 undo | NOT EVIDENCED | |
| N18 | P2 | D | 快捷键注册失败后三端分叉 | NOT EVIDENCED | |
| N19 | P2 | E | 触屏高频工具小于 44px | NOT EVIDENCED | |
| N20 | P2 | E | Menu 缺少键盘契约 | NOT EVIDENCED | |
| N21 | P2 | C | 快速 eraser 固定采样上限漏对象 | NOT EVIDENCED | |
| N22 | P3 | F | 公开文档断链 | NOT EVIDENCED | |
| N23 | P3 | F | Cargo/web package 版本漂移 | NOT EVIDENCED | |
| N24 | P3 | E | Canvas 高度依赖 69px 与 100vh | NOT EVIDENCED | |

## Release Decision

```text
Decision: NO-GO
Reason: Finding status and manual/recovery gates require explicit evidence.
```
