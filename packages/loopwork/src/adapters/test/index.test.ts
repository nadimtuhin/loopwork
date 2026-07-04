import { describe, expect, test } from 'bun:test'
import { CliAdapter, GitAdapter, CliRunnerAdapter, GitRunnerAdapter } from '../index'

describe('Adapters index', () => {
  test('should export all adapters', () => {
    expect(CliAdapter).toBeDefined()
    expect(GitAdapter).toBeDefined()
    expect(CliRunnerAdapter).toBeDefined()
    expect(GitRunnerAdapter).toBeDefined()
  })

  test('should maintain backward compatibility aliases', () => {
    expect(CliRunnerAdapter).toBe(CliAdapter)
    expect(GitRunnerAdapter).toBe(GitAdapter)
  })
})
