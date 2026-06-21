# 2026-06-21 · v0.33.0-canvas-export(P5)

> 来源: 总推进 Roadmap P5 — 用户选为下一 phase("开始吧，做出特色")。
> 技术参考: drawio 30.2.5(导出专家)+ AFFiNE 0.26.3(safe-filename)，详见
> `docs/development/reference-patterns.md` §P5。

## 设计

画布导出 SVG / PNG,**`.cystift` 往返**作为特色:导出的图片内嵌完整画布
(卡片 + tldraw 快照 + 画布元数据),拖回应用即可在新画布恢复。单文件便携卡片，
本地优先 app 的高杠杆特性(drawio P5-7 的 `.drawio.png` 套路，移植到我们的 tldraw 栈)。

### 关键决策

1. **tldraw 原生做重活** — `editor.getSvgString(shapes, {scale, background, padding})`
   走 shape→SVG walk + 对称 border(= drawio `border`→tldraw `padding`)。我们不手算
   栅格几何(drawio `mxImageExport` 不可移植，tldraw 内置了)。
2. **`.cystift` payload = 卡片 + 快照** — 卡片内容(title/body/links…)在 CardService，
   tldraw 快照只有几何;完整恢复两者都要。重导入:create 新画布、`CardService.create`
   给每卡新 id(避免碰撞)、把快照里的 `shape:<oldId>` 字符串替换成新 id、存快照、
   切到新画布(onMount 自动 loadSnapshot)。
3. **字体嵌入走 base64 @font-face** — `await document.fonts.ready` 后扫 SVG 的
   `font-family`，匹配 `document.styleSheets` 的 @font-face 规则(next/font 自托管
   woff2)，fetch→base64 注入 `<style>`。**不走 Google Fonts `@import`**(违背本地优先)。
4. **PNG `tEXt` chunk 自写** — 纯 TS PNG tEXt writer/reader(~90 行含 CRC32)，payload
   `encodeURIComponent` 后存 Latin-1 chunk(ASCII 安全，CJK 不炸)。drawio 同套路(键
   `mxfile`，我们键 `cystift`)。
5. **getSvgString 首调 undefined 重试** — tldraw 在新会话首次导出时 getSvgString 可能
   返回 undefined(asset/render 未 settle)。`exportCanvasSvg` 内 10×150ms 重试兜底。
6. **JPEG 不带 cystift** — JPEG 无干净的 metadata 通道(本 phase 不做);SVG/PNG 默认带。

### 文件清单

| 文件 | 作用 |
|---|---|
| `apps/web/src/features/canvas/export-bounds.ts` | 纯几何核心(unionBounds/expandBounds/getSafeFileName)+ tldraw adapter(resolveExportShapes) |
| `apps/web/src/lib/png-text-chunk.ts` | 纯 PNG tEXt chunk writer/reader + CRC32 + encode/decode payload |
| `apps/web/src/features/canvas/cystift-payload.ts` | .cystift payload 构建/恢复 + SVG(data-cystift)/PNG(tEXt) 嵌入提取 + restoreFromFile |
| `apps/web/src/features/canvas/export-svg.ts` | SVG 导出管线(getSvgString + 字体/图片嵌入 + cystift + 重试) |
| `apps/web/src/features/canvas/export-raster.ts` | PNG/JPEG 导出(getSvgAsImage + PNG cystift chunk) |
| `apps/web/src/features/canvas/export-dialog.tsx` | Bauhaus 导出对话框(format/scope/scale/border/background + cystift 高亮卡) |
| `apps/web/src/features/canvas/__tests__/export-bounds.test.ts` | 18 it(unionBounds/expandBounds/getSafeFileName/resolveExportShapes) |
| `apps/web/src/lib/__tests__/png-text-chunk.test.ts` | 8 it(tEXt 往返 + Unicode payload) |
| `apps/web/src/features/canvas/__tests__/cystift-payload.test.ts` | 5 it(SVG data-cystift 往返) |
| `apps/web/src/app/canvas/page.tsx` | 改:工具栏加 Export 按钮 + ExportDialog |
| `apps/web/src/features/capture/file-drop-handler.tsx` | 改:拖入 .cystift.png/svg → 恢复画布(否则走原 capture) |
| `apps/web/src/lib/i18n/messages.ts` | 改:+ canvas.export* + cystift* 文案(zh/en) |
| `scripts/p5-export-shots.cjs` | 新:e2e(warmup + PNG/SVG blob 捕获 + cystift 解码断言) |

## 验收

- **domain 26/26 ✅**(零改动)· **db 7/7 ✅**(零改动)
- **web vitest 52/52 ✅**(21 旧 + 18 export-bounds + 8 png-text-chunk + 5 cystift-payload)
- **web build exit 0 ✅**
- **e2e p5-export PASS ✅**:对话框打开 + PNG cystift tEXt 解码(app=cys-stift, cards=1)+ SVG data-cystift 解码 + 零 page error
- **e2e canvas-refactor PASS ✅**:Export 按钮 + 对话框未回归画布页

## 不做(defer)

- ❌ PDF / 打印(drawio 服务端 PDF 不可移植;浏览器打印 tile 后续 phase)
- ❌ webp / dpi 预设 / grid 栅格化(需求未现)
- ❌ JPEG 带 cystift(无干净 metadata 通道)

## Self-Review

- **特色兑现**: `.cystift` 往返是本 phase 的差异化点 — 导出图片即完整画布，拖回恢复。
  e2e 实证 PNG tEXt + SVG data-cystift 都能往返解出 payload。
- **纯逻辑单测覆盖**: 边界几何 / 文件名 / PNG chunk / payload 编码 / SVG 嵌入全是纯函数，
  31 it 锁住行为;tldraw 依赖部分由 e2e 兜底。
- **重试修复真 bug**: getSvgString 首调 undefined — 不只 e2e 命中，真实用户在卡片刚建
  后立刻导出也会撞上。10×150ms 重试兜底。
- **本地优先守住**: 字体嵌入强制 base64 data URI(不走网络字体 CDN);media 二进制不外发
  (导出的是用户自己的内容，无 AI/隐私面)。
- **风险**: 重导入的快照 `shape:id` 字符串替换理论上若某 cardId 是另一 cardId 的子串
  会误替换;实际 cardId 是 UUID(足够独特)，风险极低。

## Acceptance Gate

```bash
pnpm --filter domain test     # 26/26 ✅
pnpm --filter db test         # 7/7 ✅
pnpm --filter web exec vitest run   # 52/52 ✅
pnpm --filter web build       # exit 0 ✅
# e2e(需 build + 静态服务 :3016):
node scripts/canvas-refactor-shots.cjs   # PASS ✅
node scripts/p5-export-shots.cjs         # PASS ✅
```

## 关联

- 参考分析: `docs/development/reference-patterns.md` §P5
- Roadmap: `/Users/jinxunuo/.claude/plans/serialized-floating-fog.md` §P5
