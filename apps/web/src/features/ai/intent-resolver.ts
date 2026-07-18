import type {
  IntentCanvasElement,
  IntentDiagnostic,
  IntentOp,
  IntentSnapshot,
} from './intent-ir'

export interface ResolvedIntentSnapshot {
  elements: Map<string, IntentCanvasElement>
  diagnostics: IntentDiagnostic[]
}

export function indexIntentSnapshot(snapshot: IntentSnapshot): ResolvedIntentSnapshot {
  const elements = new Map<string, IntentCanvasElement>()
  const diagnostics: IntentDiagnostic[] = []
  for (const element of snapshot.elements) {
    if (elements.has(element.id)) {
      diagnostics.push({
        stage: 'resolve', severity: 'error', code: 'DUPLICATE_SNAPSHOT_ID',
        message: `Snapshot contains duplicate ID ${element.id}`,
      })
      continue
    }
    elements.set(element.id, structuredClone(element))
  }
  return { elements, diagnostics }
}

export function referencedIds(op: IntentOp): string[] {
  switch (op.op) {
    case 'layout':
    case 'align':
    case 'distribute':
      return op.targets
    case 'place':
      return [op.target, op.anchor]
    case 'connect':
      return [op.from, op.to]
    case 'update':
    case 'pin':
      return [op.target]
  }
}

export function missingReferences(op: IntentOp, elements: ReadonlyMap<string, IntentCanvasElement>): string[] {
  return referencedIds(op).filter((id, index, all) => !elements.has(id) && all.indexOf(id) === index)
}

export function findConnection(
  op: Extract<IntentOp, { op: 'connect' }>,
  elements: ReadonlyMap<string, IntentCanvasElement>,
): IntentCanvasElement | undefined {
  if (op.id) return elements.get(op.id)
  return [...elements.values()].find(
    (element) => element.kind === 'arrow' && element.from === op.from && element.to === op.to,
  )
}
