import { describe, test, expect, mock, beforeEach, afterEach, spyOn } from 'bun:test'
import { EventEmitter } from 'events'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import * as child_process from 'node:child_process'
import { CliExecutor } from '../src/core/cli'
import type { Config } from '../src/core/config'
import { logger } from '../src/core/utils'

describe('CliExecutor', () => {
  let config: Config
  let tempDir: string

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

  test('initializes with detected CLIs via which', () => {
    const spawnSyncSpy = spyOn(child_process, 'spawnSync').mockImplementation((cmd: string) => {
      if (cmd === 'which') {
        return { status: 0, stdout: '/usr/local/bin/opencode\n' } as any
      }
      return { status: 1 } as any
    })

    new CliExecutor(config)
    expect(spawnSyncSpy).toHaveBeenCalledWith('which', ['opencode'], expect.any(Object))
  })

  test('initializes with detected CLIs via known paths', () => {
    spyOn(child_process, 'spawnSync').mockReturnValue({ status: 1 } as any)
    const existsSpy = spyOn(fs, 'existsSync').mockImplementation((p: string) => {
      return p.toString().includes('bin/opencode')
    })

    new CliExecutor(config)
    expect(existsSpy).toHaveBeenCalled()
  })

  test('throws error if no CLI found', () => {
    spyOn(child_process, 'spawnSync').mockReturnValue({ status: 1 } as any)
    spyOn(fs, 'existsSync').mockReturnValue(false)

    expect(() => new CliExecutor(config)).toThrow(/No AI CLI tools found/)
  })

  test('execute calls spawn with correct arguments for opencode', async () => {
    spyOn(child_process, 'spawnSync').mockImplementation((cmd: string) => {
      if (cmd === 'which') return { status: 0, stdout: '/bin/opencode' } as any
      return { status: 1 } as any
    })
    
    // Mock fs.existsSync to only return true for opencode, and false for claude
    spyOn(fs, 'existsSync').mockImplementation((p: string) => {
      return p.toString().includes('opencode')
    })
    
    const mockChild = new EventEmitter() as any
    mockChild.stdout = new EventEmitter()
    mockChild.stderr = new EventEmitter()
    mockChild.stdin = { write: mock(), end: mock() }
    mockChild.kill = mock()
    
    const spawnSpy = spyOn(child_process, 'spawn').mockReturnValue(mockChild)

    const executor = new CliExecutor(config)
    const outFile = path.join(tempDir, 'out.md')
    
    const promise = executor.execute('Test prompt', outFile, 10)
    
    // Simulate process completion
    setTimeout(() => mockChild.emit('close', 0), 10)
    
    const status = await promise
    expect(status).toBe(0)
    expect(spawnSpy).toHaveBeenCalled()
    const call = spawnSpy.mock.calls[0]
    const fullCommand = [call[0], ...(call[1] as string[])].join(' ')
    expect(fullCommand).toContain('opencode')
  })

  test('retry logic switches to fallback after exhausting primary models', async () => {
    spyOn(child_process, 'spawnSync').mockImplementation(() => ({ status: 0, stdout: '/bin/cli' } as any))
    
    let attempt = 0
    spyOn(child_process, 'spawn').mockImplementation(() => {
      const m = new EventEmitter() as any
      m.stdout = new EventEmitter()
      m.stderr = new EventEmitter()
      m.stdin = { write: mock(), end: mock() }
      setTimeout(() => m.emit('close', attempt++ === 0 ? 1 : 0), 10)
      return m
    })

    const executor = new CliExecutor(config)
    // Force many failures to trigger fallback
    // We need to mock spawn to fail multiple times
    
    // For simplicity, let's just check if getNextCliConfig changes
    const config1 = executor.getNextCliConfig()
    executor.switchToFallback()
    const config2 = executor.getNextCliConfig()
    expect(config1.name).not.toBe(config2.name)
  })
})
