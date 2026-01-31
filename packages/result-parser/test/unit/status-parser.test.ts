import { describe, test, expect } from 'bun:test'
import { StatusParser } from '../../src/parsers/status-parser'
import type { ParseContext } from '../../src/contracts'

describe('StatusParser', () => {
  const parser = new StatusParser()

  const createContext = (overrides: Partial<ParseContext> = {}): ParseContext => ({
    workDir: '/test',
    exitCode: 0,
    durationMs: 1000,
    ...overrides,
  })

  test('returns success when exit code is 0', () => {
    const context = createContext({ exitCode: 0 })
    const result = parser.parse('Some output', context)
    expect(result).toBe('success')
  })

  test('returns failure when exit code is non-zero and output contains FAILED', () => {
    const context = createContext({ exitCode: 1 })
    const result = parser.parse('Task FAILED with errors', context)
    expect(result).toBe('failure')
  })

  test('returns success when output contains SUCCESS marker even with non-zero exit', () => {
    const context = createContext({ exitCode: 1 })
    const result = parser.parse('Task completed SUCCESS', context)
    expect(result).toBe('success')
  })

  test('returns failure when output contains ERROR marker', () => {
    const context = createContext({ exitCode: 1 })
    const result = parser.parse('FATAL ERROR occurred', context)
    expect(result).toBe('failure')
  })

  test('returns partial when exit code is non-zero but no clear success/failure markers', () => {
    const context = createContext({ exitCode: 1 })
    const result = parser.parse('Some ambiguous output happened', context)
    expect(result).toBe('partial')
  })

  test('is case insensitive for markers', () => {
    const context = createContext({ exitCode: 1 })
    expect(parser.parse('task failed', context)).toBe('failure')
    expect(parser.parse('task COMPLETED successfully', context)).toBe('success')
  })
})
