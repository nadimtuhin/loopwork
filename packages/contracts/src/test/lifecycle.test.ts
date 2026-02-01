import { describe, expect, test } from 'bun:test'
import type { HeartbeatConfig, HeartbeatEvent, IHeartbeatProvider, HealthCheck, HealthCheckResult, HealthStatusChangeEvent, HealthMonitorConfig, IHealthMonitor } from '../lifecycle'

describe('lifecycle', () => {
  test('should import all types without error', () => {
    expect(true).toBe(true)
  })
})
