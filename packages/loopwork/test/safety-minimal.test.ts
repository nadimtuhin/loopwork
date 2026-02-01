import { describe, test, expect, beforeEach, spyOn } from 'bun:test'
import { createSafetyPlugin } from '../src/plugins/safety'
import type { TaskContext } from '../src/contracts/plugin'
import { RiskLevel } from '../src/contracts/safety'
import { logger } from '../src/core/utils'

describe('Safety Plugin Minimal', () => {
  beforeEach(() => {
    spyOn(logger, 'info').mockImplementation(() => {})
    spyOn(logger, 'warn').mockImplementation(() => {})
    spyOn(logger, 'error').mockImplementation(() => {})
    spyOn(logger, 'debug').mockImplementation(() => {})
    spyOn(logger, 'success').mockImplementation(() => {})
  })

  test('disabled plugin should return void', async () => {
    const plugin = createSafetyPlugin({ enabled: false })

    const context: TaskContext = {
      task: {
        id: 'TASK-001',
        title: 'Test task',
        description: 'Test description',
        status: 'pending',
        priority: 'high',
      },
      config: {} as any,
      iteration: 1,
      startTime: new Date(),
      namespace: 'default',
    }

    // This should NOT throw
    const result = await plugin.onTaskStart!(context)
    console.log('Result type:', typeof result)
    console.log('Result value:', result)
  })

  test('enabled plugin with LOW risk should return void', async () => {
    const plugin = createSafetyPlugin({
      enabled: true,
      maxRiskLevel: RiskLevel.HIGH,
    })

    const context: TaskContext = {
      task: {
        id: 'TASK-002',
        title: 'Add new feature',
        description: 'Implement simple feature',
        status: 'pending',
        priority: 'medium',
      },
      config: {} as any,
      iteration: 1,
      startTime: new Date(),
      namespace: 'default',
    }

    // This should NOT throw
    const result = await plugin.onTaskStart!(context)
    console.log('Result type:', typeof result)
    console.log('Result value:', result)
  })
})
