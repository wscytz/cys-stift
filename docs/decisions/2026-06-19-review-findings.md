# Review 发现(2026-06-19 轮 self-review)

> 在 spec §8 路线图 13 个 phase 完成后做的一轮 self-review。
> 诚实记录,**不是** changelog 复述。按严重度排。
> 下个会话接手前先读此档决定修哪些。

---

## 🔴 真 bug(数据完整性 / 逻辑)

### 1. Import 部分失败留下不一致状态
**位置**:`apps/web/src/lib/export-service.ts:133-163`(`importFromJson`)

cards 先写成功,如果接着 media 写入抛错(quota — base64 大图很容易),catch 返回 `ok:false`,但 **cards 已经被覆盖成导入版本**。用户看到"Import failed",数据已被部分替换,且没有备份/回滚。UI 提示"export a backup first"但代码不强制。

**修法**:四个 key 全部先 `JSON.stringify`(序列化可能抛,先做完),全部成功后再统一 `setItem`;或写入前 snapshot 旧值到 `cys-stift.backup.v1`,失败时回滚。

### 2. soft-delete 没有任何恢复入口(全局 gap)
**位置**:产品级,非单文件

inbox 确认弹窗文案:`apps/web/src/app/inbox/page.tsx` Modal "you can recover it later from the database";archive 批量 soft-delete:`apps/web/src/app/archive/page.tsx:50-55` 也走 `service.softDelete`。但**整个 UI 没有任何地方能看到 `deletedAt` 的卡**(archive 过滤 `!c.deletedAt`,inbox 也过滤)。软删成了事实上的永久删除,除非翻 localStorage 或导出 JSON 手改。

spec §4.2 有 `archived` / `deletedAt` 三态,但缺一个"回收站/已删除"视图。被 defer 太多次(Phase 3 → 7 → 都没做)。

**修法**:archive 页加第三个 tab `deleted`(或新 `/trash` 路由),`service.listAll().filter(c => c.deletedAt)`,提供 `restore`(清 deletedAt)+ `hardDelete`(真删)。

### 3. sink 注册竞态:dynamic import 在 unmount 后才 resolve
**位置**:`apps/web/src/app/inbox/page.tsx:50-57`(manual sink);`apps/web/src/features/capture/capture-host.tsx:89-103`(shortcut/menubar 同款)

用户在 /inbox 快速跳到 /canvas,`import().then(register)` 还没 resolve,cleanup 先跑(`unregister('manual')` 是 no-op),然后 import resolve 注册了一个**永远不会被清理的 phantom sink**。回 /inbox 时覆盖,且 service 是单例,所以不致命,但逻辑是错的。

**修法**:effect 里加 `let cancelled = false`,cleanup 置 true,`.then` 里 `if (cancelled) return`。

---

## 🟡 脆弱 / 风险

### 4. `editor.dispose` 猴补丁
**位置**:`apps/web/src/features/canvas/canvas-editor.tsx:96-101`

依赖 tldraw unmount 时真的调 `editor.dispose()`。如果 tldraw v3 不走这个路径,`unsub()` 永远不执行;pending 的 500ms timer 可能在 disposed editor 上调 `getCamera()`。**没测过离开 /canvas 再回来的场景**(puppeteer 只测了 reload)。

**修法**:把 onMount 里的 listener/timer 提到一个 React `useEffect`(以 editor 为 dep),用 useEffect 的 cleanup 做销毁,不猴补丁 tldraw。需要把 editor 提到 state(Phase 5 已把 editor 提到 page state,可下传)。

### 5. `editor.store.listen()` 无 filter
**位置**:`apps/web/src/features/canvas/canvas-editor.tsx:78`

监听**所有** store 变化(含 `bindCardWriteback` 的卡片拖动),每次拖动触发一次 camera 读取 + debounce 重排。功能没错,纯浪费。

**修法**:listen 第二参数加 `source`/`scope` 过滤,或 callback 里先判 `entry.changes` 是否含 camera/instance。

---

## 🟠 UX 洞(多数已在 changelog 承认)

- **批量 soft-delete 无二次确认**(archive `page.tsx:50`)+ #2 = 实质不可恢复
- **"Send to canvas" 后卡从 inbox 消失**(spec §6.11 `listInbox` 过滤 canvasPosition),且无"从画布拿回 inbox"反向动作
- **archive tile 点击 no-op**(`archive/page.tsx:110` 注释说明)—— P6.5b 抽的 CardDetail 没接上归档卡
- **media base64 占位** —— 大图撑爆 localStorage quota(soft 500KB 警告不阻断);OPFS 真实落盘留 Phase 2.5

---

## ✅ 扎实(不需动)

- 5 个 web-local store(`cards`/`drafts`/`media`/`canvas-view`/`settings`)全用同一套 `useSyncExternalStore` + snapshot 稳定 + `hydrateOnce` 模式
- domain 零依赖没破(只加 `UpdateCardPatch.media` 一个白名单 + 1 vitest)
- 0 新依赖,全程没碰 spec
- `captureSinkRegistry` + fallback 抽象方向对(只是注册时机有 #3)
- puppeteer 断言覆盖扎实

---

## 建议优先级

1. **先修 #1 + #3**(快、纯逻辑、低风险;各几行)
2. **#2 是产品决策**:要不要做"已删除"视图(工作量中等:新 tab + restore/hardDelete)
3. **#4 #5** 留到动 canvas 时一起(需要把 editor 提到 useEffect)
4. UX 洞按用户诉求排

详见各文件 file:line。