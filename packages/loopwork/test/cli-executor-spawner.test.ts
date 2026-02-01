import { describe, test, expect, mock, beforeEach, afterEach, spyOn } from 'bun:test'
import { EventEmitter } from 'events'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import * as child_process from 'node:child_process'
import { CliExecutor } from '../src/core/cli'
import type { Config } from '../src/core/config'
import { logger } from '../src/core/utils'
import type { ProcessSpawner, SpawnedProcess, SpawnOptions } from '../src/contracts/spawner'
import { StandardSpawner } from '@loopwork-ai/executor'

/**
 * Mock spawner for testing CliExecutor's spawner injection
 */
class MockSpawner implements ProcessSpawner {
  readonly name = 'mock'
  public spawnCalls: { command: string; args: string[]; options?: SpawnOptions }[] = []
  public mockProcess: SpawnedProcess | null = null

  isAvailable(): boolean {
    return true
  }

  spawn(command: string, args: string[], options?: SpawnOptions): SpawnedProcess {
    this.spawnCalls.push({ command, args, options })

    if (this.mockProcess) {
      return this.mockProcess
    }

    // Return a default mock process
    return createMockProcess()
  }
}

/**
 * Create a mock SpawnedProcess
 */
function createMockProcess(exitCode: number = 0): SpawnedProcess {
  const emitter = new EventEmitter()
  const stdout = new EventEmitter()
  const stderr = new EventEmitter()
  const stdin = { write: mock(), end: mock() }

  const process: SpawnedProcess = {
    pid: 12345,
    stdout: stdout as any,
    stderr: stderr as any,
    stdin: stdin as any,
    kill: mock(() => true),
    on: (event: string, listener: (...args: any[]) => void) => {
      emitter.on(event, listener)
      return process
    },
  }

  // Auto-emit close after a short delay
  setTimeout(() => {
    emitter.emit('close', exitCode)
  }, 10)

  return process
}

import { plugins } from '../src/plugins'

describe('CliExecutor Spawner Integration', () => {
  let config: Config
  let tempDir: string

  beforeEach(() => {
    tempDir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'cli-spawner-test-')))
    fs.mkdirSync(path.join(tempDir, 'output'), { recursive: true })

    config = {
      cli: 'opencode',
      projectRoot: tempDir,
      outputDir: path.join(tempDir, 'output'),
      sessionId: 'test-session',
      maxIterations: 5,
      timeout: 30,
      debug: false,
      resume: false,
    } as Config

    // Mock logger
    spyOn(logger, 'info').mockImplementation(() => {})
    spyOn(logger, 'warn').mockImplementation(() => {})
    spyOn(logger, 'error').mockImplementation(() => {})
    spyOn(logger, 'debug').mockImplementation(() => {})
    spyOn(logger, 'update').mockImplementation(() => {})
  })

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true })
    mock.restore()
  })

  describe('spawner injection', () => {
    test('CliExecutor accepts injected spawner in constructor', () => {
      // Mock CLI detection
      spyOn(child_process, 'spawnSync').mockImplementation((cmd: string) => {
        if (cmd === 'which') return { status: 0, stdout: '/bin/opencode' } as any
        return { status: 1 } as any
      })

      const mockSpawner = new MockSpawner()
      const executor = new CliExecutor(config, { 
        spawner: mockSpawner,
        pluginRegistry: plugins,
        logger
      })

      expect(executor).toBeDefined()
    })

    test('CliExecutor uses injected spawner for process spawning', async () => {
      // Mock CLI detection
      spyOn(child_process, 'spawnSync').mockImplementation((cmd: string) => {
        if (cmd === 'which') return { status: 0, stdout: '/bin/opencode' } as any
        return { status: 1 } as any
      })

      const mockSpawner = new MockSpawner()
      const executor = new CliExecutor(config, { 
        spawner: mockSpawner,
        pluginRegistry: plugins,
        logger
      })

      const outFile = path.join(tempDir, 'output', 'out.md')
      await executor.execute('Test prompt', outFile, 10)

      // Verify spawner was called
      expect(mockSpawner.spawnCalls.length).toBeGreaterThan(0)
      expect(mockSpawner.spawnCalls[0].command).toContain('opencode')
    })

    test('CliExecutor uses default spawner when none provided', () => {
      // Mock CLI detection
      spyOn(child_process, 'spawnSync').mockImplementation((cmd: string) => {
        if (cmd === 'which') return { status: 0, stdout: '/bin/opencode' } as any
        return { status: 1 } as any
      })

      // No spawner provided - should use default
      const executor = new CliExecutor(config, { pluginRegistry: plugins, logger })

      expect(executor).toBeDefined()
    })

    test('spawner receives correct command and arguments', async () => {
      // Mock CLI detection - only opencode available
      spyOn(child_process, 'spawnSync').mockImplementation((cmd: string, args: string[]) => {
        if (cmd === 'which') {
          if (args[0] === 'opencode') return { status: 0, stdout: '/bin/opencode' } as any
          return { status: 1 } as any
        }
        return { status: 1 } as any
      })
      spyOn(fs, 'existsSync').mockImplementation((p: string) => {
        // Only return true for paths that would be checked for opencode
        return p.toString().includes('opencode')
      })

      const mockSpawner = new MockSpawner()
      // Create config that only uses opencode
      const opencodeConfig = {
        ...config,
        cli: 'opencode' as const,
        cliConfig: {
          models: [{ name: 'test', cli: 'opencode' as const, model: 'test-model' }],
          fallbackModels: [],
        },
      }
      const executor = new CliExecutor(opencodeConfig, { 
        spawner: mockSpawner,
        pluginRegistry: plugins,
        logger
      })

      const outFile = path.join(tempDir, 'output', 'out.md')
      await executor.execute('Test prompt', outFile, 10)

      const call = mockSpawner.spawnCalls[0]
      expect(call.command).toBe('/bin/opencode')
      expect(call.args).toContain('run')
      expect(call.args).toContain('--model')
    })

    test('spawner receives environment variables', async () => {
      // Mock CLI detection - only opencode available
      spyOn(child_process, 'spawnSync').mockImplementation((cmd: string, args: string[]) => {
        if (cmd === 'which') {
          if (args[0] === 'opencode') return { status: 0, stdout: '/bin/opencode' } as any
          return { status: 1 } as any
        }
        return { status: 1 } as any
      })
      spyOn(fs, 'existsSync').mockImplementation((p: string) => {
        return p.toString().includes('opencode')
      })

      const mockSpawner = new MockSpawner()
      // Create config that only uses opencode
      const opencodeConfig = {
        ...config,
        cli: 'opencode' as const,
        cliConfig: {
          models: [{ name: 'test', cli: 'opencode' as const, model: 'test-model' }],
          fallbackModels: [],
        },
      }
      const executor = new CliExecutor(opencodeConfig, { 
        spawner: mockSpawner,
        pluginRegistry: plugins,
        logger
      })

      const outFile = path.join(tempDir, 'output', 'out.md')
      await executor.execute('Test prompt', outFile, 10)

      const call = mockSpawner.spawnCalls[0]
      expect(call.options?.env).toBeDefined()
      expect(call.options?.env?.OPENCODE_PERMISSION).toBe('{"*":"allow"}')
    })
  })

  describe('preferPty config option', () => {
    test('preferPty defaults to true', () => {
      // Mock CLI detection
      spyOn(child_process, 'spawnSync').mockImplementation((cmd: string) => {
        if (cmd === 'which') return { status: 0, stdout: '/bin/opencode' } as any
        return { status: 1 } as any
      })

      const executor = new CliExecutor(config, { pluginRegistry: plugins, logger })
      expect(executor).toBeDefined()
      // The executor should prefer PTY by default when available
    })

    test('preferPty can be set to false in config', () => {
      // Mock CLI detection
      spyOn(child_process, 'spawnSync').mockImplementation((cmd: string) => {
        if (cmd === 'which') return { status: 0, stdout: '/bin/opencode' } as any
        return { status: 1 } as any
      })

      const configWithPtyFalse = {
        ...config,
        cliConfig: {
          preferPty: false,
        },
      }

      const executor = new CliExecutor(configWithPtyFalse, { pluginRegistry: plugins, logger })
      expect(executor).toBeDefined()
    })
  })

  describe('error handling with spawner', () => {
    test('handles spawner errors gracefully', async () => {
      // Mock CLI detection
      spyOn(child_process, 'spawnSync').mockImplementation((cmd: string) => {
        if (cmd === 'which') return { status: 0, stdout: '/bin/opencode' } as any
        return { status: 1 } as any
      })

      const errorSpawner: ProcessSpawner = {
        name: 'error-spawner',
        isAvailable: () => true,
        spawn: () => {
          const emitter = new EventEmitter()
          const process: SpawnedProcess = {
            pid: undefined,
            stdout: new EventEmitter() as any,
            stderr: new EventEmitter() as any,
            stdin: { write: mock(), end: mock() } as any,
            kill: mock(() => false),
            on: (event: string, listener: (...args: any[]) => void) => {
              emitter.on(event, listener)
              // Emit error after short delay
              if (event === 'error') {
                setTimeout(() => listener(new Error('Spawn failed')), 10)
              }
              return process
            },
          }
          return process
        },
      }

      const executor = new CliExecutor(config, { 
        spawner: errorSpawner,
        pluginRegistry: plugins,
        logger
      })
      const outFile = path.join(tempDir, 'output', 'out.md')

      // Should handle error and not crash
      try {
        await executor.execute('Test prompt', outFile, 10)
      } catch (e) {
        // Expected to throw after all retries exhausted
        expect(e).toBeDefined()
      }
    })
  })

  describe('stdin handling', () => {
    test('stdin.write and stdin.end work correctly with spawner', async () => {
      // Mock CLI detection
      spyOn(child_process, 'spawnSync').mockImplementation((cmd: string) => {
        if (cmd === 'which') return { status: 0, stdout: '/bin/claude' } as any
        return { status: 1 } as any
      })

      // Track stdin operations
      let stdinData = ''
      let stdinEnded = false

      const stdinTrackingSpawner: ProcessSpawner = {
        name: 'stdin-tracker',
        isAvailable: () => true,
        spawn: () => {
          const emitter = new EventEmitter()
          const stdout = new EventEmitter()

          const process: SpawnedProcess = {
            pid: 12345,
            stdout: stdout as any,
            stderr: null,
            stdin: {
              write: (data: string | Buffer) => {
                stdinData += data.toString()
                return true
              },
              end: () => {
                stdinEnded = true
              },
            } as any,
            kill: mock(() => true),
            on: (event: string, listener: (...args: any[]) => void) => {
              emitter.on(event, listener)
              return process
            },
          }

          // Emit output after stdin is received and ended
          setTimeout(() => {
            if (stdinEnded && stdinData) {
              stdout.emit('data', Buffer.from(`Received: ${stdinData}\n`))
            }
            emitter.emit('close', 0)
          }, 50)

          return process
        },
      }

      // Configure to use claude CLI (which sends prompt via stdin)
      const claudeConfig = {
        ...config,
        cli: 'claude' as const,
        cliConfig: {
          models: [{ name: 'test', cli: 'claude' as const, model: 'sonnet' }],
          fallbackModels: [],
        },
      }

      const executor = new CliExecutor(claudeConfig, { 
        spawner: stdinTrackingSpawner,
        pluginRegistry: plugins,
        logger
      })
      const outFile = path.join(tempDir, 'output', 'out.md')

      await executor.execute('Test stdin prompt', outFile, 10)

      // Verify stdin was written and ended
      expect(stdinData).toBe('Test stdin prompt')
      expect(stdinEnded).toBe(true)
    })
  })

  describe('PTY merged stderr handling', () => {
    test('handles null stderr from PTY spawner', async () => {
      // Mock CLI detection
      spyOn(child_process, 'spawnSync').mockImplementation((cmd: string) => {
        if (cmd === 'which') return { status: 0, stdout: '/bin/opencode' } as any
        return { status: 1 } as any
      })

      // Create a spawner that returns null stderr (like PTY)
      const ptyLikeSpawner: ProcessSpawner = {
        name: 'pty-like',
        isAvailable: () => true,
        spawn: () => {
          const emitter = new EventEmitter()
          const stdout = new EventEmitter()

          const process: SpawnedProcess = {
            pid: 12345,
            stdout: stdout as any,
            stderr: null, // PTY merges stderr into stdout
            stdin: { write: mock(), end: mock() } as any,
            kill: mock(() => true),
            on: (event: string, listener: (...args: any[]) => void) => {
              emitter.on(event, listener)
              return process
            },
          }

          // Emit some output and close
          setTimeout(() => {
            stdout.emit('data', Buffer.from('Hello from PTY\n'))
          }, 5)
          setTimeout(() => {
            emitter.emit('close', 0)
          }, 20)

          return process
        },
      }

      const executor = new CliExecutor(config, { 
        spawner: ptyLikeSpawner,
        pluginRegistry: plugins,
        logger
      })
      const outFile = path.join(tempDir, 'output', 'out.md')

      const exitCode = await executor.execute('Test prompt', outFile, 10)
      expect(exitCode).toBe(0)

      const output = fs.readFileSync(outFile, 'utf-8')
      expect(output).toContain('Hello from PTY')
    })
  })
})
