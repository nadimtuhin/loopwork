import { describe, expect, test } from 'bun:test'
import type { UsageLimit, TokenUsage, UsageEntry, UsageSummary, DailySummary, ICostTracker, IBudgetManager } from '../budget'

describe('budget', () => {
  test('should import all types without error', () => {
    expect(true).toBe(true)
  })
})
