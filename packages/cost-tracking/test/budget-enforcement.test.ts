import { describe, expect, test, beforeEach, afterEach } from 'bun:test'
import { CostTracker, BudgetExceededError, type CostTrackingConfig } from '../src'
import * as fs from 'fs'
import * as path from 'path'
import { tmpdir } from 'os'

/**
 * Budget Enforcement Tests for Cost Tracking
 *
 * Tests budget cap functionality:
 * - Per-task budget enforcement
 * - Daily budget enforcement
 * - Budget validation methods
 * - BudgetExceededError handling
 * - Alert thresholds
 */

describe('Budget Enforcement', () => {
  let tempDir: string
  let tracker: CostTracker

  beforeEach(() => {
    // Create a temporary directory for each test
    tempDir = fs.mkdtempSync(path.join(tmpdir(), 'cost-tracking-test-'))
    tracker = new CostTracker(tempDir, 'test-namespace')
  })

  afterEach(() => {
    // Clean up temp directory
    try {
      fs.rmSync(tempDir, { recursive: true, force: true })
    } catch {
      // Ignore cleanup errors
    }
  })

  describe('BudgetExceededError', () => {
    test('creates error with correct properties for daily budget', () => {
      const error = new BudgetExceededError('daily', 15.5, 10.0)

      expect(error.name).toBe('BudgetExceededError')
      expect(error.budgetType).toBe('daily')
      expect(error.currentCost).toBe(15.5)
      expect(error.budgetLimit).toBe(10.0)
      expect(error.taskId).toBeUndefined()
      expect(error.message).toContain('Daily budget exceeded')
      expect(error.message).toContain('$15.5000')
      expect(error.message).toContain('$10.0000')
    })

    test('creates error with correct properties for per-task budget', () => {
      const error = new BudgetExceededError('perTask', 5.25, 3.0, 'TASK-001')

      expect(error.name).toBe('BudgetExceededError')
      expect(error.budgetType).toBe('perTask')
      expect(error.currentCost).toBe(5.25)
      expect(error.budgetLimit).toBe(3.0)
      expect(error.taskId).toBe('TASK-001')
      expect(error.message).toContain('Per-task budget exceeded')
      expect(error.message).toContain('TASK-001')
    })

    test('creates error for per-user budget', () => {
      const error = new BudgetExceededError('perUser', 100.0, 50.0)

      expect(error.budgetType).toBe('perUser')
      expect(error.message).toContain('Per-user budget exceeded')
    })
  })

  describe('checkPerTaskBudget()', () => {
    test('allows task when under budget', () => {
      // Record a small cost
      tracker.record('TASK-001', 'claude-3-haiku', {
        inputTokens: 1000,
        outputTokens: 500,
      })

      const result = tracker.checkPerTaskBudget('TASK-001', 1.0)

      expect(result.allowed).toBe(true)
      expect(result.currentCost).toBeGreaterThan(0)
      expect(result.currentCost).toBeLessThan(1.0)
    })

    test('blocks task when budget exceeded', () => {
      // Record a large cost
      tracker.record('TASK-001', 'claude-3-opus', {
        inputTokens: 1_000_000,
        outputTokens: 500_000,
      })

      const result = tracker.checkPerTaskBudget('TASK-001', 10.0)

      expect(result.allowed).toBe(false)
      expect(result.currentCost).toBeGreaterThan(10.0)
    })

    test('aggregates costs for same task with retries', () => {
      // Simulate retries for same task
      tracker.record('TASK-001', 'claude-3-sonnet', {
        inputTokens: 100_000,
        outputTokens: 50_000,
      })
      tracker.record('TASK-001', 'claude-3-sonnet', {
        inputTokens: 100_000,
        outputTokens: 50_000,
      })

      const result = tracker.checkPerTaskBudget('TASK-001', 1.0)

      expect(result.allowed).toBe(false) // Should exceed $1.00
      expect(result.currentCost).toBeGreaterThan(1.0)
    })

    test('tracks different tasks separately', () => {
      tracker.record('TASK-001', 'claude-3-haiku', {
        inputTokens: 100_000,
        outputTokens: 50_000,
      })
      tracker.record('TASK-002', 'claude-3-haiku', {
        inputTokens: 100_000,
        outputTokens: 50_000,
      })

      const task1Result = tracker.checkPerTaskBudget('TASK-001', 0.1)
      const task2Result = tracker.checkPerTaskBudget('TASK-002', 0.1)

      // Both should be under their individual budgets
      expect(task1Result.allowed).toBe(true)
      expect(task2Result.allowed).toBe(true)
    })
  })

  describe('checkDailyBudget()', () => {
    test('allows when daily budget not exceeded', () => {
      tracker.record('TASK-001', 'claude-3-haiku', {
        inputTokens: 1000,
        outputTokens: 500,
      })

      const result = tracker.checkDailyBudget(10.0)

      expect(result.allowed).toBe(true)
      expect(result.currentCost).toBeGreaterThan(0)
    })

    test('blocks when daily budget exceeded', () => {
      tracker.record('TASK-001', 'claude-3-opus', {
        inputTokens: 2_000_000,
        outputTokens: 1_000_000,
      })

      const result = tracker.checkDailyBudget(50.0)

      expect(result.allowed).toBe(false)
      expect(result.currentCost).toBeGreaterThan(50.0)
    })

    test('aggregates all tasks for today', () => {
      tracker.record('TASK-001', 'claude-3-sonnet', {
        inputTokens: 500_000,
        outputTokens: 250_000,
      })
      tracker.record('TASK-002', 'claude-3-sonnet', {
        inputTokens: 500_000,
        outputTokens: 250_000,
      })
      tracker.record('TASK-003', 'claude-3-sonnet', {
        inputTokens: 500_000,
        outputTokens: 250_000,
      })

      const result = tracker.checkDailyBudget(10.0)

      expect(result.allowed).toBe(false) // 3 tasks should exceed $10
      expect(result.currentCost).toBeGreaterThan(10.0)
    })
  })

  describe('getTaskCost()', () => {
    test('returns zero for unknown task', () => {
      expect(tracker.getTaskCost('UNKNOWN-TASK')).toBe(0)
    })

    test('returns correct cost for single entry', () => {
      tracker.record('TASK-001', 'claude-3-haiku', {
        inputTokens: 1000,
        outputTokens: 500,
      })

      const cost = tracker.getTaskCost('TASK-001')

      expect(cost).toBeGreaterThan(0)
      // Cost should be small: ~$0.00025 for input + $0.000625 for output
      expect(cost).toBeLessThan(0.01)
    })

    test('sums costs for multiple entries same task', () => {
      tracker.record('TASK-001', 'claude-3-haiku', {
        inputTokens: 10_000,
        outputTokens: 5000,
      })
      tracker.record('TASK-001', 'claude-3-haiku', {
        inputTokens: 10_000,
        outputTokens: 5000,
      })

      const cost = tracker.getTaskCost('TASK-001')

      // Should be approximately double a single entry
      expect(cost).toBeGreaterThan(0.001)
    })
  })

  describe('validateBudgets()', () => {
    test('returns allowed when no budgets configured', () => {
      const result = tracker.validateBudgets('TASK-001', {})

      expect(result.allowed).toBe(true)
      expect(result.warnings).toHaveLength(0)
    })

    test('returns allowed when budgets not exceeded', () => {
      tracker.record('TASK-001', 'claude-3-haiku', {
        inputTokens: 1000,
        outputTokens: 500,
      })

      const result = tracker.validateBudgets('TASK-001', {
        dailyBudget: 100.0,
        perTaskBudget: 10.0,
      })

      expect(result.allowed).toBe(true)
      expect(result.warnings).toHaveLength(0)
    })

    test('returns warnings when budgets exceeded with warn action', () => {
      tracker.record('TASK-001', 'claude-3-opus', {
        inputTokens: 2_000_000,
        outputTokens: 1_000_000,
      })

      const result = tracker.validateBudgets('TASK-001', {
        dailyBudget: 10.0,
        perTaskBudget: 5.0,
        budgetAction: 'warn',
      })

      expect(result.allowed).toBe(false) // warn action prevents execution
      expect(result.warnings.length).toBeGreaterThan(0)
      expect(result.warnings[0]).toContain('Daily budget exceeded')
      expect(result.warnings[1]).toContain('Per-task budget exceeded')
    })

    test('throws BudgetExceededError with block action', () => {
      tracker.record('TASK-001', 'claude-3-opus', {
        inputTokens: 2_000_000,
        outputTokens: 1_000_000,
      })

      expect(() => {
        tracker.validateBudgets('TASK-001', {
          dailyBudget: 10.0,
          budgetAction: 'block',
        })
      }).toThrow(BudgetExceededError)
    })

    test('throws with correct error details for per-task budget', () => {
      tracker.record('TASK-001', 'claude-3-opus', {
        inputTokens: 1_000_000,
        outputTokens: 500_000,
      })

      let caughtError: BudgetExceededError | undefined

      try {
        tracker.validateBudgets('TASK-001', {
          perTaskBudget: 5.0,
          budgetAction: 'block',
        })
      } catch (error) {
        caughtError = error as BudgetExceededError
      }

      expect(caughtError).toBeDefined()
      expect(caughtError!.budgetType).toBe('perTask')
      expect(caughtError!.taskId).toBe('TASK-001')
      expect(caughtError!.budgetLimit).toBe(5.0)
    })

    test('returns warnings with alert action without blocking', () => {
      tracker.record('TASK-001', 'claude-3-haiku', {
        inputTokens: 1000,
        outputTokens: 500,
      })

      const result = tracker.validateBudgets('TASK-001', {
        dailyBudget: 100.0,
        budgetAction: 'alert',
      })

      expect(result.allowed).toBe(true)
      expect(result.warnings).toHaveLength(0) // Budget not exceeded, no alert needed
    })

    test('validates only configured budgets', () => {
      tracker.record('TASK-001', 'claude-3-haiku', {
        inputTokens: 1000,
        outputTokens: 500,
      })

      const dailyOnly = tracker.validateBudgets('TASK-001', {
        dailyBudget: 100.0,
      })

      const taskOnly = tracker.validateBudgets('TASK-001', {
        perTaskBudget: 10.0,
      })

      expect(dailyOnly.allowed).toBe(true)
      expect(taskOnly.allowed).toBe(true)
    })
  })

  describe('Budget Persistence', () => {
    test('costs persist across tracker instances', () => {
      // First instance records costs
      tracker.record('TASK-001', 'claude-3-sonnet', {
        inputTokens: 500_000,
        outputTokens: 250_000,
      })

      // Create new instance pointing to same directory
      const newTracker = new CostTracker(tempDir, 'test-namespace')

      // Should have the recorded cost
      const taskCost = newTracker.getTaskCost('TASK-001')
      expect(taskCost).toBeGreaterThan(0)
    })

    test('budget checks work with persisted data', () => {
      tracker.record('TASK-001', 'claude-3-opus', {
        inputTokens: 1_000_000,
        outputTokens: 500_000,
      })

      const newTracker = new CostTracker(tempDir, 'test-namespace')
      const result = newTracker.checkPerTaskBudget('TASK-001', 20.0)

      expect(result.allowed).toBe(false) // Should exceed $20
    })
  })

  describe('Budget Edge Cases', () => {
    test('handles zero budgets gracefully', () => {
      const result = tracker.validateBudgets('TASK-001', {
        dailyBudget: 0,
        perTaskBudget: 0,
      })

      // Zero budgets should be treated as unlimited (not enforced)
      expect(result.allowed).toBe(true)
    })

    test('handles very small budgets', () => {
      tracker.record('TASK-001', 'claude-3-haiku', {
        inputTokens: 500,
        outputTokens: 200,
      })

      const result = tracker.checkPerTaskBudget('TASK-001', 0.0001)

      // Cost: (500/1M)*$0.25 + (200/1M)*$1.25 = $0.000125 + $0.00025 = $0.000375 > $0.0001
      expect(result.allowed).toBe(false) // Should exceed tiny budget
    })

    test('handles very large budgets', () => {
      tracker.record('TASK-001', 'claude-3-opus', {
        inputTokens: 10_000_000,
        outputTokens: 5_000_000,
      })

      const result = tracker.checkDailyBudget(10000.0)

      expect(result.allowed).toBe(true) // Should be well under $10k
    })

    test('correctly calculates at exact budget limit', () => {
      // Record cost that should be exactly at a known amount
      tracker.record('TASK-001', 'default', {
        inputTokens: 1_000_000,
        outputTokens: 0,
      })

      const result = tracker.checkPerTaskBudget('TASK-001', 3.0)

      // Cost should be exactly $3.00 (input only at $3.00 per 1M)
      expect(result.currentCost).toBe(3.0)
      expect(result.allowed).toBe(false) // At limit = exceeded
    })
  })

  describe('getUserCost()', () => {
    test('returns zero for unknown user', () => {
      expect(tracker.getUserCost('unknown-user')).toBe(0)
    })

    test('returns correct cost for single entry', () => {
      tracker.record('TASK-001', 'claude-3-haiku', {
        inputTokens: 1000,
        outputTokens: 500,
      }, undefined, 'success', undefined, undefined, 'user-1')

      const cost = tracker.getUserCost('user-1')

      expect(cost).toBeGreaterThan(0)
      expect(cost).toBeLessThan(0.01)
    })

    test('sums costs for multiple entries same user', () => {
      tracker.record('TASK-001', 'claude-3-haiku', {
        inputTokens: 10_000,
        outputTokens: 5000,
      }, undefined, 'success', undefined, undefined, 'user-1')
      tracker.record('TASK-002', 'claude-3-haiku', {
        inputTokens: 10_000,
        outputTokens: 5000,
      }, undefined, 'success', undefined, undefined, 'user-1')

      const cost = tracker.getUserCost('user-1')

      expect(cost).toBeGreaterThan(0.001)
    })

    test('tracks different users separately', () => {
      tracker.record('TASK-001', 'claude-3-haiku', {
        inputTokens: 100_000,
        outputTokens: 50_000,
      }, undefined, 'success', undefined, undefined, 'user-1')
      tracker.record('TASK-002', 'claude-3-haiku', {
        inputTokens: 100_000,
        outputTokens: 50_000,
      }, undefined, 'success', undefined, undefined, 'user-2')

      const user1Cost = tracker.getUserCost('user-1')
      const user2Cost = tracker.getUserCost('user-2')

      expect(user1Cost).toBeGreaterThan(0)
      expect(user2Cost).toBeGreaterThan(0)
      expect(user1Cost).toBe(user2Cost)
    })

    test('handles entries without userId as anonymous', () => {
      tracker.record('TASK-001', 'claude-3-haiku', {
        inputTokens: 1000,
        outputTokens: 500,
      })

      const anonymousCost = tracker.getUserCost('anonymous')

      expect(anonymousCost).toBeGreaterThan(0)
    })
  })

  describe('checkPerUserBudget()', () => {
    test('allows when under budget', () => {
      tracker.record('TASK-001', 'claude-3-haiku', {
        inputTokens: 1000,
        outputTokens: 500,
      }, undefined, 'success', undefined, undefined, 'user-1')

      const result = tracker.checkPerUserBudget('user-1', 10.0)

      expect(result.allowed).toBe(true)
      expect(result.currentCost).toBeGreaterThan(0)
    })

    test('blocks when budget exceeded', () => {
      tracker.record('TASK-001', 'claude-3-opus', {
        inputTokens: 1_000_000,
        outputTokens: 500_000,
      }, undefined, 'success', undefined, undefined, 'user-1')

      const result = tracker.checkPerUserBudget('user-1', 50.0)

      expect(result.allowed).toBe(false)
      expect(result.currentCost).toBeGreaterThan(50.0)
    })

    test('aggregates costs across tasks for same user', () => {
      // claude-3-sonnet: $3.00 per 1M input, $15.00 per 1M output
      // 500K input + 250K output = $1.50 + $3.75 = $5.25 per task
      // 3 tasks = $15.75, still under $20
      // Let's use claude-3-opus which is more expensive: $15.00 input, $75.00 output per 1M
      tracker.record('TASK-001', 'claude-3-opus', {
        inputTokens: 500_000,
        outputTokens: 250_000,
      }, undefined, 'success', undefined, undefined, 'user-1')
      tracker.record('TASK-002', 'claude-3-opus', {
        inputTokens: 500_000,
        outputTokens: 250_000,
      }, undefined, 'success', undefined, undefined, 'user-1')
      tracker.record('TASK-003', 'claude-3-opus', {
        inputTokens: 500_000,
        outputTokens: 250_000,
      }, undefined, 'success', undefined, undefined, 'user-1')

      // 3 opus tasks = 3 * (500K/1M*$15 + 250K/1M*$75) = 3 * ($7.50 + $18.75) = 3 * $26.25 = $78.75
      const result = tracker.checkPerUserBudget('user-1', 50.0)

      expect(result.allowed).toBe(false) // 3 tasks should exceed $50
      expect(result.currentCost).toBeGreaterThan(50.0)
    })

    test('returns zero for user with no entries', () => {
      const result = tracker.checkPerUserBudget('empty-user', 10.0)

      expect(result.allowed).toBe(true)
      expect(result.currentCost).toBe(0)
    })
  })

  describe('validateBudgets() with perUserBudget', () => {
    test('allows when per-user budget not exceeded', () => {
      tracker.record('TASK-001', 'claude-3-haiku', {
        inputTokens: 1000,
        outputTokens: 500,
      }, undefined, 'success', undefined, undefined, 'user-1')

      const result = tracker.validateBudgets('TASK-002', {
        perUserBudget: 100.0,
        userId: 'user-1',
      })

      expect(result.allowed).toBe(true)
      expect(result.warnings).toHaveLength(0)
    })

    test('returns warnings when per-user budget exceeded with warn action', () => {
      tracker.record('TASK-001', 'claude-3-opus', {
        inputTokens: 2_000_000,
        outputTokens: 1_000_000,
      }, undefined, 'success', undefined, undefined, 'user-1')

      const result = tracker.validateBudgets('TASK-002', {
        perUserBudget: 50.0,
        userId: 'user-1',
        budgetAction: 'warn',
      })

      expect(result.allowed).toBe(false)
      expect(result.warnings.length).toBeGreaterThan(0)
      expect(result.warnings[0]).toContain('Per-user budget exceeded')
    })

    test('throws BudgetExceededError with block action', () => {
      tracker.record('TASK-001', 'claude-3-opus', {
        inputTokens: 2_000_000,
        outputTokens: 1_000_000,
      }, undefined, 'success', undefined, undefined, 'user-1')

      expect(() => {
        tracker.validateBudgets('TASK-002', {
          perUserBudget: 50.0,
          userId: 'user-1',
          budgetAction: 'block',
        })
      }).toThrow(BudgetExceededError)
    })

    test('throws with correct error details for per-user budget', () => {
      tracker.record('TASK-001', 'claude-3-opus', {
        inputTokens: 1_000_000,
        outputTokens: 500_000,
      }, undefined, 'success', undefined, undefined, 'user-1')

      let caughtError: BudgetExceededError | undefined

      try {
        tracker.validateBudgets('TASK-002', {
          perUserBudget: 50.0,
          userId: 'user-1',
          budgetAction: 'block',
        })
      } catch (error) {
        caughtError = error as BudgetExceededError
      }

      expect(caughtError).toBeDefined()
      expect(caughtError!.budgetType).toBe('perUser')
      expect(caughtError!.budgetLimit).toBe(50.0)
    })

    test('does not check per-user budget when userId not provided', () => {
      tracker.record('TASK-001', 'claude-3-opus', {
        inputTokens: 2_000_000,
        outputTokens: 1_000_000,
      }, undefined, 'success', undefined, undefined, 'user-1')

      const result = tracker.validateBudgets('TASK-002', {
        perUserBudget: 10.0,
        // userId not provided
      })

      expect(result.allowed).toBe(true) // Should not check per-user budget
    })

    test('validates multiple budgets together', () => {
      tracker.record('TASK-001', 'claude-3-opus', {
        inputTokens: 2_000_000,
        outputTokens: 1_000_000,
      }, undefined, 'success', undefined, undefined, 'user-1')

      const result = tracker.validateBudgets('TASK-002', {
        dailyBudget: 10.0,
        perTaskBudget: 5.0,
        perUserBudget: 50.0,
        userId: 'user-1',
        budgetAction: 'warn',
      })

      expect(result.allowed).toBe(false)
      expect(result.warnings.length).toBeGreaterThan(1)
    })
  })

  describe('getUserSummaries()', () => {
    test('returns empty object when no entries', () => {
      const summaries = tracker.getUserSummaries()

      expect(Object.keys(summaries)).toHaveLength(0)
    })

    test('groups entries by user', () => {
      tracker.record('TASK-001', 'claude-3-haiku', {
        inputTokens: 1000,
        outputTokens: 500,
      }, undefined, 'success', undefined, undefined, 'user-1')
      tracker.record('TASK-002', 'claude-3-haiku', {
        inputTokens: 2000,
        outputTokens: 1000,
      }, undefined, 'success', undefined, undefined, 'user-1')
      tracker.record('TASK-003', 'claude-3-haiku', {
        inputTokens: 1500,
        outputTokens: 750,
      }, undefined, 'success', undefined, undefined, 'user-2')

      const summaries = tracker.getUserSummaries()

      expect(Object.keys(summaries)).toHaveLength(2)
      expect(summaries['user-1'].taskCount).toBe(2)
      expect(summaries['user-2'].taskCount).toBe(1)
    })

    test('includes anonymous entries', () => {
      tracker.record('TASK-001', 'claude-3-haiku', {
        inputTokens: 1000,
        outputTokens: 500,
      }, undefined, 'success', undefined, undefined, 'user-1')
      tracker.record('TASK-002', 'claude-3-haiku', {
        inputTokens: 1000,
        outputTokens: 500,
      }) // No userId

      const summaries = tracker.getUserSummaries()

      expect(summaries['user-1'].taskCount).toBe(1)
      expect(summaries['anonymous'].taskCount).toBe(1)
    })
  })
})

describe('Budget Configuration', () => {
  test('CostTrackingConfig accepts all budget options', () => {
    const config: CostTrackingConfig = {
      enabled: true,
      dailyBudget: 50.0,
      perTaskBudget: 5.0,
      perUserBudget: 100.0,
      userId: 'user-123',
      budgetAction: 'block',
      alertThreshold: 0.75,
    }

    expect(config.dailyBudget).toBe(50.0)
    expect(config.perTaskBudget).toBe(5.0)
    expect(config.perUserBudget).toBe(100.0)
    expect(config.userId).toBe('user-123')
    expect(config.budgetAction).toBe('block')
    expect(config.alertThreshold).toBe(0.75)
  })

  test('budgetAction has correct union type', () => {
    const warnConfig: CostTrackingConfig = { budgetAction: 'warn' }
    const blockConfig: CostTrackingConfig = { budgetAction: 'block' }
    const alertConfig: CostTrackingConfig = { budgetAction: 'alert' }

    expect(warnConfig.budgetAction).toBe('warn')
    expect(blockConfig.budgetAction).toBe('block')
    expect(alertConfig.budgetAction).toBe('alert')
  })
})
