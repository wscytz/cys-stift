'use client'

/**
 * R3.8:DB 水合前的极简占位。useDb() 异步从 localStorage 水合卡片,首帧
 * ready=false 时若直接渲染空状态会让用户误以为「真的没数据」(空状态闪烁)。
 * 水合前显示这个极简 loading,水合后切换为真实列表/空状态。
 */
import { useI18n } from '@/lib/i18n'

export function PageLoading() {
  const { t } = useI18n()
  return (
    <div className="page-loading" role="status" aria-live="polite">
      <span className="mono">{t('common.loading')}</span>
      <style>{`
.page-loading {
  display: flex; align-items: center; justify-content: center;
  min-height: 40vh;
  font-family: var(--font-mono); font-size: var(--font-size-sm);
  color: var(--color-gray); letter-spacing: 0.1em; text-transform: uppercase;
}
`}</style>
    </div>
  )
}
