'use client'

/**
 * M2.2 — module-level pub-sub for toast queue. No deps. pushToast enqueues;
 * 5s auto-dismiss. M3 can replace with a real lib (sonner / react-hot-toast)
 * — keep the surface API (pushToast / subscribeToToasts / getToasts) so the
 * swap is local.
 */
export interface Toast {
  id: number
  kind: 'info' | 'error' | 'success'
  message: string
}

let _seq = 0
const _listeners = new Set<() => void>()
let _items: Toast[] = []

export function pushToast(t: Omit<Toast, 'id'>): void {
  const id = ++_seq
  _items = [..._items, { ...t, id }]
  _listeners.forEach((l) => l())
  setTimeout(() => {
    _items = _items.filter((x) => x.id !== id)
    _listeners.forEach((l) => l())
  }, 5000)
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