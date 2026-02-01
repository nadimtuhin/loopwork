/**
 * Tests for OpenCode Self-Healing Module
 */
import { describe, test, expect } from 'bun:test'
import {
  detectOpencodeIssues,
  isOpencodeError,
  categorizeOpencodeFailure,
  type OpencodeIssue,
} from '../src/core/opencode-healer'

describe('OpenCode Self-Healing', () => {
  describe('detectOpencodeIssues', () => {
    test('detects missing zod dependency', () => {
      const error = `
        Error: Cannot find package 'zod' from '/Users/test/.cache/opencode'
        at resolveSync (/Users/test/.cache/opencode/node_modules/...)
      `
      
      const issues = detectOpencodeIssues(error)
      
      expect(issues).toHaveLength(1)
      expect(issues[0].type).toBe('missing_dependency')
      expect(issues[0].package).toBe('zod')
      expect(issues[0].location).toBe('cache')
      expect(issues[0].autoFixable).toBe(true)
    })

    test('detects missing zod with Cannot find module', () => {
      const error = `ResolveMessage: Cannot find module 'zod' from '/Users/test/.cache/opencode/node_modules/@opencode-ai/plugin'`
      
      const issues = detectOpencodeIssues(error)
      
      expect(issues).toHaveLength(1)
      expect(issues[0].type).toBe('missing_dependency')
      expect(issues[0].package).toBe('zod')
    })

    test('detects missing @opencode-ai/plugin', () => {
      const error = `Cannot find package '@opencode-ai/plugin' from '/Users/test/.opencode'`
      
      const issues = detectOpencodeIssues(error)
      
      expect(issues).toHaveLength(1)
      expect(issues[0].type).toBe('missing_dependency')
      expect(issues[0].package).toBe('@opencode-ai/plugin')
      expect(issues[0].location).toBe('main')
    })

    test('detects cache corruption', () => {
      const error = `
        Error: Cache corruption detected in /Users/test/.cache/opencode
        at loadCache (/Users/test/.cache/opencode/...)
      `
      
      const issues = detectOpencodeIssues(error)
      
      expect(issues).toHaveLength(1)
      expect(issues[0].type).toBe('corrupted_cache')
      expect(issues[0].autoFixable).toBe(true)
    })

    test('detects multiple issues in same error', () => {
      const error = `
        Error: Cannot find package 'zod' from '/Users/test/.cache/opencode'
        Error: Cache corruption detected
        at someFunction
      `
      
      const issues = detectOpencodeIssues(error)
      
      expect(issues.length).toBeGreaterThanOrEqual(1)
      // Should detect both issues
      const types = issues.map(i => i.type)
      expect(types).toContain('missing_dependency')
      expect(types).toContain('corrupted_cache')
    })

    test('returns empty array for non-opencode errors', () => {
      const error = `
        Error: Connection timeout
        at fetch (/Users/test/project/node_modules/...)
      `
      
      const issues = detectOpencodeIssues(error)
      
      expect(issues).toHaveLength(0)
    })

    test('handles empty string', () => {
      const issues = detectOpencodeIssues('')
      expect(issues).toHaveLength(0)
    })

    test('handles case variations', () => {
      const error1 = `Cannot find package 'ZOD'`
      const error2 = `CANNOT FIND PACKAGE 'zod'`
      const error3 = `cannot find package 'Zod'`
      
      expect(detectOpencodeIssues(error1)[0]?.package).toBe('zod')
      expect(detectOpencodeIssues(error2)[0]?.package).toBe('zod')
      expect(detectOpencodeIssues(error3)[0]?.package).toBe('zod')
    })
  })

  describe('isOpencodeError', () => {
    test('returns true for zod errors', () => {
      const error = `Cannot find package 'zod' from cache`
      expect(isOpencodeError(error)).toBe(true)
    })

    test('returns true for cache corruption', () => {
      const error = `Cache corruption detected`
      expect(isOpencodeError(error)).toBe(true)
    })

    test('returns false for unrelated errors', () => {
      const error = `TypeError: Cannot read property 'foo' of undefined`
      expect(isOpencodeError(error)).toBe(false)
    })

    test('returns false for empty string', () => {
      expect(isOpencodeError('')).toBe(false)
    })
  })

  describe('categorizeOpencodeFailure', () => {
    test('categorizes dependency errors', () => {
      const error = `Cannot find package 'zod'`
      expect(categorizeOpencodeFailure(error)).toBe('opencode_dependency')
    })

    test('categorizes cache errors', () => {
      const error = `Cache corruption detected`
      expect(categorizeOpencodeFailure(error)).toBe('opencode_cache')
    })

    test('returns null for non-opencode errors', () => {
      const error = `Connection refused`
      expect(categorizeOpencodeFailure(error)).toBeNull()
    })

    test('prioritizes dependency over cache', () => {
      // If both patterns match, dependency takes precedence
      const error = `
        Cannot find package 'zod'
        Cache corruption detected
      `
      // Should return the first match (dependency)
      const result = categorizeOpencodeFailure(error)
      expect(result).toBe('opencode_dependency')
    })
  })

  describe('Real-world error patterns', () => {
    test('handles actual opencode error from logs', () => {
      const realError = `
03:52:44 │ [[W0] opencode/kimi-k2.5-tee        ] ResolveMessage: Cannot find package 'zod' from '/Users/nadimtuhin/.cache/opencode'
03:52:44 │ [[W0] opencode/kimi-k2.5-tee        ] Error: Unexpected error, check log
      `
      
      const issues = detectOpencodeIssues(realError)
      
      expect(issues.length).toBeGreaterThan(0)
      expect(issues.some(i => i.package === 'zod')).toBe(true)
    })

    test('handles multiple models failing with same issue', () => {
      const error = `
03:52:45 │ [[W3] opencode/cerebras-glm-4.7     ] Error: Cannot find package 'zod'
03:52:45 │ [[W2] opencode/antigravity-claude-sonnet-4-5] Error: Cannot find package 'zod'
03:52:45 │ [[W1] opencode/antigravity-claude-sonnet-4-5] Error: Cannot find package 'zod'
      `
      
      const issues = detectOpencodeIssues(error)
      
      // Should detect zod issue (duplicates may be consolidated)
      expect(issues.some(i => i.package === 'zod')).toBe(true)
    })

    test('handles circuit breaker pattern', () => {
      const error = `
03:52:49 ❌ ERROR: [CircuitBreaker] Model antigravity-claude-sonnet-4-5 disabled after 3 failures
ResolveMessage: Cannot find package 'zod' from '/Users/nadimtuhin/.cache/opencode'
      `
      
      expect(isOpencodeError(error)).toBe(true)
      expect(detectOpencodeIssues(error)[0]?.type).toBe('missing_dependency')
    })
  })
})
