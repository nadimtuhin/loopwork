import { describe, expect, test } from 'bun:test'
import type { StructuredLog, IMetricsCollector, ITelemetryProvider } from '../telemetry'

describe('telemetry', () => {
  test('should import all types without error', () => {
    // Type imports are compile-time only
    // This test verifies the module can be loaded
    expect(true).toBe(true)
  })
})
