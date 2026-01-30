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
        'ERR_UNKNOWN',
        'Test message',
        ['Suggestion 1', 'Suggestion 2'],
        'https://docs.example.com'
      )
      expect(error.message).toBe('Test message')
      expect(error.code).toBe('ERR_UNKNOWN')
      expect(error.suggestions).toEqual(['Suggestion 1', 'Suggestion 2'])
      expect(error.docsUrl).toBe('https://docs.example.com')
      expect(error.name).toBe('LoopworkError')
    })

    test('works without docsUrl', () => {
      const error = new LoopworkError('ERR_UNKNOWN', 'Test message', ['Suggestion'])
      // Falls back to ERROR_CODES registry URL
      expect(error.docsUrl).toBe('https://docs.loopwork.ai/errors/unknown')
    })
  })

  describe('handleError', () => {
    test('handles LoopworkError correctly', () => {
      const consoleSpy = spyOn(console, 'error').mockImplementation(() => {})
      const error = new LoopworkError(
        'ERR_UNKNOWN',
        'Special error',
        ['Try this', 'Try that'],
        'https://example.com'
      )
      handleError(error)

      // Error is logged via console.error with formatted box
      expect(consoleSpy).toHaveBeenCalled()
      const consoleOutput = consoleSpy.mock.calls.map((call: any) => call[0]).join('')
      expect(consoleOutput).toContain('Special error')
      expect(consoleOutput).toContain('Try this')
      expect(consoleOutput).toContain('Try that')
      expect(consoleOutput).toContain('https://example.com')
      consoleSpy.mockRestore()
    })

    test('formats error box with error code', () => {
      const consoleSpy = spyOn(console, 'error').mockImplementation(() => {})
      const error = new LoopworkError(
        'ERR_LOCK_CONFLICT',
        'Failed to acquire state lock',
        ['Wait for other instance to finish'],
        'https://docs.loopwork.ai/errors/lock-conflict'
      )
      handleError(error)

      const consoleOutput = consoleSpy.mock.calls.map((call: any) => call[0]).join('')
      expect(consoleOutput).toContain('ERR_LOCK_CONFLICT')
      expect(consoleOutput).toContain('Failed to acquire state lock')
      expect(consoleOutput).toContain('ERROR')
      expect(consoleOutput).toContain('╭')
      expect(consoleOutput).toContain('╰')
      consoleSpy.mockRestore()
    })

    test('formats error box with multiple suggestions', () => {
      const consoleSpy = spyOn(console, 'error').mockImplementation(() => {})
      const error = new LoopworkError(
        'ERR_CONFIG_INVALID',
        'Configuration is invalid',
        ['Check your config file', 'Verify all required fields are present'],
        'https://docs.loopwork.ai/errors/config-invalid'
      )
      handleError(error)

      const consoleOutput = consoleSpy.mock.calls.map((call: any) => call[0]).join('')
      expect(consoleOutput).toContain('ERR_CONFIG_INVALID')
      expect(consoleOutput).toContain('Configuration is invalid')
      expect(consoleOutput).toContain('Check your config file')
      expect(consoleOutput).toContain('Verify all required fields are present')
      expect(consoleOutput).toContain('💡')
      expect(consoleOutput).toContain('📚')
      consoleSpy.mockRestore()
    })

    test('formats error box without suggestions', () => {
      const consoleSpy = spyOn(console, 'error').mockImplementation(() => {})
      const error = new LoopworkError(
        'ERR_FILE_NOT_FOUND',
        'File not found',
        [],
        'https://docs.loopwork.ai/errors/file-not-found'
      )
      handleError(error)

      const consoleOutput = consoleSpy.mock.calls.map((call: any) => call[0]).join('')
      expect(consoleOutput).toContain('ERR_FILE_NOT_FOUND')
      expect(consoleOutput).toContain('File not found')
      expect(!consoleOutput.includes('💡')).toBe(true)
      expect(consoleOutput).toContain('📚')
      consoleSpy.mockRestore()
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
