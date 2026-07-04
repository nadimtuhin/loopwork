import { describe, expect, test } from 'bun:test'
import { withDynamicTasks, createDynamicTasksPlugin } from '../dynamic-tasks'

/**
 * dynamic-tasks Tests
 */
describe('dynamic-tasks', () => {

  describe('withDynamicTasks', () => {
    test('should be a function', () => {
      expect(typeof withDynamicTasks).toBe('function')
    })

    test('should disable dynamic tasks when enabled: false is passed', () => {
      const wrapper = withDynamicTasks({ enabled: false })
      const config = wrapper({ dynamicTasks: { enabled: true } }) as any
      expect(config.dynamicTasks.enabled).toBe(false)
    })
  })

  describe('createDynamicTasksPlugin', () => {
    test('should be a function', () => {
      expect(typeof createDynamicTasksPlugin).toBe('function')
    })
    
    test('should create a plugin with correct name', () => {
      const plugin = createDynamicTasksPlugin()
      expect(plugin.name).toBe('dynamic-tasks')
    })
  })
})
