# 项目 Polish 计划(E1 + E4 + P2)

> **严格策略**:确认 → 计划 → 你审 → 执行。不加功能,不删文件,不多改一行,不引入新依赖。

## E1: icons 清理(git 健康状况)

### 问题诊断

```
git status apps/desktop/src-tauri/icons/
  5 modified (旧品牌 icons 被 tauri build 覆盖尺寸):
    icon.png, icon.icns, 32x32.png, 128x128.png, 128x128@2x.png
  15+ untracked (tauri cargo icon 从 icon.png 生成的全平台产物):
    64x64.png, Square*.png(Windows), icon.ico, android/, ios/
```

- tracked 旧品牌 icons(首次 commit 的 AppAssets 版)被后续 `cargo tauri icon` 覆盖 → 成了"修改"
- untracked 的是 `cargo tauri icon` 在全平台构建时自动生成的,不是我们不想要,也不是恶意删除,只是多了

### 方案(3 选 1)

| 方案 | 操作 | 结果 |
|---|---|---|
| **A(推荐)** 只 commit 修改过的主图标(path 在 tauri.conf.json bundle.icon 里的),untracked 的 android/ios/Square* 加 .gitignore | `git add` 5 modified, `.gitignore` 加 patterns 屏蔽 | git 干净,不影响 build |
| **B** 全部 untracked 也 git add(tauri 说这些都是平台图标) | 所有图标入库 | 仓库膨胀(~2MB icons),未来每次 build 都改这些文件 |
| **C** 全部还原 + 从 icon-source.svg 只生成 bundle.icon 需要的 4 个 | 删除 untracked,restore modified,regenerate | 干净但麻烦,并且 tauri build 又会重新生成 |

**选 A。不删任何文件,只 .gitignore untracked,只 git add 已修改。**

### 执行步骤

- [ ] 1. 确认 `tauri.conf.json bundle.icon` 只用 `32x32.png, 128x128.png, 128x128@2x.png, icon.png`(已确认) — android/ios/Square* 是 build 自己生成的,不 commit
- [ ] 2. .gitignore 加 patterns `apps/desktop/src-tauri/icons/Square*.png`, `apps/desktop/src-tauri/icons/android/`, `apps/desktop/src-tauri/icons/ios/`, `apps/desktop/src-tauri/icons/icon.ico`(只忽略 untracked,不影响 tracked 本身)
- [ ] 3. `git add apps/desktop/src-tauri/icons/{32x32,128x128,128x128@2x,icon,icon}.{png,icns}` — 把 5 个修改 commit(它们就是当前品牌图标)
- [ ] 4. `git status` 确认 icons 目录干净(只 tracked),无 untracked
- [ ] 5. 单 commit `chore(icons): clean up auto-generated platform icons`

### 风险

- `.gitignore` 只忽略 untracked,不会 un-track 已跟踪文件。5 个 modified 会被 add 为新版本。**不影响 build。**
- 如果未来 `cargo tauri icon` 重新生成,untracked 文件会再出现(但被 .gitignore 挡住,不会再次 dirty)。

---

## E4: tldraw shape 包豪斯化(rectangle/note 默认非彩色)

### 问题诊断

用户反馈"下面 3,4 个工具不能用,粗糙"。实际:
- tldraw v3 rectangle/ellipse 合并为 `type:'geo'` + `props:{geo:'rectangle/ellipse'}`
- geo 默认蓝色填充,note 默认黄色填充(与包豪斯冲突)
- 工具栏图标已 SVG 修复,但**画出来的元素仍是彩色**

### 方案(2 选 1)

| 方案 | 操作 | 工作量 |
|---|---|---|
| **A(推荐)** 在 onMount 里用 `GeoShapeUtil.configure()` + `NoteShapeUtil.configure()` 设默认 black color + none fill | canvas-editor 新建 consts,传给 shapeUtils | 30 分钟 |
| **B** 每 shape 单独 `setStyle` on create | 拦截每个 create,成本高,不推荐 | 大 |

**选 A。只影响新创建的 shape,不影响已有 snapshot 的 shape。**

### 技术确认

tldraw v3 的 `ShapeUtil.configure()` 返回一个新 subclass:
```ts
const BauhausGeoShapeUtil = GeoShapeUtil.configure({
  color: 'black',
  fill: 'none',
})
const BauhausNoteShapeUtil = NoteShapeUtil.configure({
  color: 'black',
  fill: 'none',
})
```
然后 shapeUtils = `[CardShapeUtil, BauhausGeoShapeUtil, BauhausNoteShapeUtil, ...restDefaultUtils]`。去掉默认的 GeoShapeUtil/NoteShapeUtil(因为它们被 configure 版替代)。

注意:需要找到默认 shapeUtils 中哪些需要包豪斯化(geo/note/draw/text/arrow 的 fill/color)。先确认默认哪些是彩色,再配。

### 执行步骤

- [ ] 1. 读 `defaultShapeUtils`(已导入)看有哪些 util(geo/note/draw/highlight/arrow/text/line/frame/image/bookmark/embed)
- [ ] 2. 确定需包豪斯化的(geo/note 最明显,draw 默认黑白可能不动,text 无填充,arrow 无填充)
- [ ] 3. canvas-editor 导入 GeoShapeUtil + NoteShapeUtil,configure 成包豪斯版
- [ ] 4. shapeUtils 数组:用 configure 版替换默认版(按 type 去重)
- [ ] 5. build + 手动验证:画矩形/椭圆 → 无填充黑色边框;加便签 → 无填充黑色边框
- [ ] 6. 单 commit `polish(canvas): configure geo/note shape defaults to Bauhaus (black, no fill)`

### 风险

- `configure()` 是 tldraw v3 public API。如缺参数,用默认值即可。**不会 break 已有 shapes。**
- 配置的 key 和值:文档 show `showTextOutline: false`,未直接展示 color/fill。需查看 GeoShapeUtil props 类型确认可用配置项。若 `configure` 不支持 color/fill,则此方案不可行,fallback 到方案 B(在 onMount 里 `setStyleForNextShapes`—— 但每工具切换时重置? 不,setStyle 只对"下一个"shape。持久方案:编辑 `TLUserPreferences` 中 `styleDefaults`。先调研类型,再定。

---

## P2: 箭头绑定到 card(验证)

### 问题

用户刚问"箭头能不能连到灵感卡上"。tldraw arrow 默认 bind 到多种 shape,但 **custom shape(CardShapeUtil)是否 bindable** 取决于是否声明 `canBind` / `canReceiveBindings` / 基础类。

### 技术确认

- CardShapeUtil 继承 `BaseBoxShapeUtil`(不是裸 `ShapeUtil`)
- tldraw v3 文档:arrow 默认绑定("bind")到任何 `canBind` 或 `canReceiveBindings` 为 true 的 shape
- `BaseBoxShapeUtil` 默认可能**已支持绑定**(因为 `BaseBoxShapeUtil` 就是为 box shape 提供的基类,arrow 默认 bind 到 box shapes)
- 也可能需要显式覆写 `canBind: true` 或 implement `TLBindingUtil`。

**需要读代码确认才能执行。** 不确定就不改。

### 执行步骤

- [ ] 1. 读 `BaseBoxShapeUtil` 源码(在 node_modules/@tldraw 中)是否有 `canBind`/`onBinding` 方法/属性
- [ ] 2. 读 `CardShapeUtil` 是否 override 跟 binding 相关的方法
- [ ] 3. 在 e2e 或手动创建 arrow 拖到 card 上测试
- [ ] 4. 若不支持,加 override;若已支持,不做
- [ ] 5. 与 E4 同一 commit(纯配置,无数据迁移)

### 风险

- 只读不改,无风险。
- `BaseBoxShapeUtil` 默认 `canBind` 可能是 false。若是,加 `override canBind(): boolean { return true }`。
- 若需额外绑定处理,更大改动(defer)。

---

## 执行顺序 + 回退策略

1. **先 git stash + branch** — `git stash push -m "pre-polish-$(date +%s)"`(若有脏东西)
2. **E1 清理** — .gitignore + add + commit → 可回退:`git revert <commit>`
3. **E4 包豪斯化** — configure + build + 验证 → 可回退:`git revert <commit>`
4. **P2 验证** — 读代码 + 测试(不保证改) → 与 E4 同上 commit
5. 全档提交时打 tag `v0.26.3-polish`

---

## 你确认什么

审这个 plan。重点确认:

- **E1 方案 A**(不删文件,只 .gitignore untracked + commit 已修改)——同意?"
- **E4** 如果 `GeoShapeUtil.configure` 不支持 color/fill,就 defer(不做)——同意?
- **P2** 如果已支持绑定,不做任何改;不支持则加 `canBind`——同意?

确认后我按 plan 执行,每步留 commit 可回退。