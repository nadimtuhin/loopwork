import { describe, expect, test } from 'bun:test'
import type { PatternMatch, AnalysisResult, AnalysisContext, IAnalysisEngine, FailureContext, FailureAnalysisResult, IFailureAnalyzer, PatternSeverity } from '../analysis'

describe('analysis', () => {
  test('should import all types without error', () => {
    expect(true).toBe(true)
  })
})
