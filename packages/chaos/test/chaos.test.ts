import { describe, expect, test, mock } from 'bun:test'
import { withChaos, createChaosPlugin } from '../src/index'
import type { TaskContext } from '@loopwork-ai/loopwork/contracts'

describe('Chaos Plugin', () => {
  test('should register the chaos plugin', () => {
    const config = { plugins: [] } as any
    const wrapped = withChaos({ enabled: true })(config)
    expect(wrapped.plugins!).toHaveLength(1)
    expect(wrapped.plugins![0].name).toBe('chaos')
  })

  test('should not register when disabled', () => {
    const config = { plugins: [] } as any
    const wrapped = withChaos({ enabled: false })(config)
    expect(wrapped.plugins).toHaveLength(0)
  })

  test('should introduce delay when configured', async () => {
    const plugin = createChaosPlugin({ delayProbability: 1, minDelay: 10, maxDelay: 20 })
    const context = { task: { id: 'TASK-1' } } as TaskContext
    
    const start = Date.now()
    await plugin.onTaskStart!(context)
    const duration = Date.now() - start
    
    expect(duration).toBeGreaterThanOrEqual(10)
  })

  test('should introduce artificial failure when configured', async () => {
    const plugin = createChaosPlugin({ errorProbability: 1, errorMessage: 'Boom!' })
    const context = { task: { id: 'TASK-1' } } as TaskContext
    
    expect(plugin.onTaskStart!(context)).rejects.toThrow('Boom!')
  })
})
