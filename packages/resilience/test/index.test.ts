import { describe, expect, test } from 'bun:test'
import * as resilience from '../src/index'

describe('resilience package', () => {
  test('exports core components', () => {
    expect(resilience.ResilienceRunner).toBeDefined()
    expect(resilience.ExponentialBackoff).toBeDefined()
    expect(resilience.StandardRetryStrategy).toBeDefined()
    expect(resilience.createResilienceRunner).toBeDefined()
    expect(resilience.exponentialBackoff).toBeDefined()
    expect(resilience.isRetryable).toBeDefined()
  })
})
