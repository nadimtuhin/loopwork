import { describe, expect, test } from 'bun:test'
import {
  MODEL_PRICING,
  formatCost,
  formatTokens,
  formatUsageSummary,
  withCostTracking,
} from '../src'

/**
 * Unit Tests for Cost Tracking Utilities
 *
 * Tests pure functions and utilities:
 * - Formatting helpers (formatCost, formatTokens, formatUsageSummary)
 * - Config wrapper (withCostTracking)
 * - Model pricing constants validation
 */

describe('Cost Tracking - Formatting Utilities', () => {
  describe('formatCost()', () => {
    test('formats very small costs with 4 decimals', () => {
      expect(formatCost(0.0001)).toBe('$0.0001')
      expect(formatCost(0.0023)).toBe('$0.0023')
      expect(formatCost(0.0099)).toBe('$0.0099')
    })

    test('formats costs under $1 with 3 decimals', () => {
      expect(formatCost(0.01)).toBe('$0.010')
      expect(formatCost(0.123)).toBe('$0.123')
      expect(formatCost(0.999)).toBe('$0.999')
    })

    test('formats costs over $1 with 2 decimals', () => {
      expect(formatCost(1.0)).toBe('$1.00')
      expect(formatCost(5.67)).toBe('$5.67')
      expect(formatCost(123.456)).toBe('$123.46')
    })

    test('handles zero cost', () => {
      expect(formatCost(0)).toBe('$0.0000')
    })

    test('handles large costs', () => {
      expect(formatCost(1234.56)).toBe('$1234.56')
      expect(formatCost(99999.99)).toBe('$99999.99')
    })
  })

  describe('formatTokens()', () => {
    test('formats tokens under 1K as plain number', () => {
      expect(formatTokens(0)).toBe('0')
      expect(formatTokens(1)).toBe('1')
      expect(formatTokens(999)).toBe('999')
    })

    test('formats tokens in thousands with K suffix', () => {
      expect(formatTokens(1_000)).toBe('1.0K')
      expect(formatTokens(1_234)).toBe('1.2K')
      expect(formatTokens(999_999)).toBe('1000.0K') // Edge case
    })

    test('formats tokens in millions with M suffix', () => {
      expect(formatTokens(1_000_000)).toBe('1.00M')
      expect(formatTokens(1_234_567)).toBe('1.23M')
      expect(formatTokens(10_000_000)).toBe('10.00M')
    })

    test('rounds tokens appropriately', () => {
      expect(formatTokens(1_499)).toBe('1.5K')
      expect(formatTokens(1_500)).toBe('1.5K')
      expect(formatTokens(1_234_567)).toBe('1.23M')
    })
  })

  describe('formatUsageSummary()', () => {
    test('formats basic summary without cache tokens', () => {
      const summary = {
        taskCount: 5,
        successCount: 5,
        failureCount: 0,
        totalInputTokens: 12345,
        totalOutputTokens: 6789,
        totalCacheReadTokens: 0,
        totalCacheWriteTokens: 0,
        totalCost: 0.05678,
        avgTokensPerSecond: 0,
        avgCostPerTask: 0.011356,
        entries: [],
      }

      const formatted = formatUsageSummary(summary)

      expect(formatted).toContain('Tasks: 5')
      expect(formatted).toContain('Input tokens: 12.3K')
      expect(formatted).toContain('Output tokens: 6.8K')
      expect(formatted).toContain('Total cost: $0.057')
      expect(formatted).toContain('Avg: $0.011/task')
      expect(formatted).not.toContain('Cache')
    })

    test('includes cache tokens when present', () => {
      const summary = {
        taskCount: 3,
        successCount: 3,
        failureCount: 0,
        totalInputTokens: 10_000,
        totalOutputTokens: 5_000,
        totalCacheReadTokens: 2_000,
        totalCacheWriteTokens: 1_000,
        totalCost: 0.0234,
        avgTokensPerSecond: 0,
        avgCostPerTask: 0.0078,
        entries: [],
      }

      const formatted = formatUsageSummary(summary)

      expect(formatted).toContain('Cache read: 2.0K')
      expect(formatted).toContain('Cache write: 1.0K')
    })

    test('handles large token counts', () => {
      const summary = {
        taskCount: 100,
        successCount: 100,
        failureCount: 0,
        totalInputTokens: 5_000_000,
        totalOutputTokens: 2_500_000,
        totalCacheReadTokens: 0,
        totalCacheWriteTokens: 0,
        totalCost: 75.50,
        avgTokensPerSecond: 0,
        avgCostPerTask: 0.755,
        entries: [],
      }

      const formatted = formatUsageSummary(summary)

      expect(formatted).toContain('Input tokens: 5.00M')
      expect(formatted).toContain('Output tokens: 2.50M')
      expect(formatted).toContain('Total cost: $75.50')
    })

    test('handles zero values', () => {
      const summary = {
        taskCount: 0,
        successCount: 0,
        failureCount: 0,
        totalInputTokens: 0,
        totalOutputTokens: 0,
        totalCacheReadTokens: 0,
        totalCacheWriteTokens: 0,
        totalCost: 0,
        avgTokensPerSecond: 0,
        avgCostPerTask: 0,
        entries: [],
      }

      const formatted = formatUsageSummary(summary)

      expect(formatted).toContain('Tasks: 0')
      expect(formatted).toContain('Input tokens: 0')
      expect(formatted).toContain('Output tokens: 0')
      expect(formatted).toContain('Total cost: $0.0000')
    })
  })
})

describe('Cost Tracking - Config Wrapper', () => {
  test('withCostTracking() adds cost tracking config', () => {
    const baseConfig = {
      cli: 'claude',
      maxIterations: 50,
    } as any

    const wrapper = withCostTracking({ dailyBudget: 10.00 })
    const result = wrapper(baseConfig)

    expect(result).toMatchObject({
      cli: 'claude',
      maxIterations: 50,
      costTracking: {
        enabled: true,
        defaultModel: 'claude-3.5-sonnet',
        dailyBudget: 10.00,
      },
    })
  })

  test('withCostTracking() uses default model when not specified', () => {
    const baseConfig = {} as any
    const wrapper = withCostTracking()
    const result = wrapper(baseConfig)

    expect(result.costTracking).toMatchObject({
      enabled: true,
      defaultModel: 'claude-3.5-sonnet',
    })
  })

  test('withCostTracking() respects custom options', () => {
    const baseConfig = {} as any
    const wrapper = withCostTracking({
      defaultModel: 'gpt-4o',
      dailyBudget: 25.00,
      alertThreshold: 0.8,
    })
    const result = wrapper(baseConfig)

    expect(result.costTracking).toMatchObject({
      enabled: true,
      defaultModel: 'gpt-4o',
      dailyBudget: 25.00,
      alertThreshold: 0.8,
    })
  })

  test('withCostTracking() preserves existing config', () => {
    const baseConfig = {
      cli: 'opencode',
      maxIterations: 100,
      telegram: { botToken: 'test' },
    } as any

    const wrapper = withCostTracking()
    const result = wrapper(baseConfig)

    expect(result.cli).toBe('opencode')
    expect(result.maxIterations).toBe(100)
    expect(result.telegram).toEqual({ botToken: 'test' })
    expect(result.costTracking).toBeDefined()
  })
})

describe('Cost Tracking - Model Pricing Constants', () => {
  test('MODEL_PRICING contains all expected models', () => {
    const expectedModels = [
      // Claude models
      'claude-3-opus',
      'claude-3-sonnet',
      'claude-3-haiku',
      'claude-3.5-sonnet',
      'claude-3.5-haiku',
      'claude-opus-4',
      'claude-sonnet-4',

      // OpenAI models
      'gpt-4',
      'gpt-4-turbo',
      'gpt-4o',
      'gpt-4o-mini',
      'o1',
      'o1-mini',

      // Google models
      'gemini-1.5-pro',
      'gemini-1.5-flash',
      'gemini-2.0-flash',

      // Default
      'default',
    ]

    expectedModels.forEach(model => {
      expect(MODEL_PRICING[model]).toBeDefined()
    })
  })

  test('all pricing entries have required fields', () => {
    Object.entries(MODEL_PRICING).forEach(([model, pricing]) => {
      expect(pricing.inputPer1M).toBeGreaterThanOrEqual(0)
      expect(pricing.outputPer1M).toBeGreaterThanOrEqual(0)
      expect(typeof pricing.inputPer1M).toBe('number')
      expect(typeof pricing.outputPer1M).toBe('number')
    })
  })

  test('output pricing is higher than input pricing for all models', () => {
    Object.entries(MODEL_PRICING).forEach(([model, pricing]) => {
      expect(pricing.outputPer1M).toBeGreaterThan(pricing.inputPer1M)
    })
  })

  test('Claude model pricing hierarchy is correct', () => {
    // Haiku < Sonnet < Opus
    expect(MODEL_PRICING['claude-3-haiku'].inputPer1M).toBeLessThan(
      MODEL_PRICING['claude-3-sonnet'].inputPer1M
    )
    expect(MODEL_PRICING['claude-3-sonnet'].inputPer1M).toBeLessThan(
      MODEL_PRICING['claude-3-opus'].inputPer1M
    )

    expect(MODEL_PRICING['claude-3.5-haiku'].inputPer1M).toBeLessThan(
      MODEL_PRICING['claude-3.5-sonnet'].inputPer1M
    )
  })

  test('OpenAI model pricing hierarchy is correct', () => {
    // Mini < 4o < 4-turbo < 4
    expect(MODEL_PRICING['gpt-4o-mini'].inputPer1M).toBeLessThan(
      MODEL_PRICING['gpt-4o'].inputPer1M
    )
    expect(MODEL_PRICING['gpt-4o'].inputPer1M).toBeLessThan(
      MODEL_PRICING['gpt-4-turbo'].inputPer1M
    )
    expect(MODEL_PRICING['gpt-4-turbo'].inputPer1M).toBeLessThan(
      MODEL_PRICING['gpt-4'].inputPer1M
    )
  })

  test('Google model pricing hierarchy is correct', () => {
    // Flash < Pro
    expect(MODEL_PRICING['gemini-1.5-flash'].inputPer1M).toBeLessThan(
      MODEL_PRICING['gemini-1.5-pro'].inputPer1M
    )
    expect(MODEL_PRICING['gemini-2.0-flash'].inputPer1M).toBeLessThan(
      MODEL_PRICING['gemini-1.5-pro'].inputPer1M
    )
  })

  test('default pricing is reasonable fallback', () => {
    const defaultPricing = MODEL_PRICING['default']

    expect(defaultPricing.inputPer1M).toBe(3.00)
    expect(defaultPricing.outputPer1M).toBe(15.00)
  })

  test('pricing values are in reasonable ranges', () => {
    Object.entries(MODEL_PRICING).forEach(([model, pricing]) => {
      // Input pricing should be between $0.01 and $50 per 1M tokens
      expect(pricing.inputPer1M).toBeGreaterThanOrEqual(0.01)
      expect(pricing.inputPer1M).toBeLessThanOrEqual(50)

      // Output pricing should be between $0.1 and $100 per 1M tokens
      expect(pricing.outputPer1M).toBeGreaterThanOrEqual(0.1)
      expect(pricing.outputPer1M).toBeLessThanOrEqual(100)
    })
  })

  test('Claude Opus is most expensive Claude model', () => {
    const claudeModels = [
      'claude-3-opus',
      'claude-3-sonnet',
      'claude-3-haiku',
      'claude-3.5-sonnet',
      'claude-3.5-haiku',
    ]

    const opusInputPrice = MODEL_PRICING['claude-3-opus'].inputPer1M

    claudeModels.filter(m => m !== 'claude-3-opus').forEach(model => {
      expect(opusInputPrice).toBeGreaterThan(MODEL_PRICING[model].inputPer1M)
    })
  })

  test('Gemini Flash is cheapest overall', () => {
    const allModels = Object.keys(MODEL_PRICING).filter(m => m !== 'default')
    const flashPrice = MODEL_PRICING['gemini-1.5-flash'].inputPer1M

    // Should be among the cheapest (allow for ties/similar pricing)
    const cheaperModels = allModels.filter(
      m => MODEL_PRICING[m].inputPer1M < flashPrice
    )

    expect(cheaperModels.length).toBeLessThan(3) // Very few cheaper models
  })
})

describe('Cost Tracking - Export Completeness', () => {
  test('exports all necessary types and functions', () => {
    // Type exports can't be tested directly, but we can verify they compile

    // Function exports
    expect(typeof formatCost).toBe('function')
    expect(typeof formatTokens).toBe('function')
    expect(typeof formatUsageSummary).toBe('function')
    expect(typeof withCostTracking).toBe('function')

    // Constant exports
    expect(typeof MODEL_PRICING).toBe('object')
    expect(MODEL_PRICING).toBeDefined()
  })
})
