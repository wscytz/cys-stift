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
} from '../types'
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

  softDelete(id: CardId): void {
    const card = this.repo.getById(id)
    if (!card) return
    this.repo.update({ ...card, deletedAt: new Date(), updatedAt: new Date() })
  }

  count(): number {
    return this.repo.listAll().length
  }
}
