/**
 * syncCardHeight - 卡高随 cardDisplayMode 派生(setCardMode 全量同步;renderNow visible 同步)。
 * mock ctx:每字 7px(width=240 -> wrap 220 -> 31 字/行)。
 */
import { describe, it, expect } from 'vitest'
import { SelfBuiltAdapter } from '../self-built-adapter'
import type { CardInfo } from '../self-built-render'

function mockCtx() {
  return {
    measureText: (s: string) => ({ width: s.length * 7 }),
    setLineDash: () => {}, strokeRect: () => {}, save: () => {}, restore: () => {},
    translate: () => {}, scale: () => {}, setTransform: () => {}, beginPath: () => {},
    closePath: () => {}, moveTo: () => {}, lineTo: () => {}, quadraticCurveTo: () => {},
    roundRect: () => {}, arc: () => {}, rect: () => {}, fill: () => {}, stroke: () => {},
    fillRect: () => {}, fillText: () => {}, clearRect: () => {},
    strokeStyle: '', fillStyle: '', font: '', lineWidth: 0, globalAlpha: 1, textBaseline: 'top',
  } as unknown as CanvasRenderingContext2D
}

function makeAdapter(body: string): SelfBuiltAdapter {
  const host = new SelfBuiltAdapter(document.createElement('canvas'), {
    getCardInfo: (id): CardInfo | null =>
      id === 'c1' ? { title: 'T', body, type: 'note', pinned: false } : null,
  })
  ;(host as unknown as { ctx: unknown }).ctx = mockCtx()
  return host
}

describe('cardHeight sync (mode A: 模式管高度)', () => {
  it('setCardMode=auto:长 body -> 卡高增长(4 wrapped 行)', () => {
    const host = makeAdapter('a'.repeat(100)) // 100 字 -> 4 行
    host.upsert({ id: 'c1', kind: 'card', x: 0, y: 0, w: 240, h: 100, rotation: 0 })
    expect(host.getElement('c1')?.h).toBe(100) // 初始用户设的
    host.setCardMode('auto')
    // 4 行 -> 58 + 4*16 = 122
    expect(host.getElement('c1')?.h).toBe(122)
  })

  it('setCardMode=compact:长 body 截到 3 行(106)', () => {
    const host = makeAdapter('a'.repeat(100))
    host.upsert({ id: 'c1', kind: 'card', x: 0, y: 0, w: 240, h: 100, rotation: 0 })
    host.setCardMode('auto') // 先切 auto(同步到 122)
    expect(host.getElement('c1')?.h).toBe(122)
    host.setCardMode('compact') // 再切 compact(同步到 106)
    // 3 行 -> 58 + 3*16 = 106
    expect(host.getElement('c1')?.h).toBe(106)
  })

  it('setCardMode=title:无 body 行(最小高 58)', () => {
    const host = makeAdapter('a'.repeat(100))
    host.upsert({ id: 'c1', kind: 'card', x: 0, y: 0, w: 240, h: 200, rotation: 0 })
    host.setCardMode('title')
    expect(host.getElement('c1')?.h).toBe(58)
  })

  it('setCardMode=subtitle:1 行副标题(74)', () => {
    const host = makeAdapter('a'.repeat(100))
    host.upsert({ id: 'c1', kind: 'card', x: 0, y: 0, w: 240, h: 200, rotation: 0 })
    host.setCardMode('subtitle')
    expect(host.getElement('c1')?.h).toBe(74) // 58 + 16
  })

  it('空 body:所有模式 -> 最小高 58', () => {
    const host = makeAdapter('')
    host.upsert({ id: 'c1', kind: 'card', x: 0, y: 0, w: 240, h: 200, rotation: 0 })
    host.setCardMode('auto')
    expect(host.getElement('c1')?.h).toBe(58)
  })

  it('高度同步不推 undo(派生值,非用户操作)', () => {
    const host = makeAdapter('a'.repeat(100))
    host.upsert({ id: 'c1', kind: 'card', x: 0, y: 0, w: 240, h: 100, rotation: 0 })
    const canUndoBefore = host.canUndo()
    host.setCardMode('auto') // 同步改 h,不应推 undo
    host.setCardMode('compact') // 再切回
    // undo 栈:只有初始 upsert 推了一次(若 echoing)。setCardMode 不推。
    // canUndo 态不因 setCardMode 翻转(无新 undo 步)。
    expect(host.canUndo()).toBe(canUndoBefore)
  })
})
