import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const source = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8')

const consumers = [
  'src/app/canvas/page.tsx',
  'src/features/canvas/dsl-dialog.tsx',
  'src/features/canvas/freedraw-panel.tsx',
  'src/features/canvas/relation-panel.tsx',
  'src/features/workbench/workbench-sections.tsx',
]

describe('half-step spacing token', () => {
  it('declares a valid CSS identifier for the four-pixel half step', () => {
    const css = source('../../packages/ui/src/tokens.css')
    expect(css).toMatch(/--space-half:\s*4px;/)
    expect(css).not.toMatch(/--space-\d+\.\d+\s*:/)
  })

  it.each(consumers)('%s uses the valid half-step identifier', (path) => {
    const text = source(path)
    expect(text).toContain('var(--space-half)')
    expect(text).not.toContain('var(--space-0.5)')
  })
})
