# Phase 6.5f 视觉 + 交互对照笔记

> 截图:`docs/design/screenshots/phase-6.5f/`(3 张)
> 测试:puppeteer-core + 系统 Chrome

---

## 结论

**Phase 6.5f 核心承诺达成(spec §4.5 MediaAsset 最小 MVP):图片上传 — `<input type=file>` + base64 inline 存 web-local localStorage + 详情 Modal view/edit 显示图片。** spec §4.5 Web=OPFS 留 Phase 2.5,Tauri fs 留 Phase 8;当前为可工作的占位实现,大图警告。

puppeteer 4/4 断言全过:
- ✓ 上传 1 张图 → save → `card.media.length === 1` + `cys-stift.media.v1` 1 asset
- ✓ 详情 Modal 渲染 1 个 `<img class="media-list__img">`
- ✓ 跨刷新保留
- ✓ 零 page error

## 关键工程决策

1. **base64 inline localStorage 占位**:Phase 2.5 OPFS / Phase 8 Tauri fs 替换时,**mediaStore 公共 API 不变**(`attach`/`getAsset`/`remove`)。
2. **domain 扩 `UpdateCardPatch.media`**:Phase 2 已有 `Card.media: MediaRef[]` 字段,只补 `UpdateCardPatch` 白名单;不破坏零依赖,新加 1 个 vitest。
3. **软限制 500KB**:console.warn 提示,仍接受(本地优先占位实现)。
4. **0 新依赖**:FileReader / data URL 原生。

## 已知 / 后续

- OPFS 真实落盘 → Phase 2.5(独立 phase)
- Tauri fs 落盘 → Phase 8
- 图片编辑(裁剪/旋转)→ 留后
- 拖放上传 → 留后
- OG 图片抓取 → 留后

## 测试方式

```bash
pnpm --filter domain test   # 11 tests
pnpm --filter db test       # 7 tests
pnpm --filter web build     # exit 0,12 静态页
node scripts/p6.5f-shots.cjs
```