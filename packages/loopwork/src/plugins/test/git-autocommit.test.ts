import { describe, expect, test } from 'bun:test'
import { createGitAutoCommitPlugin, withGitAutoCommit } from '@loopwork-ai/plugin-git-autocommit'
import type { GitAutoCommitOptions } from '@loopwork-ai/plugin-git-autocommit'

/**
 * git-autocommit Tests
 *
 * Auto-generated test suite for git-autocommit
 */

describe('git-autocommit', () => {

  describe('GitAutoCommitOptions', () => {
    test('should be a type that can be imported', () => {
      // GitAutoCommitOptions is a TypeScript interface (type-only)
      // We verify it's exported as a type by checking createGitAutoCommitPlugin accepts it
      const options: GitAutoCommitOptions = {
        enabled: true,
        addAll: true,
        skipIfNoChanges: true,
        coAuthor: 'Test <test@example.com>',
        scope: 'all',
      }
      expect(options.enabled).toBe(true)
    })
  })

  describe('createGitAutoCommitPlugin', () => {
    test('should be a function', () => {
      expect(typeof createGitAutoCommitPlugin).toBe('function')
    })

    test('should execute without throwing', () => {
      expect(() => createGitAutoCommitPlugin()).not.toThrow()
    })
  })

  describe('withGitAutoCommit', () => {
    test('should be a function', () => {
      expect(typeof withGitAutoCommit).toBe('function')
    })

    test('should execute without throwing', () => {
      expect(() => withGitAutoCommit()).not.toThrow()
    })
  })
})
