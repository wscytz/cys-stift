import { describe, expect, it } from 'vitest'
import { SelfCanvas, type SelfCanvasHandle } from '../self-canvas'

describe('SelfCanvas', () => {
  it('模块导出 SelfCanvas 组件 + SelfCanvasHandle 类型', () => {
    expect(typeof SelfCanvas).toBe('function')
    const handle: SelfCanvasHandle = { adapter: null }
    expect(handle.adapter).toBeNull()
  })
})
