import { describe, expect, test, afterEach } from 'bun:test'
import fs from 'fs'
import path from 'path'
import { RetryBudget } from '../../src/core/retry-budget'
import { loopworkState } from '../../src/core/loopwork-state'

describe('RetryBudget Persistence', () => {
  const budgetPath = loopworkState.paths.retryBudget()

  afterEach(() => {
    if (fs.existsSync(budgetPath)) {
      fs.unlinkSync(budgetPath)
    }
  })

  test('saves and loads from file', () => {
    const budget = new RetryBudget(10, 60000, true)
    budget.consume()
    budget.consume()
    
    expect(budget.getUsage()).toBe(2)
    expect(fs.existsSync(budgetPath)).toBe(true)

    const newBudget = new RetryBudget(10, 60000, true)
    expect(newBudget.getUsage()).toBe(2)
  })

  test('respects window after loading', async () => {
    // 100ms window
    const budget = new RetryBudget(10, 100, true)
    budget.consume()
    expect(budget.getUsage()).toBe(1)

    // Wait for expiration
    await new Promise(resolve => setTimeout(resolve, 150))

    const newBudget = new RetryBudget(10, 100, true)
    expect(newBudget.getUsage()).toBe(0)
  })
})
