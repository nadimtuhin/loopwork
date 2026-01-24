import { describe, test, expect, mock, beforeEach } from 'bun:test'
import { EventEmitter } from 'events'

mock.module('child_process', () => ({
  spawn: mock(),
  spawnSync: mock(),
}))

mock.module('fs', () => {
  const originalFs = require('node:fs')
  return {
    default: {
      ...originalFs,
      existsSync: mock(),
      writeFileSync: mock(),
      readFileSync: mock(),
      createWriteStream: mock(),
      statSync: mock(() => ({ size: 1024 })),
    },
  }
})

mock.module('../src/core/utils', () => ({
  logger: {
    info: mock(),
    warn: mock(),
    error: mock(),
    debug: mock(),
    update: mock(),
  },
  StreamLogger: class {
    log = mock()
    flush = mock()
  },
  getTimestamp: () => '12:00:00 PM',
}))

import { CliExecutor } from '../src/core/cli'
import type { Config } from '../src/core/config'
import { logger } from '../src/core/utils'

describe('CliExecutor', () => {
  let config: Config
  const fsMock = (require('fs') as any).default
  const cpMock = require('child_process') as any

  beforeEach(() => {
    config = {
      cli: 'opencode',
      projectRoot: '/tmp',
      outputDir: '/tmp/output',
      sessionId: 'test-session',
      maxIterations: 5,
      timeout: 30,
      debug: false,
      resume: false,
    } as Config

    cpMock.spawnSync.mockReset()
    cpMock.spawn.mockReset()
    fsMock.existsSync.mockReset()
    fsMock.writeFileSync.mockReset()
    fsMock.readFileSync.mockReset()
    fsMock.createWriteStream.mockReset()
    
    Object.values(logger).forEach((m: any) => {
      if (m && m.mock) m.mockReset()
    })
  })

  test('initializes with detected CLIs via which', () => {
    cpMock.spawnSync.mockImplementation((cmd: string, args: string[]) => {
      if (cmd === 'which' && args[0] === 'opencode') {
        return { status: 0, stdout: '/usr/local/bin/opencode\n' }
      }
      return { status: 1 }
    })
    fsMock.existsSync.mockReturnValue(false)

    new CliExecutor(config)
    expect(cpMock.spawnSync).toHaveBeenCalledWith('which', ['opencode'], expect.any(Object))
    expect(logger.info).toHaveBeenCalledWith(expect.stringContaining('Available CLIs: opencode'))
  })

  test('initializes with detected CLIs via known paths', () => {
    cpMock.spawnSync.mockReturnValue({ status: 1 })
    fsMock.existsSync.mockImplementation((p: string) => {
      return p.includes('bin/opencode')
    })

    new CliExecutor(config)
    expect(logger.info).toHaveBeenCalledWith(expect.stringContaining('Available CLIs: opencode'))
  })

  test('throws error if no CLI found', () => {
    cpMock.spawnSync.mockReturnValue({ status: 1 })
    fsMock.existsSync.mockReturnValue(false)

    expect(() => new CliExecutor(config)).toThrow(/No AI CLI found/)
  })

  test('execute calls spawn with correct arguments for opencode', async () => {
    cpMock.spawnSync.mockImplementation((cmd: string, args: string[]) => {
      if (cmd === 'which' && args[0] === 'opencode') {
        return { status: 0, stdout: '/usr/local/bin/opencode' }
      }
      return { status: 1 }
    })
    
    const mockProcess = new EventEmitter() as any
    mockProcess.stdout = new EventEmitter()
    mockProcess.stderr = new EventEmitter()
    mockProcess.stdin = { write: mock(), end: mock() }
    mockProcess.kill = mock()
    
    cpMock.spawn.mockReturnValue(mockProcess)
    fsMock.createWriteStream.mockReturnValue({ write: mock(), end: mock() })
    fsMock.existsSync.mockImplementation((p: string) => p.includes('opencode'))
    fsMock.readFileSync.mockReturnValue('success')
    
    const executor = new CliExecutor(config)
    const executePromise = executor.execute('Hello', '/tmp/out.md', 10)
    
    setTimeout(() => {
      mockProcess.emit('close', 0)
    }, 10)
    
    const status = await executePromise
    expect(status).toBe(0)
    
    expect(cpMock.spawn).toHaveBeenCalledWith(
      '/usr/local/bin/opencode',
      ['run', '--model', 'google/antigravity-claude-sonnet-4-5', 'Hello'],
      expect.objectContaining({
        env: expect.objectContaining({ OPENCODE_PERMISSION: '{"*":"allow"}' })
      })
    )
    expect(logger.info).toHaveBeenCalledWith(expect.stringContaining('Executing: opencode run'))
  })

  test('uses displayName in logs', async () => {
    cpMock.spawnSync.mockImplementation((cmd: string, args: string[]) => {
      if (cmd === 'which' && args[0] === 'opencode') {
        return { status: 0, stdout: '/usr/local/bin/opencode' }
      }
      return { status: 1 }
    })
    
    const mockProcess = new EventEmitter() as any
    mockProcess.stdout = new EventEmitter()
    mockProcess.stderr = new EventEmitter()
    mockProcess.stdin = { write: mock(), end: mock() }
    
    cpMock.spawn.mockReturnValue(mockProcess)
    fsMock.createWriteStream.mockReturnValue({ write: mock(), end: mock() })
    fsMock.existsSync.mockImplementation((p: string) => p.includes('opencode'))
    
    const executor = new CliExecutor(config)
    const executePromise = executor.execute('Hello', '/tmp/out.md', 10)
    
    setTimeout(() => {
      mockProcess.emit('close', 0)
    }, 10)
    
    await executePromise
    expect(logger.info).toHaveBeenCalledWith(expect.stringContaining('[sonnet] Executing:'))
  })

  test('execute handles timeout', async () => {
    cpMock.spawnSync.mockReturnValue({ status: 0, stdout: '/usr/local/bin/opencode' })
    
    const mockProcess = new EventEmitter() as any
    mockProcess.stdout = new EventEmitter()
    mockProcess.stderr = new EventEmitter()
    mockProcess.stdin = { write: mock(), end: mock() }
    mockProcess.kill = mock((sig) => {
      if (sig === 'SIGTERM') {
        setTimeout(() => mockProcess.emit('close', null), 10)
      }
    })
    
    cpMock.spawn.mockReturnValue(mockProcess)
    fsMock.createWriteStream.mockReturnValue({ write: mock(), end: mock() })
    
    const executor = new CliExecutor(config)
    
    const executePromise = executor.execute('Hello', '/tmp/out.md', 0.1)
    
    const status = await executePromise
    expect(status).toBe(1)
    expect(logger.error).toHaveBeenCalledWith(expect.stringContaining('Timed out with'))
  })

  test('retry logic switches to fallback after exhausting primary models', async () => {
    cpMock.spawnSync.mockReturnValue({ status: 0, stdout: '/usr/local/bin/opencode' })
    
    cpMock.spawn.mockImplementation(() => {
      const p = new EventEmitter() as any
      p.stdout = new EventEmitter()
      p.stderr = new EventEmitter()
      p.stdin = { write: mock(), end: mock() }
      setTimeout(() => p.emit('close', 1), 5)
      return p
    })
    
    fsMock.createWriteStream.mockReturnValue({ write: mock(), end: mock() })
    fsMock.existsSync.mockReturnValue(true)
    fsMock.readFileSync.mockReturnValue('generic error')
    
    const executor = new CliExecutor(config)
    await executor.execute('Fail me', '/tmp/out.md', 1)
    
    expect(logger.warn).toHaveBeenCalledWith('Switching to fallback models')
  })

  test('rate limit detection triggers wait and retry', async () => {
    cpMock.spawnSync.mockReturnValue({ status: 0, stdout: '/usr/local/bin/opencode' })
    
    let attempt = 0
    cpMock.spawn.mockImplementation(() => {
      attempt++
      const p = new EventEmitter() as any
      p.stdout = new EventEmitter()
      p.stderr = new EventEmitter()
      p.stdin = { write: mock(), end: mock() }
      setTimeout(() => p.emit('close', attempt === 1 ? 1 : 0), 5)
      return p
    })
    
    fsMock.createWriteStream.mockReturnValue({ write: mock(), end: mock() })
    fsMock.existsSync.mockReturnValue(true)
    
    fsMock.readFileSync
      .mockReturnValueOnce('Error: rate limit exceeded (429)')
      .mockReturnValueOnce('Success output')

    const executor = new CliExecutor(config)
    
    const originalSetTimeout = global.setTimeout
    global.setTimeout = ((fn: any, ms: number) => {
      if (ms === 30000) return originalSetTimeout(fn, 1)
      return originalSetTimeout(fn, ms)
    }) as any

    try {
      const status = await executor.execute('Rate limited', '/tmp/out.md', 1)
      expect(status).toBe(0)
      expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('Rate limited on'))
    } finally {
      global.setTimeout = originalSetTimeout
    }
  })
})

