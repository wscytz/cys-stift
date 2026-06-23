# ADR-0004 · 包豪斯设计 token 集

## 背景
产品要求"包豪斯 UI"。但包豪斯是哲学不是样式表——需要把它编码成可执行的设计约束。

## 决策
- **6 个原色 token** 固定集：red / yellow / blue / black / white / gray
- 每个功能区绑定一个 token：capture=红、canvas=黑、archive=蓝、system=灰
- 用户可**重映射** region → token，但**不能新增** token
- **8px 基础网格**，所有间距是 8 的倍数
- 字体 Space Grotesk（display）+ Inter（body），两者均免费可商用

## 后果
- ✅ 设计语言即约束——组件库不能引入第六种颜色
- ✅ 用户个性化有出口，但不破坏整体美学
- ⚠️ 暗色模式不能"反过来调"——MVP 不做，预留 token 抽象给未来
- ⚠️ 包豪斯偏冷峻，不适合娱乐 / 社交场景；产品定位已锚定工具型

状态：✅ 设计已定型（spec §5），Phase 1 落地组件
