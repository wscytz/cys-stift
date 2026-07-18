import {
  INTENT_IR_VERSION,
  MAX_INTENT_OPS,
  type IntentDiagnostic,
  type IntentIR,
  type IntentValidationResult,
} from './intent-ir'

const ID_RE = /^[A-Za-z0-9_.:~-]+$/
const MODES = ['layout', 'edit', 'create'] as const
const COLORS = ['red', 'yellow', 'blue', 'black', 'white', 'gray'] as const

function object(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function diagnostic(code: string, message: string, path?: string): IntentDiagnostic {
  return { stage: 'validate', severity: 'error', code, message, ...(path ? { path } : {}) }
}

function unknownKeys(
  value: Record<string, unknown>,
  allowed: readonly string[],
  path: string,
  out: IntentDiagnostic[],
): void {
  for (const key of Object.keys(value).sort()) {
    if (!allowed.includes(key)) {
      out.push(diagnostic('UNKNOWN_FIELD', `Unknown field ${key}`, `${path}.${key}`))
    }
  }
}

function validId(value: unknown): value is string {
  return typeof value === 'string' && value.length >= 1 && value.length <= 160 && ID_RE.test(value)
}

function validateId(value: unknown, path: string, out: IntentDiagnostic[]): void {
  if (!validId(value)) out.push(diagnostic('INVALID_ID', 'Expected a bounded stable ID', path))
}

function validateTargets(value: unknown, path: string, min: number, out: IntentDiagnostic[]): void {
  if (!Array.isArray(value) || value.length < min || value.length > 256) {
    out.push(diagnostic('INVALID_TARGETS', `Expected ${min}-256 target IDs`, path))
    return
  }
  const seen = new Set<string>()
  value.forEach((id, index) => {
    validateId(id, `${path}[${index}]`, out)
    if (typeof id === 'string' && seen.has(id)) {
      out.push(diagnostic('DUPLICATE_TARGET', `Duplicate target ${id}`, `${path}[${index}]`))
    }
    if (typeof id === 'string') seen.add(id)
  })
}

function validateNumber(
  value: unknown,
  path: string,
  out: IntentDiagnostic[],
  min: number,
  max: number,
  integer = false,
): void {
  if (
    typeof value !== 'number' ||
    !Number.isFinite(value) ||
    value < min ||
    value > max ||
    (integer && !Number.isInteger(value))
  ) {
    out.push(diagnostic('INVALID_NUMBER', `Expected ${integer ? 'integer ' : ''}${min}..${max}`, path))
  }
}

function validateOptionalEnum(
  value: unknown,
  values: readonly string[],
  path: string,
  out: IntentDiagnostic[],
): void {
  if (value !== undefined && (typeof value !== 'string' || !values.includes(value))) {
    out.push(diagnostic('INVALID_ENUM', `Expected one of ${values.join(', ')}`, path))
  }
}

function validateStyle(value: unknown, path: string, out: IntentDiagnostic[]): void {
  if (value === undefined) return
  if (!object(value)) {
    out.push(diagnostic('INVALID_STYLE', 'Expected a style object', path))
    return
  }
  unknownKeys(value, ['dash', 'arrowhead', 'color', 'label'], path, out)
  validateOptionalEnum(value.dash, ['solid', 'dashed', 'dotted'], `${path}.dash`, out)
  validateOptionalEnum(value.arrowhead, ['arrow', 'triangle', 'none'], `${path}.arrowhead`, out)
  validateOptionalEnum(value.color, COLORS, `${path}.color`, out)
  if (value.label !== undefined && (typeof value.label !== 'string' || value.label.length > 200)) {
    out.push(diagnostic('INVALID_LABEL', 'Label must be at most 200 characters', `${path}.label`))
  }
}

function validatePatch(value: unknown, path: string, out: IntentDiagnostic[]): void {
  if (!object(value)) {
    out.push(diagnostic('INVALID_PATCH', 'Expected an update patch', path))
    return
  }
  unknownKeys(value, ['color', 'width', 'height', 'label'], path, out)
  if (Object.keys(value).length === 0) out.push(diagnostic('EMPTY_PATCH', 'Patch must change at least one field', path))
  validateOptionalEnum(value.color, COLORS, `${path}.color`, out)
  if (value.width !== undefined) validateNumber(value.width, `${path}.width`, out, Number.MIN_VALUE, 2000)
  if (value.height !== undefined) validateNumber(value.height, `${path}.height`, out, Number.MIN_VALUE, 2000)
  if (value.label !== undefined && (typeof value.label !== 'string' || value.label.length > 200)) {
    out.push(diagnostic('INVALID_LABEL', 'Label must be at most 200 characters', `${path}.label`))
  }
}

function validateOp(value: unknown, index: number, out: IntentDiagnostic[]): void {
  const path = `$.ops[${index}]`
  if (!object(value) || typeof value.op !== 'string') {
    out.push(diagnostic('INVALID_OP', 'Operation must be an object with an op field', path))
    return
  }
  switch (value.op) {
    case 'layout':
      unknownKeys(value, ['op', 'targets', 'mode', 'columns', 'gap', 'align', 'order'], path, out)
      validateTargets(value.targets, `${path}.targets`, 1, out)
      validateOptionalEnum(value.mode, ['grid', 'flow-row', 'flow-column', 'tree', 'dag'], `${path}.mode`, out)
      if (value.mode === undefined) out.push(diagnostic('MISSING_FIELD', 'mode is required', `${path}.mode`))
      if (value.columns !== undefined) validateNumber(value.columns, `${path}.columns`, out, 1, 64, true)
      if (value.gap !== undefined) {
        if (!Array.isArray(value.gap) || value.gap.length !== 2) out.push(diagnostic('INVALID_GAP', 'Gap must contain [x, y]', `${path}.gap`))
        else value.gap.forEach((gap, gapIndex) => validateNumber(gap, `${path}.gap[${gapIndex}]`, out, 0, 2000))
      }
      validateOptionalEnum(value.align, ['left', 'center', 'right', 'top', 'middle', 'bottom'], `${path}.align`, out)
      validateOptionalEnum(value.order, ['input', 'title', 'position'], `${path}.order`, out)
      break
    case 'place':
      unknownKeys(value, ['op', 'target', 'relation', 'anchor', 'gap', 'align'], path, out)
      validateId(value.target, `${path}.target`, out)
      validateId(value.anchor, `${path}.anchor`, out)
      validateOptionalEnum(value.relation, ['above', 'below', 'left-of', 'right-of'], `${path}.relation`, out)
      if (value.relation === undefined) out.push(diagnostic('MISSING_FIELD', 'relation is required', `${path}.relation`))
      if (value.gap !== undefined) validateNumber(value.gap, `${path}.gap`, out, 0, 2000)
      validateOptionalEnum(value.align, ['start', 'center', 'end'], `${path}.align`, out)
      break
    case 'align':
      unknownKeys(value, ['op', 'targets', 'axis'], path, out)
      validateTargets(value.targets, `${path}.targets`, 1, out)
      validateOptionalEnum(value.axis, ['left', 'center', 'right', 'top', 'middle', 'bottom'], `${path}.axis`, out)
      if (value.axis === undefined) out.push(diagnostic('MISSING_FIELD', 'axis is required', `${path}.axis`))
      break
    case 'distribute':
      unknownKeys(value, ['op', 'targets', 'axis', 'gap'], path, out)
      validateTargets(value.targets, `${path}.targets`, 2, out)
      validateOptionalEnum(value.axis, ['horizontal', 'vertical'], `${path}.axis`, out)
      if (value.axis === undefined) out.push(diagnostic('MISSING_FIELD', 'axis is required', `${path}.axis`))
      if (value.gap !== undefined) validateNumber(value.gap, `${path}.gap`, out, 0, 2000)
      break
    case 'connect':
      unknownKeys(value, ['op', 'id', 'from', 'to', 'create', 'style'], path, out)
      if (value.id !== undefined) validateId(value.id, `${path}.id`, out)
      validateId(value.from, `${path}.from`, out)
      validateId(value.to, `${path}.to`, out)
      if (typeof value.create !== 'boolean') out.push(diagnostic('INVALID_BOOLEAN', 'create must be boolean', `${path}.create`))
      validateStyle(value.style, `${path}.style`, out)
      break
    case 'update':
      unknownKeys(value, ['op', 'target', 'patch'], path, out)
      validateId(value.target, `${path}.target`, out)
      validatePatch(value.patch, `${path}.patch`, out)
      break
    case 'pin':
      unknownKeys(value, ['op', 'target'], path, out)
      validateId(value.target, `${path}.target`, out)
      break
    default:
      out.push(diagnostic('UNKNOWN_OP', `Unsupported operation ${value.op}`, `${path}.op`))
  }
}

export function validateIntent(input: unknown): IntentValidationResult {
  const diagnostics: IntentDiagnostic[] = []
  if (!object(input)) return { ok: false, diagnostics: [diagnostic('INVALID_ENVELOPE', 'Intent must be an object', '$')] }
  unknownKeys(input, ['kind', 'version', 'baseRevision', 'mode', 'ops'], '$', diagnostics)
  if (input.kind !== 'cys-intent') diagnostics.push(diagnostic('INVALID_KIND', 'kind must be cys-intent', '$.kind'))
  if (input.version !== INTENT_IR_VERSION) diagnostics.push(diagnostic('UNSUPPORTED_VERSION', 'version must be 1', '$.version'))
  if (typeof input.baseRevision !== 'string' || input.baseRevision.length < 1 || input.baseRevision.length > 256) {
    diagnostics.push(diagnostic('INVALID_REVISION', 'baseRevision must be 1-256 characters', '$.baseRevision'))
  }
  if (typeof input.mode !== 'string' || !(MODES as readonly string[]).includes(input.mode)) {
    diagnostics.push(diagnostic('INVALID_MODE', 'mode must be layout, edit, or create', '$.mode'))
  }
  if (!Array.isArray(input.ops) || input.ops.length < 1 || input.ops.length > MAX_INTENT_OPS) {
    diagnostics.push(diagnostic('INVALID_OP_COUNT', `ops must contain 1-${MAX_INTENT_OPS} operations`, '$.ops'))
  } else {
    input.ops.forEach((op, index) => validateOp(op, index, diagnostics))
  }
  if (diagnostics.length > 0) return { ok: false, diagnostics }
  return { ok: true, value: structuredClone(input) as unknown as IntentIR, diagnostics: [] }
}

export function decodeIntentJson(text: string): IntentValidationResult {
  let input: unknown
  try {
    input = JSON.parse(text)
  } catch (error) {
    return {
      ok: false,
      diagnostics: [{
        stage: 'decode', severity: 'error', code: 'INVALID_JSON',
        message: (error as Error).message,
      }],
    }
  }
  return validateIntent(input)
}
