// @cys-stift/domain — pure TS business rules (spec §4)
export * from './types'
export * from './codec'
export {
  CardService,
  type CardRepository,
  type CreateCardInput,
  type UpdateCardPatch,
} from './services/card-service'
export {
  CanvasService,
  type CanvasRepository,
} from './services/canvas-service'
export {
  WorkspaceService,
  type WorkspaceRepository,
} from './services/workspace-service'
export { searchCards, normalise, tokenise, bodySnippet, type SearchResult } from './services/search'
export {
  findDuplicateGroups,
  normaliseUrl,
  normaliseCode,
  normaliseTitle,
  type DuplicateDimension,
  type DuplicateGroup,
} from './services/duplicate-detect'
export { TAG_COLORS } from './types'
export { StorageQuotaError } from './errors'
