/**
 * T1 workbench-icons：每个已知 name 渲染 svg；未知 name 返回 null。
 * 图标是纯展示组件，用 react-dom/server renderToStaticMarkup 即可（无 act/jsdom 开销）。
 */
import { describe, it, expect } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import React from 'react'
import { WorkbenchIcon, type WorkbenchIconName } from '../workbench-icons'

const NAMES: WorkbenchIconName[] = [
  'bold', 'italic', 'strike', 'code', 'link', 'h2',
  'ul', 'task', 'quote', 'codeblock', 'table',
  'expand', 'collapse', 'search', 'plus', 'pencil',
]

describe('WorkbenchIcon', () => {
  it('每个已知 name 渲染一个 <svg>', () => {
    for (const name of NAMES) {
      const html = renderToStaticMarkup(<WorkbenchIcon name={name} />)
      expect(html, `name=${name} 应渲染 svg`).toContain('<svg')
    }
  })

  it('传 size / strokeWidth 不崩且仍渲染 svg', () => {
    const html = renderToStaticMarkup(<WorkbenchIcon name="bold" size={20} strokeWidth={1.75} />)
    expect(html).toContain('<svg')
    expect(html).toContain('width="20"')
  })

  it('未知 name 返回 null（无 svg）', () => {
    const html = renderToStaticMarkup(
      <WorkbenchIcon name={'nonexistent' as WorkbenchIconName} />,
    )
    expect(html).not.toContain('<svg')
  })
})
