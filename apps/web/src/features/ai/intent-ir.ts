export const INTENT_IR_VERSION = 1 as const
export const MAX_INTENT_OPS = 256

export type IntentMode = 'layout' | 'edit' | 'create'
export type IntentColor = 'red' | 'yellow' | 'blue' | 'black' | 'white' | 'gray'
export type IntentId = string

export interface LayoutIntentOp {
  op: 'layout'
  targets: IntentId[]
  mode: 'grid' | 'flow-row' | 'flow-column' | 'tree' | 'dag'
  columns?: number
  gap?: [number, number]
  align?: 'left' | 'center' | 'right' | 'top' | 'middle' | 'bottom'
  order?: 'input' | 'title' | 'position'
}

export interface PlaceIntentOp {
  op: 'place'
  target: IntentId
  relation: 'above' | 'below' | 'left-of' | 'right-of'
  anchor: IntentId
  gap?: number
  align?: 'start' | 'center' | 'end'
}

export interface AlignIntentOp {
  op: 'align'
  targets: IntentId[]
  axis: 'left' | 'center' | 'right' | 'top' | 'middle' | 'bottom'
}

export interface DistributeIntentOp {
  op: 'distribute'
  targets: IntentId[]
  axis: 'horizontal' | 'vertical'
  gap?: number
}

export interface ConnectIntentOp {
  op: 'connect'
  id?: IntentId
  from: IntentId
  to: IntentId
  create: boolean
  style?: {
    dash?: 'solid' | 'dashed' | 'dotted'
    arrowhead?: 'arrow' | 'triangle' | 'none'
    color?: IntentColor
    label?: string
  }
}

export interface UpdateIntentOp {
  op: 'update'
  target: IntentId
  patch: {
    color?: IntentColor
    width?: number
    height?: number
    label?: string
  }
}

export interface PinIntentOp {
  op: 'pin'
  target: IntentId
}

export type IntentOp =
  | LayoutIntentOp
  | PlaceIntentOp
  | AlignIntentOp
  | DistributeIntentOp
  | ConnectIntentOp
  | UpdateIntentOp
  | PinIntentOp

export interface IntentIR {
  kind: 'cys-intent'
  version: typeof INTENT_IR_VERSION
  baseRevision: string
  mode: IntentMode
  ops: IntentOp[]
}

export interface IntentCanvasElement {
  id: string
  kind: 'card' | 'rect' | 'frame' | 'text' | 'arrow' | 'freedraw'
  x: number
  y: number
  w: number
  h: number
  rotation?: number
  color?: string
  text?: string
  from?: string
  to?: string
  dash?: 'solid' | 'dashed' | 'dotted'
  arrowhead?: 'arrow' | 'triangle' | 'none'
}

export interface IntentSnapshot {
  revision: string
  elements: readonly IntentCanvasElement[]
}

export type IntentDiagnosticStage =
  | 'decode'
  | 'validate'
  | 'resolve'
  | 'solve'
  | 'plan'
  | 'commit'

export interface IntentDiagnostic {
  stage: IntentDiagnosticStage
  severity: 'warning' | 'error'
  code: string
  message: string
  path?: string
  opId?: string
}

export type IntentValidationResult =
  | { ok: true; value: IntentIR; diagnostics: [] }
  | { ok: false; diagnostics: IntentDiagnostic[] }
