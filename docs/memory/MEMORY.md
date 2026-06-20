# Memory 索引

> 每条一行，按日期倒序。详细见对应文件。

- [2026-06-20 · Phase batch-confirm archive 批量软删二次确认(已交付)](decisions/2026-06-20-batch-confirm.md) — 关闭 review §🟠 UX #3(floater Soft-delete 弹 Modal + Cancel 保留 selected);tag v0.13.0-batch-confirm
- [2026-06-20 · Phase archive-detail archive tile 接 detail Modal(已交付)](decisions/2026-06-20-archive-detail.md) — 抽共享 CardDetailModal(inbox+archive 双消费)/actions prop/confirm 内置;关闭 review §🟠 UX #4;tag v0.12.0-archive-detail
- [2026-06-20 · Phase canvas-refactor useEffect 驱动 canvas-editor(已交付)](decisions/2026-06-20-canvas-refactor.md) — 关闭 review #4 #5(useValue + useEffect bridge,无 dispose 猴补丁,无 listen 无 filter);tag v0.11.0-canvas-refactor
- [2026-06-20 · Phase trash soft-delete 回收/恢复视图(已交付)](decisions/2026-06-20-trash.md) — 新 /trash 路由 + domain restore/hardDelete + AppMenu Trash 入口 + inbox 文案兑现;tag v0.10.0-trash
- [2026-06-20 · Review bugfix #1 + #3(已修)](decisions/2026-06-20-review-bugfixes.md) — import 原子性(snapshot+回滚)+ sink 注册竞态(cancelled flag);#2/#4/#5 仍 open
- [2026-06-19 · Review 发现(3 真 bug + 2 风险)](decisions/2026-06-19-review-findings.md) — #1 #3 已于 06-20 修;#2 也已于 06-20 修(trash 视图);#4 #5 canvas-editor 也已于 06-20 修(canvas-refactor);**全部 review findings 已关闭**
- [2026-06-19 · Phase 9.1 JSON 反向 import](decisions/2026-06-19-phase-9.1.md) — /settings Import 按钮 + 覆盖式写回 + capture race fallback
- [2026-06-19 · Phase 9 JSON 导出 + 用户文档](decisions/2026-06-19-phase-9.md) — /settings Export 按钮 + 开放格式 JSON + 用户文档
- [2026-06-19 · Phase 8 Tauri 打包 STUCK](decisions/2026-06-19-phase-8-stuck.md) — 本机无 Rust,骨架已就位(Phase 0),实际构建阻塞;写 stuck 决策档
- [2026-06-19 · Phase 6.5h 快捷键自定义](decisions/2026-06-19-phase-6.5h.md) — /settings + web-local settings-store + CaptureHost 读 settings + 5 断言 + 3 截图
- [2026-06-19 · Phase 6.5g 菜单栏 + CaptureSinkRegistry](decisions/2026-06-19-phase-6.5g.md) — AppMenu 4 入口 + usePathname 高亮 + Capture CustomEvent + MenuCaptureSink + registry 抽象 + domain/db 零改动 + 6 断言 + 5 截图
- [2026-06-19 · Phase 6.5f 图片上传](decisions/2026-06-19-phase-6.5f.md) — base64 inline localStorage + 详情 Modal 渲染 + UpdateCardPatch.media 扩 + 4 断言 + 3 截图
- [2026-06-19 · Phase 6.5e 统一手动 capture](decisions/2026-06-19-phase-6.5e.md) — inbox CreateCardForm 走 WebCaptureSink(source.kind=manual)统一接口 + domain/db 零改动 + 5 断言 + 1 截图
- [2026-06-19 · Phase 6.5d 画布视图持久化](decisions/2026-06-19-phase-6.5d.md) — web-local canvas-view-store + tldraw camera/gridMode 监听 + 防抖 500ms 写回 + 6 断言 + 4 截图
- [2026-06-19 · Phase 6.5c Inbox→Canvas Send](decisions/2026-06-19-phase-6.5c.md) — 详情 Modal "Send to canvas" 按钮 + moveToCanvas 复用 + tldraw 自动渲染 + 6 断言 + 5 截图
- [2026-06-19 · Phase 6.5b Inbox 多媒介编辑](decisions/2026-06-19-phase-6.5b.md) — 详情 Modal edit 模式暴露 links/code/quotes editor + editors 抽 features/card 共享 + domain/db 零改动 + 7 断言 + 6 截图
- [2026-06-19 · Phase 6.5a 草稿自动保存](decisions/2026-06-19-phase-6.5a.md) — web-local localStorage 草稿 + 500ms 防抖 + Mini Input/CreateCardForm 接草稿 + domain/db 零改动 + 7 断言 + 6 截图
- [2026-06-19 · Phase 7 Archive](decisions/2026-06-19-phase-7.md) — /archive 路由 + 网格/时间轴双视图 + 多选批量 + 蓝条 region + domain/db 零改动 + 8 截图 + 8 断言
- [2026-06-19 · Phase 6 捕获入口](decisions/2026-06-19-phase-6.md) — 全局快捷键 Cmd/Ctrl+Shift+Space + Mini Input 浮层（红边 + 顶部红条）+ WebCaptureSink 走 service.fromCapture + 8 项交互断言 + 9 张截图
- [2026-06-19 · Phase 5 Canvas 完整](decisions/2026-06-19-phase-5.md) — /canvas 工具条加 snap/free + zoom 4 按钮 + 快捷键（g + - 0 1）+ §4.3 gridSize=8 + §8 四件 + 10 张截图
- [2026-06-19 · Phase 4 Canvas 基础](decisions/2026-06-19-phase-4.md) — /canvas + tldraw v3 + Card ShapeUtil + §6.11 DB 真相源绑定（位置跨刷新持久化）+ 6 张截图
- [2026-06-19 · 设计定稿](decisions/2026-06-19-design-finalized.md) — spec 经五轮复查定稿，`docs/superpowers/specs/2026-06-19-cys-stift-design.md`
- [2026-06-19 · Phase 0 脚手架](decisions/2026-06-19-phase-0.md) — monorepo + Next.js 静态导出 + Tauri 壳 + 包豪斯占位首屏
- [2026-06-19 · Phase 1 设计系统](decisions/2026-06-19-phase-1.md) — packages/ui 组件库 + /design 视觉契约页
- [2026-06-19 · Phase 2 数据层](decisions/2026-06-19-phase-2.md) — domain + db (drizzle/SQLite) + /dev/db 烟测页 + 持久化证据
- [2026-06-19 · Phase 3 Inbox 业务](decisions/2026-06-19-phase-3.md) — /inbox production 路由 + 多媒介表单 + 详情/编辑/归档 + Markdown 渲染 + 8 张截图
