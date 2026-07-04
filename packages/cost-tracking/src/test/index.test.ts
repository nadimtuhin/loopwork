import { describe, expect, test } from 'bun:test'
import { 
  CostTracker, 
  withCostTracking, 
  createCostTrackingPlugin, 
  formatCost, 
  formatTokens, 
  MODEL_PRICING 
} from '../index'

/**
 * index Tests
 */
describe('index', () => {

  describe('CostTracker', () => {
    test('should instantiate with project root', () => {
      const instance = new CostTracker('./tmp')
      expect(instance).toBeDefined()
      expect(instance).toBeInstanceOf(CostTracker)
    })
  })

  describe('withCostTracking', () => {
    test('should be a function', () => {
      expect(typeof withCostTracking).toBe('function')
    })

    test('should return a config wrapper', () => {
      const wrapper = withCostTracking({ dailyBudget: 100 })
      const config = wrapper({})
      expect(config.costTracking.dailyBudget).toBe(100)
    })
  })

  describe('createCostTrackingPlugin', () => {
    test('should create a plugin instance', () => {
      const plugin = createCostTrackingPlugin('./tmp', 'test-plugin')
      expect(plugin.name).toBe('cost-tracking')
      expect(plugin.onTaskStart).toBeDefined()
      expect(plugin.onTaskComplete).toBeDefined()
    })
  })

  describe('Formatting Helpers', () => {
    test('formatCost should format USD values', () => {
      expect(formatCost(0.12345)).toBe('$0.123')
      expect(formatCost(1.23)).toBe('$1.23')
    })

    test('formatTokens should format large numbers', () => {
      expect(formatTokens(1500)).toBe('1.5K')
      expect(formatTokens(2000000)).toBe('2.00M')
    })
  })

  describe('MODEL_PRICING', () => {
    test('should contain major models', () => {
      expect(MODEL_PRICING['claude-3.5-sonnet']).toBeDefined()
      expect(MODEL_PRICING['gpt-4o']).toBeDefined()
    })
  })
})
