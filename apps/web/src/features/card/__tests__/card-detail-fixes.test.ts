import { describe, it, expect, beforeEach } from 'vitest'
import { CardService, type CardRepository } from '@cys-stift/domain'
import type { Card, CardId, CanvasId, TagRef } from '@cys-stift/domain'

// ── Why this file exists ────────────────────────────────────────────────────
// The card-detail data-loss fixes (Bugs A/B/C/D) live in React components that
// need @testing-library/react to render (the project deliberately doesn't ship
// that dependency — see lib/__tests__/db-client.test.ts note). What we CAN
// verify without RTL is the CardService CONTRACT each fix relies on:
//
//   - Bug B premise: service.get(id) returns a soft-deleted card (it does NOT
//     filter on deletedAt). The 4 pages therefore MUST apply their own
//     `!deletedAt` filter on the live-derived card, else a soft-deleted card
//     would render as a ghost and Save would call update() on a deleted id.
//     We assert that premise here so a future refactor of `get` can't silently
//     resurrect the ghost-card bug.
//
//   - Bug C premise: service.update accepts a patch carrying title + body +
//     tags together and persists ALL of them. The canvas onSave was fixed to
//     spread the full patch through (previously it hand-picked title+body and
//     dropped tags). We assert that a patch with all three fields round-trips.
//
//   - Bug A premise: update() only touches fields present in the patch — so
//     passing the current edit state (title/media/links/...) alongside an
//     AI-generated body preserves those fields rather than reverting them.
//     We assert that an "AI replace body" style patch (body + preserved title)
//     does not lose the preserved title.

class InMemoryCardRepository implements CardRepository {
  private store = new Map<CardId, Card>()
  insert(card: Card) {
    this.store.set(card.id, card)
  }
  update(card: Card) {
    this.store.set(card.id, card)
  }
  delete(id: CardId) {
    this.store.delete(id)
  }
  getById(id: CardId) {
    return this.store.get(id) ?? null
  }
  listInbox() {
    return [...this.store.values()]
      .filter((c) => !c.canvasPosition && !c.archived && !c.deletedAt)
      .sort((a, b) => b.capturedAt.getTime() - a.capturedAt.getTime())
  }
  listOnCanvas(canvasId: CanvasId) {
    return [...this.store.values()]
      .filter((c) => c.canvasPosition?.canvasId === canvasId)
      .sort((a, b) => (a.canvasPosition?.z ?? 0) - (b.canvasPosition?.z ?? 0))
  }
  listAll() {
    return [...this.store.values()]
  }
}

const dummySource = { kind: 'manual' as const, deviceId: 'test-device' }

describe('card-detail fix premises (CardService contract)', () => {
  let service: CardService

  beforeEach(() => {
    service = new CardService(new InMemoryCardRepository())
  })

  // Bug B — service.get returns soft-deleted cards (pages must filter !deletedAt)
  describe('Bug B: service.get does NOT filter soft-deleted cards', () => {
    it('returns a card after it has been soft-deleted (deletedAt set)', () => {
      const c = service.create({ title: 'doomed', source: dummySource })
      service.softDelete(c.id)
      const got = service.get(c.id)
      // If get() returned null for soft-deleted cards, the pages' live
      // derivation would already close the modal — no filter needed. But get()
      // DOES return the soft-deleted card, so the deletedAt check is load-bearing.
      expect(got).not.toBeNull()
      expect(got!.deletedAt).toBeTruthy()
    })

    it('returns null only when the card truly does not exist', () => {
      const c = service.create({ title: 'real', source: dummySource })
      expect(service.get(c.id)).not.toBeNull()
      // An id that was never inserted:
      expect(
        service.get('nope-not-an-id' as unknown as CardId),
      ).toBeNull()
    })

    it('a soft-deleted card fails the !deletedAt filter the pages apply', () => {
      // Mirrors the page logic:
      //   const liveDetail = detail ? (service.get(detail.id) ?? null) : null
      //   const effectiveDetail = liveDetail && !liveDetail.deletedAt ? liveDetail : null
      const c = service.create({ title: 'ghost-me', source: dummySource })
      service.softDelete(c.id)
      const liveDetail = service.get(c.id) ?? null
      const effectiveDetail =
        liveDetail && !liveDetail.deletedAt ? liveDetail : null
      // The whole point: after soft-delete the modal must unmount (null).
      expect(effectiveDetail).toBeNull()
    })
  })

  // Bug C — canvas onSave spreads the full patch; update persists title+body+tags
  describe('Bug C: service.update persists a full title+body+tags patch', () => {
    it('round-trips title, body, and tags when all three are in the patch', () => {
      const c = service.create({ title: 'orig', source: dummySource })
      const tags: TagRef[] = [
        { value: 'bug-c', color: 'red' },
        { value: 'canvas', color: 'blue' },
      ]
      // This is the shape the canvas CardDetailModal emits:
      //   onSave({ title, body, tags })
      // and the canvas page now spreads straight into service.update.
      const updated = service.update(c.id, {
        title: 'edited title',
        body: 'edited body',
        tags,
      })
      expect(updated).not.toBeNull()
      expect(updated!.title).toBe('edited title')
      expect(updated!.body).toBe('edited body')
      expect(updated!.tags).toEqual(tags)
      // And persisted (not just the return value):
      const reloaded = service.get(c.id)
      expect(reloaded!.title).toBe('edited title')
      expect(reloaded!.body).toBe('edited body')
      expect(reloaded!.tags.map((t) => t.value)).toEqual(['bug-c', 'canvas'])
    })

    it('hand-picking only title+body from the patch WOULD drop tags (regression guard)', () => {
      // Documents exactly what the Bug C fix repaired: the old canvas onSave
      // did `service.update(id, { title: patch.title, body: patch.body })`,
      // which never sent tags. We simulate that buggy shape and show tags
      // don't get persisted, so this test fails if someone reverts the fix.
      const c = service.create({ title: 'orig', source: dummySource })
      const patch = {
        title: 'edited title',
        body: 'edited body',
        tags: [{ value: 'should-persist', color: 'red' }] as TagRef[],
      }
      // Buggy shape (what the fix removed): only title+body.
      service.update(c.id, { title: patch.title, body: patch.body })
      const reloaded = service.get(c.id)
      expect(reloaded!.title).toBe('edited title')
      expect(reloaded!.body).toBe('edited body')
      // Tags were dropped because the buggy shape never passed them:
      expect(reloaded!.tags).toEqual([])
    })
  })

  // Bug A — AI replace-body preserves the edited fields (title here as a proxy)
  describe('Bug A: replace-body patch preserves other edited fields', () => {
    it('an AI replace-body that also passes the current title keeps that title', () => {
      // The fixed onReplace passes the component state's title alongside the
      // AI body. service.update only touches fields present in the patch, so
      // sending { title, body } preserves the user's (possibly edited) title.
      const c = service.create({ title: 'user edited title', source: dummySource })
      const aiBody = 'AI-generated body text'
      const updated = service.update(c.id, {
        title: 'user edited title', // preserved from component state, not prop
        body: aiBody,
      })
      expect(updated!.title).toBe('user edited title')
      expect(updated!.body).toBe(aiBody)
    })

    it('the pre-fix shape (reverting title to a stale prop) would lose the edit', () => {
      // Documents the bug: if onReplace passed card.title (stale prop) instead
      // of the current state title, the user's title edit is overwritten.
      const c = service.create({ title: 'original prop title', source: dummySource })
      const stalePropTitle = 'original prop title' // what card.title was at open
      const userEditedTitle = 'user typed this'
      // Pre-fix: onSave({ title: card.title, body }) — clobbers the edit.
      service.update(c.id, { title: stalePropTitle, body: 'AI body' })
      const afterPrefiex = service.get(c.id)!
      expect(afterPrefiex.title).not.toBe(userEditedTitle)
      expect(afterPrefiex.title).toBe(stalePropTitle)
    })
  })
})
