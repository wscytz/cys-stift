# @cys-stift/canvas-engine

> 自研 Canvas 2D 画布引擎 —— cy's Stift 的画布核心,设计为可独立复用。

## 为什么单独做一个

tldraw / excalidraw 是优秀的画布库,但:① 许可有张力(tldraw 商用收费 / 遥测);② 箭头是「用户手选样式的几何箭头」,不是语义关系;③ 数据模型不透明。

canvas-engine 反过来:① **零许可依赖**(纯自研);② **关系箭头是语义签名**(线型 + 箭头形 + 颜色,一眼读出关系性质);③ **CanvasElement 透明统一**(live / SVG / PNG / .cystift / DSL 全是它的视图)。

## 特色

- **语义关系签名**:每种关系(blocks / references / derived-from / related-to)一个固定三维视觉编码 —— `dash` + `arrowhead` + `color`。
- **透明统一模型**:`CanvasElement[]` 一份数据,live 渲染 / SVG 导出 / PNG 光栅化 / .cystift 往返 / DSL 文本 全是它的视图。
- **token 注入**:引擎不假设 DOM 或调色板,消费者注入 `TokenResolver`。
- **零业务依赖**:不认识「卡片 / 关系」概念,内容经 `getCardInfo` 回调注入。
- **AI-native(转义)**:画布完全文字化(DSL 双向),任何 AI 能用文字驱动画布编辑。

## 核心 API

| | |
|---|---|
| `CanvasHost` | 引擎无关接口(`getElements` / `upsert` / `remove` / `onUserChange` / `onSelectionChange` / `onViewChange` / `applyWithoutEcho` / undo-redo) |
| `CanvasElement` | 统一模型(`card` / `arrow` / `freedraw` / `text` / `rect` + `dash` / `arrowhead` / `color`) |
| `SelfBuiltAdapter` | Canvas 2D 实现(渲染 + 交互 + undo/redo 50 步 + 选区 + resize + 多选 + pan/zoom) |
| `InMemoryCanvasHost` | 纯内存实现(测试 / 无 DOM 场景) |
| `renderElements` / `drawSelectionOutlines` / `drawMarquee` | 纯渲染函数(mock ctx 可测) |
| `elementsToSvg` | SVG 导出 |
| `TokenResolver` / `domTokenResolver` | token 解析(可注入,默认读 CSS 变量) |
| `dashPattern` / `arrowheadPoints` / `hitTest` / `screenToPage` | 几何纯函数 |

## 用法

```ts
import { SelfBuiltAdapter, type TokenResolver } from '@cys-stift/canvas-engine'

// 消费者注入自己的 token 解析 —— 引擎不假设 DOM / 调色板
const resolveColor: TokenResolver = (name, fallback) => myPalette[name] ?? fallback

const adapter = new SelfBuiltAdapter(canvas, {
  getCardInfo: (id) => myCardStore.get(id),  // 内容经回调注入,引擎不碰业务
  tokenResolver: resolveColor,
})

// 通用模型,所有视图同源
adapter.upsert({ id: 'c1', kind: 'card', x: 100, y: 100, w: 240, h: 120, rotation: 0 })
adapter.upsert({ id: 'a1', kind: 'arrow', x:0, y:0, w:0, h:0, rotation:0, from: 'c1', to: 'c2', dash: 'dashed', arrowhead: 'none', color: 'blue' })

adapter.onUserChange(({ updated, removed }) => persist(updated, removed))
```

## 设计纪律(见 `CLAUDE.md`)

- **零业务依赖**(`src/` 无 `@cys-stift/domain` 或业务 import)
- **框架无关**(无 `'use client'`,不绑 Next.js)
- **token 注入**(`renderElements(ctx, ..., tokenResolver)`,默认 `domTokenResolver`)
- **契约测试守护**(`CanvasHost` 契约 + 纯函数 + DSL 往返)
- **6 原色 token**(颜色经 resolver,不写裸 hex / 不引第七色)

## 来源

从 [cy's Stift](https://github.com/wscytz/cys-stift) 画布路线 A 抽出
(ADR:[`2026-06-23-canvas-engine-extract.md`](https://github.com/wscytz/cys-stift/blob/main/docs/adr/2026-06-23-canvas-engine-extract.md))。
在 cy's Stift 中作为主画布引擎实战验证(3D 渲染 + AI 编辑 + 导出全链路)。
