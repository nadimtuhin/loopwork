import { describe, test, expect, beforeEach, afterEach, mock, spyOn } from 'bun:test'
import path from 'path'
import fs from 'fs'
import os from 'os'

import { PtySpawner, isPtyAvailable } from '../../src/core/spawners/pty-spawner'
import { isPtyFunctional } from '../../src/core/spawners'
import type { ProcessSpawner } from '../../src/contracts/spawner'

describe('PtySpawner', () => {
  let spawner: ProcessSpawner
  let tempDir: string

  beforeEach(() => {
    tempDir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'pty-spawner-test-')))
  })

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true })
    mock.restore()
  })

  describe('isPtyAvailable', () => {
    test('returns a boolean', () => {
      const result = isPtyAvailable()
      expect(typeof result).toBe('boolean')
    })
  })

  describe('when node-pty is functional', () => {
    beforeEach(() => {
      // Only run these tests if PTY actually works (not just module available)
      if (!isPtyFunctional()) {
        return
      }
      spawner = new PtySpawner()
    })

    test('isAvailable returns true', () => {
      if (!isPtyFunctional()) return
      expect(spawner.isAvailable()).toBe(true)
    })

    test('name returns "pty"', () => {
      if (!isPtyFunctional()) return
      expect(spawner.name).toBe('pty')
    })

    test('spawn returns a process with stdout stream', () => {
      if (!isPtyFunctional()) return
      const proc = spawner.spawn('echo', ['hello'])
      expect(proc.stdout).not.toBeNull()
      proc.kill()
    })

    test('spawn returns a process with null stderr (merged with stdout)', () => {
      if (!isPtyFunctional()) return
      const proc = spawner.spawn('echo', ['hello'])
      // PTY merges stderr into stdout
      expect(proc.stderr).toBeNull()
      proc.kill()
    })

    test('spawn returns a process with stdin stream', () => {
      if (!isPtyFunctional()) return
      const proc = spawner.spawn('cat', [])
      expect(proc.stdin).not.toBeNull()
      proc.kill()
    })

    test('process has a valid pid', () => {
      if (!isPtyFunctional()) return
      const proc = spawner.spawn('echo', ['hello'])
      expect(proc.pid).toBeDefined()
      expect(typeof proc.pid).toBe('number')
      proc.kill()
    })

    test('captures stdout output correctly', async () => {
      if (!isPtyFunctional()) return
      const proc = spawner.spawn('echo', ['hello world'])

      let output = ''
      proc.stdout?.on('data', (data: Buffer | string) => {
        output += data.toString()
      })

      await new Promise<void>((resolve) => {
        proc.on('close', () => resolve())
        proc.on('exit', () => resolve())
      })

      // PTY output includes terminal control characters, so just check content is there
      expect(output).toContain('hello world')
    })

    test('stderr output appears in stdout (PTY behavior)', async () => {
      if (!isPtyFunctional()) return
      // Use sh -c to redirect to stderr
      const proc = spawner.spawn('sh', ['-c', 'echo "error message" >&2'])

      let output = ''
      proc.stdout?.on('data', (data: Buffer | string) => {
        output += data.toString()
      })

      await new Promise<void>((resolve) => {
        proc.on('close', () => resolve())
        proc.on('exit', () => resolve())
      })

      // In PTY mode, stderr is merged into stdout
      expect(output).toContain('error message')
    })

    test('stdin can write to process', async () => {
      if (!isPtyFunctional()) return
      const proc = spawner.spawn('cat', [])

      let output = ''
      proc.stdout?.on('data', (data: Buffer | string) => {
        output += data.toString()
      })

      // Write to stdin - PTY echoes input
      proc.stdin?.write('test input\n')

      // Give it time to process
      await new Promise(r => setTimeout(r, 100))

      // Send EOF (Ctrl+D in terminal)
      proc.stdin?.write('\x04')

      await new Promise<void>((resolve) => {
        proc.on('close', () => resolve())
        proc.on('exit', () => resolve())
      })

      expect(output).toContain('test input')
    })

    test('emits exit event with exit code', async () => {
      if (!isPtyFunctional()) return
      const proc = spawner.spawn('sh', ['-c', 'exit 42'])

      const code = await new Promise<number | null>((resolve) => {
        proc.on('exit', (code) => resolve(code))
      })

      expect(code).toBe(42)
    })

    test('emits exit event with code 0 on success', async () => {
      if (!isPtyFunctional()) return
      const proc = spawner.spawn('echo', ['success'])

      const code = await new Promise<number | null>((resolve) => {
        proc.on('exit', (code) => resolve(code))
      })

      expect(code).toBe(0)
    })

    test('kill terminates the process', async () => {
      if (!isPtyFunctional()) return
      const proc = spawner.spawn('sleep', ['60'])

      // Give process time to start
      await new Promise(r => setTimeout(r, 50))

      const killed = proc.kill('SIGTERM')
      expect(killed).toBe(true)

      await new Promise<void>((resolve) => {
        proc.on('close', () => resolve())
        proc.on('exit', () => resolve())
      })

      // Process was killed
      expect(true).toBe(true)
    })

    test('respects cwd option', async () => {
      if (!isPtyFunctional()) return
      const proc = spawner.spawn('pwd', [], { cwd: tempDir })

      let output = ''
      proc.stdout?.on('data', (data: Buffer | string) => {
        output += data.toString()
      })

      await new Promise<void>((resolve) => {
        proc.on('close', () => resolve())
        proc.on('exit', () => resolve())
      })

      expect(output).toContain(tempDir)
    })

    test('respects env option', async () => {
      if (!isPtyFunctional()) return
      const proc = spawner.spawn('sh', ['-c', 'echo $TEST_VAR'], {
        env: { ...process.env, TEST_VAR: 'pty_custom_value' }
      })

      let output = ''
      proc.stdout?.on('data', (data: Buffer | string) => {
        output += data.toString()
      })

      await new Promise<void>((resolve) => {
        proc.on('close', () => resolve())
        proc.on('exit', () => resolve())
      })

      expect(output).toContain('pty_custom_value')
    })

    test('respects cols and rows options', () => {
      if (!isPtyFunctional()) return
      // This mainly tests that the options are passed without error
      const proc = spawner.spawn('echo', ['test'], { cols: 120, rows: 40 })
      expect(proc.pid).toBeDefined()
      proc.kill()
    })

    test('stdin.end() properly sends EOF to PTY', async () => {
      if (!isPtyFunctional()) return
      // This tests the critical EOF handling fix
      // When stdin.end() is called, the PTY should receive EOF
      const proc = spawner.spawn('cat', [])

      let output = ''
      proc.stdout?.on('data', (data: Buffer | string) => {
        output += data.toString()
      })

      // Write input and then end (simulating how CliExecutor works)
      proc.stdin?.write('test-eof-input\n')
      proc.stdin?.end()  // This should trigger EOF to be sent to PTY

      const code = await new Promise<number | null>((resolve) => {
        proc.on('close', (c) => resolve(c))
        proc.on('exit', (c) => resolve(c))
      })

      // cat should exit with 0 when it receives EOF
      expect(code).toBe(0)
      expect(output).toContain('test-eof-input')
    })
  })

  describe('when node-pty is not available', () => {
    test('constructor throws if forceRequired is true and PTY unavailable', () => {
      if (isPtyAvailable()) {
        // Can't test this scenario if PTY is actually available
        return
      }

      expect(() => new PtySpawner({ forceRequired: true })).toThrow(/node-pty/)
    })
  })
})
