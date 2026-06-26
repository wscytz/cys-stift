import { describe, expect, it } from 'vitest'
import { canvasToMarkdown, markdownFileName, type MarkdownCardInfo } from '../canvas-to-markdown'
import type { CanvasElement } from '@cys-stift/canvas-engine'

function card(id: string, x: number, y: number, w = 200, h = 120): CanvasElement {
  return { id, kind: 'card', x, y, w, h, rotation: 0 }
}
function frame(id: string, x: number, y: number, w: number, h: number, text: string): CanvasElement {
  return { id, kind: 'frame', x, y, w, h, rotation: 0, text, color: 'blue' }
}
function arrow(id: string, from: string, to: string, label?: string): CanvasElement {
  return { id, kind: 'arrow', x: 0, y: 0, w: 0, h: 0, rotation: 0, from, to, text: label }
}

const info = (title: string, body = '', type = 'note', pinned = false): MarkdownCardInfo => ({
  title,
  body,
  type,
  pinned,
})

describe('canvasToMarkdown', () => {
  it('空画布 → 只出 H1 画布名', () => {
    const md = canvasToMarkdown([], { getCardInfo: () => null, canvasName: '我的画布' })
    expect(md).toContain('# 我的画布')
  })

  it('单张散卡 → ### title + body(无 frame 分区)', () => {
    const md = canvasToMarkdown([card('c1', 0, 0)], {
      getCardInfo: () => info('想法一', '内容'),
      canvasName: 'X',
    })
    expect(md).toContain('### 想法一')
    expect(md).toContain('内容')
    expect(md).not.toMatch(/^## /m) // 无 frame 分区标题(H2)
  })

  it('frame 分区:card 在 frame 内 → 进 ## 分区', () => {
    const f = frame('f1', 0, 0, 500, 500, '主题A')
    const c = card('c1', 50, 50) // 在 frame 内
    const md = canvasToMarkdown([f, c], {
      getCardInfo: () => info('卡A', 'a'),
      canvasName: 'X',
    })
    expect(md).toContain('## 主题A')
    expect(md).toContain('### 卡A')
  })

  it('frame 外的散卡 → 进「其他」分区(有 frame 时)', () => {
    const f = frame('f1', 0, 0, 200, 200, '主题A')
    const inside = card('c1', 50, 50)
    const outside = card('c2', 500, 500) // frame 外
    const md = canvasToMarkdown([f, inside, outside], {
      getCardInfo: (id) => info(id === 'c1' ? '内' : '外'),
      canvasName: 'X',
    })
    expect(md).toContain('## 主题A')
    expect(md).toContain('## 其他')
    expect(md).toContain('### 内')
    expect(md).toContain('### 外')
  })

  it('关系:arrow from→to → 双方都出关系行(← 指向本卡 / → 本卡指出)', () => {
    const a = arrow('a1', 'c1', 'c2')
    const md = canvasToMarkdown([card('c1', 0, 0), card('c2', 300, 0), a], {
      getCardInfo: (id) => info(id === 'c1' ? '甲' : '乙'),
      canvasName: 'X',
    })
    // 甲(c1,from)指出乙;乙(c2,to)被甲指向。
    expect(md).toContain('→ 乙')
    expect(md).toContain('← 甲')
    expect(md).toContain('**关系:**')
  })

  it('pinned 卡 → meta 行含 ★ pinned', () => {
    const md = canvasToMarkdown([card('c1', 0, 0)], {
      getCardInfo: () => info('T', 'b', 'note', true),
      canvasName: 'X',
    })
    expect(md).toContain('★ pinned')
  })

  it('title 含 Markdown 特殊字符 → 转义(防破坏结构)', () => {
    const md = canvasToMarkdown([card('c1', 0, 0)], {
      getCardInfo: () => info('标题 #1 _强调_'),
      canvasName: 'X',
    })
    expect(md).toContain('\\#1') // # 转义
    expect(md).toContain('\\_强调\\_') // _ 转义
    expect(md).not.toMatch(/^标题 #1/m) // 不当标题解析
  })

  it('body 含 # 开头行 → 转义防误当标题', () => {
    const md = canvasToMarkdown([card('c1', 0, 0)], {
      getCardInfo: () => info('T', '# 这不该是标题'),
      canvasName: 'X',
    })
    expect(md).toContain('\\# 这不该是标题')
  })

  it('无 frame 全散卡 → 不出「其他」标题(直接顶层)', () => {
    const md = canvasToMarkdown([card('c1', 0, 0), card('c2', 300, 0)], {
      getCardInfo: (id) => info(id === 'c1' ? '甲' : '乙'),
      canvasName: 'X',
    })
    expect(md).not.toContain('## 其他')
    expect(md).toContain('### 甲')
    expect(md).toContain('### 乙')
  })
})

describe('markdownFileName', () => {
  it('画布名 + .md', () => {
    expect(markdownFileName('我的画布')).toBe('我的画布.md')
  })
  it('非法文件名字符 → 下划线', () => {
    expect(markdownFileName('a/b:c?')).toBe('a_b_c_.md')
  })
  it('空名 → canvas.md', () => {
    expect(markdownFileName('')).toBe('canvas.md')
  })
})
