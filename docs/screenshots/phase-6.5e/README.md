# Phase 6.5e 视觉 + 交互对照笔记

> 截图:`docs/design/screenshots/phase-6.5e/`(1 张)
> 测试:puppeteer-core + 系统 Chrome

---

## 结论

**Phase 6.5e 核心承诺达成(spec §7 CaptureSink 接口统一):inbox CreateCardForm onCreate 改走 `WebCaptureSink.submit({source:{kind:'manual'}})`。两路 capture 入口(快捷键 + 表单)现在走同一抽象。** domain / db 零改动,0 新依赖。

puppeteer 5/5 断言全过:
- ✓ Inbox 创建卡 → title 正确
- ✓ `card.source.kind === 'manual'`
- ✓ `card.source.deviceId === 'web'`
- ✓ 跨刷新保留
- ✓ 零 page error

---

## 1 张截图

| 文件 | 内容 |
|---|---|
| `01-inbox-after-manual-create.png` | Inbox 创建卡后:列表显示 "P6.5e manual capture test" tile(NOTE 红 tag)|

---

## 关键工程决策

1. **两路 capture 入口同一接口**:inbox 表单 + Mini Input 快捷键都走 `WebCaptureSink.submit → service.fromCapture`。单一 capture 抽象(spec §7 依赖倒置)。
2. **`CaptureInput.links` 是 `string[]`**(URL 字符串),CreateCardForm 给的是 `LinkPreview[]`;`input.links.map(l => l.url)` 转换。
3. **不 await `submit`**:`WebCaptureSink.submit` 内部调 `service.fromCapture` 是同步 in-memory,无失败可能。
4. **`service.create` 仍保留**(canvas dblclick 路径用),inbox 不再用。
5. **0 新依赖** + **domain / db 零改动**。

---

## 已知 / 后续

- CaptureSinkRegistry(多 sink 注册)→ P6.5g
- TauriCaptureSink / MenubarCaptureSink → P6.5g

---

## 测试方式

```bash
pnpm --filter domain test   # 10 tests
pnpm --filter db test       # 7 tests
pnpm --filter web build     # exit 0,12 静态页
pnpm --filter web dev --port 3016 &
node scripts/p6.5e-shots.cjs   # 5/5 assertions pass
```