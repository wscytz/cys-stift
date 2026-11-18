'use client'
/**
 * save-status-badge — 画布静态「默认本机存储」角标(2-A)。
 *
 * 只说明数据存在哪里,不冒充「最近一次保存成功」(写入失败不会翻转状态)。
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
      {t('canvas.saved')}
      <style>{`
.save-badge{position:absolute;right:var(--space-2);bottom:var(--space-2);background:var(--color-gray-soft);color:var(--color-black-soft);font-family:var(--font-body);font-size:var(--font-size-xs);padding:2px var(--space-1);border-radius:var(--radius-sm);opacity:.7;pointer-events:none;user-select:none;z-index:5}
      `}</style>
    </div>
  )
}
