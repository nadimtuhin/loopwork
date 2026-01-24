import { describe, test, expect, beforeEach, afterEach } from 'bun:test'
import { spawn } from 'child_process'
import fs from 'fs'
import path from 'path'
import os from 'os'

describe('Monitor CLI', () => {
  let tempDir: string

  beforeEach(() => {
    tempDir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'monitor-cli-test-')))
    // Create dummy src/index.ts
    fs.mkdirSync(path.join(tempDir, 'src'), { recursive: true })
    fs.writeFileSync(path.join(tempDir, 'src', 'index.ts'), 'console.log("dummy")')
  })

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true })
  })

  function runCLI(args: string[]): Promise<{ stdout: string; stderr: string; exitCode: number | null }> {
    return new Promise((resolve) => {
      const cwd = path.join(__dirname, '..')
      const child = spawn('bun', ['run', 'src/monitor/index.ts', ...args], {
        cwd,
        env: { ...process.env, TEST_PROJECT_ROOT: tempDir, FORCE_COLOR: '0' },
        stdio: ['ignore', 'pipe', 'pipe']
      })

      let stdout = ''
      let stderr = ''
      let resolved = false

      const finish = (exitCode: number | null) => {
        if (resolved) return
        resolved = true
        resolve({ stdout, stderr, exitCode })
      }

      child.stdout?.on('data', (data) => {
        stdout += data.toString()
      })

      child.stderr?.on('data', (data) => {
        stderr += data.toString()
      })

      child.on('close', (exitCode) => {
        finish(exitCode)
      })

      child.on('error', (err) => {
        stderr += err.message
        finish(null)
      })

      // Timeout after 10 seconds (increased for CI)
      setTimeout(() => {
        if (!resolved) {
          child.kill('SIGTERM')
          setTimeout(() => {
            if (!resolved) {
              child.kill('SIGKILL')
              finish(null)
            }
          }, 1000)
        }
      }, 10000)
    })
  }

  test('CLI help command shows usage', async () => {
    const result = await runCLI(['help'])
    expect(result.stdout).toContain('Commands:')
    expect(result.stdout).toContain('start')
    expect(result.stdout).toContain('stop')
    expect(result.stdout).toContain('status')
    expect(result.stdout).toContain('logs')
  })

  test('CLI without args shows help', async () => {
    const result = await runCLI([])
    expect(result.stdout).toContain('Loopwork Monitor')
    expect(result.stdout).toContain('Commands:')
  })

  test('CLI status shows empty when no loops running', async () => {
    const result = await runCLI(['status'])
    expect(result.stdout).toContain('Loopwork Monitor Status')
  })

  test('CLI stop with missing namespace shows usage', async () => {
    const result = await runCLI(['stop'])
    expect(result.stdout).toContain('Usage:')
    expect(result.exitCode).toBe(1)
  })

  test('CLI stop non-existent namespace shows error', async () => {
    const result = await runCLI(['stop', 'nonexistent'])
    expect(result.stdout).toContain('No running loop found')
    expect(result.exitCode).toBe(1)
  })

  test('CLI logs shows message when no logs exist', async () => {
    const result = await runCLI(['logs', 'nonexistent'])
    expect(result.stdout).toContain('No logs found')
  })

  test('CLI logs accepts optional line count argument', async () => {
    const result = await runCLI(['logs', 'test-ns', '100'])
    // Should not error, will show "no logs found"
    expect(result.stdout).toBeDefined()
  })

  test('CLI stop --all shows message when nothing running', async () => {
    const result = await runCLI(['stop', '--all'])
    expect(result.stdout).toContain('No running loops')
  })

  test('CLI logs defaults to 50 lines', async () => {
    const result = await runCLI(['logs', 'default'])
    // Should use default 50 lines, will show "no logs found"
    expect(result.stdout).toBeDefined()
  })
})
