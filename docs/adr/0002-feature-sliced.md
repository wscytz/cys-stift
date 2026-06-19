# ADR-0002 · Feature-sliced 架构

## 背景
MVP 要做 Inbox / Canvas / Archive 三个视图，外加 capture 入口。长期要加 sync / 协作 / AI。

## 决策
采用 **feature-sliced** 思想：`apps/web/src/{app,features,entities,shared}/`。每个 feature（capture / card / canvas / archive）是一个高内聚切片，跨 feature 不互相 import，只依赖 entities + shared。

## 后果
- ✅ 新增 / 替换 feature 成本低（"可独立替换的切片"信念 3）
- ✅ 未来 capture-*/sync-*/ai-* 插件化自然
- ⚠️ 初期文件比单层多；需要纪律守住边界（lint rule 后续可加）

状态：✅ 已设计（spec §3.3），Phase 4 起逐步填实
