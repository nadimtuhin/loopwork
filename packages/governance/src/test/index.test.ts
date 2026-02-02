import { describe, expect, test, beforeEach, afterEach } from 'bun:test'
import { GovernanceError, PolicyEngine, createGovernancePlugin, withGovernance } from '../index'

describe('index', () => {
  describe('GovernanceError', () => {
    test('should instantiate with message', () => {
      const instance = new GovernanceError('test message')
      expect(instance).toBeDefined()
      expect(instance.message).toBe('test message')
      expect(instance).toBeInstanceOf(GovernanceError)
    })
  })

  describe('PolicyEngine', () => {
    test('should instantiate', () => {
      const instance = new PolicyEngine()
      expect(instance).toBeDefined()
      expect(instance).toBeInstanceOf(PolicyEngine)
    })

    test('should block if max concurrent tasks reached', async () => {
      const engine = new PolicyEngine({ maxConcurrentTasks: 1 })
      engine.trackTaskStart('TASK-1')
      
      const context = {
        task: { id: 'TASK-2', title: 'Test' },
        namespace: 'default',
        activeTasks: new Set(['TASK-1']),
        iteration: 1
      }
      
      const result = await engine.evaluate(context as any)
      expect(result.allowed).toBe(false)
      expect(result.reason).toContain('Maximum concurrent tasks limit reached')
    })
  })

  describe('createGovernancePlugin', () => {
    test('should be a function', () => {
      expect(typeof createGovernancePlugin).toBe('function')
    })
  })
})
