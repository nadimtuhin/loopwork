import { describe, expect, test } from 'bun:test'
import { GitHubTaskAdapter } from '../src/index'

/**
 * GitHub Backend Tests
 * 
 * Test suite for GitHubTaskAdapter
 */

describe('GitHubTaskAdapter', () => {
  test('should instantiate without errors', () => {
    const instance = new GitHubTaskAdapter()
    expect(instance).toBeDefined()
    expect(instance).toBeInstanceOf(GitHubTaskAdapter)
  })

  test('should maintain instance identity', () => {
    const instance1 = new GitHubTaskAdapter()
    const instance2 = new GitHubTaskAdapter()
    expect(instance1).not.toBe(instance2)
  })

  test('should have correct name property', () => {
    const instance = new GitHubTaskAdapter()
    expect(instance.name).toBe('github')
  })
})
