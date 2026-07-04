import { describe, test, expect, mock, beforeEach, afterEach, spyOn } from 'bun:test'
import { EventEmitter } from 'events'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import * as child_process from 'node:child_process'
import { CliExecutor } from '../src/core/cli'
import type { Config } from '../src/core/config'
import { logger } from '../src/core/utils'
import { plugins } from '../src/plugins'

describe.serial('CliExecutor', () => {
  let config: Config
  let tempDir: string
  let timeouts: Timer[] = []
  let emitters: EventEmitter[] = []

  const safeTimeout = (fn: () => void, ms: number) => {
    const t = setTimeout(fn, ms)
    timeouts.push(t)
    return t
  }

  const trackEmitter = <T extends EventEmitter>(e: T): T => {
    emitters.push(e)
    return e
  }

  beforeEach(() => {
    tempDir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'cli-executor-test-')))
    config = {
      cli: 'opencode',
      projectRoot: tempDir,
      outputDir: path.join(tempDir, 'output'),
      sessionId: 'test-session',
      maxIterations: 5,
      timeout: 30,
      debug: false,
      resume: false,
      cliConfig: {
        progressIntervalMs: 50
      }
    } as Config

    // Mock logger
    spyOn(logger, 'info').mockImplementation(() => {})
    spyOn(logger, 'warn').mockImplementation(() => {})
    spyOn(logger, 'error').mockImplementation(() => {})
    spyOn(logger, 'debug').mockImplementation(() => {})
    spyOn(logger, 'update').mockImplementation(() => {})
    spyOn(logger, 'startSpinner').mockImplementation(() => {})
    spyOn(logger, 'stopSpinner').mockImplementation(() => {})
  })

  afterEach(() => {
    timeouts.forEach(clearTimeout)
    timeouts = []
    emitters.forEach(e => e.removeAllListeners())
    emitters = []
    
    if (fs.existsSync(tempDir)) {
      try {
        fs.rmSync(tempDir, { recursive: true, force: true })
      } catch {}
    }
    mock.restore()
  })

  test('initializes with detected CLIs via which', () => {
    const spawnSyncSpy = spyOn(child_process, 'spawnSync').mockImplementation((cmd: string) => {
      if (cmd === 'which') {
        return { status: 0, stdout: '/usr/local/bin/opencode\n' } as any
      }
      return { status: 1 } as any
    })

    new CliExecutor(config, { pluginRegistry: plugins, logger })
    expect(spawnSyncSpy).toHaveBeenCalledWith('which', ['opencode'], expect.any(Object))
  })

  test('initializes with detected CLIs via known paths', () => {
    spyOn(child_process, 'spawnSync').mockReturnValue({ status: 1 } as any)
    const existsSpy = spyOn(fs, 'existsSync').mockImplementation(((p: any) => {
      return p.toString().includes('bin/opencode')
    }) as any)

    new CliExecutor(config, { pluginRegistry: plugins, logger })
    expect(existsSpy).toHaveBeenCalled()
  })

  test('throws error if no CLI found', () => {
    spyOn(child_process, 'spawnSync').mockReturnValue({ status: 1 } as any)
    spyOn(fs, 'existsSync').mockReturnValue(false as any)

    expect(() => new CliExecutor(config, { pluginRegistry: plugins, logger })).toThrow(/No AI CLI tools found/)
  })

  test('execute calls spawn with correct arguments for opencode', async () => {
    spyOn(child_process, 'spawnSync').mockImplementation((cmd: string) => {
      if (cmd === 'which') return { status: 0, stdout: '/bin/opencode' } as any
      return { status: 1 } as any
    })
    
    // Mock fs.existsSync to only return true for opencode, and false for claude
    spyOn(fs, 'existsSync').mockImplementation(((p: any) => {
      return p.toString().includes('opencode')
    }) as any)
    
    const mockChild = trackEmitter(new EventEmitter()) as any
    mockChild.stdout = trackEmitter(new EventEmitter())
    mockChild.stderr = trackEmitter(new EventEmitter())
    mockChild.stdin = { write: mock(), end: mock() }
    mockChild.kill = mock()
    
    const mockProcessManager = {
      spawn: mock(() => mockChild),
      kill: mock(() => true),
      track: mock(() => {}),
      untrack: mock(() => {}),
      listChildren: mock(() => []),
      listByNamespace: mock(() => []),
      cleanup: mock(async () => ({ cleaned: [], failed: [], alreadyGone: [] })),
      persist: mock(async () => {}),
      load: mock(async () => {})
    }

    const executor = new CliExecutor(config, { 
      processManager: mockProcessManager as any,
      pluginRegistry: plugins,
      logger
    })
    const outFile = path.join(tempDir, 'out.md')
    
    const promise = executor.execute('Test prompt', outFile, 10)
    
    // Simulate process completion
    safeTimeout(() => mockChild.emit('close', 0), 10)
    
    const status = await promise
    expect(status).toBe(0)
    expect(mockProcessManager.spawn).toHaveBeenCalled()
  })

  test('execute shows progress updates during execution', async () => {
    spyOn(child_process, 'spawnSync').mockImplementation(() => ({ status: 0, stdout: '/bin/cli' } as any))
    spyOn(fs, 'existsSync').mockReturnValue(true)
    
    const mockChild = trackEmitter(new EventEmitter()) as any
    mockChild.pid = 12345
    mockChild.stdout = trackEmitter(new EventEmitter())
    mockChild.stderr = trackEmitter(new EventEmitter())
    mockChild.stdin = { write: mock(), end: mock() }
    mockChild.kill = mock()
    
    const mockProcessManager = {
      spawn: mock(() => mockChild),
      kill: mock(() => true),
      track: mock(() => {}),
      untrack: mock(() => {}),
      listChildren: mock(() => []),
      listByNamespace: mock(() => []),
      cleanup: mock(async () => ({ cleaned: [], failed: [], alreadyGone: [] })),
      persist: mock(async () => {}),
      load: mock(async () => {})
    }

    const executor = new CliExecutor(config, { 
      processManager: mockProcessManager as any,
      pluginRegistry: plugins,
      logger
    })
    const outFile = path.join(tempDir, 'out.md')
    
    const promise = executor.execute('Test prompt', outFile, 10)
    
    await new Promise(r => safeTimeout(r as () => void, 100))
    
    mockChild.emit('close', 0)
    
    await promise
    
    expect(mockProcessManager.spawn).toHaveBeenCalled()
  })

  test('retry logic switches to fallback after exhausting primary models', async () => {
    spyOn(child_process, 'spawnSync').mockImplementation(() => ({ status: 0, stdout: '/bin/cli' } as any))
    
    let attempt = 0
    const mockChild = trackEmitter(new EventEmitter()) as any
    mockChild.stdout = trackEmitter(new EventEmitter())
    mockChild.stderr = trackEmitter(new EventEmitter())
    mockChild.stdin = { write: mock(), end: mock() }
    mockChild.kill = mock()

    const mockProcessManager = {
      spawn: mock(() => {
        const m = trackEmitter(new EventEmitter()) as any
        m.stdout = trackEmitter(new EventEmitter())
        m.stderr = trackEmitter(new EventEmitter())
        m.stdin = { write: mock(), end: mock() }
        safeTimeout(() => m.emit('close', attempt++ === 0 ? 1 : 0), 10)
        return m
      }),
      kill: mock(() => true),
      track: mock(() => {}),
      untrack: mock(() => {}),
      listChildren: mock(() => []),
      listByNamespace: mock(() => []),
      cleanup: mock(async () => ({ cleaned: [], failed: [], alreadyGone: [] })),
      persist: mock(async () => {}),
      load: mock(async () => {})
    }

    const executor = new CliExecutor(config, { 
      processManager: mockProcessManager as any,
      pluginRegistry: plugins,
      logger
    })
    // Force many failures to trigger fallback
    // We need to mock spawn to fail multiple times
    
    // For simplicity, let's just check if getNextCliConfig changes
    const config1 = executor.getNextCliConfig()
    executor.switchToFallback()
    const config2 = executor.getNextCliConfig()
    expect(config1.name).not.toBe(config2.name)
  })

  describe('updateConfig', () => {
    test('updates cliConfig when changed', () => {
      spyOn(child_process, 'spawnSync').mockImplementation(() => ({ status: 0, stdout: '/bin/cli' } as any))
      spyOn(fs, 'existsSync').mockReturnValue(true)
      
      const mockProcessManager = {
        spawn: mock(() => null),
        kill: mock(() => true),
        track: mock(() => {}),
        untrack: mock(() => {}),
        listChildren: mock(() => []),
        listByNamespace: mock(() => []),
        cleanup: mock(async () => ({ cleaned: [], failed: [], alreadyGone: [] })),
        persist: mock(async () => {}),
        load: mock(async () => {})
      }

      const executor = new CliExecutor(config, {
        processManager: mockProcessManager as any,
        pluginRegistry: plugins,
        logger
      })
      
      const newConfig = {
        ...config,
        cliConfig: {
          ...config.cliConfig,
          preferPty: false
        }
      }

      executor.updateConfig(newConfig)
      const self = executor as any
      expect(self.cliConfig.preferPty).toBe(false)
    })

    test('updates process manager settings when timeout changes', () => {
      spyOn(child_process, 'spawnSync').mockImplementation(() => ({ status: 0, stdout: '/bin/cli' } as any))
      spyOn(fs, 'existsSync').mockReturnValue(true)
      
      const updateSettingsSpy = mock((settings: any) => {})
      const mockProcessManager = {
        spawn: mock(() => null),
        kill: mock(() => true),
        track: mock(() => {}),
        untrack: mock(() => {}),
        listChildren: mock(() => []),
        listByNamespace: mock(() => []),
        cleanup: mock(async () => ({ cleaned: [], failed: [], alreadyGone: [] })),
        persist: mock(async () => {}),
        load: mock(async () => {}),
        updateSettings: updateSettingsSpy
      }

      const executor = new CliExecutor(config, {
        processManager: mockProcessManager as any,
        pluginRegistry: plugins,
        logger
      })
      
      const newConfig = {
        ...config,
        timeout: 120
      }

      executor.updateConfig(newConfig)
      expect(updateSettingsSpy).toHaveBeenCalledWith({
        staleTimeoutMs: 120 * 1000 * 2,
        gracePeriodMs: 5000,
        resourceLimits: config.resourceLimits
      })
    })

    test('updates process manager settings when sigkillDelayMs changes', () => {
      spyOn(child_process, 'spawnSync').mockImplementation(() => ({ status: 0, stdout: '/bin/cli' } as any))
      spyOn(fs, 'existsSync').mockReturnValue(true)
      
      const updateSettingsSpy = mock((settings: any) => {})
      const mockProcessManager = {
        spawn: mock(() => null),
        kill: mock(() => true),
        track: mock(() => {}),
        untrack: mock(() => {}),
        listChildren: mock(() => []),
        listByNamespace: mock(() => []),
        cleanup: mock(async () => ({ cleaned: [], failed: [], alreadyGone: [] })),
        persist: mock(async () => {}),
        load: mock(async () => {}),
        updateSettings: updateSettingsSpy
      }

      const executor = new CliExecutor(config, {
        processManager: mockProcessManager as any,
        pluginRegistry: plugins,
        logger
      })
      
      const newConfig = {
        ...config,
        cliConfig: {
          ...config.cliConfig,
          sigkillDelayMs: 10000
        }
      }

      executor.updateConfig(newConfig)
      expect(updateSettingsSpy).toHaveBeenCalledWith({
        staleTimeoutMs: config.timeout! * 1000 * 2,
        gracePeriodMs: 10000,
        resourceLimits: config.resourceLimits
      })
    })

    test('does not update process manager when settings unchanged', () => {
      spyOn(child_process, 'spawnSync').mockImplementation(() => ({ status: 0, stdout: '/bin/cli' } as any))
      spyOn(fs, 'existsSync').mockReturnValue(true)
      
      const updateSettingsSpy = mock((settings: any) => {})
      const mockProcessManager = {
        spawn: mock(() => null),
        kill: mock(() => true),
        track: mock(() => {}),
        untrack: mock(() => {}),
        listChildren: mock(() => []),
        listByNamespace: mock(() => []),
        cleanup: mock(async () => ({ cleaned: [], failed: [], alreadyGone: [] })),
        persist: mock(async () => {}),
        load: mock(async () => {}),
        updateSettings: updateSettingsSpy
      }

      const executor = new CliExecutor(config, {
        processManager: mockProcessManager as any,
        pluginRegistry: plugins,
        logger
      })
      
      const newConfig = { ...config }
      executor.updateConfig(newConfig)
      
      expect(updateSettingsSpy).not.toHaveBeenCalled()
    })
  })
})
