'use client'

/**
 * AI 设置面板(多 profile 模型)。
 * - profile 列表(chips):name + provider + active ●。点选 = 编辑该 profile。
 * - 「+ 新建」:选 provider 种默认 → 进编辑。
 * - 编辑表单:name + provider radio + baseUrl/model/key + Advanced。
 * - 「设为当前」(= active)+「删除」+「测试」+「保存」。
 * active profile = getCurrentAI 返回的 = /ask 等实际用的。
 */
import { useEffect, useMemo, useState } from 'react'
import { Button, Modal } from '@cys-stift/ui'
import { settingsStore, useSettings } from '@/lib/settings-store'
import { testConnection } from '@/features/ai/test-connection'
import {
  getDefaultProviderDefaults,
  registerDefaultProviders,
} from '@/features/ai/providers'
import { genProfileId, type AIProfile, type ProviderId } from '@/features/ai/types'
import { useI18n } from '@/lib/i18n'
import { pushToast } from '@/lib/toast-store'

const PROVIDERS: ProviderId[] = ['openai', 'anthropic', 'ollama']

type ConfirmAction =
  | { kind: 'switch'; id: string }
  | { kind: 'new'; provider: ProviderId }
  | { kind: 'provider'; provider: ProviderId }
  | { kind: 'delete' }

export function AISettingsPanel() {
  const { t } = useI18n()
  const { settings, ready } = useSettings()
  const profiles = ready ? settings.profiles : []
  const activeProfileId = ready ? settings.activeProfileId : null
  // 当前编辑的 profile id(null=没选/没新建)。默认选 active(或第一个)。
  const [editingId, setEditingId] = useState<string | null>(null)
  const [draft, setDraft] = useState<AIProfile | null>(null)
  const [testing, setTesting] = useState(false)
  const [showKey, setShowKey] = useState(false)
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [testedIds, setTestedIds] = useState<Set<string>>(() => new Set())
  const [confirmAction, setConfirmAction] = useState<ConfirmAction | null>(null)

  // 初次打开选 active 或第一个；放 effect，避免 render 中 setState。
  useEffect(() => {
    if (!ready || draft !== null || editingId !== null) return
    const initialId = activeProfileId ?? profiles[0]?.id ?? null
    if (initialId) {
      const p = profiles.find((x) => x.id === initialId) ?? null
      if (p) {
        setEditingId(p.id)
        setDraft(p)
      }
    }
  }, [activeProfileId, draft, editingId, profiles, ready])

  const persisted = useMemo(
    () => (draft ? profiles.find((profile) => profile.id === draft.id) ?? null : null),
    [draft, profiles],
  )
  const dirty = !!draft && JSON.stringify(draft) !== JSON.stringify(persisted)

  const clearTested = (id: string) => {
    setTestedIds((current) => {
      if (!current.has(id)) return current
      const next = new Set(current)
      next.delete(id)
      return next
    })
  }

  const update = (patch: Partial<AIProfile>) => {
    if (draft) clearTested(draft.id)
    setDraft((current) => (current ? { ...current, ...patch } : current))
  }

  const onNewProfile = (provider: ProviderId) => {
    if (dirty) {
      setConfirmAction({ kind: 'new', provider })
      return
    }
    createProfile(provider)
  }

  const createProfile = (provider: ProviderId) => {
    const def = getDefaultProviderDefaults(provider)
    const np: AIProfile = {
      id: genProfileId(),
      name: def.displayName,
      provider,
      apiKey: '',
      baseUrl: def.baseUrl,
      model: def.model,
      enabled: false,
    }
    setDraft(np)
    setEditingId(null) // 新建:还没 upsert,editingId 为空(保存时落库)
    setShowKey(false)
    setShowAdvanced(false)
  }

  const selectProfile = (id: string) => {
    if (draft?.id === id) return
    if (dirty) {
      setConfirmAction({ kind: 'switch', id })
      return
    }
    applyProfileSelection(id)
  }

  const applyProfileSelection = (id: string) => {
    const p = profiles.find((x) => x.id === id) ?? null
    if (p) {
      setEditingId(p.id)
      setDraft(p)
      setShowKey(false)
      setShowAdvanced(false)
    }
  }

  const save = () => {
    if (!draft) return
    if (settingsStore.upsertProfile(draft)) {
      setEditingId(draft.id) // 保存后落定 editingId(新建的也变成已存在)
      pushToast({ kind: 'success', message: t('settings.aiSaved') })
    }
  }

  const setActive = () => {
    if (!draft || !editingId) return
    if (settingsStore.setActiveProfile(draft.id)) {
      pushToast({ kind: 'success', message: t('settings.aiActive') })
    }
  }

  const onDelete = () => {
    if (!draft || !editingId) return
    setConfirmAction({ kind: 'delete' })
  }

  const deleteConfirmed = () => {
    if (!draft || !editingId) return
    settingsStore.deleteProfile(draft.id)
    clearTested(draft.id)
    setDraft(null)
    setEditingId(null)
  }

  const onProviderChange = (provider: ProviderId) => {
    if (!draft || provider === draft.provider) return
    if (editingId) {
      setConfirmAction({ kind: 'provider', provider })
      return
    }
    applyProviderChange(provider)
  }

  const applyProviderChange = (provider: ProviderId) => {
    const def = getDefaultProviderDefaults(provider)
    if (draft) clearTested(draft.id)
    setDraft((current) => {
      if (!current) return current
      return {
        ...current,
        provider,
        apiKey: '',
        baseUrl: def.baseUrl,
        model: def.model,
      }
    })
  }

  const runConfirmedAction = () => {
    const action = confirmAction
    setConfirmAction(null)
    if (!action) return
    if (action.kind === 'switch') applyProfileSelection(action.id)
    if (action.kind === 'new') createProfile(action.provider)
    if (action.kind === 'provider') applyProviderChange(action.provider)
    if (action.kind === 'delete') deleteConfirmed()
  }

  const onTest = async () => {
    if (!draft) return
    setTesting(true)
    registerDefaultProviders()
    try {
      const result = await testConnection(draft)
      if (result.ok) {
        setTestedIds((current) => new Set(current).add(draft.id))
        pushToast({ kind: 'success', message: t('settings.aiTestOk', { ms: String(result.latencyMs ?? 0) }) })
      } else {
        pushToast({ kind: 'error', message: t('settings.aiTestFail', { error: result.error ?? 'unknown' }) })
      }
    } finally {
      setTesting(false)
    }
  }

  const def = draft ? getDefaultProviderDefaults(draft.provider) : null
  const canTest = !!draft && draft.enabled && draft.baseUrl.length > 0 && (!def?.needsKey || draft.apiKey.length > 0)
  const isActive = !!(draft && editingId && draft.id === activeProfileId)
  const tested = !!draft && testedIds.has(draft.id)
  const profileState = !draft
    ? t('settings.aiStateNone')
    : isActive
      ? t('settings.aiStateActive')
      : dirty || !editingId
        ? t('settings.aiStateDraft')
        : tested
          ? t('settings.aiStateTested')
          : t('settings.aiStateSaved')

  return (
    <section className="aip" data-testid="ai-settings">
      <div className="aip__region" aria-hidden="true" />
      <h2 className="aip__h">{t('settings.ai')}</h2>
      <p className="aip__lede">{t('settings.aiLede')}</p>
      <div className="aip__warn" role="note">
        <span aria-hidden="true">⚠</span> {t('settings.aiPlaintextWarning')}
      </div>
      <p className="aip__state" data-testid="ai-profile-state" aria-live="polite">
        {profileState}
      </p>

      {/* profile 列表 */}
      <div className="aip__profileRow" data-testid="ai-profile-list">
        {profiles.map((p) => {
          const d = getDefaultProviderDefaults(p.provider)
          const editing = editingId === p.id && draft?.id === p.id
          const active = p.id === activeProfileId
          return (
            <button
              key={p.id}
              type="button"
              data-testid={`profile-chip-${p.id}`}
              className={`aip__profileChip${editing ? ' aip__profileChip--selected' : ''}`}
              onClick={() => selectProfile(p.id)}
            >
              <span className={`aip__accent aip__accent--${d.accent}`} aria-hidden="true" />
              <span className="aip__profileName">{p.name || d.displayName}</span>
              {active && <span className="aip__activeTag" aria-label={t('settings.aiActive')}>●</span>}
            </button>
          )
        })}
        {/* 新建下拉:三 provider */}
        {PROVIDERS.map((p) => {
          const d = getDefaultProviderDefaults(p)
          return (
            <button
              key={'new-' + p}
              type="button"
              data-testid={`new-profile-${p}`}
              className="aip__profileChip aip__profileChip--new"
              onClick={() => onNewProfile(p)}
              title={t('settings.aiNewProfile') + ': ' + d.displayName}
            >
              + {d.displayName}
            </button>
          )
        })}
      </div>

      {draft && def ? (
        <>
          <div className="aip__row">
            <label className="aip__label" htmlFor="ai-name">{t('settings.aiProfileName')}</label>
            <input
              id="ai-name"
              type="text"
              className="aip__input"
              value={draft.name}
              onChange={(e) => update({ name: e.target.value })}
              disabled={!draft.enabled && editingId === null ? false : !draft.enabled}
              autoComplete="off"
              spellCheck={false}
            />
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
              const descKey = p === 'openai' ? 'settings.aiProviderDesc.openai' : p === 'anthropic' ? 'settings.aiProviderDesc.anthropic' : 'settings.aiProviderDesc.ollama'
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
                  {p === 'ollama' && <span className="aip__noKey">{t('settings.aiOllamaNoKey')}</span>}
                </button>
              )
            })}
          </div>

          <div className="aip__row">
            <label className="aip__label" htmlFor="ai-baseurl">{t('settings.aiBaseUrl')}</label>
            <input id="ai-baseurl" type="url" className="aip__input" value={draft.baseUrl} onChange={(e) => update({ baseUrl: e.target.value })} placeholder={def.baseUrl} disabled={!draft.enabled} autoComplete="off" spellCheck={false} />
          </div>
          <div className="aip__row">
            <label className="aip__label" htmlFor="ai-model">{t('settings.aiModel')}</label>
            <input id="ai-model" type="text" className="aip__input" value={draft.model} onChange={(e) => update({ model: e.target.value })} placeholder={def.model} disabled={!draft.enabled} autoComplete="off" spellCheck={false} />
          </div>
          {def.needsKey && (
            <div className="aip__row">
              <label className="aip__label" htmlFor="ai-apikey">{t('settings.aiApiKey')}</label>
              <div className="aip__keyWrap">
                <input id="ai-apikey" type={showKey ? 'text' : 'password'} className="aip__input" value={draft.apiKey} onChange={(e) => update({ apiKey: e.target.value })} placeholder={draft.provider === 'openai' ? 'sk-...' : 'sk-ant-...'} disabled={!draft.enabled} autoComplete="off" spellCheck={false} />
                <button type="button" className="aip__btnGhost" onClick={() => setShowKey((s) => !s)} disabled={!draft.enabled}>{showKey ? t('settings.aiHideKey') : t('settings.aiShowKey')}</button>
              </div>
            </div>
          )}

          <button type="button" className="aip__advancedToggle" data-testid="ai-advanced-toggle" aria-expanded={showAdvanced} onClick={() => setShowAdvanced((s) => !s)} disabled={!draft.enabled}>
            {showAdvanced ? '▾' : '▸'} {t('settings.aiAdvanced')}
          </button>
          {showAdvanced && (
            <div className="aip__advanced" data-testid="ai-advanced">
              <div className="aip__row">
                <label className="aip__label" htmlFor="ai-temperature">{t('settings.aiTemperature')}</label>
                <input id="ai-temperature" type="number" min={0} max={2} step={0.1} className="aip__input" value={draft.temperature ?? ''} onChange={(e) => update({ temperature: e.target.value === '' ? undefined : Number(e.target.value) })} placeholder="0.3 / 0.7" disabled={!draft.enabled} />
              </div>
              <div className="aip__row">
                <label className="aip__label" htmlFor="ai-maxtokens">{t('settings.aiMaxTokens')}</label>
                <input id="ai-maxtokens" type="number" min={1} max={8192} step={1} className="aip__input" value={draft.maxTokens ?? ''} onChange={(e) => update({ maxTokens: e.target.value === '' ? undefined : Number(e.target.value) })} placeholder="1024" disabled={!draft.enabled} />
                <p className="aip__hint">{t('settings.ai.maxTokensHint')}</p>
              </div>
            </div>
          )}

          <div className="aip__actions">
            <button type="button" className="aip__btn" onClick={onTest} disabled={!canTest || testing || dirty || !editingId}>{testing ? t('settings.aiTesting') : t('settings.aiTest')}</button>
            <button type="button" className="aip__btn" onClick={onDelete} disabled={editingId === null}>{t('settings.aiDeleteProfile')}</button>
            <button type="button" className="aip__btn" onClick={setActive} disabled={!editingId || isActive || !tested || dirty}>{t('settings.aiSetActive')}</button>
            <button type="button" className="aip__btn aip__btn--primary" onClick={save} disabled={!draft.enabled || !dirty}>{t('settings.aiSave')}</button>
          </div>
        </>
      ) : (
        <p className="aip__empty">{t('settings.aiNoProfile')}</p>
      )}
      <Modal
        open={confirmAction !== null}
        onClose={() => setConfirmAction(null)}
        title={
          confirmAction?.kind === 'delete'
            ? t('settings.aiDeleteConfirmTitle')
            : confirmAction?.kind === 'provider'
              ? t('settings.aiProviderConfirmTitle')
              : t('settings.aiDiscardConfirmTitle')
        }
        closeLabel={t('common.close')}
      >
        <p className="aip__confirmBody">
          {confirmAction?.kind === 'delete'
            ? t('settings.aiDeleteConfirmBody')
            : confirmAction?.kind === 'provider'
              ? t('settings.aiProviderConfirmBody')
              : t('settings.aiDiscardConfirmBody')}
        </p>
        <div className="aip__confirmActions">
          <Button variant="ghost" onClick={() => setConfirmAction(null)}>{t('common.cancel')}</Button>
          <Button variant="primary" onClick={runConfirmedAction}>
            {confirmAction?.kind === 'delete' ? t('settings.aiDeleteProfile') : t('common.ok')}
          </Button>
        </div>
      </Modal>
      <style>{panelStyles}</style>
    </section>
  )
}

const panelStyles = `
.aip { position: relative; padding-top: var(--space-3); }
.aip__region { position: absolute; top: 0; left: 0; width: 8px; height: 100%; background: var(--color-black); }
.aip__h { font-family: var(--font-display); margin-left: var(--space-3); }
.aip__lede { font-family: var(--font-body); color: var(--color-gray); margin: var(--space-1) var(--space-3) var(--space-3); }
.aip__warn { margin: 0 var(--space-3) var(--space-3); padding: var(--space-2) var(--space-3); border: var(--border-thick); border-color: var(--color-red); font-family: var(--font-mono); font-size: var(--font-size-xs); background: var(--color-white); color: var(--color-black); }
.aip__state { margin: 0 var(--space-3) var(--space-2); font-family: var(--font-mono); font-size: var(--font-size-xs); font-weight: 700; }
.aip__row { display: flex; align-items: center; flex-wrap: wrap; gap: var(--space-2); margin: 0 var(--space-3) var(--space-2); }
.aip__label { flex: 0 0 140px; font-family: var(--font-mono); font-size: var(--font-size-xs); text-transform: uppercase; letter-spacing: 0.08em; color: var(--color-black-soft); }
.aip__input { flex: 1 1 auto; padding: var(--space-1) var(--space-2); border: var(--border-hairline); font-family: var(--font-mono); font-size: var(--font-size-sm); background: var(--color-white); color: var(--color-black); }
.aip__input:focus-visible { outline: 2px solid var(--color-blue); outline-offset: 1px; }
.aip__hint { flex: 0 0 100%; margin: 0 calc(140px + var(--space-2)) var(--space-2); font-family: var(--font-mono); font-size: var(--font-size-xs); color: var(--color-black-soft); line-height: 1.4; }
.aip__keyWrap { display: flex; flex: 1 1 auto; gap: var(--space-1); }
.aip__btnGhost { padding: var(--space-1) var(--space-2); border: var(--border-hairline); background: transparent; font-family: var(--font-mono); font-size: var(--font-size-xs); cursor: pointer; }
.aip__profileRow { display: flex; flex-wrap: wrap; gap: var(--space-1); margin: 0 var(--space-3) var(--space-3); }
.aip__profileChip { display: inline-flex; align-items: center; min-height: 44px; gap: var(--space-1); padding: var(--space-1) var(--space-2); border: var(--border-thick); border-color: var(--color-gray); background: var(--color-white); font-family: var(--font-body); font-size: var(--font-size-sm); cursor: pointer; }
.aip__profileChip--selected { border-color: var(--color-black); box-shadow: 4px 4px 0 var(--color-black); }
.aip__profileChip--new { border-style: dashed; color: var(--color-gray); }
.aip__profileName { font-family: var(--font-display); }
.aip__activeTag { color: var(--color-blue); }
.aip__providerRow { display: grid; grid-template-columns: repeat(3, 1fr); gap: var(--space-2); margin: 0 var(--space-3) var(--space-3); }
.aip__providerCard { display: flex; flex-direction: column; align-items: flex-start; gap: var(--space-1); padding: var(--space-2) var(--space-3); background: var(--color-white); border: var(--border-thick); border-color: var(--color-gray); cursor: pointer; text-align: left; font-family: var(--font-body); }
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
.aip__actions { display: flex; flex-wrap: wrap; gap: var(--space-2); margin: var(--space-3); }
.aip__btn { padding: var(--space-2) var(--space-3); border: var(--border-thick); background: var(--color-white); color: var(--color-black); font-family: var(--font-display); cursor: pointer; }
.aip__btn--primary { background: var(--color-black); color: var(--color-white); }
.aip__btn:disabled { opacity: 0.5; cursor: not-allowed; }
.aip__empty { margin: 0 var(--space-3) var(--space-3); font-family: var(--font-mono); font-size: var(--font-size-xs); color: var(--color-gray); }
.aip__confirmBody { line-height: 1.5; }
.aip__confirmActions { display: flex; justify-content: flex-end; gap: var(--space-2); margin-top: var(--space-3); }
@media (max-width: 480px) {
  .aip__lede, .aip__warn, .aip__state, .aip__profileRow, .aip__providerRow,
  .aip__row, .aip__advanced, .aip__actions, .aip__empty {
    margin-left: var(--space-1);
    margin-right: var(--space-1);
  }
  .aip__providerRow { grid-template-columns: minmax(0, 1fr); }
  .aip__row { align-items: stretch; }
  .aip__label { flex: 1 1 100%; }
  .aip__input { width: 100%; min-width: 0; box-sizing: border-box; }
  .aip__keyWrap { flex: 1 1 100%; min-width: 0; flex-direction: column; }
  .aip__hint { margin-left: 0; margin-right: 0; }
  .aip__advancedToggle { min-height: 44px; margin-left: var(--space-1); margin-right: var(--space-1); }
  .aip__confirmActions { flex-wrap: wrap; }
}
`
