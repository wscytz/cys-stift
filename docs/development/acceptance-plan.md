# 长效验收计划

> 2026-06-27 确立。四轮 subagent 审计(30+ 修复)后沉淀的**持续质量机制**。
> 目标:质量不回退、设计系统被遵守、新改动有门禁、复杂交互有回归保障。
>
> **分工**:
> - [`definition-of-done.md`](./definition-of-done.md) = L0 每次提交的验证门(test/lint/build)。**本文件不重复它**。
> - 本文件 = L1 发布前手测 + L2 定期深度审计 + 自动化守卫 + 设计系统合规。

---

## 一、三层验收(按频率 + 深度)

| 层 | 时机 | 内容 | 耗时 |
|----|------|------|------|
| **L0** | 每次 commit | test + lint + build(见 DoD) | <2min |
| **L1** | 每次发布/打包前 | L0 + 画布回归手测(§二)+ 守卫脚本(§三)+ 暗色扫 | ~20min |
| **L2** | 每月 / 每个大功能后 | subagent 九维审计(§四)+ WCAG 复测 + 设计系统全扫 | ~1h |

**铁律**:L0 过了不代表能发布;发布前必跑 L1。L2 防累积漂移。

---

## 二、画布回归手测清单(L1,10 条关键路径)

> 四轮审计修的 bug 固化成手测。每条都曾被改坏过 —— 跑一遍能挡住大多数回退。

画布页(`/canvas`)逐条验证,任一失败则阻塞发布:

- [ ] **1. 工具切换**:鼠标点 5 工具 + 键盘 `v/p/e/t/c`,激活态黄底黑边,画布光标随工具变
- [ ] **2. 橡皮拖擦**:eraser 按住拖过多元素全擦;**一次 Ctrl+Z 全恢复**(非多次)
- [ ] **3. 箭头**:connect 拖建箭头;选中后双击加折点/重置;拖 curve 手柄弯曲
- [ ] **4. undo/redo**:侧栏按钮 + Ctrl+Z/Y,disabled 态实时反映;拖拽合并 1 步
- [ ] **5. DSL 模态**:工具栏 DSL 按钮 → 编辑 → 应用计数诚实;「复制选中」复制选中元素片段
- [ ] **6. minimap**:显示**箭头连线**(非点)+ **frame 分区**;不被侧栏遮挡
- [ ] **7. Escape 关模态**:选中态开 CardDetailModal → 单次 Escape 关模态(非两次)
- [ ] **8. 暗色模式**:设置切暗色 → 画布底/卡片/文字都可读(无蓝灰底破功);正文灰对比度足够
- [ ] **9. .cystift 拖放**:导出带箭头/手绘的画布 → 拖回新画布 → 几何全恢复(刷新仍在)
- [ ] **10. 多画布切换**:切走再切回 → 卡片/自由形状/视图(pan/zoom/grid)都保留;text 编辑不丢

**判定**:全过 = 可发布;任一 fail = 修了再发。

---

## 三、设计系统守卫脚本(L1 自动化)

跑 `bash scripts/design-guard.sh`。grep 规则扫描违规,**零违规**才过。

### 规则

| 规则 | grep | 判据 |
|------|------|------|
| 组件层无 hex | `grep -rE '#[0-9a-fA-F]{3,6}' apps/web/src/ \| grep -v node_modules \| grep -v fallback` | 仅允许 `readToken('...', '#xxx')` 第二参数 |
| 禁第 7 色 | `grep -rn 'green\|teal\|purple\|orange\|pink' apps/web/src/` | 仅注释/测试反向断言 |
| 禁写死字体 | `grep -rn "font-family.*monospace\|'Inter'" apps/web/src/` | 全走 `var(--font-*)` |
| z-index 分层 | `grep -rn 'z-index\|zIndex' apps/web/src/` | 只出现 0/10/20/30/40/100/110/9999 |
| 8px 网格 | `grep -rE ':\s*(5|6|7|9|11|13)px' apps/web/src/` | 无破坏网格的魔法值(允许 1/2/4/8 倍数 + 10px 字号) |

> 脚本会输出每条的命中行;人眼确认是否真违规(允许的例外:Canvas 2D fallback、a11y skip-link)。

### 触发
- L1 发布前必跑
- L2 审计时跑全量 + 统计趋势

---

## 四、subagent 九维审计(L2,定期轮转)

> 四轮审计已覆盖的维度。每月或每个大功能后轮转一遍,防累积漂移。

| 维度 | 审计什么 | 关键检查点 |
|------|---------|-----------|
| 1. 交互功能 | 工具/选区/箭头/undo | 五工具切换清态、橡皮单步 undo、Escape 不卡模态 |
| 2. UI 一致性 | 五态规范遵守 | `:active` 缩放全有、激活态黄底黑边(非黑底) |
| 3. 渲染一致性 | 五视图对齐 | frame/箭头/负 bbox 在实时/SVG/minimap/overview/DSL 一致 |
| 4. 数据持久化 | 往返完整性 | 刷新恢复、多画布切换、导入导出、.cystift OPFS 竞态 |
| 5. 边缘健壮性 | 崩溃/损坏 | 空/单元素、NaN/Infinity 坐标、坏 DSL/.cystift |
| 6. 键盘 a11y | 快捷键/焦点/IME | isComposing 守卫、模态焦点陷阱、Tab 顺序 |
| 7. AI 隐私 | R2 红线 | deviceId/dataUrl/点序列/软删除卡 不进 prompt |
| 8. 资源泄漏 | 监听器/timer/RAF/订阅 | detach 全清、useEffect cleanup、PointerCapture 释放 |
| 9. i18n + token | 规范合规 | 无硬编码可见文字、6 色 token、8px 网格、字体 token |

### 触发
- 每月一次全九维
- 每个大功能后:跑相关 1-2 维(如改画布交互 → 跑 1+3+6;改 AI → 跑 7)
- 发版前:跑 1+2+7(高频/高风险三维)

### 执行
3 个 subagent 并行,每个聚焦 2-3 维,返回确认的真 bug 清单(按 🔴🟠🟡 分级)。主模型核实后修,不臆造。

---

## 五、质量基线指标(趋势监控)

每发版记录,看趋势(上升=好,下降=查):

| 指标 | 当前基线(v0.37.0) | 趋势 |
|------|------------------|------|
| 测试总数 | 1225(domain 68 + engine 379 + db 7 + web 771) | — |
| WCAG 正文对比度 | ≥4.5(gray #666 = 5.5:1)✅ | 四轮修复 |
| 画布页 First Load JS | 218 kB | tldraw 移除后稳定 |
| R2 隐私红线违规 | 0(独立审计确认) | — |
| 已知 debt | 见 STATE.md「已知 debt」 | — |

**红线**:测试数下降 / WCAG 退化 / 隐私违规 = 阻塞发版。

---

## 六、暗色模式专项(L1 必扫)

暗色模式是回归高发区(写死白底/token 缺失)。发版前:
- [ ] 设置切暗色,逐页扫:home / inbox / canvas / archive / trash / search / timeline / settings
- [ ] 画布:底色/卡片/箭头/手绘/工具栏/侧栏/minimap/模态都可见
- [ ] 无"白底写死在暗色破功"的元素(背景应走 `--color-canvas` / `--color-page-bg`)

---

## 七、发布检查表(L1 汇总)

打包前逐项打勾,全过才 `pnpm tauri build`:

- [ ] L0 门禁全过(test/lint/build exit 0)
- [ ] §二 画布回归 10 条全过
- [ ] §三 `design-guard.sh` 零违规
- [ ] §六 暗色模式全页扫
- [ ] §五 基线指标无退化(尤其测试数)
- [ ] 改动写进 `docs/changelog.md`(newest-first)
- [ ] STATE.md「下一步」更新

---

## 附录:四轮审计已修的 30+ 问题(回归参照)

修复都在 git 历史(commit `d728d2c` `dd0a835` `af5423f` `3c2cdfd` `700e98c`)。手测清单(§二)和守卫(§三)把它们固化成可重复检查,防止同类回退。

**核心教训**(每条都曾是真 bug):
- 加连续操作态必配 coalescing(否则 undo 多步)
- Escape preventDefault 会反向吞模态
- fire-and-forget OPFS save 与 mount load 竞态
- 透明边框占位防态切换跳动
- adapter detach 必 cancelAnimationFrame
- 镜像 token 文件(web/tailwind-preset/tokens.ts)要与权威源(packages/ui)同步,否则 import 顺序让错误值生效
