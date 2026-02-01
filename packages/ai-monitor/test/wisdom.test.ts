import { describe, test, expect, beforeEach, afterEach } from 'bun:test'
import fs from 'fs'
import path from 'path'
import os from 'os'
import { WisdomSystem, type WisdomConfig } from '../src/wisdom'
import type { ErrorPattern } from '../src/types'

function createTestPattern(name: string): ErrorPattern {
  return {
    name,
    regex: new RegExp(`ERROR: ${name}`),
    severity: 'ERROR',
    category: 'test',
    action: { type: 'auto-fix' }
  }
}

describe('WisdomSystem', () => {
  let wisdom: WisdomSystem
  let TEST_DIR: string
  let TEST_STATE_DIR: string

  beforeEach(() => {
    TEST_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'test-wisdom-'))
    TEST_STATE_DIR = path.join(TEST_DIR, 'ai-monitor')

    const config: WisdomConfig = {
      enabled: true,
      stateDir: TEST_STATE_DIR,
      patternExpiryDays: 30,
      minSuccessForTrust: 3
    }
    wisdom = new WisdomSystem(config)
  })

  afterEach(() => {
    if (fs.existsSync(TEST_DIR)) {
      fs.rmSync(TEST_DIR, { recursive: true })
    }
  })

  describe('Learning and Recording', () => {
    test('should record successful healing', () => {
      const pattern = createTestPattern('missing-prd')
      const learned = wisdom.recordSuccess(pattern, 'create-prd')
      expect(learned).toBe(true)
      const stats = wisdom.getStats()
      expect(stats.totalHeals).toBe(1)
      expect(stats.totalPatterns).toBe(1)
    })

    test('should record failed healing', () => {
      const pattern = createTestPattern('unknown-error')
      wisdom.recordFailure(pattern, 'llm-fix')
      const stats = wisdom.getStats()
      expect(stats.totalFailures).toBe(1)
      expect(stats.totalPatterns).toBe(0)
    })

    test('should track success count correctly', () => {
      const pattern = createTestPattern('rate-limit')
      wisdom.recordSuccess(pattern, 'wait-and-retry')
      wisdom.recordSuccess(pattern, 'wait-and-retry')
      wisdom.recordSuccess(pattern, 'wait-and-retry')
      const learned = wisdom.findPattern(pattern)
      expect(learned).not.toBeNull()
      expect(learned!.successCount).toBe(3)
    })

    test('should accumulate context info', () => {
      const pattern = createTestPattern('build-error')
      wisdom.recordSuccess(pattern, 'fix-imports', { fileTypes: ['.ts'] })
      wisdom.recordSuccess(pattern, 'fix-imports', { fileTypes: ['.ts'] })
      wisdom.recordSuccess(pattern, 'fix-imports', { fileTypes: ['.tsx'], errorTypes: ['syntax'] })
      const learned = wisdom.findPattern(pattern)
      expect(learned).not.toBeNull()
      expect(learned!.context?.fileTypes).toContain('.ts')
      expect(learned!.context?.fileTypes).toContain('.tsx')
      expect(learned!.context?.errorTypes).toContain('syntax')
    })
  })

  describe('Pattern Retrieval', () => {
    test('should not return pattern until it reaches trust threshold', () => {
      const pattern = createTestPattern('trust-test')
      wisdom.recordSuccess(pattern, 'fix')
      wisdom.recordSuccess(pattern, 'fix')
      let learned = wisdom.findPattern(pattern)
      expect(learned).toBeNull()
      wisdom.recordSuccess(pattern, 'fix')
      learned = wisdom.findPattern(pattern)
      expect(learned).not.toBeNull()
    })

    test('should return best pattern based on success count', () => {
      const pattern = createTestPattern('multiple-fixes')
      wisdom.recordSuccess(pattern, 'fix-a')
      wisdom.recordSuccess(pattern, 'fix-a')
      wisdom.recordSuccess(pattern, 'fix-a')
      wisdom.recordSuccess(pattern, 'fix-b')
      wisdom.recordSuccess(pattern, 'fix-b')
      wisdom.recordSuccess(pattern, 'fix-b')
      wisdom.recordSuccess(pattern, 'fix-b')
      wisdom.recordSuccess(pattern, 'fix-b')
      const learned = wisdom.findPattern(pattern)
      expect(learned).not.toBeNull()
      expect(learned!.fixAction).toBe('fix-b')
      expect(learned!.successCount).toBe(5)
    })
  })

  describe('Persistence (Integration)', () => {
    test('should save wisdom to disk', () => {
      const pattern = createTestPattern('persistent-pattern')
      for (let i = 0; i < 3; i++) {
        wisdom.recordSuccess(pattern, 'fix')
      }
      const wisdomFile = path.join(TEST_STATE_DIR, 'wisdom.json')
      expect(fs.existsSync(wisdomFile)).toBe(true)
      const data = JSON.parse(fs.readFileSync(wisdomFile, 'utf8'))
      expect(data.patterns).toHaveLength(1)
      expect(data.totalHeals).toBe(3)
    })

    test('should load wisdom from disk on restart', () => {
      const pattern = createTestPattern('reload-test')
      for (let i = 0; i < 3; i++) {
        wisdom.recordSuccess(pattern, 'fix')
      }
      const stats1 = wisdom.getStats()
      expect(stats1.totalHeals).toBe(3)
      const wisdom2 = new WisdomSystem({
        enabled: true,
        stateDir: TEST_STATE_DIR,
        patternExpiryDays: 30,
        minSuccessForTrust: 3
      })
      const stats2 = wisdom2.getStats()
      expect(stats2.totalHeals).toBe(3)
      expect(stats2.totalPatterns).toBe(1)
      const learned = wisdom2.findPattern(pattern)
      expect(learned).not.toBeNull()
      expect(learned!.successCount).toBe(3)
    })
  })

  describe('Pattern Expiration', () => {
    test('should not return expired patterns', async () => {
      const pattern = createTestPattern('expiring-pattern')
      const shortLivedWisdom = new WisdomSystem({
        enabled: true,
        stateDir: TEST_STATE_DIR,
        patternExpiryDays: -1,
        minSuccessForTrust: 1
      })
      shortLivedWisdom.recordSuccess(pattern, 'fix')
      const learned = shortLivedWisdom.findPattern(pattern)
      expect(learned).toBeNull()
    })

    test('should clean up expired patterns', async () => {
      const pattern = createTestPattern('cleanup-test')
      const shortLivedWisdom = new WisdomSystem({
        enabled: true,
        stateDir: TEST_STATE_DIR,
        patternExpiryDays: -1,
        minSuccessForTrust: 1
      })
      shortLivedWisdom.recordSuccess(pattern, 'fix')
      let stats = shortLivedWisdom.getStats()
      expect(stats.totalPatterns).toBe(1)
      const removed = shortLivedWisdom.clearExpired()
      expect(removed).toBe(1)
      stats = shortLivedWisdom.getStats()
      expect(stats.totalPatterns).toBe(0)
    })
  })

  describe('Statistics and Reporting', () => {
    test('should provide accurate statistics', () => {
      const pattern1 = createTestPattern('stat-pattern-1')
      const pattern2 = createTestPattern('stat-pattern-2')
      for (let i = 0; i < 5; i++) wisdom.recordSuccess(pattern1, 'fix1')
      for (let i = 0; i < 3; i++) wisdom.recordSuccess(pattern2, 'fix2')
      wisdom.recordFailure(pattern1, 'fix1')
      const stats = wisdom.getStats()
      expect(stats.totalHeals).toBe(8)
      expect(stats.totalFailures).toBe(1)
      expect(stats.totalPatterns).toBe(2)
    })
  })

  describe('Reset and Maintenance', () => {
    test('should reset wisdom store', () => {
      const pattern = createTestPattern('reset-test')
      for (let i = 0; i < 5; i++) {
        wisdom.recordSuccess(pattern, 'fix')
      }
      let stats = wisdom.getStats()
      expect(stats.totalPatterns).toBe(1)
      wisdom.reset()
      stats = wisdom.getStats()
      expect(stats.totalPatterns).toBe(0)
      expect(stats.totalHeals).toBe(0)
    })
  })
})
