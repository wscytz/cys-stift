import type { Canvas, CanvasId, WorkspaceId } from '../types'
import { generateId } from '../codec'

export interface CanvasRepository {
  insert(canvas: Canvas): void
  getById(id: CanvasId): Canvas | null
  listByWorkspace(workspaceId: WorkspaceId): Canvas[]
}

export class CanvasService {
  constructor(private repo: CanvasRepository) {}

  create(input: { workspaceId: WorkspaceId; name: string }): Canvas {
    const now = new Date()
    const canvas: Canvas = {
      id: generateId() as CanvasId,
      workspaceId: input.workspaceId,
      name: input.name,
      view: { zoom: 1, pan: { x: 0, y: 0 }, gridMode: 'snap', gridSize: 8 },
      createdAt: now,
      updatedAt: now,
    }
    this.repo.insert(canvas)
    return canvas
  }

  get(id: CanvasId): Canvas | null {
    return this.repo.getById(id)
  }

  listForWorkspace(workspaceId: WorkspaceId): Canvas[] {
    return this.repo.listByWorkspace(workspaceId)
  }
}
