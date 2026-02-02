import { describe, expect, test } from 'bun:test'
import { GitAdapter } from '../git-adapter'
import os from 'os'

describe('GitAdapter', () => {
  test('should instantiate with workDir', () => {
    const adapter = new GitAdapter(os.tmpdir())
    expect(adapter).toBeDefined()
  })

  test('should have diff and status methods', () => {
    const adapter = new GitAdapter(os.tmpdir())
    expect(typeof adapter.diff).toBe('function')
    expect(typeof adapter.status).toBe('function')
  })
})
