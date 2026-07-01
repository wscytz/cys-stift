'use client'

/**
 * Bauhaus AI settings panel (spec §3.1 / plan Task 3).
 * - region stripe + title + lede
 * - 3 selectable provider CARDS (accent dot + description; Ollama flagged "no key")
 * - grouped fields (baseUrl / model / key, key row hidden when !needsKey)
 * - plaintext warning as a bordered callout (role=note)
 * - "Advanced" reveal: optional temperature + maxTokens (blank = default)
 * - Test + Save primary buttons
 *
 * Style scoping (engineering correction to the plan): every class this panel
 * emits is prefixed `aip__` (AI-panel) and the base section is `aip`. The
 * /settings page (`app/settings/page.tsx`) ships its own `.set__*` classes in
 * an inline <style> block; if this panel reused `.set__*`, two inline style
 * blocks would define the same selectors → ambiguous cascade → visual
 * regression on /settings. The panel therefore defines its OWN complete
 * styling here and relies on none of the page's `.set__*`.
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

const PROVIDERS: ProviderId[] = ['openai', 'anthropic', 'ollama']

export function AISettingsPanel() {
  const { t } = useI18n()
  const { settings, ready } = useSettings()
  // Defer the draft seed until hydration completes; otherwise the first
  // render with no localStorage entry would race with the hydration effect.
  const ai = ready ? settings.ai : null
  const [draft, setDraft] = useState<AIConfig | null>(null)
  const [testing, setTesting] = useState(false)
  const [showKey, setShowKey] = useState(false)
  const [showAdvanced, setShowAdvanced] = useState(false)

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
      <section className="aip" data-testid="ai-settings">
        <div className="aip__region" aria-hidden="true" />
        <h2 className="aip__h">{t('settings.ai')}</h2>
        <p className="aip__lede">{t('settings.aiLede')}</p>
        <style>{panelStyles}</style>
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
    <section className="aip" data-testid="ai-settings">
      <div className="aip__region" aria-hidden="true" />
      <h2 className="aip__h">{t('settings.ai')}</h2>
      <p className="aip__lede">{t('settings.aiLede')}</p>
      <div className="aip__warn" role="note">
        <span aria-hidden="true">⚠</span> {t('settings.aiPlaintextWarning')}
      </div>

      <div className="aip__row">
        <label className="aip__label" htmlFor="ai-enabled">{t('settings.aiEnabled')}</label>
        <input
          id="ai-enabled"
          type="checkbox"
          checked={draft.enabled}
          onChange={(e) => update({ enabled: e.target.checked })}
          aria-label={t('settings.aiEnabled')}
        />
      </div>

      <div className="aip__providerRow" role="radiogroup" aria-label={t('settings.aiProvider')}>
        {PROVIDERS.map((p) => {
          const d = getDefaultProviderDefaults(p)
          const selected = draft.provider === p
          const descKey =
            p === 'openai'
              ? 'settings.aiProviderDesc.openai'
              : p === 'anthropic'
                ? 'settings.aiProviderDesc.anthropic'
                : 'settings.aiProviderDesc.ollama'
          return (
            <button
              key={p}
              type="button"
              data-testid={`provider-card-${p}`}
              role="radio"
              aria-checked={selected}
              className={`aip__providerCard${selected ? ' aip__providerCard--selected' : ''}`}
              onClick={() => onProviderChange(p)}
              disabled={!draft.enabled}
            >
              <span className={`aip__accent aip__accent--${d.accent}`} aria-hidden="true" />
              <span className="aip__providerName">{d.displayName}</span>
              <span className="aip__providerDesc">{t(descKey)}</span>
              {p === 'ollama' && (
                <span className="aip__noKey">{t('settings.aiOllamaNoKey')}</span>
              )}
            </button>
          )
        })}
      </div>

      <div className="aip__row">
        <label className="aip__label" htmlFor="ai-baseurl">{t('settings.aiBaseUrl')}</label>
        <input
          id="ai-baseurl"
          type="url"
          className="aip__input"
          value={draft.baseUrl}
          onChange={(e) => update({ baseUrl: e.target.value })}
          placeholder={def.baseUrl}
          disabled={!draft.enabled}
          autoComplete="off"
          spellCheck={false}
        />
      </div>

      <div className="aip__row">
        <label className="aip__label" htmlFor="ai-model">{t('settings.aiModel')}</label>
        <input
          id="ai-model"
          type="text"
          className="aip__input"
          value={draft.model}
          onChange={(e) => update({ model: e.target.value })}
          placeholder={def.model}
          disabled={!draft.enabled}
          autoComplete="off"
          spellCheck={false}
        />
      </div>

      {def.needsKey && (
        <div className="aip__row">
          <label className="aip__label" htmlFor="ai-apikey">{t('settings.aiApiKey')}</label>
          <div className="aip__keyWrap">
            <input
              id="ai-apikey"
              type={showKey ? 'text' : 'password'}
              className="aip__input"
              value={draft.apiKey}
              onChange={(e) => update({ apiKey: e.target.value })}
              placeholder={draft.provider === 'openai' ? 'sk-...' : 'sk-ant-...'}
              disabled={!draft.enabled}
              autoComplete="off"
              spellCheck={false}
            />
            <button
              type="button"
              className="aip__btnGhost"
              onClick={() => setShowKey((s) => !s)}
              disabled={!draft.enabled}
            >
              {showKey ? t('settings.aiHideKey') : t('settings.aiShowKey')}
            </button>
          </div>
        </div>
      )}

      <button
        type="button"
        className="aip__advancedToggle"
        data-testid="ai-advanced-toggle"
        aria-expanded={showAdvanced}
        onClick={() => setShowAdvanced((s) => !s)}
        disabled={!draft.enabled}
      >
        {showAdvanced ? '▾' : '▸'} {t('settings.aiAdvanced')}
      </button>
      {showAdvanced && (
        <div className="aip__advanced" data-testid="ai-advanced">
          <div className="aip__row">
            <label className="aip__label" htmlFor="ai-temperature">{t('settings.aiTemperature')}</label>
            <input
              id="ai-temperature"
              type="number"
              min={0}
              max={2}
              step={0.1}
              className="aip__input"
              value={draft.temperature ?? ''}
              onChange={(e) =>
                update({
                  temperature:
                    e.target.value === '' ? undefined : Number(e.target.value),
                })
              }
              placeholder="0.3 / 0.7"
              disabled={!draft.enabled}
            />
          </div>
          <div className="aip__row">
            <label className="aip__label" htmlFor="ai-maxtokens">{t('settings.aiMaxTokens')}</label>
            <input
              id="ai-maxtokens"
              type="number"
              min={1}
              max={8192}
              step={1}
              className="aip__input"
              value={draft.maxTokens ?? ''}
              onChange={(e) =>
                update({
                  maxTokens:
                    e.target.value === '' ? undefined : Number(e.target.value),
                })
              }
              placeholder="1024"
              disabled={!draft.enabled}
            />
            <p className="aip__hint">{t('settings.ai.maxTokensHint')}</p>
          </div>
        </div>
      )}

      <div className="aip__actions">
        <button
          type="button"
          className="aip__btn"
          onClick={onTest}
          disabled={!canTest || testing}
        >
          {testing ? t('settings.aiTesting') : t('settings.aiTest')}
        </button>
        <button
          type="button"
          className="aip__btn aip__btn--primary"
          onClick={save}
          disabled={!draft.enabled}
        >
          {t('settings.aiSave')}
        </button>
      </div>
      <style>{panelStyles}</style>
    </section>
  )
}

const panelStyles = `
.aip { position: relative; padding-top: var(--space-3); }
.aip__region { position: absolute; top: 0; left: 0; width: 8px; height: 100%; background: var(--color-black); }
.aip__h { font-family: var(--font-display); margin-left: var(--space-3); }
.aip__lede { font-family: var(--font-body); color: var(--color-gray); margin: var(--space-1) var(--space-3) var(--space-3); }
.aip__warn {
  margin: 0 var(--space-3) var(--space-3);
  padding: var(--space-2) var(--space-3);
  border: var(--border-thick);
  border-color: var(--color-red);
  font-family: var(--font-mono); font-size: var(--font-size-xs);
  background: var(--color-white); color: var(--color-black);
}
.aip__row { display: flex; align-items: center; flex-wrap: wrap; gap: var(--space-2); margin: 0 var(--space-3) var(--space-2); }
.aip__label { flex: 0 0 140px; font-family: var(--font-mono); font-size: var(--font-size-xs); text-transform: uppercase; letter-spacing: 0.08em; color: var(--color-black-soft); }
.aip__input { flex: 1 1 auto; padding: var(--space-1) var(--space-2); border: var(--border-hairline); font-family: var(--font-mono); font-size: var(--font-size-sm); background: var(--color-white); color: var(--color-black); }
.aip__input:focus-visible { outline: 2px solid var(--color-blue); outline-offset: 1px; }
.aip__hint { flex: 0 0 100%; margin: 0 calc(140px + var(--space-2)) var(--space-2); font-family: var(--font-mono); font-size: var(--font-size-xs); color: var(--color-black-soft); line-height: 1.4; }
.aip__keyWrap { display: flex; flex: 1 1 auto; gap: var(--space-1); }
.aip__btnGhost { padding: var(--space-1) var(--space-2); border: var(--border-hairline); background: transparent; font-family: var(--font-mono); font-size: var(--font-size-xs); cursor: pointer; }
.aip__providerRow { display: grid; grid-template-columns: repeat(3, 1fr); gap: var(--space-2); margin: 0 var(--space-3) var(--space-3); }
.aip__providerCard {
  display: flex; flex-direction: column; align-items: flex-start; gap: var(--space-1);
  padding: var(--space-2) var(--space-3);
  background: var(--color-white); border: var(--border-thick); border-color: var(--color-gray);
  cursor: pointer; text-align: left; font-family: var(--font-body);
}
.aip__providerCard--selected { border-color: var(--color-black); box-shadow: 4px 4px 0 var(--color-black); }
.aip__providerCard:disabled { opacity: 0.5; cursor: not-allowed; }
.aip__accent { width: 12px; height: 12px; border-radius: 50%; display: inline-block; }
.aip__accent--black { background: var(--color-black); }
.aip__accent--blue { background: var(--color-blue); }
.aip__accent--yellow { background: var(--color-yellow); }
.aip__providerName { font-family: var(--font-display); font-size: var(--font-size-base); color: var(--color-black); }
.aip__providerDesc { font-size: var(--font-size-xs); color: var(--color-gray); }
.aip__noKey { font-family: var(--font-mono); font-size: var(--font-size-xs); color: var(--color-blue); text-transform: lowercase; }
.aip__advancedToggle { margin: var(--space-1) var(--space-3); background: transparent; border: 0; padding: 0; font-family: var(--font-mono); font-size: var(--font-size-xs); color: var(--color-gray); cursor: pointer; text-transform: lowercase; }
.aip__advancedToggle:disabled { opacity: 0.5; cursor: not-allowed; }
.aip__advanced { margin: var(--space-1) var(--space-3) var(--space-2); }
.aip__actions { display: flex; gap: var(--space-2); margin: var(--space-3); }
.aip__btn { padding: var(--space-2) var(--space-3); border: var(--border-thick); background: var(--color-white); color: var(--color-black); font-family: var(--font-display); cursor: pointer; }
.aip__btn--primary { background: var(--color-black); color: var(--color-white); }
.aip__btn:disabled { opacity: 0.5; cursor: not-allowed; }
`
