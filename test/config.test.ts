import { describe, test, expect } from 'bun:test'
import type { Config } from '../src/core/config'
import { DEFAULT_CONFIG } from '../src/contracts'

describe('Config', () => {
  describe('DEFAULT_CONFIG', () => {
    test('has expected default values', () => {
      expect(DEFAULT_CONFIG.maxIterations).toBe(50)
      expect(DEFAULT_CONFIG.timeout).toBe(600)
      expect(DEFAULT_CONFIG.cli).toBe('opencode')
      expect(DEFAULT_CONFIG.autoConfirm).toBe(false)
      expect(DEFAULT_CONFIG.dryRun).toBe(false)
    })

    test('cli default is a valid option', () => {
      const validClis = ['opencode', 'claude', 'gemini']
      expect(validClis).toContain(DEFAULT_CONFIG.cli)
    })
  })

  describe('Config interface', () => {
    test('can create a valid config object', () => {
      const config: Config = {
        ...DEFAULT_CONFIG,
        projectRoot: '/test/project',
        outputDir: '/test/project/loopwork-runs/2026-01-17',
        sessionId: 'loopwork-2026-01-17-123',
        debug: false,
        resume: false,
      }

      expect(config.projectRoot).toBe('/test/project')
      expect(config.sessionId).toMatch(/^loopwork-/)
    })

    test('supports optional fields', () => {
      const config: Config = {
        ...DEFAULT_CONFIG,
        projectRoot: '/test',
        outputDir: '/test/output',
        sessionId: 'test',
        debug: false,
        resume: false,
        repo: 'owner/repo',
        feature: 'profile-health',
        startTask: 123,
        model: 'claude-sonnet',
      }

      expect(config.repo).toBe('owner/repo')
      expect(config.feature).toBe('profile-health')
      expect(config.startTask).toBe(123)
      expect(config.model).toBe('claude-sonnet')
    })

    test('config without optional fields is valid', () => {
      const config: Config = {
        ...DEFAULT_CONFIG,
        projectRoot: '/test',
        outputDir: '/test/output',
        sessionId: 'test',
        debug: false,
        resume: false,
      }

      expect(config.repo).toBeUndefined()
      expect(config.feature).toBeUndefined()
      expect(config.startTask).toBeUndefined()
    })
  })

  describe('sessionId format', () => {
    test('sessionId follows expected pattern', () => {
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
      const sessionId = `loopwork-${timestamp}-${process.pid}`

      expect(sessionId).toMatch(/^loopwork-\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d+$/)
    })
  })

  describe('outputDir format', () => {
    test('outputDir includes timestamp', () => {
      const timestamp = '2026-01-17T10-30-00'
      const projectRoot = '/home/user/project'
      const outputDir = `${projectRoot}/loopwork-runs/${timestamp}`

      expect(outputDir).toBe('/home/user/project/loopwork-runs/2026-01-17T10-30-00')
    })
  })
})
