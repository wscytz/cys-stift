'use client'

/**
 * R3.8:DB 水合前的占位骨架。useDb() 异步从 localStorage 水合卡片,首帧
 * ready=false 时若直接渲染空状态会让用户误以为「真的没数据」(空状态闪烁)。
 * 水合前显示这个骨架,水合后切换为真实列表/空状态。
 *
 * v0.32 — 替换原 "LOADING…" 文本为克制 Bauhaus 骨架:几块灰色占位矩形
 * 呼应卡片网格(每块 ~160px min-height,与 inbox tile 一致)。纯 CSS,
 * 仅缓慢透明度脉动(可读为"在加载"),无重动画。用于 inbox/archive/trash/
 * search/timeline,占位通用。
 * 导出名/签名不变(PageLoading()),调用方无需改动。
 */
import { useI18n } from '@/lib/i18n'

export function PageLoading() {
  const { t } = useI18n()
  return (
    <div className="page-loading" role="status" aria-live="polite">
      {/* 4 块灰色占位,呼应卡片网格 */}
      <div className="page-loading__skel" aria-hidden="true" />
      <div className="page-loading__skel" aria-hidden="true" />
      <div className="page-loading__skel" aria-hidden="true" />
      <div className="page-loading__skel" aria-hidden="true" />
      {/* 屏幕阅读器仍读到 loading 文案(占位块 aria-hidden) */}
      <span className="page-loading__sr">{t('common.loading')}</span>
      <style>{`
.page-loading {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
  gap: var(--space-3) var(--space-4);
  padding: var(--space-4);
}
.page-loading__skel {
  min-height: 160px;
  background: var(--color-gray-soft);
  border: var(--border-hairline);
  border-radius: var(--radius-sm);
  animation: page-loading-pulse 1.6s ease-in-out infinite;
}
@keyframes page-loading-pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.5; }
}
.page-loading__sr {
  position: absolute;
  width: 1px; height: 1px;
  padding: 0; margin: -1px;
  overflow: hidden; clip: rect(0, 0, 0, 0);
  white-space: nowrap; border: 0;
}
@media (prefers-reduced-motion: reduce) {
  .page-loading__skel { animation: none; }
}
`}</style>
    </div>
  )
}
