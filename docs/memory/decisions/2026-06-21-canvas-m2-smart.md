# 2026-06-21 · v0.28.0-canvas-m2-smart

> 来源: F2 反馈(箭头智能化+文件拖拽+竞品对标)+ next-phase-roadmap(平台期判断)+ 用户对话(2026-06-21:个人灵感空间定位 + 传递接口预留)。

## 设计

M2 落地 5 个能力: edge connector drag / 文件多模态拖拽 / 智能关系类型推断 / 浮动关系面板 / 单卡导出 .md。

### 关键决策

1. **edge connector 用 vertex handle 而非 create handle** — vertex 是 tldraw 原生的「边中点」语义,无需自渲染,自带 hover 锚点。
2. **onHandleDrag* 回调内不传 editor,用 module-level `_currentEditor` ref** — tldraw 的 ShapeUtil method 在 React 渲染期外调用,`useEditor()` 会违 rules-of-hooks。CardShapeUtil.component 在 useEffect 里 setCurrentCardEditor(ed),卸载时清。
3. **markitdownllm 走 dynamic import** — 主 bundle 不增体积(50KB gzipped + pdfjs worker),只在用户首次拖入文档文件时按需加载。
4. **FileCaptureSink 直接调 `service.create()` 传 media**,**不**走 fromCapture — because fromCapture 丢弃 media 字段(M1 留下的口子,本 plan 不修 fromCapture,只绕开)。
5. **智能推断 = 关键词匹配,不是 AI** — 4 个内置类型的关键词表,纯字符串 contains。YAGNI:不开 AI 推理(破坏本地优先 + 零服务端卖点)。
6. **M2.5 单卡导出,不做 ZIP / 不做整画布导出** — 用户确认「最简形态」,M3 可扩。
7. **tldraw 3.15.6 `editor.createShape()` 返回 `this` 而不是 shapeId** — 与 4.x 差异,M1 已处理过(e2e 用 diff 找新 shape)。M2.1 复用同 pattern。
8. **`pdfjs-dist` 显式装顶层 dep** — markitdownllm 0.1.5 把 pdfjs 写在 `dependencies` 但 pnpm 9 strict 没拉上,需要 app 端 add。

### 不做(显式 defer)

- 整画布导出(等 M3)
- ZIP 打包(等 M3)
- AI 关系推断(本地优先边界,不做)
- File 类型的预览 UI(mediaStore 已存 base64,但详情 Modal 还没渲染 file 类型;M3 补)
- Canvas-position-aware drop(拖到画布具体位置建卡,M3 补)
- 拖入文件后自动布局
- 多文件一次合成一张 card(本 plan 一文件一 card,简单)
- tldraw 顶层不 export `TLHandle` 类型(`@tldraw/editor` 才有)—— 用 inline `CardHandle` interface 替代,零新 dep

## 交付

| 文件 | 责任 |
|---|---|
| `apps/web/src/features/canvas/card-handles.ts` | M2.1: vertex handles 配置 + createArrowFromHandle 两步走 helper + module-level editor ref |
| `apps/web/src/features/canvas/card-shape-util.tsx` | 加 getHandles + onHandleDragEnd + useEffect 写 editor ref |
| `apps/web/src/features/canvas/relation-inference.ts` | M2.3: inferRelationTypeFromContext 关键词匹配 |
| `apps/web/src/features/canvas/relation-panel.tsx` | M2.3 + M2.4: 推断 + auto-apply + 浮动位置 (inline left/top, not fixed center) |
| `apps/web/src/features/canvas/canvas-editor.tsx` | Expose `window.__cardService` for M2.3 inference |
| `apps/web/src/features/capture/file-capture-sink.ts` | M2.2: MIME 分流 (image/text/doc) + markitdownllm 转换 |
| `apps/web/src/features/capture/file-drop-handler.tsx` | 全局 window dragover/drop/paste 监听 |
| `apps/web/src/features/capture/capture-host.tsx` | 注册 `drag-drop` + `paste` sink |
| `apps/web/src/lib/toast-store.ts` | Module-level pub-sub for toast queue |
| `apps/web/src/components/toast.tsx` + `toast.module.css` | ToastHost 右下角容器 |
| `apps/web/src/lib/safe-href.ts` | 加 `isSafeFileDataUrl` 校验 (text/* + pdf + docx + xlsx + pptx + epub + image) |
| `apps/web/src/lib/serialize-card.ts` | M2.5: cardToMarkdown 纯函数 |
| `apps/web/src/lib/export-card.ts` | M2.5: downloadCardMarkdown Blob + <a download> |
| `apps/web/src/features/card/card-detail.tsx` | `CardDetailAction` 加 `'export'` + 按钮 |
| `apps/web/src/app/{inbox,archive}/page.tsx` | actions 数组加 `'export'` |
| `apps/web/src/app/layout.tsx` | 挂 `<FileDropHandler />` + `<ToastHost />` |
| `apps/web/src/lib/i18n/messages.ts` | 8 个新 i18n key (capture.* + relation.inferred + card.export*) |
| `scripts/m2-shots.cjs` | 5-section e2e |
| `docs/design/screenshots/m2/` | 5 张截图 |
| `apps/web/package.json` | + `markitdownllm@0.1.5`, + `pdfjs-dist@6.0.227` |

## 验收

- domain 26/26 + db 7/7 + web build exit 0
- e2e: 6/6 passed
- 新 dep: markitdownllm + pdfjs-dist(2 个)
