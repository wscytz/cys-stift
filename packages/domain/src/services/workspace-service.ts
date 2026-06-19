import type { CanvasId, Workspace, WorkspaceId } from '../types'
import { generateId } from '../codec'

export interface WorkspaceRepository {
  insert(workspace: Workspace): void
  getById(id: WorkspaceId): Workspace | null
  getDefault(): Workspace | null
}

export class WorkspaceService {
  constructor(private repo: WorkspaceRepository) {}

  create(input: { name: string; defaultCanvasId: CanvasId }): Workspace {
    const now = new Date()
    const ws: Workspace = {
      id: generateId() as WorkspaceId,
      name: input.name,
      defaultCanvasId: input.defaultCanvasId,
      createdAt: now,
    }
    this.repo.insert(ws)
    return ws
  }

  get(id: WorkspaceId): Workspace | null {
    return this.repo.getById(id)
  }

  getDefault(): Workspace | null {
    return this.repo.getDefault()
  }

  /** Ensure at least one workspace + one canvas exist; create if missing. */
  ensureDefault(): Workspace {
    const existing = this.repo.getDefault()
    if (existing) return existing
    const canvasId = generateId() as CanvasId
    // Caller is expected to create the canvas separately; we just need the id
    // here. For MVP, we stash a placeholder canvas in the workspace and let
    // the caller create the actual canvas row.
    return this.create({ name: '默认工作空间', defaultCanvasId: canvasId })
  }
}
