import { describe, expect, it, vi, beforeEach } from 'vitest'
import type { CanvasElement } from '@cys-stift/canvas-engine'

/**
 * RB-T1 — relation-builder(addRelation / removeRelation)单测。
 *
 * 这层不依赖 host:它直接读写 default canvas 的 freeform store(详情页建/删
 * 关系,此刻画布 host 可能尚未挂载,或详情页根本没开画布)。所以这里把
 * canvasFreeformStore.load/save mock 到一个内存 Record,断言写入形状。
 *
 * vi.mock 被 vitest hoist 到顶部,因此关系 builder 模块 import 时拿到的就是
 * 下面 factory 返回的 mock 对象。
 */

// 内存 store:canvasId → CanvasElement[]。每个 it 前重置。
let mem: Record<string, CanvasElement[]> = {}

vi.mock('@/lib/canvas-freeform-store', () => ({
  canvasFreeformStore: {
    async load(canvasId: string) {
      return mem[canvasId] ? { v: 1 as const, app: 'cys-stift' as const, elements: mem[canvasId] } : null
    },
    async save(canvasId: string, elements: CanvasElement[]) {
      mem[canvasId] = [...elements]
      return true
    },
  },
}))

import { addRelation, removeRelation } from '../relation-builder'
import { relationTypeById, RELATION_TYPES } from '../relation-types'
import type { RelationType } from '../relation-types'

beforeEach(() => {
  mem = {}
})

describe('addRelation', () => {
  it('creates an arrow whose signature matches the relation type (color/dash/arrowhead + text=type.id)', async () => {
    const type = relationTypeById('blocks')!
    const arrowId = await addRelation('card-a', 'card-b', type)

    const saved = mem['default-canvas']!
    expect(saved).toHaveLength(1)
    const a = saved[0]!
    expect(a.id).toBe(arrowId)
    expect(a.kind).toBe('arrow')
    expect(a.from).toBe('card-a')
    expect(a.to).toBe('card-b')
    // 语义三维签名(来自 RelationType)
    expect(a.color).toBe(type.color)
    expect(a.dash).toBe(type.dash)
    expect(a.arrowhead).toBe(type.arrowhead)
    // text label = type id,让 inferRelationType 反推得到类型
    expect(a.text).toBe('blocks')
  })

  it('preserves existing freeform elements when adding a new relation', async () => {
    const existing: CanvasElement = {
      id: 'arrow-old',
      kind: 'arrow',
      x: 0,
      y: 0,
      w: 0,
      h: 0,
      rotation: 0,
      from: 'card-a',
      to: 'card-c',
      color: 'blue',
      dash: 'dashed',
      arrowhead: 'none',
      text: 'references',
    }
    mem['default-canvas'] = [existing]

    const type = relationTypeById('derived-from')!
    await addRelation('card-a', 'card-b', type)

    const saved = mem['default-canvas']!
    expect(saved).toHaveLength(2)
    expect(saved.find((e) => e.id === 'arrow-old')).toBe(existing)
    const created = saved.find((e) => e.text === 'derived-from')!
    expect(created.kind).toBe('arrow')
  })

  it('marks the arrow as a manual relation (no wikilink/embed meta)', async () => {
    const type = relationTypeById('related-to')!
    await addRelation('card-x', 'card-y', type)

    const a = mem['default-canvas']![0]!
    // 手动关系:不带 meta(wikilink/embed 是自动关系专用的标记)。
    // 区别于 BR-T2 的自动 embed 箭头(meta.embed=true)和 wikilink 自动箭头。
    expect(a.meta).toBeUndefined()
  })
})

describe('removeRelation', () => {
  it('removes the arrow by id', async () => {
    const type = RELATION_TYPES[0]! as RelationType
    const id = await addRelation('card-a', 'card-b', type)
    expect(mem['default-canvas']).toHaveLength(1)

    await removeRelation(id)

    const saved = mem['default-canvas']!
    expect(saved.find((e) => e.id === id)).toBeUndefined()
    expect(saved).toHaveLength(0)
  })

  it('is a no-op when the arrow id does not exist', async () => {
    const type = relationTypeById('blocks')!
    const id = await addRelation('card-a', 'card-b', type)
    expect(mem['default-canvas']).toHaveLength(1)

    // 不存在的 id:不应抛、不应误删。
    await removeRelation('does-not-exist')

    const saved = mem['default-canvas']!
    expect(saved.find((e) => e.id === id)).toBeDefined()
    expect(saved).toHaveLength(1)
  })
})
