import { describe, expect, test, mock } from 'bun:test'
import { CliAdapter } from '../cli-adapter'
import type { ICliExecutor } from '@loopwork-ai/contracts'

describe('CliAdapter', () => {
  test('should run prompt through executor', async () => {
    const mockExecutor: ICliExecutor = {
      execute: mock(async () => 0),
      executeTask: mock(),
      killCurrent: mock(),
      cleanup: mock(),
    }
    
    const adapter = new CliAdapter(mockExecutor)
    const result = await adapter.run({
      prompt: 'test prompt',
    })
    
    expect(mockExecutor.execute).toHaveBeenCalled()
    expect(result.exitCode).toBe(0)
  })

  test('should handle executor errors', async () => {
    const mockExecutor: ICliExecutor = {
      execute: mock(async () => { throw new Error('execution failed') }),
      executeTask: mock(),
      killCurrent: mock(),
      cleanup: mock(),
    }
    
    const adapter = new CliAdapter(mockExecutor)
    const result = await adapter.run({
      prompt: 'test prompt',
    })
    
    expect(result.exitCode).toBe(1)
    expect(result.output).toBe('execution failed')
  })
})
