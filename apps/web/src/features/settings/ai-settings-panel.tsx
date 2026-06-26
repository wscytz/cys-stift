'use client'

/**
 * M3.2 — /settings AI panel. Self-contained form: provider select, baseUrl,
 * model, API key (password + show/hide toggle), enable toggle, test button,
 * plaintext warning banner, save button. Draft state lives in the component
 * (not in settings-store) — we only commit on Save so a half-filled form
 * doesn't write a broken config.
 *
 * The plaintext warning is a deliberate UX choice: the AIConfig.apiKey is
 * stored as-is in localStorage (M3 ADR). A more secure path (OS keychain,
 * AES-GCM with a user-set passphrase) is M4 territory.
 */

import { useState } from 'react'
import { settingsStore, useSettings } from '@/lib/settings-store'
import { testConnection } from '@/features/ai/test-connection'
import {
  getDefaultProviderDefaults,
  registerDefaultProviders,
} from '@/features/ai/providers'
import type { AIConfig, ProviderId } from '@/features/ai/types'
import { useI18n } from '@/lib/i18n'
import { pushToast } from '@/lib/toast-store'

export function AISettingsPanel() {
  const { t } = useI18n()
  const { settings, ready } = useSettings()
  // Defer the draft seed until hydration completes; otherwise the first
  // render with no localStorage entry would race with the hydration effect.
  const ai = ready ? settings.ai : null
  const [draft, setDraft] = useState<AIConfig | null>(null)
  const [testing, setTesting] = useState(false)
  const [showKey, setShowKey] = useState(false)

  // Lazy seed once hydration is done — only if user hasn't started editing.
  if (ready && draft === null) {
    const def = getDefaultProviderDefaults('openai')
    setDraft(
      ai ?? {
        provider: 'openai',
        apiKey: '',
        baseUrl: def.baseUrl,
        model: def.model,
        enabled: false,
      },
    )
  }
  // While pre-hydration or seeding, render a placeholder so the section is
  // visible at the right position.
  if (!draft) {
    return (
      <section className="set">
        <h2 className="set__h">{t('settings.ai')}</h2>
        <p className="set__lede">{t('settings.aiLede')}</p>
      </section>
    )
  }

  const update = (patch: Partial<AIConfig>) => setDraft((d) => ({ ...d!, ...patch }))

  const save = () => {
    // updateAISettings 返回 false = 配额失败已回滚内存 + notifyQuota(泛化配额 toast
    // 由 AppMenu 订阅触发)。此时不该再 toast 成功(误导反馈真 bug:此前无条件 success
    // toast → 用户看到「已保存」+「配额超限」两个矛盾 toast,reload 后配置消失)。
    if (settingsStore.updateAISettings(draft)) {
      pushToast({ kind: 'success', message: t('settings.aiSaved') })
    }
  }

  const onProviderChange = (provider: ProviderId) => {
    const def = getDefaultProviderDefaults(provider)
    setDraft({ ...draft, provider, baseUrl: def.baseUrl, model: def.model })
  }

  const onTest = async () => {
    setTesting(true)
    registerDefaultProviders()
    try {
      const result = await testConnection(draft)
      if (result.ok) {
        pushToast({
          kind: 'success',
          message: t('settings.aiTestOk', { ms: String(result.latencyMs ?? 0) }),
        })
      } else {
        pushToast({
          kind: 'error',
          message: t('settings.aiTestFail', { error: result.error ?? 'unknown' }),
        })
      }
    } finally {
      setTesting(false)
    }
  }

  const def = getDefaultProviderDefaults(draft.provider)
  const canTest =
    draft.enabled && draft.baseUrl.length > 0 && (!def.needsKey || draft.apiKey.length > 0)

  return (
    <section className="set">
      <h2 className="set__h">{t('settings.ai')}</h2>
      <p className="set__lede">{t('settings.aiLede')}</p>
      <div className="set__warn" role="note">
        ⚠ {t('settings.aiPlaintextWarning')}
      </div>

      <div className="set__row">
        <label className="set__label" htmlFor="ai-enabled">{t('settings.aiEnabled')}</label>
        <input
          id="ai-enabled"
          type="checkbox"
          checked={draft.enabled}
          onChange={(e) => update({ enabled: e.target.checked })}
          aria-label={t('settings.aiEnabled')}
        />
      </div>

      <div className="set__row">
        <label className="set__label" htmlFor="ai-provider">{t('settings.aiProvider')}</label>
        <select
          id="ai-provider"
          className="set__select"
          value={draft.provider}
          onChange={(e) => onProviderChange(e.target.value as ProviderId)}
          disabled={!draft.enabled}
        >
          <option value="openai">{getDefaultProviderDefaults('openai').displayName}</option>
          <option value="anthropic">{getDefaultProviderDefaults('anthropic').displayName}</option>
          <option value="ollama">{getDefaultProviderDefaults('ollama').displayName}</option>
        </select>
      </div>

      <div className="set__row">
        <label className="set__label" htmlFor="ai-baseurl">{t('settings.aiBaseUrl')}</label>
        <input
          id="ai-baseurl"
          type="url"
          className="set__input"
          value={draft.baseUrl}
          onChange={(e) => update({ baseUrl: e.target.value })}
          placeholder={def.baseUrl}
          disabled={!draft.enabled}
          autoComplete="off"
          spellCheck={false}
        />
      </div>

      <div className="set__row">
        <label className="set__label" htmlFor="ai-model">{t('settings.aiModel')}</label>
        <input
          id="ai-model"
          type="text"
          className="set__input"
          value={draft.model}
          onChange={(e) => update({ model: e.target.value })}
          placeholder={def.model}
          disabled={!draft.enabled}
          autoComplete="off"
          spellCheck={false}
        />
      </div>

      {def.needsKey && (
        <div className="set__row">
          <label className="set__label" htmlFor="ai-apikey">{t('settings.aiApiKey')}</label>
          <div className="set__keyWrap">
            <input
              id="ai-apikey"
              type={showKey ? 'text' : 'password'}
              className="set__input"
              value={draft.apiKey}
              onChange={(e) => update({ apiKey: e.target.value })}
              placeholder={draft.provider === 'openai' ? 'sk-...' : 'sk-ant-...'}
              disabled={!draft.enabled}
              autoComplete="off"
              spellCheck={false}
            />
            <button
              type="button"
              className="set__btnGhost"
              onClick={() => setShowKey((s) => !s)}
              disabled={!draft.enabled}
            >
              {showKey ? t('settings.aiHideKey') : t('settings.aiShowKey')}
            </button>
          </div>
        </div>
      )}

      <div className="set__actions">
        <button
          type="button"
          className="set__btn"
          onClick={onTest}
          disabled={!canTest || testing}
        >
          {testing ? t('settings.aiTesting') : t('settings.aiTest')}
        </button>
        <button
          type="button"
          className="set__btn set__btn--primary"
          onClick={save}
          disabled={!draft.enabled}
        >
          {t('settings.aiSave')}
        </button>
      </div>
    </section>
  )
}