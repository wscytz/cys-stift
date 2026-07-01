'use client'

/**
 * CaptureHost — Phase 6 + 6.5g. Mounts the global Cmd/Ctrl+Shift+Space
 * shortcut listener, the menu "open capture" CustomEvent, and renders
 * a single MiniInput instance. One host per app; no event bus, no
 * multi-instance.
 *
 * Shortcut matching rules (plan §3 T3):
 * - metaKey OR ctrlKey must be true (cross-platform)
 * - shiftKey must be true
 * - code === 'Space' (more reliable than key which can be a CJK char)
 * - active element must NOT be INPUT / TEXTAREA / contenteditable
 * - MiniInput must NOT already be open (avoids repeat-fires)
 *
 * On match: event.preventDefault() (blocks browser default, e.g. macOS
 * Spotlight is OS-level so it can't be blocked here — that's fine, the
 * shortcut works inside the browser context which is where MiniInput lives).
 *
 * Menu entry: AppMenu dispatches `cys-stift:open-capture` to ask the
 * CaptureHost to open the Mini Input. Same instance, same onSubmit.
 */
import { useCallback, useEffect, useState } from 'react'
import { useDb } from '@/lib/db-client'
import { useSettings } from '@/lib/settings-store'
import { MiniInput } from './mini-input'
import { captureSinkRegistry } from './capture-sink'
import { getDeviceId } from '@/lib/device-id'
import { pushToast } from '@/lib/toast-store'
import { useI18n } from '@/lib/i18n'
import { useCanvases } from '@/lib/canvas-store'
import { buildCaptureRedirectActions } from './capture-redirect'

export const CAPTURE_OPEN_EVENT = 'cys-stift:open-capture'

/**
 * 把 web 端 CaptureShortcut(modKey + shift + KeyboardEvent.code)转成 Tauri
 * accelerator 字符串(如 "CmdOrCtrl+Shift+Space")。modKey meta→CmdOrCtrl 跨平台
 * (Tauri 自动 Cmd on macOS / Ctrl on Win+Linux);code 归一化(KeyC→C、Digit1→1)。
 * 用于桌面壳跟随用户改的快捷键(修补轮:此前 Rust 写死,web 可改但不联动)。
 */
export function captureShortcutToAccelerator(sc: {
  modKey: 'meta' | 'ctrl'
  shift: boolean
  code: string
}): string {
  const parts: string[] = [sc.modKey === 'meta' ? 'CmdOrCtrl' : 'Ctrl']
  if (sc.shift) parts.push('Shift')
  // KeyC → C, Digit1 → 1, Space/Comma/... 原样。
  let key = sc.code
  if (key.startsWith('Key')) key = key.slice(3)
  else if (key.startsWith('Digit')) key = key.slice(5)
  parts.push(key)
  return parts.join('+')
}

/** 在桌面壳里调 update_shortcut。非桌面(无 __TAURI__)静默 no-op。 */
function invokeUpdateShortcut(accelerator: string): void {
  type TauriCoreAPI = { invoke: (cmd: string, args?: Record<string, unknown>) => Promise<unknown> }
  type TauriGlobal = { core?: TauriCoreAPI }
  const tauri = (window as unknown as { __TAURI__?: TauriGlobal }).__TAURI__
  if (!tauri?.core?.invoke) return
  tauri.core.invoke('update_shortcut', { accelerator }).catch(() => {
    // Rust 端已 emit global-shortcut-error 事件,这里不重复 toast。
  })
}

export function CaptureHost() {
  const { service } = useDb()
  const { t } = useI18n()
  const { settings } = useSettings()
  const { snapshot } = useCanvases()
  const sc = settings.captureShortcut
  const [open, setOpen] = useState(false)
  // Tracks which entry-point opened the Mini Input so the saved card's
  // source.kind reflects it (shortcut vs menubar). Reset on submit/close.
  const [openKind, setOpenKind] = useState<'shortcut' | 'menubar'>('shortcut')

  // H2 fix: capture submit 现在是 await 的——配额失败时 sink 会 reject
  // (cardRepo.insert 在配额满时抛 StorageQuotaError)。失败时推 error toast
  // 并返回 false,让 MiniInput 据此保持 modal 打开 + 保留草稿 + 重置 submitting
  // latch(可重试);成功时关闭 modal,返回 true(MiniInput 清草稿)。happy path
  // 仍是单 microtask(WebCaptureSink.submit 同步 resolve),不阻塞 UI。
  const onSubmit = useCallback(
    ({ title, body }: { title: string; body?: string }): Promise<boolean> => {
      const did = getDeviceId()
      const source =
        openKind === 'menubar'
          ? { kind: 'menubar' as const, deviceId: did }
          : {
              kind: 'shortcut' as const,
              shortcutId: 'cmd-shift-space',
              deviceId: did,
            }
      return captureSinkRegistry
        .submit({ title, body, source })
        .then(({ cardId }) => {
          setOpen(false)
          const actions = buildCaptureRedirectActions({
            cardId,
            service,
            activeCanvasId: snapshot.activeCanvasId,
            openCard: (id) => {
              window.dispatchEvent(
                new CustomEvent('cys-stift:open-card', { detail: { id } }),
              )
            },
            onError: (msg) =>
              pushToast({ kind: 'error', message: t('capture.redirectFailed', { error: msg }) }),
          }).map((a, i) => ({
            // Localize the label for display (machine label → i18n).
            label:
              i === 0
                ? t('capture.toCanvas')
                : i === 1
                  ? t('capture.toArchive')
                  : t('capture.open'),
            onClick: a.onClick,
          }))
          pushToast({ kind: 'success', message: t('capture.saved'), actions })
          return true
        })
        .catch((e: unknown) => {
          const msg = e instanceof Error ? e.message : String(e)
          pushToast({
            kind: 'error',
            message: t('capture.persistFailed', { error: msg }),
          })
          return false
        })
    },
    [openKind, t, service, snapshot.activeCanvasId],
  )

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (open) return
      // Match against the user-configured shortcut (spec §5.5). We accept
      // either meta or ctrl as the mod key for cross-platform forgiveness
      // — the stored modKey is just the user's preferred label.
      const mod = e.metaKey || e.ctrlKey
      if (!mod) return
      if (sc.shift && !e.shiftKey) return
      if (e.code !== sc.code) return
      const t = e.target as HTMLElement | null
      if (t) {
        const tag = t.tagName
        if (tag === 'INPUT' || tag === 'TEXTAREA' || t.isContentEditable) return
      }
      e.preventDefault()
      setOpenKind('shortcut')
      setOpen(true)
    }
    const onMenuOpen = () => {
      setOpenKind('menubar')
      setOpen(true)
    }
    window.addEventListener('keydown', onKey)
    window.addEventListener(CAPTURE_OPEN_EVENT, onMenuOpen as EventListener)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener(CAPTURE_OPEN_EVENT, onMenuOpen as EventListener)
    }
  }, [open, sc.shift, sc.code])

  // Phase C (v0.25.0): listen for the Tauri global-shortcut event so the
  // Mini Input opens even when the window is unfocused/minimised. No-op in
  // a plain browser (window.__TAURI__ is undefined). We use the global API
  // (withGlobalTauri) instead of importing @tauri-apps/api so the web
  // bundle stays free of a Tauri runtime dependency.
  //
  // R1 (v0.25.1): listen() returns a Promise<unlisten>. If the component
  // unmounts before that resolves, the naive cleanup (unlisten?.()) would
  // no-op and the listener would leak forever. Guard with a cancelled flag
  // and unregister inside .then if we've already torn down — same pattern
  // as the capture-sink registration effect below.
  useEffect(() => {
    type TauriEventAPI = {
      listen: (
        event: string,
        handler: (e: unknown) => void,
      ) => Promise<() => void>
    }
    type TauriGlobal = { event?: TauriEventAPI }
    const tauri = (window as unknown as { __TAURI__?: TauriGlobal }).__TAURI__
    if (!tauri?.event?.listen) return
    let cancelled = false
    let unlisten: (() => void) | undefined
    tauri.event
      .listen('global-capture-open', () => {
        setOpenKind('shortcut')
        setOpen(true)
      })
      .then((fn) => {
        // Unmounted before the promise resolved — unregister immediately
        // so the listener doesn't outlive the component.
        if (cancelled) {
          fn()
          return
        }
        unlisten = fn
      })
      .catch(() => {
        /* Tauri event listen failed — ignore outside the desktop shell */
      })
    return () => {
      cancelled = true
      unlisten?.()
    }
  }, [])

  // 桌面壳快捷键注册失败 → toast(修补轮:此前 Rust 仅 eprintln,桌面用户看不到
  // stderr,被别的应用占用快捷键时静默失效)。非桌面 no-op。
  useEffect(() => {
    type TauriEventAPI = { listen: (e: string, h: (e: unknown) => void) => Promise<() => void> }
    type TauriGlobal = { event?: TauriEventAPI }
    const tauri = (window as unknown as { __TAURI__?: TauriGlobal }).__TAURI__
    if (!tauri?.event?.listen) return
    let cancelled = false
    let unlisten: (() => void) | undefined
    tauri.event
      .listen('global-shortcut-error', (e) => {
        const detail = (e as { payload?: string })?.payload ?? ''
        pushToast({
          kind: 'error',
          message: t('capture.globalShortcutFailed', { error: detail }),
        })
      })
      .then((fn) => {
        if (cancelled) {
          fn()
          return
        }
        unlisten = fn
      })
      .catch(() => {})
    return () => {
      cancelled = true
      unlisten?.()
    }
  }, [t])

  // 用户改快捷键 → 推给桌面壳重新注册(修补轮:此前 Rust 写死,web 可改但不联动,
  // 全局热键永远还是默认键)。非桌面 no-op(浏览器走 keydown 监听,不依赖此)。
  useEffect(() => {
    invokeUpdateShortcut(captureShortcutToAccelerator(sc))
  }, [sc.modKey, sc.shift, sc.code])

  // Register the web sinks on mount. Other sinks (Phase 6.5g MenuCaptureSink,
  // Phase 8 TauriCaptureSink) can also register against the same registry.
  // The `cancelled` flag guards both dynamic imports: if the host unmounts
  // before an import resolves, we skip registering instead of leaking a
  // phantom sink that the cleanup (already run) can't remove.
  //
  // 'manual' kind 也在这里注册(与 shortcut/menubar 同范式)。它不归 inbox
  // 单页:archive/timeline/详情等页也用 { kind: 'manual' } 作为 fallback
  // 提交路径(CreateCardForm / AI append-new 等)。sink 生命周期绑在全局 host
  // 上,跨页行为一致;之前绑 inbox 页时,离开 inbox 后这类 submit 只能落到
  // fallbackService。register 用 Map.set 去重,host 卸载时统一 unregister。
  useEffect(() => {
    let cancelled = false
    // Fallback first: if a submit arrives before the dynamic-import
    // registration resolves, we still persist via service.fromCapture.
    captureSinkRegistry.setFallbackService(service)
    void import('./capture-sink').then(({ WebCaptureSink }) => {
      if (cancelled) return
      captureSinkRegistry.register('shortcut', new WebCaptureSink(service))
    })
    void import('./menu-capture-sink').then(({ MenuCaptureSink }) => {
      if (cancelled) return
      captureSinkRegistry.register('menubar', new MenuCaptureSink(service))
    })
    void import('./capture-sink').then(({ WebCaptureSink }) => {
      if (cancelled) return
      captureSinkRegistry.register('manual', new WebCaptureSink(service))
    })
    return () => {
      cancelled = true
      captureSinkRegistry.unregister('shortcut')
      captureSinkRegistry.unregister('menubar')
      captureSinkRegistry.unregister('manual')
    }
  }, [service])

  return <MiniInput open={open} onClose={() => setOpen(false)} onSubmit={onSubmit} />
}