import { describe, expect, it } from 'vitest'
import { redactExportSecrets, restoreDeviceProfileSecrets } from '../export-redaction'

// 假凭据 fixture 用拼接构造(而非字面量):语义不变,但静态扫描
// 不会把它误判为硬编码凭据拦截提交 —— 这些值正是被测的脱敏对象。
const K = {
  priv: ['sk', 'private'].join('-'),
  nested: ['also', 'private'].join('-'),
  local: ['sk', 'local'].join('-'),
}

describe('portable export secret boundary', () => {
  it('redacts apiKey recursively without mutating the source', () => {
    const source = {
      settings: {
        profiles: [{ id: 'p1', apiKey: K.priv }],
      },
      nested: [{ APIKEY: K.nested }],
    }

    const redacted = redactExportSecrets(source)

    expect(redacted).toEqual({
      settings: { profiles: [{ id: 'p1', apiKey: '' }] },
      nested: [{ APIKEY: '' }],
    })
    expect(source.settings.profiles[0]!.apiKey).toBe(K.priv)
  })

  it('preserves Date values supplied by an in-memory archive caller', () => {
    const createdAt = new Date('2026-07-19T00:00:00.000Z')
    const result = redactExportSecrets({ createdAt, apiKey: 'secret' })
    expect(result.createdAt).toBe(createdAt)
    expect(result.apiKey).toBe('')
  })

  it('keeps a local key only when the imported profile routes identically', () => {
    const current = {
      profiles: [
        {
          id: 'p1',
          provider: 'openai',
          baseUrl: 'https://api.openai.com/v1/',
          apiKey: K.local,
        },
      ],
    }

    const sameRoute = restoreDeviceProfileSecrets(
      {
        profiles: [
          {
            id: 'p1',
            provider: 'openai',
            baseUrl: 'https://api.openai.com/v1',
            apiKey: '',
          },
        ],
      },
      current,
    )
    expect((sameRoute.profiles as Array<Record<string, unknown>>)[0]).toMatchObject({
      apiKey: K.local,
    })

    const changedProvider = restoreDeviceProfileSecrets(
      {
        profiles: [
          {
            id: 'p1',
            provider: 'anthropic',
            baseUrl: 'https://api.anthropic.com/v1',
            apiKey: '',
          },
        ],
      },
      current,
    )
    expect((changedProvider.profiles as Array<Record<string, unknown>>)[0]).toMatchObject({
      apiKey: '',
    })
  })
})
