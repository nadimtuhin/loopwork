import { describe, expect, test, beforeEach, afterEach, spyOn } from 'bun:test'
import { LoopworkError, handleError } from '../src/core/errors'
import { logger } from '../src/core/utils'
import chalk from 'chalk'

describe('error-handling', () => {
  let stdoutSpy: ReturnType<typeof spyOn>
  let stderrSpy: ReturnType<typeof spyOn>

  beforeEach(() => {
    stdoutSpy = spyOn(process.stdout, 'write').mockImplementation(() => true)
    stderrSpy = spyOn(process.stderr, 'write').mockImplementation(() => true)
  })

  afterEach(() => {
    stdoutSpy.mockRestore()
    stderrSpy.mockRestore()
  })

  describe('LoopworkError', () => {
    test('correctly stores message, suggestions and docsUrl', () => {
      const error = new LoopworkError(
        'Test message',
        ['Suggestion 1', 'Suggestion 2'],
        'https://docs.example.com'
      )
      expect(error.message).toBe('Test message')
      expect(error.suggestions).toEqual(['Suggestion 1', 'Suggestion 2'])
      expect(error.docsUrl).toBe('https://docs.example.com')
      expect(error.name).toBe('LoopworkError')
    })

    test('works without docsUrl', () => {
      const error = new LoopworkError('Test message', ['Suggestion'])
      expect(error.docsUrl).toBeUndefined()
    })
  })

  describe('handleError', () => {
    test('handles LoopworkError correctly', () => {
      const error = new LoopworkError(
        'Special error',
        ['Try this', 'Try that'],
        'https://example.com'
      )
      handleError(error)

      // Error is logged to stderr
      expect(stderrSpy).toHaveBeenCalled()
      const stderrOutput = stderrSpy.mock.calls.map((call: any) => call[0]).join('')
      expect(stderrOutput).toContain('Special error')

      // Suggestions and docs are logged to stdout
      expect(stdoutSpy).toHaveBeenCalled()
      const stdoutOutput = stdoutSpy.mock.calls.map((call: any) => call[0]).join('')
      expect(stdoutOutput).toContain('💡 Try this')
      expect(stdoutOutput).toContain('💡 Try that')
      expect(stdoutOutput).toContain('📚 Documentation:')
      expect(stdoutOutput).toContain('https://example.com')
    })

    test('handles generic Error correctly', () => {
      const error = new Error('Generic failure')
      handleError(error)

      expect(stderrSpy).toHaveBeenCalled()
      const stderrOutput = stderrSpy.mock.calls.map((call: any) => call[0]).join('')
      expect(stderrOutput).toContain('Generic failure')
    })

    test('handles unknown types correctly', () => {
      handleError('string error')
      expect(stderrSpy).toHaveBeenCalled()
      const stderrOutput = stderrSpy.mock.calls.map((call: any) => call[0]).join('')
      expect(stderrOutput).toContain('string error')
    })

    test('logs stack trace to debug for Errors', () => {
      const error = new Error('Stack test')
      handleError(error)
      
      const debugSpy = spyOn(logger, 'debug')
      handleError(error)
      expect(debugSpy).toHaveBeenCalled()
      debugSpy.mockRestore()
    })
  })
})
