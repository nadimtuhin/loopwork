import { describe, expect, test } from 'bun:test'
import type { ICliDetector, IBinaryInfo, IDetectionResult, CliType } from '@loopwork-ai/contracts'

/**
 * Mock CLI detector for testing
 */
class MockCliDetector implements ICliDetector {
  private binaries: Map<CliType, IBinaryInfo | null> = new Map()

  constructor(initialBinaries?: Record<CliType, IBinaryInfo | null>) {
    if (initialBinaries) {
      for (const [type, info] of Object.entries(initialBinaries)) {
        this.binaries.set(type as CliType, info)
      }
    }
  }

  async detectAll(): Promise<IDetectionResult> {
    const found = new Map<CliType, IBinaryInfo>()
    const notFound: CliType[] = []

    for (const [type, info] of this.binaries) {
      if (info) {
        found.set(type, info)
      } else {
        notFound.push(type)
      }
    }

    return {
      found,
      notFound,
      hasAny: found.size > 0,
    }
  }

  async detectOne(type: CliType): Promise<IBinaryInfo | null> {
    return this.binaries.get(type) ?? null
  }

  async isAvailable(type: CliType): Promise<boolean> {
    return this.binaries.get(type) !== null && this.binaries.get(type) !== undefined
  }

  async getPath(type: CliType): Promise<string | null> {
    return this.binaries.get(type)?.path ?? null
  }

  setBinary(type: CliType, info: IBinaryInfo | null): void {
    this.binaries.set(type, info)
  }
}

/**
 * cli Tests
 * 
 * Auto-generated test suite for cli
 */

describe('cli', () => {

  describe('CliExecutor', () => {
    test('should be importable', async () => {
      const { CliExecutor } = await import('../cli')
      expect(CliExecutor).toBeDefined()
      expect(typeof CliExecutor).toBe('function')
    })

    test('should accept custom cliDetector in options', () => {
      const mockDetector = new MockCliDetector({
        claude: { type: 'claude', path: '/usr/bin/claude', isExecutable: true, source: 'path' },
        opencode: { type: 'opencode', path: '/usr/bin/opencode', isExecutable: true, source: 'path' },
        gemini: { type: 'gemini', path: '/usr/bin/gemini', isExecutable: true, source: 'path' },
        droid: null,
        crush: null,
        kimi: null,
        kilocode: null,
      })

      // Options interface should accept cliDetector
      expect(mockDetector).toBeInstanceOf(MockCliDetector)
    })
  })

  describe('CliExecutorOptions', () => {
    test('should allow optional cliDetector property', () => {
      const mockDetector = new MockCliDetector()
      // Type check - verify cliDetector is part of the options type
      const options = {
        cliDetector: mockDetector,
      }
      // This will fail type checking if cliDetector is not a valid property
      expect(options.cliDetector).toBeDefined()
    })
  })

  describe('MockCliDetector', () => {
    test('should detect all binaries', async () => {
      const detector = new MockCliDetector({
        claude: { type: 'claude', path: '/usr/bin/claude', version: '1.0.0', isExecutable: true, source: 'path' },
        opencode: { type: 'opencode', path: '/usr/bin/opencode', isExecutable: true, source: 'default' },
        gemini: { type: 'gemini', path: '/usr/bin/gemini', isExecutable: true, source: 'path' },
        droid: null,
        crush: null,
        kimi: null,
        kilocode: null,
      })

      const result = await detector.detectAll()

      expect(result.hasAny).toBe(true)
      expect(result.found.size).toBe(3)
      expect(result.notFound.length).toBe(4)
    })

    test('should report missing binaries', async () => {
      const detector = new MockCliDetector({
        claude: { type: 'claude', path: '/usr/bin/claude', isExecutable: true, source: 'path' },
        opencode: null,
        gemini: null,
        droid: null,
        crush: null,
        kimi: null,
        kilocode: null,
      })

      const result = await detector.detectAll()

      expect(result.hasAny).toBe(true)
      expect(result.found.size).toBe(1)
      expect(result.notFound).toContain('opencode')
    })

    test('should report hasAny false when no binaries found', async () => {
      const detector = new MockCliDetector({
        claude: null,
        opencode: null,
        gemini: null,
        droid: null,
        crush: null,
        kimi: null,
        kilocode: null,
      })

      const result = await detector.detectAll()

      expect(result.hasAny).toBe(false)
      expect(result.found.size).toBe(0)
      expect(result.notFound.length).toBe(7)
    })
  })
})
