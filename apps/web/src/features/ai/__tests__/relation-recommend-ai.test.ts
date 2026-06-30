import { describe, it, expect } from 'vitest'
import type { Card } from '@cys-stift/domain'
import {
  AI_RECOMMEND_SYSTEM_PROMPT,
  AI_RECOMMEND_SCORE,
  AI_RECOMMEND_MAX,
  buildAIRecommendPrompt,
  parseAIRecommendations,
} from '../relation-recommend-ai'

function card(id: string, title: string, body = '', deleted = false): Card {
  const c: Card = {
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
  if (deleted) c.deletedAt = new Date()
  return c
}

describe('buildAIRecommendPrompt', () => {
  it('含当前卡 + 候选标题列表 + JSON 格式要求', () => {
    const cur = card('1', '做早餐', '研究健康早餐')
    const cands = [card('2', '营养学笔记'), card('3', 'JavaScript 入门')]
    const p = buildAIRecommendPrompt(cur, cands)
    expect(p).toContain('做早餐')
    expect(p).toContain('[card #2] 营养学笔记')
    expect(p).toContain('[card #3] JavaScript 入门')
    expect(p).toContain('JSON array')
  })

  it('当前卡软删 → 空提示(serializeCardForAI 守 R2)', () => {
    const cur = card('1', '做早餐', 'x', true)
    const p = buildAIRecommendPrompt(cur, [card('2', '其他')])
    expect(p).toBe('')
  })

  it('候选池空 → 空提示', () => {
    const cur = card('1', '做早餐', 'x')
    const p = buildAIRecommendPrompt(cur, [])
    expect(p).toBe('')
  })
})

describe('parseAIRecommendations', () => {
  const known = new Set(['2', '3', '4'])

  it('合法 JSON + 白名单 id → 转成推荐(含 aiReason)', () => {
    const raw = JSON.stringify([
      { id: '2', reason: '都与饮食健康相关' },
      { id: '3', reason: '都涉及能量摄入' },
    ])
    const r = parseAIRecommendations(raw, known)
    expect(r).toHaveLength(2)
    expect(r[0]!.otherCardId).toBe('2')
    expect(r[0]!.reasons).toEqual(['ai'])
    expect(r[0]!.score).toBe(AI_RECOMMEND_SCORE)
    expect(r[0]!.aiReason).toBe('都与饮食健康相关')
    expect(r[0]!.suggestedType.id).toBe('related-to')
  })

  it('id 数字也接受(规范化成字符串)', () => {
    const raw = JSON.stringify([{ id: 2, reason: '相关' }])
    const r = parseAIRecommendations(raw, known)
    expect(r).toHaveLength(1)
    expect(r[0]!.otherCardId).toBe('2')
  })

  it('id 不在白名单(模型编 id)→ 丢弃', () => {
    const raw = JSON.stringify([
      { id: '2', reason: 'ok' },
      { id: '999', reason: '编造的' },
    ])
    const r = parseAIRecommendations(raw, known)
    expect(r).toHaveLength(1)
    expect(r[0]!.otherCardId).toBe('2')
  })

  it('重复 id 去重', () => {
    const raw = JSON.stringify([
      { id: '2', reason: 'a' },
      { id: '2', reason: 'b' },
    ])
    const r = parseAIRecommendations(raw, known)
    expect(r).toHaveLength(1)
  })

  it('坏 JSON → []', () => {
    expect(parseAIRecommendations('not json', known)).toEqual([])
  })

  it('非数组 → []', () => {
    expect(parseAIRecommendations('{"id":"2"}', known)).toEqual([])
  })

  it('空数组 → []', () => {
    expect(parseAIRecommendations('[]', known)).toEqual([])
  })

  it('剥 ```json 围栏', () => {
    const raw = '```json\n[{"id":"2","reason":"x"}]\n```'
    const r = parseAIRecommendations(raw, known)
    expect(r).toHaveLength(1)
  })

  it('缺 reason → 不崩,aiReason 空', () => {
    const raw = JSON.stringify([{ id: '2' }])
    const r = parseAIRecommendations(raw, known)
    expect(r).toHaveLength(1)
    expect(r[0]!.aiReason).toBeUndefined()
  })
})

describe('AI_RECOMMEND 常量', () => {
  it('score 低于本地启发式分(让本地优先排前)', () => {
    // 本地最低命中 content-overlap = 1.0;AI = 0.5 < 1.0,排在本地之后。
    expect(AI_RECOMMEND_SCORE).toBeLessThan(1)
  })
  it('max 合理(≤5,避免刷屏)', () => {
    expect(AI_RECOMMEND_MAX).toBeLessThanOrEqual(5)
  })
  it('SYSTEM_PROMPT 强调 id 白名单 + JSON + 空则 []', () => {
    expect(AI_RECOMMEND_SYSTEM_PROMPT).toContain('MUST come from')
    expect(AI_RECOMMEND_SYSTEM_PROMPT).toContain('JSON array')
    expect(AI_RECOMMEND_SYSTEM_PROMPT).toContain('output []')
  })
})
