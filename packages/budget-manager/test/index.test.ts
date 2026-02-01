import { describe, expect, it } from 'bun:test'
import { createBudgetManager, version } from '../src/index'

describe('Budget Manager', () => {
  it('should have a version', () => {
    expect(version).toBe('0.1.0')
  })

  it('should create a budget manager instance', () => {
    const manager = createBudgetManager({ dailyBudget: 10 })
    expect(manager.name).toBe('budget-manager')
    expect(manager.config.dailyBudget).toBe(10)
  })
})
