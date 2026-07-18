import type {
  AlignIntentOp,
  ConnectIntentOp,
  DistributeIntentOp,
  IntentCanvasElement,
  IntentDiagnostic,
  IntentOp,
  LayoutIntentOp,
  PlaceIntentOp,
} from './intent-ir'
import { findConnection } from './intent-resolver'

export interface IntentSolveResult {
  elements: Map<string, IntentCanvasElement>
  changedIds: string[]
  diagnostics: IntentDiagnostic[]
}

const DEFAULT_GAP = 40
const COORD_LIMIT = 1_000_000
const MAX_COLLISION_STEPS = 512

function blocksLayout(element: IntentCanvasElement): boolean {
  return element.kind === 'card' || element.kind === 'rect' || element.kind === 'text'
}

function overlaps(a: IntentCanvasElement, b: IntentCanvasElement): boolean {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y
}

function collides(candidate: IntentCanvasElement, obstacles: readonly IntentCanvasElement[]): boolean {
  return blocksLayout(candidate) && obstacles.some((obstacle) => blocksLayout(obstacle) && overlaps(candidate, obstacle))
}

function cloneMap(elements: ReadonlyMap<string, IntentCanvasElement>): Map<string, IntentCanvasElement> {
  return new Map([...elements].map(([id, element]) => [id, structuredClone(element)]))
}

function orderedTargets(op: LayoutIntentOp, elements: ReadonlyMap<string, IntentCanvasElement>): IntentCanvasElement[] {
  const targets = op.targets.map((id) => elements.get(id)).filter((value): value is IntentCanvasElement => !!value)
  if (op.order === 'title') return targets.sort((a, b) => (a.text ?? a.id).localeCompare(b.text ?? b.id))
  if (op.order === 'position') return targets.sort((a, b) => a.y - b.y || a.x - b.x || a.id.localeCompare(b.id))
  return targets
}

function setPosition(
  target: IntentCanvasElement,
  x: number,
  y: number,
  pinned: ReadonlySet<string>,
  changed: Set<string>,
): IntentCanvasElement {
  if (pinned.has(target.id) || (target.x === x && target.y === y)) return target
  changed.add(target.id)
  return { ...target, x, y }
}

function solveLayout(
  op: LayoutIntentOp,
  elements: Map<string, IntentCanvasElement>,
  pinned: ReadonlySet<string>,
  changed: Set<string>,
): void {
  const targets = orderedTargets(op, elements)
  if (targets.length === 0) return
  const originX = Math.min(...targets.map((target) => target.x))
  const originY = Math.min(...targets.map((target) => target.y))
  const maxW = Math.max(...targets.map((target) => target.w))
  const maxH = Math.max(...targets.map((target) => target.h))
  const [gapX, gapY] = op.gap ?? [DEFAULT_GAP, DEFAULT_GAP]
  const columns = op.mode === 'flow-column' ? 1 : op.mode === 'flow-row' ? targets.length : op.columns ?? Math.ceil(Math.sqrt(targets.length))
  const targetIds = new Set(targets.map((target) => target.id))
  const obstacles = [...elements.values()].filter(
    (element) => blocksLayout(element) && (!targetIds.has(element.id) || pinned.has(element.id)),
  )
  targets.forEach((target, index) => {
    if (pinned.has(target.id)) return
    const column = index % columns
    const row = Math.floor(index / columns)
    let x = originX + column * (maxW + gapX)
    let y = originY + row * (maxH + gapY)
    let candidate = { ...target, x, y }
    let step = 0
    while (collides(candidate, obstacles) && step < MAX_COLLISION_STEPS) {
      if (op.mode === 'flow-row') x += maxW + gapX
      else y += maxH + gapY
      candidate = { ...target, x, y }
      step += 1
    }
    const next = setPosition(target, x, y, pinned, changed)
    elements.set(target.id, next)
    obstacles.push(next)
  })
}

function alignedCoordinate(anchor: IntentCanvasElement, target: IntentCanvasElement, align: PlaceIntentOp['align'], horizontal: boolean): number {
  if (horizontal) {
    if (align === 'start') return anchor.y
    if (align === 'end') return anchor.y + anchor.h - target.h
    return anchor.y + (anchor.h - target.h) / 2
  }
  if (align === 'start') return anchor.x
  if (align === 'end') return anchor.x + anchor.w - target.w
  return anchor.x + (anchor.w - target.w) / 2
}

function solvePlace(
  op: PlaceIntentOp,
  elements: Map<string, IntentCanvasElement>,
  pinned: ReadonlySet<string>,
  changed: Set<string>,
): void {
  const target = elements.get(op.target)
  const anchor = elements.get(op.anchor)
  if (!target || !anchor) return
  const gap = op.gap ?? DEFAULT_GAP
  let x = target.x
  let y = target.y
  if (op.relation === 'above') {
    y = anchor.y - gap - target.h
    x = alignedCoordinate(anchor, target, op.align, false)
  } else if (op.relation === 'below') {
    y = anchor.y + anchor.h + gap
    x = alignedCoordinate(anchor, target, op.align, false)
  } else if (op.relation === 'left-of') {
    x = anchor.x - gap - target.w
    y = alignedCoordinate(anchor, target, op.align, true)
  } else {
    x = anchor.x + anchor.w + gap
    y = alignedCoordinate(anchor, target, op.align, true)
  }
  let candidate = { ...target, x, y }
  const obstacles = [...elements.values()].filter((element) => element.id !== target.id && blocksLayout(element))
  let step = 0
  while (collides(candidate, obstacles) && step < MAX_COLLISION_STEPS) {
    if (op.relation === 'above') y -= target.h + gap
    if (op.relation === 'below') y += target.h + gap
    if (op.relation === 'left-of') x -= target.w + gap
    if (op.relation === 'right-of') x += target.w + gap
    candidate = { ...target, x, y }
    step += 1
  }
  elements.set(target.id, setPosition(target, x, y, pinned, changed))
}

function solveAlign(
  op: AlignIntentOp,
  elements: Map<string, IntentCanvasElement>,
  pinned: ReadonlySet<string>,
  changed: Set<string>,
): void {
  const targets = op.targets.map((id) => elements.get(id)).filter((value): value is IntentCanvasElement => !!value)
  if (targets.length === 0) return
  const left = Math.min(...targets.map((target) => target.x))
  const right = Math.max(...targets.map((target) => target.x + target.w))
  const top = Math.min(...targets.map((target) => target.y))
  const bottom = Math.max(...targets.map((target) => target.y + target.h))
  for (const target of targets) {
    let x = target.x
    let y = target.y
    if (op.axis === 'left') x = left
    if (op.axis === 'center') x = (left + right - target.w) / 2
    if (op.axis === 'right') x = right - target.w
    if (op.axis === 'top') y = top
    if (op.axis === 'middle') y = (top + bottom - target.h) / 2
    if (op.axis === 'bottom') y = bottom - target.h
    elements.set(target.id, setPosition(target, x, y, pinned, changed))
  }
}

function solveDistribute(
  op: DistributeIntentOp,
  elements: Map<string, IntentCanvasElement>,
  pinned: ReadonlySet<string>,
  changed: Set<string>,
): void {
  const horizontal = op.axis === 'horizontal'
  const targets = op.targets
    .map((id) => elements.get(id))
    .filter((value): value is IntentCanvasElement => !!value)
    .sort((a, b) => (horizontal ? a.x - b.x : a.y - b.y) || a.id.localeCompare(b.id))
  if (targets.length < 2) return
  const first = targets[0]!
  const last = targets[targets.length - 1]!
  const totalSize = targets.reduce((sum, target) => sum + (horizontal ? target.w : target.h), 0)
  const available = horizontal ? last.x + last.w - first.x : last.y + last.h - first.y
  const gap = op.gap ?? Math.max(0, (available - totalSize) / (targets.length - 1))
  let cursor = horizontal ? first.x : first.y
  for (const target of targets) {
    const next = horizontal
      ? setPosition(target, cursor, target.y, pinned, changed)
      : setPosition(target, target.x, cursor, pinned, changed)
    elements.set(target.id, next)
    cursor += (horizontal ? target.w : target.h) + gap
  }
}

function solveConnect(
  op: ConnectIntentOp,
  elements: Map<string, IntentCanvasElement>,
  changed: Set<string>,
  diagnostics: IntentDiagnostic[],
): void {
  const from = elements.get(op.from)
  const to = elements.get(op.to)
  if (!from || !to) return
  const current = findConnection(op, elements)
  if (!current && !op.create) {
    diagnostics.push({ stage: 'solve', severity: 'error', code: 'CONNECTION_NOT_FOUND', message: `No existing connection from ${op.from} to ${op.to}` })
    return
  }
  const id = current?.id ?? op.id ?? `arrow:${op.from}~${op.to}`
  if (!current && elements.has(id)) {
    diagnostics.push({ stage: 'solve', severity: 'error', code: 'ID_COLLISION', message: `Cannot create arrow ${id}; ID already exists` })
    return
  }
  const x = from.x + from.w / 2
  const y = from.y + from.h / 2
  const next: IntentCanvasElement = {
    ...(current ?? { id, kind: 'arrow' as const, rotation: 0 }),
    id, kind: 'arrow', x, y,
    w: to.x + to.w / 2 - x,
    h: to.y + to.h / 2 - y,
    from: op.from, to: op.to,
    ...(op.style?.color ? { color: op.style.color } : {}),
    ...(op.style?.label !== undefined ? { text: op.style.label } : {}),
    ...(op.style?.dash ? { dash: op.style.dash } : {}),
    ...(op.style?.arrowhead ? { arrowhead: op.style.arrowhead } : {}),
  }
  elements.set(id, next)
  changed.add(id)
}

function validateSolved(
  elements: ReadonlyMap<string, IntentCanvasElement>,
  changedIds: readonly string[],
  source: ReadonlyMap<string, IntentCanvasElement>,
): IntentDiagnostic[] {
  const diagnostics: IntentDiagnostic[] = []
  for (const id of changedIds) {
    const element = elements.get(id)
    if (!element) continue
    if (![element.x, element.y, element.w, element.h].every(Number.isFinite)) {
      diagnostics.push({ stage: 'solve', severity: 'error', code: 'NON_FINITE_GEOMETRY', message: `Element ${id} has non-finite geometry` })
    }
    if (Math.abs(element.x) > COORD_LIMIT || Math.abs(element.y) > COORD_LIMIT || Math.abs(element.w) > COORD_LIMIT || Math.abs(element.h) > COORD_LIMIT) {
      diagnostics.push({ stage: 'solve', severity: 'error', code: 'GEOMETRY_OUT_OF_BOUNDS', message: `Element ${id} exceeds geometry bounds` })
    }
    if (element.kind !== 'arrow' && (!(element.w > 0) || !(element.h > 0) || element.w > 2000 || element.h > 2000)) {
      diagnostics.push({ stage: 'solve', severity: 'error', code: 'INVALID_SIZE', message: `Element ${id} has an invalid bounded size` })
    }
    if (element.kind === 'arrow' && (!element.from || !element.to || !elements.has(element.from) || !elements.has(element.to))) {
      diagnostics.push({ stage: 'solve', severity: 'error', code: 'MISSING_ENDPOINT', message: `Arrow ${id} has a missing endpoint` })
    }
    const before = source.get(id)
    const geometryChanged = !before || before.x !== element.x || before.y !== element.y || before.w !== element.w || before.h !== element.h
    if (geometryChanged && blocksLayout(element)) {
      const collision = [...elements.values()].find(
        (other) => other.id !== id && blocksLayout(other) && overlaps(element, other),
      )
      if (collision) {
        diagnostics.push({ stage: 'solve', severity: 'error', code: 'OVERLAP', message: `Element ${id} overlaps ${collision.id}` })
      }
    }
  }
  return diagnostics
}

export function solveIntentOp(
  op: IntentOp,
  source: ReadonlyMap<string, IntentCanvasElement>,
  pinned: ReadonlySet<string>,
): IntentSolveResult {
  const elements = cloneMap(source)
  const changed = new Set<string>()
  const diagnostics: IntentDiagnostic[] = []
  if (op.op === 'layout') solveLayout(op, elements, pinned, changed)
  if (op.op === 'place') solvePlace(op, elements, pinned, changed)
  if (op.op === 'align') solveAlign(op, elements, pinned, changed)
  if (op.op === 'distribute') solveDistribute(op, elements, pinned, changed)
  if (op.op === 'connect') solveConnect(op, elements, changed, diagnostics)
  if (op.op === 'update') {
    const target = elements.get(op.target)
    if (target) {
      if (target.kind === 'card' && op.patch.label !== undefined) {
        diagnostics.push({
          stage: 'solve',
          severity: 'error',
          code: 'UNSUPPORTED_CARD_LABEL',
          message: `Card ${target.id} label is persisted as card content and is outside Intent IR v1`,
        })
        return { elements, changedIds: [], diagnostics }
      }
      const next = {
        ...target,
        ...(op.patch.color ? { color: op.patch.color } : {}),
        ...(op.patch.width !== undefined ? { w: op.patch.width } : {}),
        ...(op.patch.height !== undefined ? { h: op.patch.height } : {}),
        ...(op.patch.label !== undefined ? { text: op.patch.label } : {}),
      }
      elements.set(target.id, next)
      changed.add(target.id)
    }
  }
  diagnostics.push(...validateSolved(elements, [...changed], source))
  return { elements, changedIds: [...changed].sort(), diagnostics }
}
