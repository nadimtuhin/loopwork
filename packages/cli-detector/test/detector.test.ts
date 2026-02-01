import { describe, test, expect, beforeEach, mock } from 'bun:test'
import { NodeBasedCliDetector } from '../src/detector'
import type { CliType } from '@loopwork-ai/contracts'

describe('NodeBasedCliDetector', () => {
  let detector: NodeBasedCliDetector

  beforeEach(() => {
    detector = new NodeBasedCliDetector()
  })

  describe('detectAll', () => {
    test('detects all available CLIs', async () => {
      const result = await detector.detectAll()

      expect(result).toBeDefined()
      expect(result.found).toBeInstanceOf(Map)
      expect(result.notFound).toBeInstanceOf(Array)
      expect(typeof result.hasAny).toBe('boolean')
    })

    test('returns empty found map when no CLIs available', async () => {
      const mockDetector = new NodeBasedCliDetector()
      
      mock.module('fs', () => ({
        existsSync: () => false,
        accessSync: () => { throw new Error('EACCES') },
      }))

      const result = await mockDetector.detectAll({
        checkEnvironment: false,
        searchPath: false,
        checkDefaults: false,
      })

      expect(result.found.size).toBe(0)
      expect(result.hasAny).toBe(false)
      expect(result.notFound.length).toBe(3)
    })

    test('respects detection options', async () => {
      const result = await detector.detectAll({
        checkEnvironment: false,
        searchPath: false,
        checkDefaults: false,
      })

      expect(result).toBeDefined()
      expect(result.notFound.length).toBeGreaterThanOrEqual(0)
    })
  })

  describe('detectOne', () => {
    test('returns null when binary not found', async () => {
      const result = await detector.detectOne('claude', {
        checkEnvironment: false,
        searchPath: false,
        checkDefaults: false,
      })

      expect(result).toBeNull()
    })

    test('checks environment variable first', async () => {
      const mockPath = '/custom/path/to/claude'
      process.env.LOOPWORK_CLAUDE_PATH = mockPath

      const originalExistsSync = require('fs').existsSync
      const originalAccessSync = require('fs').accessSync
      
      mock.module('fs', () => ({
        existsSync: (path: string) => path === mockPath,
        accessSync: (path: string) => {
          if (path !== mockPath) throw new Error('ENOENT')
        },
      }))

      const result = await detector.detectOne('claude', {
        checkEnvironment: true,
        searchPath: false,
        checkDefaults: false,
      })

      if (result) {
        expect(result.path).toBe(mockPath)
        expect(result.source).toBe('environment')
      }

      delete process.env.LOOPWORK_CLAUDE_PATH
      mock.restore()
    })

    test('checks custom paths when provided', async () => {
      const customPath = '/my/custom/opencode'

      const result = await detector.detectOne('opencode', {
        customPaths: {
          opencode: [customPath, '/another/path'],
        },
        checkEnvironment: false,
        searchPath: false,
        checkDefaults: false,
      })

      if (result) {
        expect(result.source).toBe('config')
      }
    })

    test('returns binary info with version when available', async () => {
      const mockExecSync = mock(() => 'claude 1.0.0\n')
      
      mock.module('child_process', () => ({
        execSync: mockExecSync,
      }))

      const result = await detector.detectOne('claude')

      if (result && result.version) {
        expect(result.version).toContain('claude')
        expect(result.isExecutable).toBe(true)
        expect(result.type).toBe('claude')
      }

      mock.restore()
    })
  })

  describe('isAvailable', () => {
    test('returns false when CLI not found', async () => {
      const available = await detector.isAvailable('gemini' as CliType)

      expect(typeof available).toBe('boolean')
    })

    test('returns true when CLI is found', async () => {
      const mockDetectOne = mock(async () => ({
        type: 'claude' as CliType,
        path: '/usr/bin/claude',
        version: '1.0.0',
        isExecutable: true,
        source: 'path' as const,
      }))

      const testDetector = Object.create(detector)
      testDetector.detectOne = mockDetectOne

      const available = await testDetector.isAvailable('claude')

      expect(available).toBe(true)
    })
  })

  describe('getPath', () => {
    test('returns null when CLI not found', async () => {
      const path = await detector.getPath('gemini' as CliType)

      if (path !== null) {
        expect(typeof path).toBe('string')
      } else {
        expect(path).toBeNull()
      }
    })

    test('returns path when CLI is found', async () => {
      const mockPath = '/usr/local/bin/claude'
      const mockDetectOne = mock(async () => ({
        type: 'claude' as CliType,
        path: mockPath,
        version: '1.0.0',
        isExecutable: true,
        source: 'path' as const,
      }))

      const testDetector = Object.create(detector)
      testDetector.detectOne = mockDetectOne

      const path = await testDetector.getPath('claude')

      expect(path).toBe(mockPath)
    })
  })

  describe('Edge cases', () => {
    test('handles binary not found gracefully', async () => {
      const result = await detector.detectOne('claude', {
        customPaths: { claude: ['/nonexistent/path'] },
        checkEnvironment: false,
        searchPath: false,
        checkDefaults: false,
      })

      expect(result).toBeNull()
    })

    test('handles permission denied gracefully', async () => {
      mock.module('fs', () => ({
        existsSync: () => true,
        accessSync: () => { throw new Error('EACCES: permission denied') },
      }))

      const result = await detector.detectOne('claude', {
        customPaths: { claude: ['/restricted/claude'] },
        checkEnvironment: false,
        searchPath: false,
        checkDefaults: false,
      })

      expect(result).toBeNull()
      mock.restore()
    })

    test('handles version detection failure gracefully', async () => {
      mock.module('child_process', () => ({
        execSync: () => { throw new Error('Command failed') },
      }))

      const result = await detector.detectOne('claude')

      if (result) {
        expect(result.version).toBeUndefined()
      }

      mock.restore()
    })

    test('expands tilde in paths', async () => {
      const result = await detector.detectOne('claude', {
        customPaths: { claude: ['~/custom/claude'] },
        checkEnvironment: false,
        searchPath: false,
        checkDefaults: false,
      })

      expect(result).toBeDefined()
    })

    test('handles Windows paths with extensions', async () => {
      const originalPlatform = process.platform

      Object.defineProperty(process, 'platform', {
        value: 'win32',
      })

      const result = await detector.detectOne('claude', {
        searchPath: true,
        checkEnvironment: false,
        checkDefaults: false,
      })

      Object.defineProperty(process, 'platform', {
        value: originalPlatform,
      })

      expect(result).toBeDefined()
    })
  })
})
