# Phase 9.1 视觉 + 交互对照笔记

> 截图:`docs/design/screenshots/phase-9.1/`(2 张)

---

## 结论

**Phase 9.1 核心承诺达成:JSON 反向 import。/settings 加 Import 按钮 → 选文件 → 校验 version → 写回 localStorage → reload 恢复。** Export → clear → Import 同文件 → cards 全恢复。0 新依赖。

puppeteer 全过:export 1 file → clear 0 → import → 2 cards 恢复。

## 关键工程决策

1. **覆盖式合并**(MVP):导出快照成为真相源;建议先 Export 备份。
2. **校验 version + shape**:`version !== 1` 或 cards 非数组 → 报错不写。
3. **可选 key 跳过**:drafts/settings 缺失不报错。
4. **reload 恢复**:写完 localStorage 后 800ms reload,所有 store 重新 hydrate。
5. **0 新依赖** + **domain/db 零改动**。

## 已知 / 后续

- 合并策略(merge vs replace)→ 留后
- 冲突解决(同 id)→ 覆盖
- 导入预览 → 留后
- 撤销 → 留后(建议先 Export)

## 测试方式

```bash
pnpm --filter web build
node scripts/p9.1-shots.cjs
```