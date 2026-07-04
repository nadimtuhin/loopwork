import { describe, test, expect, beforeEach, mock, afterEach } from 'bun:test'
import type { SandboxConfig, SandboxHandle } from '../src'

// Mock child_process
const mockSpawn = mock(() => ({
  pid: 12345,
  stdout: { on: mock(), pipe: mock() },
  stderr: { on: mock(), pipe: mock() },
  stdin: { write: mock(), end: mock() },
  on: mock((event: string, cb: Function) => {
    if (event === 'exit') {
       // Store callback to trigger it manually if needed
    }
  }),
  kill: mock(),
  exitCode: null
}))

const mockExec = mock((cmd: string, cb: Function) => {
  if (cmd.includes('docker --version')) {
    cb(null, { stdout: 'Docker version 20.10.0' })
  } else {
    cb(null, { stdout: '' })
  }
})

mock.module('child_process', () => {
  return {
    spawn: mockSpawn,
    exec: mockExec
  }
})

// Import source after mocking
const { LocalIsolationProvider, DockerIsolationProvider, defaultProvider } = await import('../src')

describe('LocalIsolationProvider', () => {
  let provider: InstanceType<typeof LocalIsolationProvider>

  beforeEach(() => {
    provider = new LocalIsolationProvider()
    mockSpawn.mockClear()
  })

  test('should have correct provider name', () => {
    expect(provider.name).toBe('local')
  })

  test('should always be available', async () => {
    const isAvailable = await provider.isAvailable()
    expect(isAvailable).toBe(true)
  })

  test('should acquire sandbox handle', async () => {
    const config: SandboxConfig = {
      memoryLimitMB: 512,
      niceness: 10,
      workingDirectory: '/tmp',
      env: { TEST: 'value' },
    }

    const handle = await provider.acquire(config)

    expect(handle).toBeDefined()
    expect(handle.provider).toBe('local')
    expect(handle.id).toMatch(/^local-\d+-[a-z0-9]+$/)
  })

  test('should spawn process using child_process.spawn', async () => {
    const handle = await provider.acquire({})
    const process = await handle.spawn('ls', ['-la'])

    expect(mockSpawn).toHaveBeenCalled()
    expect(mockSpawn).toHaveBeenCalledWith('ls', ['-la'], expect.any(Object))
    expect(process).toBeDefined()
    expect(process.pid).toBe(12345)
  })

  test('should handle should be active initially', async () => {
    const handle = await provider.acquire({})
    expect(handle.isActive()).toBe(true)
  })

  test('should handle should not be active after terminate', async () => {
    const handle = await provider.acquire({})
    await handle.terminate('SIGTERM')

    expect(handle.isActive()).toBe(false)
  })

  test('should release handle without errors', async () => {
    const handle = await provider.acquire({})
    await provider.release(handle)
  })

  test('should cleanup handle without errors', async () => {
    const handle = await provider.acquire({})
    await handle.cleanup()
  })

  test('should create unique handle IDs', async () => {
    const handle1 = await provider.acquire({})
    const handle2 = await provider.acquire({})

    expect(handle1.id).not.toBe(handle2.id)
  })
})

describe('DockerIsolationProvider', () => {
  let provider: InstanceType<typeof DockerIsolationProvider>

  beforeEach(() => {
    provider = new DockerIsolationProvider()
    mockSpawn.mockClear()
    mockExec.mockClear()
  })

  test('should have correct provider name', () => {
    expect(provider.name).toBe('docker')
  })

  describe('Docker availability', () => {
    test('should check if Docker is available', async () => {
      const isAvailable = await provider.isAvailable()
      expect(isAvailable).toBe(true)
      expect(mockExec).toHaveBeenCalled()
    })
  })

  describe('Docker acquisition', () => {
    // We can't easily mock isAvailable on a new instance inside the test if we mock the module globally
    // But we can verify it calls exec
  })

  test('should spawn process using docker run', async () => {
    const handle = await provider.acquire({
      memoryLimitMB: 512,
      env: { FOO: 'bar' }
    })
    
    const process = await handle.spawn('echo', ['hello'])

    expect(mockSpawn).toHaveBeenCalled()
    const callArgs = mockSpawn.mock.calls[0] as unknown as [string, string[], any]
    expect(callArgs[0]).toBe('docker')
    expect(callArgs[1]).toContain('run')
    expect(callArgs[1]).toContain('--name')
    expect(callArgs[1]).toContain('--memory=512m')
    expect(callArgs[1]).toContain('echo')
    expect(callArgs[1]).toContain('hello')
  })

  test('should use image from config options', async () => {
    const handle = await provider.acquire({
      options: { image: 'custom-image:latest' }
    })
    
    await handle.spawn('echo', ['hello'])

    const callArgs = mockSpawn.mock.calls[0] as unknown as [string, string[], any]
    expect(callArgs[1]).toContain('custom-image:latest')
  })

  test('should reject invalid handle on release', async () => {
    const mockHandle: SandboxHandle = {
      id: 'test-id',
      provider: 'local',
      pid: 123,
      isActive: () => false,
      terminate: async () => {},
      cleanup: async () => {},
      spawn: async () => ({} as any)
    }

    await expect(provider.release(mockHandle)).rejects.toThrow('Invalid handle provider')
  })
})

describe('defaultProvider', () => {
  test('should be instance of LocalIsolationProvider', () => {
    expect(defaultProvider).toBeInstanceOf(LocalIsolationProvider)
  })

  test('should have local name', () => {
    expect(defaultProvider.name).toBe('local')
  })
})
