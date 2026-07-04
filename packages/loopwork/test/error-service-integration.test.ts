import { describe, expect, test, beforeEach, afterEach, spyOn } from 'bun:test'
import { LoopworkError, handleError } from '../src/core/errors'
import { setErrorRegistry, logger } from '../src/core/utils'
import { CentralErrorRegistry } from '@loopwork-ai/error-service'

describe('Error Service Integration', () => {
  let stdoutSpy: ReturnType<typeof spyOn>

  beforeEach(() => {
    stdoutSpy = spyOn(process.stdout, 'write').mockImplementation(() => true)
  })

  afterEach(() => {
    stdoutSpy.mockRestore()
    // Reset error registry
    setErrorRegistry(undefined as any)
  })

  test('should use suggestions from CentralErrorRegistry when missing in error object', () => {
    const registry = new CentralErrorRegistry()
    setErrorRegistry(registry)

    // ERR_LOCK_CONFLICT has default suggestions in CentralErrorRegistry
    const error = new LoopworkError('ERR_LOCK_CONFLICT', 'Lock conflict occurred', [])
    handleError(error)

    const stdoutOutput = stdoutSpy.mock.calls.map((call: any) => call[0]).join('')
    expect(stdoutOutput).toContain('ERR_LOCK_CONFLICT')
    expect(stdoutOutput).toContain('Lock conflict occurred')
    
    // Check for suggestions from registry
    expect(stdoutOutput).toContain('Check if another Loopwork process is running')
    expect(stdoutOutput).toContain('Wait for the other process to complete')
    expect(stdoutOutput).toContain('terminate')
    expect(stdoutOutput).toContain('it')
  })

  test('should use docsUrl from CentralErrorRegistry', () => {
    const registry = new CentralErrorRegistry()
    setErrorRegistry(registry)

    const error = new LoopworkError('ERR_CONFIG_INVALID', 'Invalid config')
    expect(error.docsUrl).toBe('https://docs.loopwork.ai/errors/config-invalid')
  })

  test('should fallback gracefully when registry is not initialized', () => {
    // Registry is not set (handled in afterEach)
    const error = new LoopworkError('ERR_FILE_NOT_FOUND', 'File missing')
    handleError(error)

    const stdoutOutput = stdoutSpy.mock.calls.map((call: any) => call[0]).join('')
    expect(stdoutOutput).toContain('ERR_FILE_NOT_FOUND')
    expect(stdoutOutput).toContain('File missing')
    expect(stdoutOutput).toContain('https://docs.loopwork.ai/errors/file-not-found')
  })
})
