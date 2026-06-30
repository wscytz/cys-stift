import { describe, expect, it } from 'vitest'
import type { Card } from '@cys-stift/domain'
import { buildDeepenUserPrompt, parseDeepenResult } from './companion-discovery-ai'

const card = (id: string, over: Partial<Card> = {}): Card =>
  ({ id, title: id, type: 'note', capturedAt: new Date('2026-01-01'), tags: [], links: [], ...over } as Card)

describe('buildDeepenUserPrompt', () => {
  it('含卡片序列化内容 + locale 指令', () => {
    const p = buildDeepenUserPrompt([card('a', { title: 'react' })], 'en')
    expect(p).toContain('react')
    expect(p.toLowerCase()).toContain('english')
  })
  it('R2 反向断言:不含 deviceId / dataUrl / apiKey', () => {
    const c = card('a', { title: 'x' })
    // 塞入绝不该出现的字段,验证序列化不输出
    ;(c as any).source = { deviceId: 'DEV-SECRET' }
    ;(c as any).media = [{ dataUrl: 'data:image/png;base64,SECRET' }]
    const p = buildDeepenUserPrompt([c], 'zh')
    expect(p).not.toContain('DEV-SECRET')
    expect(p).not.toContain('base64,SECRET')
    expect(p).not.toContain('deviceId')
  })
})

describe('parseDeepenResult', () => {
  it('解析合法 JSON:{note, relationType}', () => {
    expect(parseDeepenResult('blah {"note":"都关于前端框架","relationType":"related-to"} tail'))
      .toEqual({ note: '都关于前端框架', relationType: 'related-to' })
  })
  it('relationType 非法 → undefined(保留 note)', () => {
    expect(parseDeepenResult('{"note":"x","relationType":"bogus"}')).toEqual({ note: 'x', relationType: undefined })
  })
  it('无 JSON / 解析失败 → null', () => {
    expect(parseDeepenResult('纯文本无 json')).toBeNull()
    expect(parseDeepenResult('{"broken":')).toBeNull()
  })
  it('空 note + 无 type → null', () => {
    expect(parseDeepenResult('{"note":"","relationType":null}')).toBeNull()
  })
})
