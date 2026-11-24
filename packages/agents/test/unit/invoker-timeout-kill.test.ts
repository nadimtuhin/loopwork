import { describe, expect, test } from 'bun:test'
import { BaseCliInvoker } from '../../src/invokers/base-invoker'
import type { CliInvokeOptions } from '../../src/contracts/invoker'

// A child that ignores SIGTERM, as a hung AI CLI might
class StubbornInvoker extends BaseCliInvoker {
  readonly name = 'stubborn'
  readonly description = 'ignores SIGTERM'
  readonly command = process.execPath
  getSupportedModels() { return [] }
  buildArgs(_options: CliInvokeOptions) {
    return ['-e', "process.on('SIGTERM', () => {}); setInterval(() => {}, 1000)"]
  }
}

describe('BaseCliInvoker timeout', () => {
  test('escalates to SIGKILL when the CLI ignores SIGTERM', async () => {
    const invoker = new StubbornInvoker()
    const start = Date.now()
    const result = await invoker.invoke({ prompt: '', workDir: process.cwd(), timeout: 0.3 })

    expect(result.timedOut).toBe(true)
    expect(Date.now() - start).toBeLessThan(8000)
  }, 15000)
})
