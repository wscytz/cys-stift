/** Provider-neutral JSON Schema used by structured-output adapters. */
export const INTENT_IR_SCHEMA = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  $id: 'https://cys-stift.local/schema/intent-ir-v1.json',
  title: 'CYS Intent IR v1',
  type: 'object',
  additionalProperties: false,
  required: ['kind', 'version', 'baseRevision', 'mode', 'ops'],
  properties: {
    kind: { const: 'cys-intent' },
    version: { const: 1 },
    baseRevision: { type: 'string', minLength: 1, maxLength: 256 },
    mode: { enum: ['layout', 'edit', 'create'] },
    ops: {
      type: 'array',
      minItems: 1,
      maxItems: 256,
      items: {
        oneOf: [
          {
            type: 'object', additionalProperties: false,
            required: ['op', 'targets', 'mode'],
            properties: {
              op: { const: 'layout' }, targets: { $ref: '#/$defs/targets' },
              mode: { enum: ['grid', 'flow-row', 'flow-column', 'tree', 'dag'] },
              columns: { type: 'integer', minimum: 1, maximum: 64 },
              gap: { $ref: '#/$defs/gapPair' },
              align: { enum: ['left', 'center', 'right', 'top', 'middle', 'bottom'] },
              order: { enum: ['input', 'title', 'position'] },
            },
          },
          {
            type: 'object', additionalProperties: false,
            required: ['op', 'target', 'relation', 'anchor'],
            properties: {
              op: { const: 'place' }, target: { $ref: '#/$defs/id' },
              relation: { enum: ['above', 'below', 'left-of', 'right-of'] },
              anchor: { $ref: '#/$defs/id' }, gap: { $ref: '#/$defs/gap' },
              align: { enum: ['start', 'center', 'end'] },
            },
          },
          {
            type: 'object', additionalProperties: false,
            required: ['op', 'targets', 'axis'],
            properties: {
              op: { const: 'align' }, targets: { $ref: '#/$defs/targets' },
              axis: { enum: ['left', 'center', 'right', 'top', 'middle', 'bottom'] },
            },
          },
          {
            type: 'object', additionalProperties: false,
            required: ['op', 'targets', 'axis'],
            properties: {
              op: { const: 'distribute' }, targets: { $ref: '#/$defs/targets' },
              axis: { enum: ['horizontal', 'vertical'] }, gap: { $ref: '#/$defs/gap' },
            },
          },
          {
            type: 'object', additionalProperties: false,
            required: ['op', 'from', 'to', 'create'],
            properties: {
              op: { const: 'connect' }, id: { $ref: '#/$defs/id' },
              from: { $ref: '#/$defs/id' }, to: { $ref: '#/$defs/id' },
              create: { type: 'boolean' }, style: { $ref: '#/$defs/style' },
            },
          },
          {
            type: 'object', additionalProperties: false,
            required: ['op', 'target', 'patch'],
            properties: {
              op: { const: 'update' }, target: { $ref: '#/$defs/id' },
              patch: { $ref: '#/$defs/patch' },
            },
          },
          {
            type: 'object', additionalProperties: false,
            required: ['op', 'target'],
            properties: { op: { const: 'pin' }, target: { $ref: '#/$defs/id' } },
          },
        ],
      },
    },
  },
  $defs: {
    id: { type: 'string', pattern: '^[A-Za-z0-9_.:~-]+$', minLength: 1, maxLength: 160 },
    targets: { type: 'array', items: { $ref: '#/$defs/id' }, minItems: 1, maxItems: 256, uniqueItems: true },
    gap: { type: 'number', minimum: 0, maximum: 2000 },
    gapPair: { type: 'array', prefixItems: [{ $ref: '#/$defs/gap' }, { $ref: '#/$defs/gap' }], items: false, minItems: 2, maxItems: 2 },
    style: {
      type: 'object', additionalProperties: false,
      properties: {
        dash: { enum: ['solid', 'dashed', 'dotted'] },
        arrowhead: { enum: ['arrow', 'triangle', 'none'] },
        color: { enum: ['red', 'yellow', 'blue', 'black', 'white', 'gray'] },
        label: { type: 'string', maxLength: 200 },
      },
    },
    patch: {
      type: 'object', additionalProperties: false, minProperties: 1,
      properties: {
        color: { enum: ['red', 'yellow', 'blue', 'black', 'white', 'gray'] },
        width: { type: 'number', exclusiveMinimum: 0, maximum: 2000 },
        height: { type: 'number', exclusiveMinimum: 0, maximum: 2000 },
        label: { type: 'string', maxLength: 200 },
      },
    },
  },
} as const
