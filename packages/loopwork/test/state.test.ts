import { describe, test, expect, beforeEach, afterEach, spyOn } from 'bun:test'
import fs from 'fs'
import path from 'path'
import os from 'os'
import { StateManager } from '../src/core/state'
import type { Config } from '../src/core/config'
import * as utils from '../src/core/utils'

describe('StateManager', () => {
  let tempDir: string
  let config: Config
  let stateManager: StateManager

  beforeEach(() => {
    tempDir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'loopwork-test-')))
    config = {
      projectRoot: tempDir,
      outputDir: path.join(tempDir, 'output'),
      sessionId: 'test-session-123',
      maxIterations: 50,
      timeout: 600,
      cli: 'opencode',
      autoConfirm: false,
      dryRun: false,
      debug: false,
    } as Config
    stateManager = new StateManager(config)

    // Mock logger to avoid CI issues with stdout/stderr
    spyOn(utils.logger, 'info').mockImplementation(() => {})
    spyOn(utils.logger, 'success').mockImplementation(() => {})
    spyOn(utils.logger, 'warn').mockImplementation(() => {})
    spyOn(utils.logger, 'error').mockImplementation(() => {})
    spyOn(utils.logger, 'debug').mockImplementation(() => {})
  })

  afterEach(() => {
    // Clean up temp directory
    fs.rmSync(tempDir, { recursive: true, force: true })
  })

  describe('acquireLock', () => {
    test('acquires lock successfully when no lock exists', () => {
      const result = stateManager.acquireLock()
      expect(result).toBe(true)

      const lockDir = path.join(tempDir, '.loopwork/state.lock')
      expect(fs.existsSync(lockDir)).toBe(true)

      const pidFile = path.join(lockDir, 'pid')
      expect(fs.existsSync(pidFile)).toBe(true)
      expect(fs.readFileSync(pidFile, 'utf-8')).toBe(process.pid.toString())
    })

    test('fails to acquire lock when another process holds it', () => {
      // Create a lock with current process PID (simulating another instance)
      const stateDir = path.join(tempDir, '.loopwork')
      fs.mkdirSync(stateDir, { recursive: true })
      const lockDir = path.join(stateDir, 'state.lock')
      fs.mkdirSync(lockDir)
      fs.writeFileSync(path.join(lockDir, 'pid'), process.pid.toString())

      const result = stateManager.acquireLock()
      expect(result).toBe(false)
    })

    test('removes stale lock and acquires new one', () => {
      // Create a lock with a non-existent PID
      const stateDir = path.join(tempDir, '.loopwork')
      fs.mkdirSync(stateDir, { recursive: true })
      const lockDir = path.join(stateDir, 'state.lock')
      fs.mkdirSync(lockDir)
      fs.writeFileSync(path.join(lockDir, 'pid'), '999999999') // Non-existent PID

      const result = stateManager.acquireLock()
      expect(result).toBe(true)

      // Verify new lock has current PID
      const pidFile = path.join(lockDir, 'pid')
      expect(fs.readFileSync(pidFile, 'utf-8')).toBe(process.pid.toString())
    })

    test('fails after max retry attempts', () => {
      const result = stateManager.acquireLock(4) // Already exceeded max retries
      expect(result).toBe(false)
    })
  })

  describe('releaseLock', () => {
    test('releases existing lock', () => {
      stateManager.acquireLock()
      const lockDir = path.join(tempDir, '.loopwork/state.lock')
      expect(fs.existsSync(lockDir)).toBe(true)

      stateManager.releaseLock()
      expect(fs.existsSync(lockDir)).toBe(false)
    })

    test('does nothing when no lock exists', () => {
      // Should not throw
      stateManager.releaseLock()
    })
  })

  describe('saveState', () => {
    test('saves state to file', () => {
      stateManager.saveState(123, 5)

      const stateFile = path.join(tempDir, '.loopwork/state.json')
      expect(fs.existsSync(stateFile)).toBe(true)

      const content = fs.readFileSync(stateFile, 'utf-8')
      expect(content.toString()).toContain('LAST_ISSUE=123')
      expect(content.toString()).toContain('LAST_ITERATION=5')
      expect(content.toString()).toContain('SESSION_ID=test-session-123')
      expect(content.toString()).toContain('SAVED_AT=')
    })

    test('overwrites previous state', () => {
      stateManager.saveState(100, 1)
      stateManager.saveState(200, 10)

      const stateFile = path.join(tempDir, '.loopwork/state.json')
      const content = fs.readFileSync(stateFile, 'utf-8')
      expect(content.toString()).toContain('LAST_ISSUE=200')
      expect(content.toString()).toContain('LAST_ITERATION=10')
      expect(content.toString()).not.toContain('LAST_ISSUE=100')
    })
  })

  describe('loadState', () => {
    test('returns null when no state file exists', () => {
      const result = stateManager.loadState()
      expect(result).toBeNull()
    })

    test('loads state from file', () => {
      stateManager.saveState(456, 20)

      const result = stateManager.loadState()
      expect(result).not.toBeNull()
      expect(result!.lastIssue).toBe(456)
      expect(result!.lastIteration).toBe(20)
    })

    test('returns null when state file is malformed', () => {
      const stateDir = path.join(tempDir, '.loopwork')
      fs.mkdirSync(stateDir, { recursive: true })
      const stateFile = path.join(stateDir, 'state.json')
      fs.writeFileSync(stateFile, 'invalid content without equals sign')

      const result = stateManager.loadState()
      expect(result).toBeNull()
    })

    test('handles missing optional fields', () => {
      const stateDir = path.join(tempDir, '.loopwork')
      fs.mkdirSync(stateDir, { recursive: true })
      const stateFile = path.join(stateDir, 'state.json')
      fs.writeFileSync(stateFile, 'LAST_ISSUE=789')

      const result = stateManager.loadState()
      expect(result).not.toBeNull()
      expect(result!.lastIssue).toBe(789)
      expect(result!.lastIteration).toBe(0)
      expect(result!.lastOutputDir).toBe('')
    })
  })

  describe('clearState', () => {
    test('removes state file', () => {
      stateManager.saveState(123, 5)
      const stateFile = path.join(tempDir, '.loopwork/state.json')
      expect(fs.existsSync(stateFile)).toBe(true)

      stateManager.clearState()
      expect(fs.existsSync(stateFile)).toBe(false)
    })

    test('does nothing when no state file exists', () => {
      // Should not throw
      stateManager.clearState()
    })
  })
})

describe('StateManager with namespace', () => {
  let tempDir: string

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'loopwork-ns-test-'))

    // Mock logger for all namespace tests too
    spyOn(utils.logger, 'info').mockImplementation(() => {})
    spyOn(utils.logger, 'success').mockImplementation(() => {})
    spyOn(utils.logger, 'warn').mockImplementation(() => {})
    spyOn(utils.logger, 'error').mockImplementation(() => {})
    spyOn(utils.logger, 'debug').mockImplementation(() => {})
  })

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true })
  })

  test('uses default namespace by default', () => {
    const config = {
      projectRoot: tempDir,
      outputDir: path.join(tempDir, 'output'),
      sessionId: 'test-session',
      namespace: 'default',
    } as Config

    const stateManager = new StateManager(config)
    expect(stateManager.getNamespace()).toBe('default')
    expect(stateManager.getStateFile()).toBe(path.join(tempDir, '.loopwork/state.json'))
    expect(stateManager.getLockFile()).toBe(path.join(tempDir, '.loopwork/state.lock'))
  })

  test('uses custom namespace in file paths', () => {
    const config = {
      projectRoot: tempDir,
      outputDir: path.join(tempDir, 'output'),
      sessionId: 'test-session',
      namespace: 'feature-a',
    } as Config

    const stateManager = new StateManager(config)
    expect(stateManager.getNamespace()).toBe('feature-a')
    expect(stateManager.getStateFile()).toBe(path.join(tempDir, '.loopwork/state-feature-a.json'))
    expect(stateManager.getLockFile()).toBe(path.join(tempDir, '.loopwork/state-feature-a.lock'))
  })

  test('multiple namespaces can coexist', () => {
    const configA = {
      projectRoot: tempDir,
      outputDir: path.join(tempDir, 'output-a'),
      sessionId: 'session-a',
      namespace: 'feature-a',
    } as Config

    const configB = {
      projectRoot: tempDir,
      outputDir: path.join(tempDir, 'output-b'),
      sessionId: 'session-b',
      namespace: 'feature-b',
    } as Config

    const managerA = new StateManager(configA)
    const managerB = new StateManager(configB)

    // Both should acquire locks independently
    expect(managerA.acquireLock()).toBe(true)
    expect(managerB.acquireLock()).toBe(true)

    // Save state independently
    managerA.saveState(100, 1)
    managerB.saveState(200, 2)

    // Load state independently
    const stateA = managerA.loadState()
    const stateB = managerB.loadState()

    expect(stateA!.lastIssue).toBe(100)
    expect(stateB!.lastIssue).toBe(200)

    // Clean up
    managerA.releaseLock()
    managerB.releaseLock()
  })

  test('saves namespace in state file', () => {
    const config = {
      projectRoot: tempDir,
      outputDir: path.join(tempDir, 'output'),
      sessionId: 'test-session',
      namespace: 'my-namespace',
    } as Config

    const stateManager = new StateManager(config)
    stateManager.saveState(123, 5)

    const stateFile = stateManager.getStateFile()
    const content = fs.readFileSync(stateFile, 'utf-8')
    expect(content.toString()).toContain('NAMESPACE=my-namespace')
  })

  test('namespace does not affect lock acquisition for different namespaces', () => {
    const defaultConfig = {
      projectRoot: tempDir,
      outputDir: path.join(tempDir, 'output'),
      sessionId: 'default-session',
      namespace: 'default',
    } as Config

    const customConfig = {
      projectRoot: tempDir,
      outputDir: path.join(tempDir, 'output-custom'),
      sessionId: 'custom-session',
      namespace: 'custom',
    } as Config

    const defaultManager = new StateManager(defaultConfig)
    const customManager = new StateManager(customConfig)

    // Acquire lock for default namespace
    expect(defaultManager.acquireLock()).toBe(true)

    // Custom namespace should still be able to acquire its own lock
    expect(customManager.acquireLock()).toBe(true)

    // Both locks should exist
    expect(fs.existsSync(defaultManager.getLockFile())).toBe(true)
    expect(fs.existsSync(customManager.getLockFile())).toBe(true)

    defaultManager.releaseLock()
    customManager.releaseLock()
  })
})
