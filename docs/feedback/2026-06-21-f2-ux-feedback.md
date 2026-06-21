# 2026-06-21 · 用户反馈 F2 + 外部对标研究

> 来源:用户反馈(箭头智能/文件拖拽/竞品功能)+ 5 轮 web search 调研(tldraw SDK/markitdownllm/Scrintal/Heptabase/Constella/VIA/Obsidian Canvas/Bauhaus UI)。本文综合记录,供下一轮 plan。

---

## 一、箭头智能化(用户反馈 + 技术验证)

### 1.1 从 card edge 拖出箭头(技术可行,零 fork)

**已验证**:tldraw 的 `ShapeUtil.getHandles()` 可以在自定义 shape 上定义连接点,`onHandleDrag` 追踪拖拽,`onHandleDragEnd` 中 programmatic 创建 arrow + binding。**无需 fork tldraw**。

实施路线:
- `CardShapeUtil.getHandles()` 返回 4 个 `vertex` handle(上下左右各一个)
- `onHandleDragEnd`:检测 handle 落在哪个 shape 上 → `editor.createShape({type:'arrow'})` + `editor.createBindings`
- 参考:[tldraw.dev/sdk-features/handles](https://tldraw.dev/sdk-features/handles) · [tldraw.dev/examples/create-arrow](https://tldraw.dev/examples/create-arrow)

对标产品:Heptabase 的 card edge connector 就是这个模式 —— 鼠标 hover 卡片时显示连接点,拖拽直接拉出箭头。这是 M1 的 UX 瓶颈:当前用户必须切到 arrow 工具才能画连接,**零熟练度门槛应该做到 hover→拖→连**。

### 1.2 智能关系类型推断

用户反馈:不需要每次都手动选关系类型。方案:
- 在 `applyRelationType` 之前加一步 `suggestRelationType`:
  - 卡 A 标题/body 含"TODO/待办/阻塞/block" → 默认 `blocks`
  - 卡 A 的 links 指向卡 B 的标题 → 默认 `references`
  - 卡 A 的 body 含"引用/来源/from" → 默认 `derived-from`
  - 其他 → 默认 `related-to`
- 关系面板仍然显示(可覆盖),但**默认值已经是智能的**,不需要每次都手动点
- 对标 Constella:AI 自动推断卡片间的关系,用户只需确认

---

## 二、文件拖拽导入(技术方案明确)

### 2.1 浏览器端文件解析

**markitdownllm**(npm)一键转换 PDF/DOCX/XLSX/PPTX/HTML/CSV/EPUB → Markdown,**纯浏览器端,零服务端**。底层链:
- DOCX → `mammoth` · XLSX → `SheetJS` · PDF → `pdfjs-dist` · HTML → `Turndown`

cy's Stift 只需要:
1. 监听 `drop` / `paste` 事件
2. `FileReader` + markitdownllm → Markdown body
3. 文件名 = card title,body = 解析后的 Markdown
4. `captureSinkRegistry.submit()`(canvas)或 `service.create()`(inbox)
5. `source.kind = 'drag-drop'`(域层已定义,**零行接线**)

### 2.2 剪贴板粘贴

同一套逻辑处理 `paste` 事件:
- `navigator.clipboard.read()` → 有图片 → 转 base64 → `mediaStore` → `MediaAsset`
- 有文字 → 创建 note card
- 有 URL → 创建 link card,可后续 fetch LinkPreview
- 有文件 → 走上述文件解析流程

---

## 三、竞品对标(功能差距清单)

### 3.1 直接竞品

| 产品 | 核心模式 | cy's Stift 差距 |
|---|---|---|
| **Scrintal** | atomic card + infinite canvas + bidirectional link + foldable card | 无 card 密度切换(compact/snippet/full)、无[[wikilink]]、无多 board 共用同一卡 |
| **Heptabase** | card + whiteboard + connector drag + nested hierarchy | 无 edge connector drag、无 card hierarchy(parent/child) |
| **Obsidian Canvas** | node-graph + Markdown + community plugins | 无固定尺寸卡片(用户声量很大)、无 corkboard 视图 |
| **Constella** | AI 自动推断关系 + Zettelkasten + visual graph | 无 AI 关系推断、无 embedding search |
| **VIA Canvas** | "Miro meets NotebookLM"—— AI 生成子卡片 + 自动布局 | 无 AI 布局、无"Grow"机械手(右键生成子话题) |
| **Kosmik** | 浏览器内 visual canvas + 媒体嵌入 | 无视频/音频嵌入 |

### 3.2 Freeform(Apple)功能对比

| Freeform | cy's Stift |
|---|---|
| 手绘 + 形状 + 便签 + 箭头 | ✅ 都有 |
| 文件拖入画布(PDF/Word/Excel) | ❌ 零接线 |
| Apple Pencil 压感 | ❌ tldraw 原生支持但未启用 |
| 链接预览卡片(贴 URL 自动展开) | ❌ 域层有 `LinkPreview` 类型,UI 从不渲染 |
| 视频/音频播放 | ❌ |
| 实时协作(iCloud) | ❌(本地优先) |
| 扫描文档(相机) | ❌(桌面无意义) |

### 3.3 2025 趋势

1. **从手动连接 → AI 推断连接**:Constella / VIA 的 AI 自动提议关系,用户只需确认或拒绝
2. **Canvas + Chat 融合**:对话式 AI 不仅生成文本,还**决定在哪放什么卡片** —— VIA 的"Grow"机械手
3. **自动布局**:力导向 / 树形 / 圆形算法,避免手动拖拽排列
4. **隐私 + 本地优先**:Constella 强调离线 + 本地优先 + 云端 AI 可选,与 Stift 理念一致
5. **卡片密度切换**:Scrintal 的 compact/snippet/full 三种视图是用户强烈需求

---

## 四、UI 设计优化建议(基于竞品 + Bauhaus)

### 4.1 已达标的地方(不要改)

| 维度 | 我们的状态 |
|---|---|
| 颜色系统 | Bauhaus 6 原色 + 8px 网格,是 2025 最受欢迎的极简方向。红线是 Stift 的品牌识别点 |
| 硬阴影(no blur) | Bauhaus 签名特征,√ 已经做到。比其他产品更独特 |
| tldraw 选择 | 对的。ReactFlow 是竞品标配但太重,Stift 的 tldraw 集成是同体量里量最精简的 |
| 卡片徽标(`× N`) | 比 Scrintal 的连接计数更直观—— Scrintal 只在画线时显示,Stift 是常驻 |

### 4.2 可以优化的

**卡片密度切换**
对标 Scrintal 的 compact/snippet/full。Stift 当前是固定 240×120 → 用户拖 resize 仍保留全内容。可以加:
- `compact`:仅显示标题行 + 类型标签 + 箭头徽标(高度 ~40px)
- `snippet`:当前 240×120(标题 + 前 3 行 body)
- `full`:不截断 body,卡片高度自适应
- 双击卡片切换密度,或右键菜单选

**card edge 连接点 hover 态**
当前卡片 `pointerEvents: 'none'`(事件透给 tldraw 层)。加 handles 后:
- hover 卡片时 4 个半透明方形连接点出现(上下左右)
- 连接点颜色 = 卡片所在 region 色(red for canvas)
- 拖拽连接点 → 自动切到 arrow 创建模式 → 松手创建 arrow

**卡片颜色 token 映射到 tldraw labelColor**
现在 arrow 的 labelColor 用 registry 的颜色(`red`/`blue`/`black`/`grey`)。但 tldraw 的 `labelColor` 只支持 tldraw 的 palette,不是 CSS token。我们可以:
- 把关系类型的 labelColor 换成 tldraw 的 `light-red` / `light-blue` 系列,在暗色画布上更可读
- 或者在 dark mode 下 swap

**关系面板位置**
当前 `position: fixed; top: ...` 固定顶部。更好的交互:
- 选中 arrow 时,面板**浮动在 arrow 旁边**(用 `editor.getShapePageBounds(arrowId)` 计算位置)
- 而不是固定在屏幕顶部。减少鼠标移动距离

**Canvas 空态提示升级**
当前:文字"空白画布 · 双击创建 · 拖动摆放"。升级:
- 居中显示半透明引导卡片模板(拖文件到此 → 创建卡 / 双击 → 创建笔记 / 拖 URL → 创建链接卡)
- 每次画布为空时显示,第一张卡创建后消失

**卡片最小化/折叠到边栏**
对标 Scrintal 的 "Open card windows"。Stift 可以:
- 双击 → 打开 detail modal(已有)
- 右键 → "折叠到边栏"(卡片从 canvas 缩成一个小色条停在 canvas 边缘)
- 点击色条 → 恢复

### 4.3 不推荐做的(理由)

- ❌ **ReactFlow 换引擎** —— tldraw 已经够好,换引擎是推倒重来,ROI 负
- ❌ **多 board 共用卡片** —— Scrintal 的 "global archive" 模式需要中心数据库。Stift 是本地单文件,不适合
- ❌ **AI chat sidebar** —— VIA/Constella 的做法很酷但需要 API key + server,破坏"零服务端"的卖点。可以以后做可选的本地模型
- ❌ **协作** —— 需要 server + CRDT(Yjs/Automerge),架构变更太大。本地优先就是 Stift 的差异化

---

## 五、优先行动计划

| 优先 | 项目 | 外部对标 | 工作量 |
|---|---|---|---|
| **P0** | card edge connector drag 创建箭头 | Heptabase · tldraw handles API 现成 | ~100 行 |
| **P0** | 文件拖拽 + 粘贴(Card 创建路径) | markitdownllm · File API | ~50 行接线 + dep |
| **P1** | 智能关系类型推断 | Constella(VIA) · 关键词匹配 | ~30 行纯函数 |
| **P1** | 关系面板浮动在 arrow 旁边 | 通用 UX · `getShapePageBounds` | ~20 行 |
| **P2** | canvas 空态引导升级 | Scrintal 空态模板 | ~50 行 |
| **P2** | 卡片密度切换(compact/snippet/full) | Scrintal 三档 | ~80 行 |
| **P3** | card 最小化/折叠到边栏 | Scrintal open card windows | ~120 行 |
| **P3** | 文件格式解析(md/docx/xlsx/pdf) | markitdownllm · mammoth · SheetJS | ~60 行 + deps |

**建议顺序**:P0 两个一起做(文件拖拽是新入口,edge connector 是已有 M1 的自然升级),做完后再议 P1-P3。
