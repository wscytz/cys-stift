import type { CanvasElement } from './canvas-host'

/**
 * 场景修订号(防 stale-guard 假阳性,2026-11-17 真机复现)。
 *
 * 卡片的 `h` 是**派生值**:引擎 render 每次 syncCardHeights 按
 * 卡模式+body+宽度重算并静默自愈(不发事件)。字体晚到/首帧渲染都会让 h
 * 在无人编辑的情况下漂移(种子 96 → 派生 58)。任何把 h 当"外部变更"的
 * revision 深比对都会假阳性:DSL 对话框开着的几秒内 Apply 被整体拒绝
 * ("画布已在编辑期间变化")、AI 确认门 "Element changed after preview"。
 *
 * 因此 sceneRevision 把 card 的 h 归一后才序列化:两个场景仅 card h 不同
 * ⇒ 同一修订号(引擎会自愈,不丢信息);其余字段(含 meta/curve/elbow)
 * 仍逐字节参与——手动编辑不会被隐藏。非 card 元素的 h(如 text/frame)
 * 是真实状态,照常参与。
 */
export function sceneRevision(elements: readonly CanvasElement[]): string {
  const normalized = elements
    .slice()
    .sort((a, b) => a.id.localeCompare(b.id))
    .map((el) => (el.kind === 'card' ? { ...el, h: 0 } : el))
  return JSON.stringify(normalized)
}
