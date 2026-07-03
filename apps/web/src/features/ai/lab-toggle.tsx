'use client'

/**
 * LabToggle — 实验室开关 + 风险说明 + 不可撤销确认门。
 *
 * 从 LAB_REGISTRY 读元数据渲染。开启走确认门(说明风险);关闭直接生效。
 * /settings 实验室区遍历 LAB_REGISTRY 渲染一组 <LabToggle>。
 *
 * 代码层守卫在调用方(useLabEnabled),这里只管设置层的开关 + 确认门 UI。
 */
import { useState } from 'react'
import { Modal, Button } from '@cys-stift/ui'
import { useI18n } from '@/lib/i18n'
import { settingsStore } from '@/lib/settings-store'
import { LAB_REGISTRY, type LabId } from './labs-registry'

export function LabToggle({
  lab,
  enabled,
}: {
  lab: LabId
  enabled: boolean
}) {
  const { t } = useI18n()
  const [confirmOpen, setConfirmOpen] = useState(false)
  const meta = LAB_REGISTRY.find((m) => m.id === lab)
  if (!meta) return null

  const onChange = (checked: boolean) => {
    if (checked && !enabled) {
      // 开启走确认门(不可撤销风险让步)
      setConfirmOpen(true)
    } else if (!checked && enabled) {
      // 关闭直接生效
      settingsStore.updateLabs({ [lab]: false })
    }
  }

  const confirmEnable = () => {
    settingsStore.updateLabs({ [lab]: true })
    setConfirmOpen(false)
  }

  return (
    <>
      <label className="mono-label set__lab-item">
        <input
          type="checkbox"
          checked={enabled}
          onChange={(e) => onChange(e.target.checked)}
        />
        <span>
          {t(meta.labelKey)}
          <span className="mono mono--xs set__lab-warn">{t(meta.warnKey)}</span>
        </span>
      </label>

      <Modal
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        title={t(meta.confirmTitleKey)}
        closeLabel={t('common.close')}
      >
        <p className="set__lab-confirm-body">{t(meta.confirmBodyKey)}</p>
        <div className="set__lab-confirm-actions">
          <Button variant="ghost" type="button" onClick={() => setConfirmOpen(false)}>
            {t('common.cancel')}
          </Button>
          <Button variant="primary" type="button" onClick={confirmEnable}>
            {t(meta.confirmActionKey)}
          </Button>
        </div>
      </Modal>
    </>
  )
}
