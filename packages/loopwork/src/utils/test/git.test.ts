import { describe, expect, test, beforeEach, afterEach } from 'bun:test'
import { isGitRepo, hasChanges, getCurrentHash, createCommit, createStash, applyStash, rollbackTo, getChangedFiles } from '../utils/git'

/**
 * git Tests
 * 
 * Auto-generated test suite for git
 */

describe('git', () => {

  describe('isGitRepo', () => {
    test('should be a function', () => {
      expect(typeof isGitRepo).toBe('function')
    })

    test('should execute without throwing', () => {
      expect(() => isGitRepo()).not.toThrow()
    })
  })

  describe('hasChanges', () => {
    test('should be a function', () => {
      expect(typeof hasChanges).toBe('function')
    })

    test('should execute without throwing', () => {
      expect(() => hasChanges()).not.toThrow()
    })
  })

  describe('getCurrentHash', () => {
    test('should be a function', () => {
      expect(typeof getCurrentHash).toBe('function')
    })

    test('should execute without throwing', () => {
      expect(() => getCurrentHash()).not.toThrow()
    })
  })

  describe('createCommit', () => {
    test('should be a function', () => {
      expect(typeof createCommit).toBe('function')
    })

    test('should execute without throwing', () => {
      expect(() => createCommit()).not.toThrow()
    })
  })

  describe('createStash', () => {
    test('should be a function', () => {
      expect(typeof createStash).toBe('function')
    })

    test('should execute without throwing', () => {
      expect(() => createStash()).not.toThrow()
    })
  })

  describe('applyStash', () => {
    test('should be a function', () => {
      expect(typeof applyStash).toBe('function')
    })

    test('should execute without throwing', () => {
      expect(() => applyStash()).not.toThrow()
    })
  })

  describe('rollbackTo', () => {
    test('should be a function', () => {
      expect(typeof rollbackTo).toBe('function')
    })

    test('should execute without throwing', () => {
      expect(() => rollbackTo()).not.toThrow()
    })
  })

  describe('getChangedFiles', () => {
    test('should be a function', () => {
      expect(typeof getChangedFiles).toBe('function')
    })

    test('should execute without throwing', () => {
      expect(() => getChangedFiles()).not.toThrow()
    })
  })
})
