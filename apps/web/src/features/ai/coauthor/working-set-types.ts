export type ScopeKind = 'selection' | 'frame' | 'explicit-cards' | 'paste'

export interface WorkingSetScopeV1 {
  kind: ScopeKind
  rootIds: string[]
}

export interface WorkingSetRevisionV1 {
  content: string
  relations: string
  geometry: string
}

export type SourceKindV1 = 'card' | 'canvas-element' | 'paste-block'
export type SourceFieldV1 = 'title' | 'body' | 'relation' | 'text' | 'paste'

export interface SourceSelectorV1 {
  path?: string
  exact: string
  prefix?: string
  suffix?: string
  start?: number
  end?: number
  excerptHash: string
}

/** A source reference never carries an evidence role. Roles belong to a model
 * proposal edge so immutable evidence can be reused without changing meaning. */
export interface SourceRefV1 {
  refId: string
  sourceKind: SourceKindV1
  entityId: string
  field: SourceFieldV1
  sourceRevision: string
  selector: SourceSelectorV1
}

export interface WorkingSetRelationV1 {
  arrowId: string
  from: string
  to: string
  label?: string
  refId: string
}

export interface WorkingSetRelationIssueV1 {
  arrowId: string
  kind: 'missing-endpoint' | 'self-loop' | 'duplicate-relation'
  from?: string
  to?: string
  duplicateOf?: string
  refId: string
}

export interface WorkingSetGeometryV1 {
  id: string
  kind: string
  x: number
  y: number
  w: number
  h: number
  rotation: number
}

export type OmissionReason = 'out-of-scope' | 'budget' | 'unsupported' | 'private'

export interface TransmissionManifestV1 {
  includedRefIds: string[]
  geometryOnlyEntityIds: string[]
  omitted: Array<{ entityId: string; reason: OmissionReason }>
  truncated: boolean
  chars: number
  estimatedTokens?: number
  budgetPolicy: string
}

export interface WorkingSetSnapshotV1 {
  kind: 'cys-working-set'
  version: 1
  snapshotId: string
  canvasId: string
  scope: WorkingSetScopeV1
  createdAt: string
  revisions: WorkingSetRevisionV1
  sources: SourceRefV1[]
  relations: WorkingSetRelationV1[]
  relationIssues: WorkingSetRelationIssueV1[]
  geometry: WorkingSetGeometryV1[]
  manifest: TransmissionManifestV1
}

export interface WorkingSetSourceRecordV1 {
  ref: SourceRefV1
  /** Exact allowlisted text that may be sent to the provider. */
  text: string
}

export interface WorkingSetBuildResultV1 {
  snapshot: WorkingSetSnapshotV1
  /** Provider input is constructed only from these complete, manifest-tracked records. */
  records: WorkingSetSourceRecordV1[]
}
