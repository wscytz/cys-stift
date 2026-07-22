# 隐私 & AI 数据访问

> 你在 cy's Stift 里的所有内容都存在你**自己的电脑**上。AI 功能是完全可选的。
> 本文回答三个问题:**AI 看到了什么?怎么关?关了会怎样?**

---

## 一句话总结

- **没启用 AI** → 你的数据完全留在本机,没有任何东西上传到任何服务器
- **启用 AI** → 你选定的 provider 收到你**明确允许它看**的字段(见下表);其他东西(API key、未启用字段、媒体文件二进制)不会被发送
- **未配置或关闭 AI** → AI 操作入口会保留为可解释的配置入口,不会发送请求;应用照常工作

## 五种数据边界

这些边界容易混在一起,但它们是五条不同的路径:

| 数据 | 默认位置 / 去向 | 什么时候会离开本机 |
|---|---|---|
| **prompt** | 只在启用 AI 的那次请求中,由客户端组装后发给你选的 provider | 发送请求时。包括当前问题、最近对话上下文(最多 20 条)、RAG 允许字段和目标画布几何快照;不是后台同步 |
| **conversation** | `cys-stift.conversation.<canvasId>.v2` 的本地 localStorage; `/ask` 与 Canvas companion 共用,每画布隔离,最多保留 100 条 | 不会自动外发;只有后续 AI 请求会把最近上下文带给你选的 provider,或你主动导出 JSON |
| **sample** | `cys-stift.ai-samples.v1` 的本地 localStorage;默认关闭,只有你在设置中明确开启后才累积,最近 500 条 | 不会自动外发;你在设置中导出样本或把完整 JSON 备份交给第三方时才离开本机 |
| **proposal** | Proposal payload/review/receipt 存在本地 OPFS（不可用时 localStorage）；持久化来源锚点只保存 identity、revision、path/position 与 excerpt hash，不重复保存 `title/body` 原文；审计报告也不包含来源正文、API key 或完整 prompt | 只有生成时 allowlisted Working Set 会发给你选的 provider；本地 proposal 仅在你主动导出报告时离开设备 |
| **export / archive** | Export 是你主动下载的开放 JSON; archive 是本地 OPFS(不可用时 localStorage) 的开发存档 | Export 文件由你决定是否分享; archive 本身不发给 AI。两者在最终边界清空 `apiKey`; archive 还剥离媒体 `dataUrl`,只留媒体元数据 |

样本只保存 `question/context/aiOutput`、结果和 DSL 版号等脱敏字段,不保存原始 `Card[]`、settings、`deviceId` 或 API key。完整 JSON 备份可以包含卡片、媒体、草稿、设置、画布几何、对话和样本,所以分享前请把它当作包含你内容的文件处理。**画布 DSL v7**支持卡片 `@title`/`@content`(内容能力自 v5 引入;v6 将 freedraw 移出 DSL;v7 加 `@group` 语义分组 / `@href` 卡片显式引用 / `@compute` 安全公式——其中 `@compute` 只引用元素几何 `#id.x|y|w|h`、**不碰卡片内容**,`@href` 是卡 id,均不新增内容外发):DSL 模态编辑器的人读全量视图会携带内容;"复制所选为 DSL"与自建模板不注入内容,仍是纯几何(outbound 默认隐私安全)。AI 不直接读取模态编辑器 DSL 文本,而由程序通过独立的 `snapshotCanvas` / RAG 视图按任务构造上下文(snapshot 默认卡片 title;RAG 仅发送 allowlist 字段;freedraw 仅 shape 描述符)。分享**你在模态编辑器里复制的全量 DSL 文本**时仍应当作包含卡片内容处理。DSL 永远不含 `apiKey`、媒体二进制或手绘点序列;freedraw 由程序自管 R2 + 渲染。

---

## AI 看到了什么(逐字段)

下表列出了 AI 在做 **summarize / rewrite / translate / auto-relate / 画布排版 / 找相似(cluster) / AI 关系候选推荐 / AI 对话 agent(/ask)** 等动作时,会收到的字段。**未列出的字段一律不发送**。

> **找相似(cluster,2026-06-23)**:读画布上多张卡的允许字段(同下表),让 AI 把近重复 / 相似卡分组,落成 `related-to` 关系箭头连接组内成员——**非破坏性**(只加关系,不合并、不删卡)。AI **看不到**卡的 `source.deviceId`、`media.dataUrl`(图片/PDF 二进制)、软删除卡;输出经白名单 id 校验(模型编造的 id 一律丢弃)。

> **AI 关系候选推荐(2026-06-30)**:在图谱详情页点「AI 再找找」时,把**当前卡的允许字段**(同下表,走 allowlist)+ **候选卡的 id 和标题**(只标题,不发正文/媒体/deviceId)发给 AI,让它挑出语义相关但字面无重合的卡作为**候选**(不自动建关系,用户一键才建)。同样守 R2:`deviceId` / `media.dataUrl` / 软删除卡永不发;输出经白名单 id 校验。**未配 AI 时不显示该按钮**,本地启发式推荐照常工作(零 AI)。

> **AI 对话 agent /ask(2026-06-30)**:在 `/ask` 页对话时,把你的问题 + **RAG 检索到的 top-8 相关卡**(走 allowlist,同下表)+ **目标画布的元素快照**(id+位置+颜色+关系签名+卡片标题)发给 AI。AI 回答时引用 `[card #id]`(UI 渲染可点开);要改画布时输出 `cys-dsl` 块,**经你确认才应用**(确认门显示 before/after 缩略图 + 变更摘要)。画布侧的“AI 排版”则使用受限 Intent IR v1,只允许 layout/place/align/distribute/pin,同样先预览 immutable plan 再提交。同样守 R2:`deviceId` / `media.dataUrl` / `apiKey` / 软删除卡永不发。
>
> **画布快照 content-on-demand 开关(2026-07-22)**:`/ask`、companion、AI 排版/聚类的画布快照默认**还会带卡片正文**(`  content: …` 行),让 AI 在画布类任务里也能理解卡片内容(以前只发标题,AI 常反映"看不到正文")。正文本就在 AI allowlist(RAG 一直发 body),这是同源数据的另一通道,不是新隐私面。想省 token / 更保守,在 **设置 → AI 上下文** 关掉「允许 AI 读取卡片正文」,快照就只发标题。对外「复制为提示词」仍纯几何。

> **思考模式适配(2026-06-30)**:DeepSeek 等 OpenAI 兼容端点默认开「思考模式」,思考会吃掉大量 token 导致排版/分组/关系推荐这类**结构化输出**被截断(实测 1024~4096 token 全花在思考,DSL/JSON 输出 0 字 → 「未生效」)。结构化任务现在对 DeepSeek 端点发 `thinking: {type: disabled}` 关闭思考 —— 不截断、省约 75% token、快 2-3 倍、输出更完整。**只对 DeepSeek 端点发此字段**(靠 baseUrl 识别),真 OpenAI/Claude 端点不发(不破坏兼容)。总结/改写/翻译等需理解推理的任务**不关思考**(保留模型推理能力)。这不涉及隐私——思考内容留在模型侧,不发额外数据。

> **vision 模型**:当前版本没有可用的 vision 运行时能力,因此设置中不显示 Vision 实验开关。图片二进制不会进入 AI prompt。只有实现完整 consumer、隐私确认和测试后,未来版本才会公开相应开关。

> **可审计 AI 共编（Labs，默认关闭）**：必须先在设置中明确启用，再在画布选择范围并确认 manifest。发送内容只来自所选卡片的 `title/body` allowlist、范围内关系文字和必要几何；不会发送 scope 外卡片、设备 ID、媒体二进制、手绘点序列或 API key。模型只能返回无权限的 Proposal Payload；接受、Apply 与 Undo 都由本地系统记录控制。

### ✅ AI 可以看到的(默认)

| 字段 | 用途举例 | 备注 |
|---|---|---|
| `card.title` | summarize 用 | |
| `card.body` | summarize / rewrite / translate 直接操作 | |
| `card.capturedAt` | "按时间排" 指令用 | |
| `card.color` | cluster 染色 | |
| `card.pinned` | 区分重要卡 | |
| `card.canvasPosition` | 知道卡在哪个画布 | |
| `card.media[i].kind` | 知道是 image / file | 不发送图片二进制 |
| `card.links[i].url` + `title` + `description` | summarize 时能引用 | |
| `card.codeSnippets[i].code` + `language` | summarize 看到代码 | |
| `card.quotes[i].text` + `attribution` | summarize 看到引用 | |
| `card.source.kind` | 知道卡从哪来(manual / paste / file-drop) | 不发送设备 ID |
| **画布上的非卡片形状** | 画布排版(Intent IR / Scene DSL)用 | 见下文"手绘 = 几何描述" |

### ❌ AI 看不到的(永不发送)

| 字段 / 数据 | 为什么 |
|---|---|
| `settings.ai.apiKey` | 你的密钥,**永不**进入 prompt 或日志 |
| 任何卡片的图片 / 文件二进制 | image / pdf / docx 的原始字节不上传(只看到 `kind: 'image'` 元数据) |
| 卡片已软删除的状态 | 软删除的卡 (`deletedAt` 非空) 完全不在 AI 视野 |
| 其他 workspace 的卡 | 单 workspace 模式下不存在;多 workspace 时隔离 |
| 浏览器 localStorage 里的其他 key | AI 看不到 |
| 操作系统 / 浏览器信息 | navigator.userAgent 等不上传 |

### ❌ 多模态(图像理解)默认不做

cy's Stift **默认不**使用 GPT-4V / Claude Vision / 任何 vision 模型。你的图片卡:
- AI 只看得到"这是一张图"(元数据),**看不到图的内容**
- 拖入 PDF / Word 时,M2.2 的 markitdownllm 已**本地**把文档转成 markdown 写到 `card.body` —— AI 读 markdown,看不到原文件二进制

> **Vision 状态**:当前没有可启用的 Vision 功能或实验开关。应用只发送媒体类型元数据,不会发送图片二进制。

### 📐 手绘 = 几何描述

画布上的**手绘内容**(线段、便签、自由形状)**不进 AI 的"图像理解"** —— 我们不做 vision 解析像素。

但是,所有形状都有 page-space 坐标。我们会在客户端把它们**编码成几何描述**发给 AI:

```
# 例子:AI 看到的画布快照片段
[card #a1] at (200, 300) size 240x120, color blue
[card #a2] at (700, 400) size 240x120, color red
[arrow from #a1 to #a2, label "references"]
[line from (300, 100) to (500, 100)]
[draw region bounds (100, 600) to (400, 800)]  ← 客户端判定的闭合区域
```

AI 看到的是**坐标 / 类型 / 标签**,不是像素。所以 AI 能做:
- "把这两张卡并排"
- "在 (300, 100) 那条线下面加一行"
- "把所有红卡移到 (700, 700) 区域"

**判定逻辑在客户端**(启发式:端点距离 < 阈值 → 闭合 → 视为 region;形状 type === 'draw' → 视为手绘;等等),不在 AI 端。

> **手绘语义识别(2026-06-23)**:选中一条手绘时,应用会用**本地几何启发式**(直线度 / 闭合度 / 细长比)粗判它「看起来像箭头 / 装饰」并给置信度——纯几何运算,**点序列绝不外发任何 AI**(手绘笔迹是隐私)。这只是辅助提示 + 「复制」便利(装饰可一键复用),非破坏性,不自动改你的画。

> **手绘形状描述发给 AI(2026-06-24)**:当 AI 做画布排版 / cluster 时,它需要"看到"手绘是什么形状才能智能处理。应用在**本地**跑形状识别(\$1 识别器 + 启发式)后,只把**离散形状标签**(圈 / 方 / 三角 / 勾 / 箭头)+ **置信度** + **4 个标量几何比例**(直线度 / 闭合度 / 细长比 / 点数)发给 AI。例如 AI 看到 `[freedraw #f1] @pos(200,300)` + `shape: circle (85%)`。**点序列本身绝不外发**(R2 隐私:手绘笔迹是矢量数据,留在你的设备上)。AI 只拿到"这里有个圈"这样的抽象结论,拿不到你具体怎么画的。

---

## 怎么关 / 开

### 关掉 AI(应用照常工作)

1. 打开 **设置** → **AI** 面板
2. 取消勾选"启用 AI"
3. (可选)清除 provider / API key 字段

关闭后:
- AI 操作不会发出请求;点击入口只会说明需要先配置 provider
- 本地关系推断、Markdown、DSL 手动编辑等不依赖 AI 的能力仍然可用
- 应用其它功能**完全不受影响**

### 不存 API key(纯本地模式)

- 不配 API key → AI 面板保持禁用;AI 入口显示配置引导,不会把失败伪装成已执行
- 这是最严格的本地优先模式

### 完全卸载 AI 模块

- 在 Tauri 桌面端可裁剪 AI 代码(Web 端静态导出,所有代码都在 bundle 里,无法运行时移除)
- 详见 `docs/development/setup.md`

---

## 数据传到哪里

### 没启用 AI → 没数据外传

零网络请求发往 AI provider。所有的 CRUD / 文件上传 / 导入导出都在本地。

### 启用 AI → 数据发到你选的 provider

| Provider | 数据发送到 | 适合场景 |
|---|---|---|
| **OpenAI** | `api.openai.com`(可改 baseUrl 指向代理) | 商业 API,数据走 OpenAI 服务器 |
| **Anthropic** | `api.anthropic.com`(可改 baseUrl) | 商业 API |
| **Ollama** | `http://localhost:11434`(本地) | 完全本地,数据不出本机 |

每次 AI 请求,客户端只发送:
- 你的当前问题 + 最近对话上下文(最多 20 条)
- RAG 选出的相关卡(允许字段) / 当前操作的卡 / 目标画布几何快照
- **不**发送 settings、API key、`source.deviceId`、软删除卡或 `media.dataUrl` 二进制

provider 的服务端会按它的[隐私政策](https://openai.com/policies/row-privacy-policy)处理你的请求(OpenAI / Anthropic 默认**不**用 API 请求训练模型,但请以官方文档为准)。

### API key 怎么存

**明文存在浏览器 localStorage**(key 名 `cys-stift.settings.v2`)。

设置面板里有显式警告 banner:

> ⚠ API key 以明文存储在本地(localStorage),仅用于客户端直接请求你选择的 provider,不会发送给 cy's Stift 自有服务器。请勿在公共设备上启用。

默认 JSON 备份和本地开发存档都会在最终载荷边界把 `apiKey` 清空,因此导出的文件不含密钥。把这类文件导入另一台设备后,需要重新输入密钥;若目标设备已有同 ID 且 provider / Base URL 相同的 profile,导入会保留该设备本地已有的密钥。若路由发生变化,出于安全考虑必须重新输入。

**为什么不加密**:
- 加密需要密码,密码不能本地存(否则失去意义),要用户每次输入 → 体验差
- 你已经在自己的设备上,设备本身的锁屏是第一道防线
- M4 可能升级到 OS keychain(macOS Keychain / Windows Credential Manager)

### 其它本地数据

- 对话会按画布持久化,可在 `/ask` 的「清空」操作中清除当前画布对话。
- 样本累积默认关闭,只有你在设置页明确开启后才写入;可随时关闭、导出或清空,它不是自动上传的训练集。
- Export/Import 是用户主动操作,不是后台同步;Import 会覆盖或合并本地数据,操作前应先导出备份。
- 不上传 localStorage 里的其他 key,也不记录与 AI 无关的用户操作用于训练。

---

## 离线模式

| 模式 | 网络要求 | 备注 |
|---|---|---|
| 不启用 AI | 完全离线可用 | 所有功能正常 |
| OpenAI / Anthropic | 必须联网 | 断网时 AI 按钮显示错误 |
| Ollama | 仅本地 | Ollama daemon 必须在 localhost:11434 运行 |

---

## 出错了怎么办

| 错误 | 含义 | 怎么修 |
|---|---|---|
| `连接失败:HTTP 401` | API key 无效或过期 | 去 provider 网站重新生成,粘到 /settings |
| `连接失败:HTTP 429` | 额度用尽 | 充值或换 provider |
| `连接失败:fetch failed` | 网络问题 / baseUrl 错 | 检查 baseUrl / 联网状态 |
| `AI 失败:CORS` | Ollama 默认不允许跨域 | 启动时加 `OLLAMA_ORIGINS=*` |
| 流式中断 / 卡住 | provider 服务挂了 | 关闭 AI 按钮重试,或换 provider |

---

## 详细技术设计

开发面向的隐私设计 spec:
`docs/development/privacy-design.md`

每个 phase 怎么审计"AI 是否看到了不该看的":
`docs/development/privacy-design.md` 第 3 节「字段审计 check-list」

---

## 反馈

发现隐私 / 安全问题 → 项目仓库 issue
