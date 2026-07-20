import { PROPOSAL_CAPS } from './proposal-contract'

/** Provider-neutral schema. Cross-reference, DAG, capability and exact caps
 * remain authoritative in proposal-validation.ts. */
export const PROPOSAL_PAYLOAD_SCHEMA_V1 = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  $id: 'https://cys-stift.local/schema/proposal-payload-v1.json',
  type: 'object',
  additionalProperties: false,
  required: ['kind', 'version', 'task', 'summary', 'findings', 'items'],
  properties: {
    kind: { const: 'cys-proposal-payload' },
    version: { const: 1 },
    task: { const: 'plan-structure-audit' },
    summary: { type: 'string', maxLength: PROPOSAL_CAPS.summary },
    findings: { type: 'array', maxItems: PROPOSAL_CAPS.findings, items: { $ref: '#/$defs/finding' } },
    items: {
      type: 'array', maxItems: PROPOSAL_CAPS.items,
      items: { oneOf: [{ $ref: '#/$defs/semanticItem' }, { $ref: '#/$defs/ideaItem' }, { $ref: '#/$defs/layoutItem' }] },
    },
  },
  $defs: {
    id: { type: 'string', pattern: '^[A-Za-z0-9_.:~-]+$', minLength: 1, maxLength: 160 },
    text: { type: 'string', maxLength: PROPOSAL_CAPS.text },
    ids: { type: 'array', maxItems: PROPOSAL_CAPS.dependenciesPerItem, uniqueItems: true, items: { $ref: '#/$defs/id' } },
    evidence: {
      type: 'array', minItems: 1, maxItems: PROPOSAL_CAPS.refsPerItem,
      items: {
        type: 'object', additionalProperties: false, required: ['refId', 'role'],
        properties: { refId: { $ref: '#/$defs/id' }, role: { enum: ['supports', 'contradicts', 'targets', 'inspired-by'] } },
      },
    },
    finding: {
      type: 'object', additionalProperties: false,
      required: ['findingId', 'kind', 'title', 'explanation', 'evidence', 'uncertainty', 'proposalItemIds'],
      properties: {
        findingId: { $ref: '#/$defs/id' },
        kind: { enum: ['relation-cycle', 'orphan-step', 'duplicate-step', 'missing-precondition', 'unclear-owner-or-output', 'suspicious-block-direction', 'dangling-relation', 'relation-invariant'] },
        title: { $ref: '#/$defs/text' }, explanation: { $ref: '#/$defs/text' }, evidence: { $ref: '#/$defs/evidence' },
        uncertainty: { enum: ['low', 'medium', 'high'] },
        proposalItemIds: { type: 'array', maxItems: PROPOSAL_CAPS.items, uniqueItems: true, items: { $ref: '#/$defs/id' } },
      },
    },
    relationAction: {
      oneOf: [
        {
          type: 'object', additionalProperties: false, required: ['type', 'from', 'to', 'relation'],
          properties: { type: { const: 'relation.add' }, from: { $ref: '#/$defs/id' }, to: { $ref: '#/$defs/id' }, relation: { enum: ['blocks', 'related-to'] }, label: { type: 'string', maxLength: 200 } },
        },
        {
          type: 'object', additionalProperties: false, required: ['type', 'arrowId'],
          properties: { type: { enum: ['relation.remove', 'relation.reverse'] }, arrowId: { $ref: '#/$defs/id' } },
        },
      ],
    },
    candidate: {
      type: 'object', additionalProperties: false, required: ['title', 'promptedByRefIds'],
      properties: { title: { $ref: '#/$defs/text' }, body: { $ref: '#/$defs/text' }, promptedByRefIds: { type: 'array', maxItems: PROPOSAL_CAPS.refsPerItem, uniqueItems: true, items: { $ref: '#/$defs/id' } } },
    },
    gap: { type: 'number', minimum: 0, maximum: 2000 },
    targets: { type: 'array', minItems: 1, maxItems: 256, uniqueItems: true, items: { $ref: '#/$defs/id' } },
    layoutOp: {
      oneOf: [
        {
          type: 'object', additionalProperties: false, required: ['op', 'targets', 'mode'],
          properties: {
            op: { const: 'layout' }, targets: { $ref: '#/$defs/targets' }, mode: { enum: ['grid', 'flow-row', 'flow-column', 'tree', 'dag'] },
            columns: { type: 'integer', minimum: 1, maximum: 64 },
            gap: { type: 'array', prefixItems: [{ $ref: '#/$defs/gap' }, { $ref: '#/$defs/gap' }], items: false, minItems: 2, maxItems: 2 },
            align: { enum: ['left', 'center', 'right', 'top', 'middle', 'bottom'] }, order: { enum: ['input', 'title', 'position'] },
          },
        },
        {
          type: 'object', additionalProperties: false, required: ['op', 'target', 'relation', 'anchor'],
          properties: { op: { const: 'place' }, target: { $ref: '#/$defs/id' }, relation: { enum: ['above', 'below', 'left-of', 'right-of'] }, anchor: { $ref: '#/$defs/id' }, gap: { $ref: '#/$defs/gap' }, align: { enum: ['start', 'center', 'end'] } },
        },
        {
          type: 'object', additionalProperties: false, required: ['op', 'targets', 'axis'],
          properties: { op: { const: 'align' }, targets: { $ref: '#/$defs/targets' }, axis: { enum: ['left', 'center', 'right', 'top', 'middle', 'bottom'] } },
        },
        {
          type: 'object', additionalProperties: false, required: ['op', 'targets', 'axis'],
          properties: { op: { const: 'distribute' }, targets: { $ref: '#/$defs/targets' }, axis: { enum: ['horizontal', 'vertical'] }, gap: { $ref: '#/$defs/gap' } },
        },
        {
          type: 'object', additionalProperties: false, required: ['op', 'target'],
          properties: { op: { const: 'pin' }, target: { $ref: '#/$defs/id' } },
        },
      ],
    },
    layoutIntent: {
      type: 'object', additionalProperties: false, required: ['mode', 'ops'],
      properties: { mode: { const: 'layout' }, ops: { type: 'array', minItems: 1, maxItems: 256, items: { $ref: '#/$defs/layoutOp' } } },
    },
    semanticItem: {
      type: 'object', additionalProperties: false,
      required: ['itemId', 'lane', 'evidence', 'dependsOn', 'conflictsWith', 'reason', 'action'],
      properties: {
        itemId: { $ref: '#/$defs/id' }, lane: { const: 'semantic' }, findingId: { $ref: '#/$defs/id' }, evidence: { $ref: '#/$defs/evidence' },
        dependsOn: { $ref: '#/$defs/ids' }, conflictsWith: { $ref: '#/$defs/ids' }, atomicGroupId: { $ref: '#/$defs/id' }, reason: { $ref: '#/$defs/text' }, action: { $ref: '#/$defs/relationAction' },
      },
    },
    ideaItem: {
      type: 'object', additionalProperties: false,
      required: ['itemId', 'lane', 'evidence', 'dependsOn', 'conflictsWith', 'reason', 'candidate'],
      properties: {
        itemId: { $ref: '#/$defs/id' }, lane: { const: 'idea' }, findingId: { $ref: '#/$defs/id' }, evidence: { $ref: '#/$defs/evidence' },
        dependsOn: { $ref: '#/$defs/ids' }, conflictsWith: { $ref: '#/$defs/ids' }, atomicGroupId: { $ref: '#/$defs/id' }, reason: { $ref: '#/$defs/text' }, candidate: { $ref: '#/$defs/candidate' },
      },
    },
    layoutItem: {
      type: 'object', additionalProperties: false,
      required: ['itemId', 'lane', 'evidence', 'dependsOn', 'conflictsWith', 'reason', 'intent'],
      properties: {
        itemId: { $ref: '#/$defs/id' }, lane: { const: 'layout' }, findingId: { $ref: '#/$defs/id' }, evidence: { $ref: '#/$defs/evidence' },
        dependsOn: { $ref: '#/$defs/ids' }, conflictsWith: { $ref: '#/$defs/ids' }, atomicGroupId: { $ref: '#/$defs/id' }, reason: { $ref: '#/$defs/text' }, intent: { $ref: '#/$defs/layoutIntent' },
      },
    },
  },
} as const
