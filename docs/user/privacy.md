# 隐私 & AI 数据访问

> 你在 cy's Stift 里的所有内容都存在你**自己的电脑**上。AI 功能是完全可选的。
> 本文回答三个问题:**AI 看到了什么?怎么关?关了会怎样?**

---

## 一句话总结

- **没启用 AI** → 你的数据完全留在本机,没有任何东西上传到任何服务器
- **启用 AI** → 你选定的 provider 收到你**明确允许它看**的字段(见下表);其他东西(API key、未启用字段、媒体文件二进制)不会被发送
- **完全关闭** → AI 按钮消失,应用照常工作

---

## AI 看到了什么(逐字段)

下表列出了 AI 在做 **summarize / rewrite / translate / auto-relate / 画布排版 / 找相似(cluster) / AI 关系候选推荐** 等动作时,会收到的字段。**未列出的字段一律不发送**。

> **找相似(cluster,2026-06-23)**:读画布上多张卡的允许字段(同下表),让 AI 把近重复 / 相似卡分组,落成 `related-to` 关系箭头连接组内成员——**非破坏性**(只加关系,不合并、不删卡)。AI **看不到**卡的 `source.deviceId`、`media.dataUrl`(图片/PDF 二进制)、软删除卡;输出经白名单 id 校验(模型编造的 id 一律丢弃)。

> **AI 关系候选推荐(2026-06-30)**:在图谱详情页点「AI 再找找」时,把**当前卡的允许字段**(同下表,走 allowlist)+ **候选卡的 id 和标题**(只标题,不发正文/媒体/deviceId)发给 AI,让它挑出语义相关但字面无重合的卡作为**候选**(不自动建关系,用户一键才建)。同样守 R2:`deviceId` / `media.dataUrl` / 软删除卡永不发;输出经白名单 id 校验。**未配 AI 时不显示该按钮**,本地启发式推荐照常工作(零 AI)。

> **vision 模型(v0.38 修订)**:v0.30 曾决定"vision 永久不做",v0.38 修订为——vision 作为**附加能力放进实验室区,默认关闭**。未手动开启时,行为与"不做 vision"完全一致(见下文)。开启仍守 R2 铁律:`deviceId` / `apiKey` / 软删除卡永不进 vision prompt;默认 Ollama 本地 provider 即便开启也不外发。

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
| **画布上的非卡片形状** | 画布排版(DSL)用 | 见下文"手绘 = 几何描述" |

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

> **实验室区 vision 附加能力(v0.38)**:设置 → 实验室区可手动开启 vision(需二次确认门)。开启后仍守 R2:`deviceId` / `apiKey` / 软删除卡永不进 vision prompt;默认 Ollama 本地 provider 即便开启也不外发。**未开启时,行为与本节描述完全一致——不做任何图像理解。** vision 三能力(看图描述/画布视觉理解/图转 DSL)实装 defer,当前仅骨架。

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
- 所有 AI 按钮从界面消失(不渲染,不是灰掉)
- canvas 上的"AI 自动关联"按钮消失
- card-detail 的 ✨ Summarize / Rewrite / Translate 按钮消失
- 应用其它功能**完全不受影响**

### 不存 API key(纯本地模式)

- 不配 API key → AI 面板默认禁用 → 同上,AI 按钮不渲染
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
- 你当前正在操作的卡 / 卡列表 / 画布快照
- **不**发送你的其他卡、设置、API key、media 二进制

provider 的服务端会按它的[隐私政策](https://openai.com/policies/row-privacy-policy)处理你的请求(OpenAI / Anthropic 默认**不**用 API 请求训练模型,但请以官方文档为准)。

### API key 怎么存

**明文存在浏览器 localStorage**(key 名 `cys-stift.settings.v1`)。

设置面板里有显式警告 banner:

> ⚠ API key 以明文存储在本地(localStorage),仅保存在本机浏览器。不上传到任何服务器。请勿在公共设备上启用。

**为什么不加密**:
- 加密需要密码,密码不能本地存(否则失去意义),要用户每次输入 → 体验差
- 你已经在自己的设备上,设备本身的锁屏是第一道防线
- M4 可能升级到 OS keychain(macOS Keychain / Windows Credential Manager)

### 不存什么

- **不**记录 AI 请求历史
- **不**记录用户操作用于训练
- **不**上传 localStorage 里的其他 key

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