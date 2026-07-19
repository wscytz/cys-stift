import type { Card, CardId, CanvasId } from '@cys-stift/domain'

export const CORE_LOOP_CANVAS_ID = 'core-loop-fixture' as CanvasId

/**
 * Deterministic cards for the local core-loop contract test.  This fixture is
 * intentionally kept under tests so it can never become user data or be
 * bundled into the application.
 */
export function coreLoopCards(): Card[] {
  const capturedAt = new Date('2026-01-02T09:00:00.000Z')
  const createdAt = new Date('2026-01-02T09:00:00.000Z')
  const updatedAt = new Date('2026-01-02T09:00:00.000Z')
  return [
    {
      id: 'core-capture' as CardId,
      title: '捕获后的想法',
      body: '### 研究线索\n第一行\n第二行',
      type: 'note',
      media: [],
      links: [],
      codeSnippets: [],
      quotes: [],
      source: { kind: 'shortcut', shortcutId: 'cmd-shift-e', deviceId: 'fixture' },
      capturedAt,
      createdAt,
      updatedAt,
      tags: [],
      pinned: false,
      archived: false,
    },
    {
      id: 'core-second' as CardId,
      title: '另一张卡',
      body: '用于组织',
      type: 'note',
      media: [],
      links: [],
      codeSnippets: [],
      quotes: [],
      source: { kind: 'manual', deviceId: 'fixture' },
      capturedAt: new Date(capturedAt.getTime() + 1_000),
      createdAt: new Date(createdAt.getTime() + 1_000),
      updatedAt: new Date(updatedAt.getTime() + 1_000),
      tags: [],
      pinned: false,
      archived: false,
    },
  ]
}
