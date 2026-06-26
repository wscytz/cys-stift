'use client'

/**
 * M2.2 — module-level pub-sub for toast queue. No deps. pushToast enqueues;
 * success/info auto-dismiss (4s); error persists until dismissed.
 *
 * v0.32 — toast contract:
 *  - KINDS unchanged ('info' | 'error' | 'success'); pushToast API unchanged.
 *  - error toasts do NOT auto-dismiss (data-class errors must not vanish).
 *    success/info keep a 4s auto-dismiss; success/info WITH `actions[]` keep
 *    a 6s auto-dismiss so the user has time to click the action buttons.
 *  - visible queue capped at MAX_VISIBLE (5); when exceeded, drop the OLDEST
 *    non-error toast — errors are never silently dropped.
 *  - dismissToast(id) removes a toast (wired to the × button on every toast,
 *    and also fired automatically after an action button's onClick runs).
 *
 * M3 can replace this with a real lib (sonner / react-hot-toast) — keep the
 * surface API (pushToast / dismissToast / subscribeToToasts / getToasts) so
 * the swap is local.
 */
export interface ToastAction {
  label: string
  onClick: () => void
}

export interface Toast {
  id: number
  kind: 'info' | 'error' | 'success'
  message: string
  /** Optional inline action buttons (e.g. capture redirect). Rendered before
   *  the × close; clicking one fires onClick then dismisses the toast.
   *  A toast WITH actions lives longer (ACTION_AUTO_DISMISS_MS) than a plain
   *  one (AUTO_DISMISS_MS) so the user has time to click. Errors persist. */
  actions?: ToastAction[]
}

/** plain success/info auto-dismiss window (ms). */
const AUTO_DISMISS_MS = 4000
/** success/info WITH actions live longer so the user can click them. */
const ACTION_AUTO_DISMISS_MS = 6000
/** Visible queue cap; older non-error toasts are dropped beyond this. */
const MAX_VISIBLE = 5

let _seq = 0
const _listeners = new Set<() => void>()
let _items: Toast[] = []

function emit(): void {
  _listeners.forEach((l) => l())
}

/** Trim the queue: keep at most MAX_VISIBLE toasts, dropping the OLDEST
 *  non-error first. Errors are always retained (never silently dropped). */
function enforceCap(): void {
  if (_items.length <= MAX_VISIBLE) return
  // Index of the oldest non-error toast — that's the one to evict.
  const idx = _items.findIndex((t) => t.kind !== 'error')
  if (idx === -1) {
    // All errors (and we're over cap): keep the newest MAX_VISIBLE errors.
    _items = _items.slice(_items.length - MAX_VISIBLE)
    return
  }
  _items = _items.filter((_, i) => i !== idx)
}

export function pushToast(t: Omit<Toast, 'id'>): void {
  const id = ++_seq
  _items = [..._items, { ...t, id }]
  enforceCap()
  emit()
  // Only non-error toasts auto-dismiss. Errors persist until dismissed.
  // A toast WITH actions lives longer (6000ms) so the user can click them;
  // plain success/info auto-dismiss at 4000ms.
  if (t.kind !== 'error') {
    const ttl = t.actions && t.actions.length > 0 ? ACTION_AUTO_DISMISS_MS : AUTO_DISMISS_MS
    setTimeout(() => {
      dismissToast(id)
    }, ttl)
  }
}

export function dismissToast(id: number): void {
  if (!_items.some((t) => t.id === id)) return
  _items = _items.filter((t) => t.id !== id)
  emit()
}

export function subscribeToToasts(fn: () => void): () => void {
  _listeners.add(fn)
  return () => {
    _listeners.delete(fn)
  }
}

export function getToasts(): readonly Toast[] {
  return _items
}
