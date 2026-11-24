import { describe, expect, test } from 'bun:test'
import { VerificationEngine } from '../src/ai-monitor/verification'

describe('VerificationEngine.runCommand timeout', () => {
  test('force-kills a command that ignores SIGTERM after the grace period', async () => {
    const engine = new VerificationEngine({ cwd: process.cwd() } as any)
    // Ignores SIGTERM; only SIGKILL stops it
    const cmd = `${process.execPath} -e "process.on('SIGTERM',()=>{});setInterval(()=>{},1000)"`
    const start = Date.now()
    const result = await (engine as any).runCommand(cmd, 200)

    expect(result.passed).toBe(false)
    expect(result.output).toContain('timed out')
    // 200ms timeout + 5s grace, well short of "never"
    expect(Date.now() - start).toBeLessThan(8000)
  }, 20000)
})
