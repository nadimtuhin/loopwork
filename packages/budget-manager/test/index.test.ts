import { describe, expect, it } from 'bun:test'
import { createBudgetManager, version, BudgetManager, CostTracker } from '../src/index'

describe('Budget Manager', () => {
  it('should have a version', () => {
    expect(version).toBe('0.1.0')
  })

  it('should create a budget manager instance', () => {
    const manager = createBudgetManager('./tmp', 'test', { dailyBudget: 10 })
    expect(manager).toBeInstanceOf(BudgetManager)
    expect(manager.getUsageLimit().dailyBudget).toBe(10)
  })

  it('should track and enforce budget', () => {
    const manager = createBudgetManager('./tmp', 'test-track', { dailyBudget: 0.01 })
    
    // Initial status
    expect(manager.hasBudget()).toBe(true)
    
    // Record expensive task
    manager.record('TASK-1', 'claude-3-opus', { inputTokens: 1000000, outputTokens: 1000000 })
    
    // Check exceeded
    expect(manager.hasBudget()).toBe(false)
    expect(manager.getBudgetStatus().isExceeded).toBe(true)
  })
})
