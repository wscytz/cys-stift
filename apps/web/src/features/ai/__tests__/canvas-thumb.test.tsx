// apps/web/src/features/ai/__tests__/canvas-thumb.test.tsx
import { describe, it, expect } from 'vitest'
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import type { CanvasElement } from '@cys-stift/canvas-engine'
import { Thumb, DiffGroup, summarizeEl, confirmStyles } from '../canvas-thumb'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

describe('canvas-thumb', () => {
  it('summarizeEl 三 kind 格式', () => {
    const card = { id: 'c1', kind: 'card', x: 10, y: 20, w: 240, h: 120, rotation: 0, color: 'white' } as CanvasElement
    const arrow = { id: 'a1', kind: 'arrow', x: 0, y: 0, w: 0, h: 0, rotation: 0, from: 'c1', to: 'c2' } as CanvasElement
    const rect = { id: 'r1', kind: 'rect', x: 0, y: 0, w: 10, h: 10, rotation: 0, color: 'black' } as CanvasElement
    expect(summarizeEl(card)).toBe('card #c1 @(10,20)')
    expect(summarizeEl(arrow)).toBe('arrow c1→c2')
    expect(summarizeEl(rect)).toBe('rect #r1')
  })

  it('confirmStyles 是非空 CSS 字符串(含 .ac 类)', () => {
    expect(typeof confirmStyles).toBe('string')
    expect(confirmStyles).toContain('.ac')
  })

  it('Thumb + DiffGroup 挂载不炸', () => {
    const els: CanvasElement[] = [
      { id: 'c1', kind: 'card', x: 0, y: 0, w: 100, h: 50, rotation: 0, color: 'white' } as CanvasElement,
    ]
    const host = document.createElement('div')
    document.body.appendChild(host)
    const root = createRoot(host)
    act(() => {
      root.render(
        <>
          <Thumb elements={els} label="Before" />
          <DiffGroup color="blue" label="Added 1" items={['card #c1']} />
        </>,
      )
    })
    expect(host.querySelector('.ac__thumb')).toBeTruthy()
    expect(host.querySelector('.ac__group--blue')).toBeTruthy()
    act(() => root.unmount())
  })
})
