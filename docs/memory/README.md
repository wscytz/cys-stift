# cy's Stift · 记忆系统

> 跨模型 + 跨会话的工作记忆。纯 Markdown，任何 LLM（Claude / GPT / Gemini 等）都能直接读取。

---

## 三类文件

```
docs/memory/
├── MEMORY.md                 # 索引（一行一条）
├── decisions/                # 长期决策（已落地）
│   └── YYYY-MM-DD-<slug>.md
├── context/                  # 当前会话上下文（会被压缩 / 归档）
│   └── current-session.md
└── reference/                # 外部资源
    └── README.md
```

### decisions/
**已落地**的长期决策。例：
- 为什么选 pnpm monorepo → 见 ADR，但摘要在这里方便快速回忆
- 为什么 Phase 0 不写业务逻辑 → 一行话 + 链接到计划
- 用户偏好：包豪斯风 + 长期项目 + 不盈利

### context/
**当前会话上下文**。每次开新会话先读这个，能秒接上下文。
- 写到 `current-session.md`（同一文件覆盖）
- 完成阶段性工作后归档到 `decisions/` 或删掉

### reference/
外部资源（文档链接、参考设计、灵感图等）。可注释。

---

## 何时写

| 触发 | 写到哪 |
|---|---|
| 用户说"记住 X" / "以后都 Y" | `decisions/` + 索引 |
| 完成一个 Phase | `decisions/YYYY-MM-DD-phase-N.md` |
| 跨会话延续 | `context/current-session.md` |
| 发现有用外部资源 | `reference/README.md` |

---

## 跨模型可读约束

- **纯 Markdown**，无 Claude 私有格式
- 每文件 frontmatter 标注 `audience: [claude, gpt, gemini, human]`
- 中文为主，关键术语中英对照
- 一行话能说清的别写段落
