/**
 * Budget Manager Package for Loopwork
 *
 * Manages cost tracking and budget enforcement.
 */

export interface BudgetConfig {
  dailyBudget?: number
  alertThreshold?: number
  enabled?: boolean
}

export const version = '0.1.0'

export function createBudgetManager(config: BudgetConfig = {}) {
  return {
    name: 'budget-manager',
    config,
    // Implementation will follow
  }
}
