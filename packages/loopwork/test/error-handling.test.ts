import { describe, expect, test, beforeEach, afterEach, spyOn } from 'bun:test'
import { LoopworkError, handleError, createCliNotFoundError, createNoTasksError, createRateLimitError, createTaskFailureError } from '../src/core/errors'
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
      const error = new LoopworkError(
        'ERR_UNKNOWN',
        'Special error',
        ['Try this', 'Try that'],
        'https://example.com'
      )
      handleError(error)

      // Error is logged via stdout with formatted box (logger.raw uses stdout)
      expect(stdoutSpy).toHaveBeenCalled()
      const stdoutOutput = stdoutSpy.mock.calls.map((call: any) => call[0]).join('')
      expect(stdoutOutput).toContain('Special error')
      expect(stdoutOutput).toContain('Try this')
      expect(stdoutOutput).toContain('Try that')
      expect(stdoutOutput).toContain('https://example.com')
    })

    test('formats error box with error code', () => {
      const error = new LoopworkError(
        'ERR_LOCK_CONFLICT',
        'Failed to acquire state lock',
        ['Wait for other instance to finish'],
        'https://docs.loopwork.ai/errors/lock-conflict'
      )
      handleError(error)

      const stdoutOutput = stdoutSpy.mock.calls.map((call: any) => call[0]).join('')
      expect(stdoutOutput).toContain('ERR_LOCK_CONFLICT')
      expect(stdoutOutput).toContain('Failed to acquire state lock')
      expect(stdoutOutput).toContain('ERROR')
      expect(stdoutOutput).toContain('╭')
      expect(stdoutOutput).toContain('╰')
    })

    test('formats error box with multiple suggestions', () => {
      const error = new LoopworkError(
        'ERR_CONFIG_INVALID',
        'Configuration is invalid',
        ['Check your config file', 'Verify all required fields are present'],
        'https://docs.loopwork.ai/errors/config-invalid'
      )
      handleError(error)

      const stdoutOutput = stdoutSpy.mock.calls.map((call: any) => call[0]).join('')
      expect(stdoutOutput).toContain('ERR_CONFIG_INVALID')
      expect(stdoutOutput).toContain('Configuration is invalid')
      expect(stdoutOutput).toContain('Check your config file')
      expect(stdoutOutput).toContain('Verify all required fields are present')
      expect(stdoutOutput).toContain('💡')
      expect(stdoutOutput).toContain('📚')
    })

    test('formats error box without suggestions', () => {
      const error = new LoopworkError(
        'ERR_FILE_NOT_FOUND',
        'File not found',
        [],
        'https://docs.loopwork.ai/errors/file-not-found'
      )
      handleError(error)

      const stdoutOutput = stdoutSpy.mock.calls.map((call: any) => call[0]).join('')
      expect(stdoutOutput).toContain('ERR_FILE_NOT_FOUND')
      expect(stdoutOutput).toContain('File not found')
      expect(!stdoutOutput.includes('💡')).toBe(true)
      expect(stdoutOutput).toContain('📚')
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

  describe('createCliNotFoundError', () => {
    test('creates helpful error for missing claude', () => {
      const error = createCliNotFoundError('claude', 'https://claude.com/code')

      expect(error).toBeInstanceOf(LoopworkError)
      expect(error.code).toBe('ERR_CLI_NOT_FOUND')
      expect(error.message).toContain("AI CLI 'claude' not found in PATH")
      expect(error.suggestions).toContainEqual('Install claude from: https://claude.com/code')
      expect(error.suggestions).toContainEqual('Ensure Claude Code is in your PATH: which claude')
    })

    test('creates helpful error for missing opencode', () => {
      const error = createCliNotFoundError('opencode', 'https://opencode.sh')

      expect(error).toBeInstanceOf(LoopworkError)
      expect(error.code).toBe('ERR_CLI_NOT_FOUND')
      expect(error.message).toContain("AI CLI 'opencode' not found in PATH")
      expect(error.suggestions).toContainEqual('Install opencode from: https://opencode.sh')
      expect(error.suggestions).toContainEqual('Ensure OpenCode is in your PATH: which opencode')
    })
  })

  describe('createNoTasksError', () => {
    test('creates helpful error with task creation suggestions', () => {
      const error = createNoTasksError('.specs/tasks/tasks.json')

      expect(error).toBeInstanceOf(LoopworkError)
      expect(error.code).toBe('ERR_TASK_NOT_FOUND')
      expect(error.message).toBe('No pending tasks found')
      expect(error.suggestions).toContainEqual('Create tasks in .specs/tasks/tasks.json')
      expect(error.suggestions).toContainEqual('Or run: loopwork task-new --title "Your task" --priority high')
    })
  })

  describe('createRateLimitError', () => {
    test('creates error with wait info and upgrade suggestions', () => {
      const error = createRateLimitError(60, 60)

      expect(error).toBeInstanceOf(LoopworkError)
      expect(error.code).toBe('ERR_CLI_EXEC')
      expect(error.message).toContain('Rate limit reached, waiting 60 seconds...')
      expect(error.suggestions).toContainEqual('Consider upgrading your API tier for higher limits')
      expect(error.suggestions).toContainEqual('Rate limits are per-minute, waiting will automatically retry')
      expect(error.suggestions).toContainEqual('You can also reduce concurrency with: --parallel 1')
    })

    test('uses default wait time when retryAfter not provided', () => {
      const error = createRateLimitError(30)

      expect(error.message).toContain('Rate limit reached, waiting 30 seconds...')
    })
  })

  describe('createTaskFailureError', () => {
    test('creates helpful error with recovery options', () => {
      const error = createTaskFailureError('TASK-001', 'npm test', 1, '.specs/tasks/TASK-001.md')

      expect(error).toBeInstanceOf(LoopworkError)
      expect(error.code).toBe('ERR_CLI_EXEC')
      expect(error.message).toContain('Task TASK-001 failed')
      expect(error.message).toContain("Command 'npm test' exited with code 1")
      expect(error.suggestions).toContainEqual('Check task requirements in .specs/tasks/TASK-001.md')
      expect(error.suggestions).toContainEqual('Run manually: npm test')
      expect(error.suggestions).toContainEqual('Skip task: loopwork deadletter retry TASK-001')
      expect(error.suggestions).toContainEqual('View logs: loopwork logs --task 001')
    })
  })
})
