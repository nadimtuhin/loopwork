import { describe, expect, test, beforeEach, afterEach, mock } from 'bun:test'
import { DailyBriefingManager, createDailyBriefingPlugin, generateAndSendBriefing } from '../daily-briefing'
import type { DailyBriefingConfig, BriefingTelegramSender } from '../daily-briefing'

describe('daily-briefing', () => {
  const defaultConfig: DailyBriefingConfig = {
    enabled: true,
    sendTime: '09:00',
    timezone: 'UTC',
    includeMetrics: true,
    includeFileChanges: true,
  }

  describe('DailyBriefingManager', () => {
    test('should instantiate without errors', () => {
      const instance = new DailyBriefingManager(defaultConfig)
      expect(instance).toBeDefined()
      expect(instance).toBeInstanceOf(DailyBriefingManager)
    })

    test('should maintain instance identity', () => {
      const instance1 = new DailyBriefingManager(defaultConfig)
      const instance2 = new DailyBriefingManager(defaultConfig)
      expect(instance1).not.toBe(instance2)
    })
  })

  describe('createDailyBriefingPlugin', () => {
    test('should be a function', () => {
      expect(typeof createDailyBriefingPlugin).toBe('function')
    })

    test('should execute without throwing', () => {
      expect(() => createDailyBriefingPlugin(defaultConfig)).not.toThrow()
    })

    test('should create plugin with manager', () => {
      const mockSender: BriefingTelegramSender = {
        sendMessage: mock(async () => true),
      }
      const plugin = createDailyBriefingPlugin(defaultConfig, mockSender)

      expect(plugin.name).toBe('telegram-daily-briefing')
      expect(plugin.manager).toBeDefined()
      expect(plugin.onTaskComplete).toBeDefined()
      expect(plugin.onTaskFailed).toBeDefined()
    })
  })

  describe('generateAndSendBriefing', () => {
    test('should be a function', () => {
      expect(typeof generateAndSendBriefing).toBe('function')
    })

    test('should execute and return result', async () => {
      const mockSender: BriefingTelegramSender = {
        sendMessage: mock(async () => true),
      }
      const config: DailyBriefingConfig = {
        enabled: true,
        sendTime: '09:00',
        timezone: 'UTC',
        includeMetrics: true,
        includeFileChanges: true,
      }

      const result = await generateAndSendBriefing(config, mockSender)
      expect(result).toBeDefined()
      expect(typeof result.success).toBe('boolean')
    })
  })
})
