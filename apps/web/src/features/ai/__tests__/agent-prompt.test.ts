import { describe, it, expect } from 'vitest'
import type { Card } from '@cys-stift/domain'
import {
  AGENT_SYSTEM_PROMPT,
  RAG_TOP_N,
  buildAgentUserPrompt,
  extractDslBlocks,
  extractCardRefs,
} from '../agent-prompt'

function card(id: string, title: string, body = ''): Card {
  return {
    id: id as never,
    title,
    body,
    type: 'note',
    media: [],
    links: [],
    codeSnippets: [],
    quotes: [],
    source: { kind: 'manual', deviceId: 'dev' } as never,
    capturedAt: new Date(),
    createdAt: new Date(),
    updatedAt: new Date(),
    tags: [],
    pinned: false,
    archived: false,
  }
}

describe('AGENT_SYSTEM_PROMPT', () => {
  it('含 cys-dsl v8 输出契约 + 内容能力 + 引用格式 + 能力分诊', () => {
    expect(AGENT_SYSTEM_PROMPT).toContain('cys-dsl grammar v8')
    expect(AGENT_SYSTEM_PROMPT).toContain('[card #id]')
    expect(AGENT_SYSTEM_PROMPT).toContain('UPDATE')
    expect(AGENT_SYSTEM_PROMPT).toContain('create')
    expect(AGENT_SYSTEM_PROMPT).toContain('@title')
    expect(AGENT_SYSTEM_PROMPT).toContain('@content')
    // v7:AI 必须看到三条新指令(group/href/compute)才会用。
    expect(AGENT_SYSTEM_PROMPT).toContain('@group')
    expect(AGENT_SYSTEM_PROMPT).toContain('@href')
    expect(AGENT_SYSTEM_PROMPT).toContain('@compute')
    // v8:卡片结构化字段指令(type/tags/links/code/quote)也必须出现在语法参考里。
    expect(AGENT_SYSTEM_PROMPT).toContain('@type(')
    expect(AGENT_SYSTEM_PROMPT).toContain('@tags(')
    expect(AGENT_SYSTEM_PROMPT).toContain('@links(')
    expect(AGENT_SYSTEM_PROMPT).toContain('@code(')
    expect(AGENT_SYSTEM_PROMPT).toContain('@quote(')
    expect(AGENT_SYSTEM_PROMPT).not.toContain('[freedraw #id]')
    expect(AGENT_SYSTEM_PROMPT).not.toContain('NEVER put card titles')
  })
})

describe('buildAgentUserPrompt', () => {
  it('含用户问题 + RAG 相关卡(走 allowlist [card #id] 格式)', () => {
    const cards = [
      card('1', 'React hooks', 'useState useEffect'),
      card('2', 'Cooking pasta', 'boil water'),
    ]
    const p = buildAgentUserPrompt('React 相关的笔记', cards)
    expect(p).toContain('React 相关的笔记')
    // RAG 命中 React 卡,注入 [card #1] 格式
    expect(p).toContain('[card #1]')
    expect(p).toContain('React hooks')
  })

  it('RAG 截断到 top-N', () => {
    const cards = Array.from({ length: 20 }, (_, i) => card(String(i), `react ${i}`, 'react'))
    const p = buildAgentUserPrompt('react', cards)
    // 不超过 RAG_TOP_N 张(每张一个 [card #id] header)
    const cardHeaderCount = (p.match(/\[card #\d+\]/g) || []).length
    expect(cardHeaderCount).toBeLessThanOrEqual(RAG_TOP_N)
  })

  it('软删卡不进 RAG', () => {
    const dead = card('1', 'react', 'react')
    dead.deletedAt = new Date()
    const p = buildAgentUserPrompt('react', [dead])
    expect(p).not.toContain('[card #1]')
    expect(p).toContain('no matching cards')
  })

  it('空问题 → 不注入 RAG(用户闲聊)', () => {
    const p = buildAgentUserPrompt('', [card('1', 'x', 'y')])
    expect(p).not.toContain('[card #1]')
    expect(p).not.toContain('Relevant cards')
  })

  it('含目标画布快照(可选)', () => {
    const p = buildAgentUserPrompt('对齐', [], '[card #c1] @pos(100,100)')
    expect(p).toContain('Target canvas current state')
    expect(p).toContain('[card #c1] @pos(100,100)')
  })

  it('RAG 不含 deviceId / media.dataUrl(allowlist)', () => {
    const c = card('1', 'react', 'hooks')
    ;(c as any).source = { kind: 'manual', deviceId: 'SECRET-DEVICE-ID' }
    ;(c as any).media = [{ assetId: 'a1', kind: 'image', dataUrl: 'data:image/png;base64,SECRET' }]
    const p = buildAgentUserPrompt('react', [c])
    expect(p).not.toContain('SECRET-DEVICE-ID')
    expect(p).not.toContain('data:image')
  })
})

describe('extractDslBlocks', () => {
  it('提取单个 cys-dsl 块(去围栏)', () => {
    const text = '好的,对齐如下:\n```cys-dsl\n[card #c1] @pos(100,100)\n[card #c2] @pos(200,100)\n```\n应用即可。'
    const blocks = extractDslBlocks(text)
    expect(blocks).toHaveLength(1)
    expect(blocks[0]).toContain('[card #c1] @pos(100,100)')
    expect(blocks[0]).not.toContain('```')
  })

  it('无块 → 空数组', () => {
    expect(extractDslBlocks('纯文字回答,没有 DSL')).toEqual([])
  })

  it('多个块都提取', () => {
    const text = '```cys-dsl\n[card #c1] @pos(1,1)\n```\n说明\n```cys-dsl\n[card #c2] @pos(2,2)\n```'
    expect(extractDslBlocks(text)).toHaveLength(2)
  })

  it('大小写无关(CYS-DSL 也认)', () => {
    const text = '```CYS-DSL\n[card #c1] @pos(1,1)\n```'
    expect(extractDslBlocks(text)).toHaveLength(1)
  })

  it('普通 ``` 代码块(非 cys-dsl)不提取', () => {
    const text = '```js\nconst x = 1\n```\n```cys-dsl\n[card #c1] @pos(1,1)\n```'
    expect(extractDslBlocks(text)).toHaveLength(1)
    expect(extractDslBlocks(text)[0]).toContain('[card #c1]')
  })
})

describe('extractCardRefs', () => {
  it('提取 [card #id] 引用,去重保序', () => {
    const text = '见 [card #c1] 和 [card #c2],再回 [card #c1]'
    expect(extractCardRefs(text)).toEqual(['c1', 'c2'])
  })

  it('无引用 → 空', () => {
    expect(extractCardRefs('没有引用')).toEqual([])
  })

  it('大小写无关 + id 含连字符', () => {
    const text = '[CARD #abc-1] 引用'
    expect(extractCardRefs(text)).toEqual(['abc-1'])
  })
})
