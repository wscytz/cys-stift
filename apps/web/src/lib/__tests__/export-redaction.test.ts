import { describe, expect, it } from 'vitest'
import { redactExportSecrets, restoreDeviceProfileSecrets } from '../export-redaction'

describe('portable export secret boundary', () => {
  it('redacts apiKey recursively without mutating the source', () => {
    const source = {
      settings: {
        profiles: [{ id: 'p1', apiKey: 'sk-private' }],
      },
      nested: [{ APIKEY: 'also-private' }],
    }

    const redacted = redactExportSecrets(source)

    expect(redacted).toEqual({
      settings: { profiles: [{ id: 'p1', apiKey: '' }] },
      nested: [{ APIKEY: '' }],
    })
    expect(source.settings.profiles[0]!.apiKey).toBe('sk-private')
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
          apiKey: 'sk-local',
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
      apiKey: 'sk-local',
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
