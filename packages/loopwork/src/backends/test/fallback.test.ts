import { describe, expect, test } from 'bun:test'
import { FallbackTaskBackend } from '../fallback'
import type { BackendPlugin } from '../../contracts'

function makeBackend(overrides: Record<string, unknown>): BackendPlugin {
  return overrides as unknown as BackendPlugin
}

const networkError = Object.assign(new Error('down'), { code: 'ECONNREFUSED' })

describe('FallbackTaskBackend', () => {
  test('reads fall back when primary is unreachable', async () => {
    const primary = makeBackend({ findNextTask: async () => { throw networkError } })
    const secondary = makeBackend({ findNextTask: async () => ({ id: 'fb' }) })
    const backend = new FallbackTaskBackend(primary, secondary)

    expect(await backend.findNextTask()).toEqual({ id: 'fb' } as never)
  })

  test('claimTask is a write and never claims on the fallback backend', async () => {
    let fallbackClaims = 0
    const primary = makeBackend({ claimTask: async () => { throw networkError } })
    const secondary = makeBackend({
      claimTask: async () => { fallbackClaims++; return { id: 'fb' } },
    })
    const backend = new FallbackTaskBackend(primary, secondary)

    await expect(backend.claimTask()).rejects.toBe(networkError)
    expect(fallbackClaims).toBe(0)
  })
})
