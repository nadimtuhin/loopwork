import { describe, test, expect, beforeEach, mock } from 'bun:test'
import { LocalScriptBridgeAdapter } from '../src/adapters/LocalScriptBridgeAdapter'
import type { McpScript } from '../src/index'

mock.module('child_process', () => ({
  spawnSync: mock((command: string, args: string[]) => {
    if (command === 'node' && args[0] === 'success.js') {
      return {
        stdout: JSON.stringify({ result: 'success' }),
        stderr: '',
        status: 0,
      }
    }
    if (command === 'node' && args[0] === 'fail.js') {
      return {
        stdout: 'Error message',
        stderr: 'Some stderr',
        status: 1,
      }
    }
    return {
      stdout: '',
      stderr: 'Unknown script',
      status: 127,
    }
  })
}))

describe('LocalScriptBridgeAdapter', () => {
  let scripts: Record<string, McpScript>
  let adapter: LocalScriptBridgeAdapter

  beforeEach(() => {
    scripts = {
      'test-success': {
        source: 'success.js',
        runtime: 'node',
      },
      'test-fail': {
        source: 'fail.js',
        runtime: 'node',
      }
    }
    adapter = new LocalScriptBridgeAdapter(scripts)
  })

  test('runs a successful script and parses JSON output', async () => {
    const result = await adapter.run('test-success', { foo: 'bar' })
    expect(result.exitCode).toBe(0)
    expect(result.data).toEqual({ result: 'success' })
  })

  test('runs a failing script', async () => {
    const result = await adapter.run('test-fail', {})
    expect(result.exitCode).toBe(1)
    expect(result.stdout).toBe('Error message')
  })

  test('throws error for missing script', async () => {
    await expect(adapter.run('non-existent', {})).rejects.toThrow('Script not found')
  })

  test('registers tools in the registry', () => {
    const mockRegistry = {
      registerLocalTool: mock(() => {})
    }
    adapter.registerTools(mockRegistry)
    expect(mockRegistry.registerLocalTool).toHaveBeenCalledTimes(2)
  })
})
