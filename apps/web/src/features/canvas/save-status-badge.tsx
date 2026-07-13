'use client'
/**
 * save-status-badge — 画布静态「已保存」角标(2-A)。
 *
 * 持续指示数据在本地有归宿,让用户安心(非单次操作反馈,不随拖卡闪)。
 * SSG 期 localStorage 不可达 → 首帧不显示(useEffect 置 show),避免 hydration mismatch。
 * 挂在 cv-host(画布容器,position relative)内,absolute 贴右下,pointer-events:none 不挡操作。
 */
import { useEffect, useState } from 'react'
import { useI18n } from '@/lib/i18n'

export function SaveStatusBadge() {
  const { t } = useI18n()
  const [show, setShow] = useState(false)
  useEffect(() => { setShow(true) }, [])
  if (!show) return null
  return (
    <div className="save-badge" role="status" aria-live="off">
      <span aria-hidden>✓</span> {t('canvas.saved')}
      <style>{`
.save-badge{position:absolute;right:var(--space-2);bottom:var(--space-2);background:var(--color-gray-soft);color:var(--color-black-soft);font-family:var(--font-body);font-size:var(--font-size-xs);padding:2px var(--space-1);border-radius:var(--radius-sm);opacity:.7;pointer-events:none;user-select:none;z-index:5}
      `}</style>
    </div>
  )
}
