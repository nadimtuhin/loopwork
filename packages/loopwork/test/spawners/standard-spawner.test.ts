import { describe, test, expect, beforeEach, afterEach, mock } from 'bun:test'
import path from 'path'
import fs from 'fs'
import os from 'os'

// Import will fail until we implement - that's TDD!
import { StandardSpawner } from '../../src/core/spawners/standard-spawner'
import type { ProcessSpawner, SpawnedProcess } from '../../src/contracts/spawner'

describe('StandardSpawner', () => {
  let spawner: ProcessSpawner
  let tempDir: string

  beforeEach(() => {
    spawner = new StandardSpawner()
    tempDir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'std-spawner-test-')))
  })

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true })
    mock.restore()
  })

  describe('isAvailable', () => {
    test('returns true (standard spawn is always available)', () => {
      expect(spawner.isAvailable()).toBe(true)
    })
  })

  describe('name', () => {
    test('returns "standard"', () => {
      expect(spawner.name).toBe('standard')
    })
  })

  describe('spawn', () => {
    test('returns a process with stdout stream', () => {
      const proc = spawner.spawn('echo', ['hello'])
      expect(proc.stdout).not.toBeNull()
      proc.kill()
    })

    test('returns a process with stderr stream', () => {
      const proc = spawner.spawn('echo', ['hello'])
      expect(proc.stderr).not.toBeNull()
      proc.kill()
    })

    test('returns a process with stdin stream', () => {
      const proc = spawner.spawn('cat', [])
      expect(proc.stdin).not.toBeNull()
      proc.kill()
    })

    test('process has a valid pid', () => {
      const proc = spawner.spawn('echo', ['hello'])
      expect(proc.pid).toBeDefined()
      expect(typeof proc.pid).toBe('number')
      proc.kill()
    })

    test('captures stdout output correctly', async () => {
      const proc = spawner.spawn('echo', ['hello world'])

      let output = ''
      proc.stdout?.on('data', (data: Buffer) => {
        output += data.toString()
      })

      await new Promise<void>((resolve) => {
        proc.on('close', () => resolve())
      })

      expect(output.trim()).toBe('hello world')
    })

    test('captures stderr output correctly', async () => {
      // Use sh -c to redirect to stderr
      const proc = spawner.spawn('sh', ['-c', 'echo "error message" >&2'])

      let output = ''
      proc.stderr?.on('data', (data: Buffer) => {
        output += data.toString()
      })

      await new Promise<void>((resolve) => {
        proc.on('close', () => resolve())
      })

      expect(output.trim()).toBe('error message')
    })

    test('stdin can write to process', async () => {
      const proc = spawner.spawn('cat', [])

      let output = ''
      proc.stdout?.on('data', (data: Buffer) => {
        output += data.toString()
      })

      proc.stdin?.write('test input\n')
      proc.stdin?.end()

      await new Promise<void>((resolve) => {
        proc.on('close', () => resolve())
      })

      expect(output.trim()).toBe('test input')
    })

    test('emits close event with exit code', async () => {
      const proc = spawner.spawn('sh', ['-c', 'exit 42'])

      const code = await new Promise<number | null>((resolve) => {
        proc.on('close', (code) => resolve(code))
      })

      expect(code).toBe(42)
    })

    test('emits close event with code 0 on success', async () => {
      const proc = spawner.spawn('echo', ['success'])

      const code = await new Promise<number | null>((resolve) => {
        proc.on('close', (code) => resolve(code))
      })

      expect(code).toBe(0)
    })

    test('handles invalid command gracefully', async () => {
      // Different runtimes handle this differently:
      // - Node.js: emits 'error' event with ENOENT
      // - Bun: throws synchronously
      try {
        const proc = spawner.spawn('/nonexistent/command/that/does/not/exist', [])

        const error = await new Promise<Error>((resolve, reject) => {
          proc.on('error', (err) => resolve(err))
          // Timeout in case error is not emitted
          setTimeout(() => reject(new Error('timeout')), 1000)
        })

        expect(error).toBeInstanceOf(Error)
      } catch (err) {
        // Bun throws synchronously - this is acceptable behavior
        expect(err).toBeInstanceOf(Error)
      }
    })

    test('kill terminates the process', async () => {
      const proc = spawner.spawn('sleep', ['60'])

      // Give process time to start
      await new Promise(r => setTimeout(r, 50))

      const killed = proc.kill('SIGTERM')
      expect(killed).toBe(true)

      const code = await new Promise<number | null>((resolve) => {
        proc.on('close', (code) => resolve(code))
      })

      // Process was killed, so code should be null or non-zero
      expect(code).not.toBe(0)
    })

    test('respects cwd option', async () => {
      const proc = spawner.spawn('pwd', [], { cwd: tempDir })

      let output = ''
      proc.stdout?.on('data', (data: Buffer) => {
        output += data.toString()
      })

      await new Promise<void>((resolve) => {
        proc.on('close', () => resolve())
      })

      expect(output.trim()).toBe(tempDir)
    })

    test('respects env option', async () => {
      const proc = spawner.spawn('sh', ['-c', 'echo $TEST_VAR'], {
        env: { ...process.env, TEST_VAR: 'custom_value' }
      })

      let output = ''
      proc.stdout?.on('data', (data: Buffer) => {
        output += data.toString()
      })

      await new Promise<void>((resolve) => {
        proc.on('close', () => resolve())
      })

      expect(output.trim()).toBe('custom_value')
    })
  })
})
