import { describe, it, expect } from 'vitest'
import { CAPABILITY_REGISTRY } from '../capability-registry'

// ── 为什么有这个文件 ──────────────────────────────────────────────────────────
// B-5「统一功能管理」:CAPABILITY_REGISTRY 是 settings 能力清单的单一真相源。
// 守卫注册表结构 —— 加新能力必须更新清单(而非散落各处),避免「Labs 只用 1/N」复发。

describe('CAPABILITY_REGISTRY', () => {
  it('每个能力都有 label + desc i18n key', () => {
    for (const cap of CAPABILITY_REGISTRY) {
      expect(cap.labelKey).toBeTruthy()
      expect(cap.descKey).toBeTruthy()
    }
  })

  it('core 能力 = 8 个核心卖点(常开)', () => {
    const core = CAPABILITY_REGISTRY.filter((c) => c.kind === 'core').map((c) => c.id)
    expect(core).toEqual([
      'canvas',
      'relations',
      'dsl',
      'compute',
      'structuredFields',
      'search',
      'exportRestore',
      'localFirst',
    ])
  })

  it('optional 能力 = AI + proposalCoauthorLab(门控)', () => {
    const optional = CAPABILITY_REGISTRY.filter((c) => c.kind === 'optional').map((c) => c.id)
    expect(optional).toEqual(['ai', 'proposalCoauthorLab'])
  })
})
