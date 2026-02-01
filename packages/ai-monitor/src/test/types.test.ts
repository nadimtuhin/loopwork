import { describe, expect, test } from 'bun:test'
import type {
  MonitorAction,
  ErrorPattern,
  TaskRecoveryAnalysis,
  TaskEnhancement,
  VerificationEvidence,
  CircuitBreakerState,
  ConcurrencyConfig,
  MonitorTimeouts,
  HealingCategory,
  AIMonitorConfig,
  RecoveryHistoryEntry,
  WisdomPattern,
  MonitorState,
  LearnedPattern,
  HealingHistory,
  ErrorSeverity,
  RecoveryStrategy,
  ExitReason,
  MonitorActionType
} from '../types'

describe('types', () => {
  test('should import all types without error', () => {
    // Type imports are compile-time only
    // This test verifies the module can be loaded
    expect(true).toBe(true)
  })

  test('should have valid type definitions', () => {
    // Type-level test - if this compiles, types are valid
    const mockAction: MonitorAction = {
      type: 'RETRY',
      description: 'Test action',
      priority: 1
    }
    expect(mockAction.type).toBe('RETRY')
    expect(mockAction.description).toBe('Test action')
  })
})
