/**
 * CardService — pure business logic, no persistence.
 * Persistence is injected via the CardRepository interface in
 * `../repositories/types`. This keeps domain testable and persistence swappable
 * (memory / OPFS / Tauri fs all implement the same interface).
 */

import type {
  Card,
  CardId,
  CanvasId,
  CardType,
  CaptureInput,
  CaptureSource,
  CanvasPosition,
  CodeBlock,
  LinkPreview,
  MediaRef,
  Quote,
  TagRef,
  TagColor,
} from '../types'
import { TAG_COLORS } from '../types'
import { generateId } from '../codec'

export interface CardRepository {
  insert(card: Card): void
  update(card: Card): void
  delete(id: CardId): void
  getById(id: CardId): Card | null
  listInbox(): Card[]
  listOnCanvas(canvasId: CanvasId): Card[]
  listAll(): Card[]
}

export interface CreateCardInput {
  title: string
  body?: string
  type?: CardType
  source: CaptureSource
  canvasPosition?: CanvasPosition
  media?: MediaRef[]
  links?: LinkPreview[]
  codeSnippets?: CodeBlock[]
  quotes?: Quote[]
  color?: Card['color']
  tags?: TagRef[]
}

export interface UpdateCardPatch {
  title?: string
  body?: string
  type?: CardType
  color?: Card['color']
  pinned?: boolean
  media?: MediaRef[]
  links?: LinkPreview[]
  codeSnippets?: CodeBlock[]
  quotes?: Quote[]
  tags?: TagRef[]
}

export class CardService {
  constructor(private repo: CardRepository) {}

  create(input: CreateCardInput): Card {
    const now = new Date()
    const card: Card = {
      id: generateId() as CardId,
      title: input.title,
      body: input.body ?? '',
      type: input.type ?? 'note',
      media: input.media ?? [],
      links: input.links ?? [],
      codeSnippets: input.codeSnippets ?? [],
      quotes: input.quotes ?? [],
      source: input.source,
      capturedAt: now,
      createdAt: now,
      updatedAt: now,
      canvasPosition: input.canvasPosition,
      color: input.color,
      tags: input.tags ?? [],
      pinned: false,
      archived: false,
    }
    this.repo.insert(card)
    return card
  }

  fromCapture(input: CaptureInput): Card {
    return this.create({
      title: input.title ?? '',
      body: input.body ?? '',
      type: input.type,
      source: input.source,
      canvasPosition: input.canvasPosition,
      links: input.links?.map((url) => ({
        url,
        fetchedAt: new Date(),
      })),
      codeSnippets: input.codeSnippets,
      quotes: input.quotes,
    })
  }

  get(id: CardId): Card | null {
    return this.repo.getById(id)
  }

  /**
   * Update mutable card fields. Returns the updated card, or null if the card
   * does not exist. Only fields present in `patch` are touched — lifecycle
   * fields (archived / deletedAt / canvasPosition) are intentionally not
   * patchable here; use archive / unarchive / moveToCanvas / softDelete for
   * those. updatedAt is bumped automatically.
   */
  update(id: CardId, patch: UpdateCardPatch): Card | null {
    const card = this.repo.getById(id)
    if (!card) return null
    const next: Card = {
      ...card,
      ...(patch.title !== undefined ? { title: patch.title } : {}),
      ...(patch.body !== undefined ? { body: patch.body } : {}),
      ...(patch.type !== undefined ? { type: patch.type } : {}),
      ...(patch.color !== undefined ? { color: patch.color } : {}),
      ...(patch.pinned !== undefined ? { pinned: patch.pinned } : {}),
      ...(patch.tags !== undefined ? { tags: patch.tags } : {}),
      ...(patch.media !== undefined ? { media: patch.media } : {}),
      ...(patch.links !== undefined ? { links: patch.links } : {}),
      ...(patch.codeSnippets !== undefined
        ? { codeSnippets: patch.codeSnippets }
        : {}),
      ...(patch.quotes !== undefined ? { quotes: patch.quotes } : {}),
      updatedAt: new Date(),
    }
    this.repo.update(next)
    return next
  }

  listInbox(): Card[] {
    return this.repo.listInbox()
  }

  listOnCanvas(canvasId: CanvasId): Card[] {
    return this.repo.listOnCanvas(canvasId)
  }

  listAll(): Card[] {
    return this.repo.listAll()
  }

  archive(id: CardId): void {
    const card = this.repo.getById(id)
    if (!card) return
    this.repo.update({ ...card, archived: true, updatedAt: new Date() })
  }

  unarchive(id: CardId): void {
    const card = this.repo.getById(id)
    if (!card) return
    this.repo.update({ ...card, archived: false, updatedAt: new Date() })
  }

  moveToCanvas(id: CardId, position: CanvasPosition): void {
    const card = this.repo.getById(id)
    if (!card) return
    this.repo.update({
      ...card,
      canvasPosition: position,
      updatedAt: new Date(),
    })
  }

  /**
   * Remove a card from the canvas (clears `canvasPosition` so it
   * reappears in the inbox via `listInbox`). Does NOT delete the card;
   * use `softDelete` / `hardDelete` for that. Idempotent: calling on
   * a card that isn't on a canvas is a no-op. Returns true if the card
   * was actually moved off the canvas.
   */
  removeFromCanvas(id: CardId): boolean {
    const card = this.repo.getById(id)
    if (!card) return false
    if (!card.canvasPosition) return false
    this.repo.update({
      ...card,
      canvasPosition: undefined,
      updatedAt: new Date(),
    })
    return true
  }

  softDelete(id: CardId): void {
    const card = this.repo.getById(id)
    if (!card) return
    this.repo.update({ ...card, deletedAt: new Date(), updatedAt: new Date() })
  }

  /**
   * Restore a soft-deleted card. Clears `deletedAt` and bumps `updatedAt`,
   * but leaves `archived` and `canvasPosition` untouched — so the card
   * naturally returns to whatever view it belonged to (inbox / archive /
   * canvas). Idempotent: if the card is not soft-deleted, this still
   * succeeds (no-op). Returns true if the card existed and was modified.
   */
  restore(id: CardId): boolean {
    const card = this.repo.getById(id)
    if (!card) return false
    this.repo.update({
      ...card,
      deletedAt: undefined,
      updatedAt: new Date(),
    })
    return true
  }

  /**
   * Add a tag to a card. Idempotent: if the same tag value already
   * exists, the existing color is preserved. Returns the updated card
   * or null if the card doesn't exist.
   */
  addTag(id: CardId, value: string, color?: TagColor): Card | null {
    const card = this.repo.getById(id)
    if (!card) return null
    const existing = card.tags.find((t) => t.value === value)
    if (existing) return card
    const chosen = color ?? TAG_COLORS[Math.floor(Math.random() * TAG_COLORS.length)]!
    const next: Card = {
      ...card,
      tags: [...card.tags, { value: value.trim(), color: chosen }],
      updatedAt: new Date(),
    }
    this.repo.update(next)
    return next
  }

  /**
   * Remove a tag from a card by value. Idempotent: if the tag
   * doesn't exist on the card, this is a no-op. Returns the updated
   * card or null if the card doesn't exist.
   */
  removeTag(id: CardId, value: string): Card | null {
    const card = this.repo.getById(id)
    if (!card) return null
    if (!card.tags.some((t) => t.value === value)) return card
    const next: Card = {
      ...card,
      tags: card.tags.filter((t) => t.value !== value),
      updatedAt: new Date(),
    }
    this.repo.update(next)
    return next
  }

  /**

  /** List all unique tag values across all cards. */
  listTags(): { value: string; color: TagColor; count: number }[] {
    const all = this.repo.listAll()
    const map = new Map<string, { color: TagColor; count: number }>()
    for (const c of all) {
      for (const t of c.tags) {
        const entry = map.get(t.value)
        if (entry) {
          entry.count++
        } else {
          map.set(t.value, { color: t.color, count: 1 })
        }
      }
    }
    return [...map.entries()].map(([value, { color, count }]) => ({
      value,
      color,
      count,
    }))
  }

  /** Find cards that have ANY of the given tag values. */
  listByTags(tagValues: string[]): Card[] {
    if (tagValues.length === 0) return []
    return this.repo.listAll().filter((c) =>
      c.tags.some((t) => tagValues.includes(t.value)),
    )
  }

  /**
   * Permanently delete a card. Storage semantics belong to the repository
   * implementation (SQLite DELETEs the row; in-memory forgets the key).
   * Idempotent: if the card is gone, this is a no-op. Returns true if a
   * card was actually removed.
   */
  hardDelete(id: CardId): boolean {
    const card = this.repo.getById(id)
    if (!card) return false
    this.repo.delete(id)
    return true
  }

  count(): number {
    return this.repo.listAll().length
  }
}
