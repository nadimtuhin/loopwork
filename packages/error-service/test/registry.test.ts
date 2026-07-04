import { describe, expect, test, beforeEach } from 'bun:test'
import {
  CentralErrorRegistry,
  centralErrorRegistry,
  getErrorDocsUrl,
  getErrorSuggestions,
  formatErrorMessage
} from '../src/registry'

/**
 * Registry Tests
 * 
 * Tests for CentralErrorRegistry functionality including:
 * - Error code registration and lookup
 * - Documentation URL generation
 * - Suggestion generation
 * - Error formatting
 * - Unknown error code handling
 */

describe('CentralErrorRegistry', () => {
  let registry: CentralErrorRegistry

  beforeEach(() => {
    // Create a fresh registry for each test
    registry = new CentralErrorRegistry()
  })

  describe('initialization', () => {
    test('should initialize with default error codes', () => {
      expect(registry.size()).toBeGreaterThan(0)
      expect(registry.isEmpty()).toBe(false)
    })

    test('should have all expected error codes registered', () => {
      expect(registry.has('ERR_FILE_NOT_FOUND')).toBe(true)
      expect(registry.has('ERR_CONFIG_INVALID')).toBe(true)
      expect(registry.has('ERR_CLI_NOT_FOUND')).toBe(true)
      expect(registry.has('ERR_TASK_NOT_FOUND')).toBe(true)
      expect(registry.has('ERR_UNKNOWN')).toBe(true)
    })

    test('should have error codes from all categories', () => {
      // File system errors
      expect(registry.has('ERR_LOCK_CONFLICT')).toBe(true)
      expect(registry.has('ERR_FILE_READ')).toBe(true)
      expect(registry.has('ERR_FILE_WRITE')).toBe(true)

      // Configuration errors
      expect(registry.has('ERR_CONFIG_MISSING')).toBe(true)
      expect(registry.has('ERR_CONFIG_LOAD')).toBe(true)
      expect(registry.has('ERR_ENV_INVALID')).toBe(true)

      // CLI errors
      expect(registry.has('ERR_CLI_EXEC')).toBe(true)
      expect(registry.has('ERR_CLI_TIMEOUT')).toBe(true)
      expect(registry.has('ERR_PREFLIGHT_FAILED')).toBe(true)

      // Backend errors
      expect(registry.has('ERR_BACKEND_INVALID')).toBe(true)
      expect(registry.has('ERR_BACKEND_INIT')).toBe(true)

      // Task errors
      expect(registry.has('ERR_TASK_INVALID')).toBe(true)
      expect(registry.has('ERR_TASK_DEPS')).toBe(true)

      // State errors
      expect(registry.has('ERR_STATE_CORRUPT')).toBe(true)

      // Plugin errors
      expect(registry.has('ERR_PLUGIN_NOT_FOUND')).toBe(true)
      expect(registry.has('ERR_PLUGIN_LOAD')).toBe(true)
      expect(registry.has('ERR_PLUGIN_INIT')).toBe(true)
      expect(registry.has('ERR_PLUGIN_HOOK')).toBe(true)

      // Process errors
      expect(registry.has('ERR_PROCESS_SPAWN')).toBe(true)
      expect(registry.has('ERR_PROCESS_KILL')).toBe(true)
      expect(registry.has('ERR_RESOURCE_EXHAUSTED')).toBe(true)

      // Monitor errors
      expect(registry.has('ERR_MONITOR_START')).toBe(true)
      expect(registry.has('ERR_MONITOR_STOP')).toBe(true)

      // Safety errors
      expect(registry.has('ERR_SAFETY_VIOLATION')).toBe(true)
    })
  })

  describe('IErrorRegistry interface', () => {
    test('register should add new error code', () => {
      const code = 'ERR_TEST_CODE'
      const url = 'https://example.com/docs/test'
      
      registry.register(code, url)
      
      expect(registry.has(code)).toBe(true)
      expect(registry.getDocsUrl(code)).toBe(url)
    })

    test('register should update existing error code', () => {
      const code = 'ERR_FILE_NOT_FOUND'
      const newUrl = 'https://example.com/new-url'
      
      registry.register(code, newUrl)
      
      expect(registry.getDocsUrl(code)).toBe(newUrl)
    })

    test('getDocsUrl should return URL for registered codes', () => {
      const url = registry.getDocsUrl('ERR_FILE_NOT_FOUND')
      
      expect(url).toBeDefined()
      expect(url).toContain('docs.loopwork.ai')
      expect(url).toContain('file-not-found')
    })

    test('getDocsUrl should return generated URL for unknown codes', () => {
      const url = registry.getDocsUrl('ERR_UNKNOWN_CODE')
      
      expect(url).toBeDefined()
      expect(url).toContain('unknown')
      expect(url).toContain('ERR_UNKNOWN_CODE')
    })

    test('has should return true for registered codes', () => {
      expect(registry.has('ERR_TASK_NOT_FOUND')).toBe(true)
      expect(registry.has('ERR_CLI_EXEC')).toBe(true)
    })

    test('has should return false for unknown codes', () => {
      expect(registry.has('ERR_NONEXISTENT')).toBe(false)
      expect(registry.has('')).toBe(false)
    })

    test('getAllCodes should return array of all codes', () => {
      const codes = registry.getAllCodes()
      
      expect(Array.isArray(codes)).toBe(true)
      expect(codes.length).toBeGreaterThan(0)
      expect(codes).toContain('ERR_FILE_NOT_FOUND')
      expect(codes).toContain('ERR_UNKNOWN')
    })
  })

  describe('IErrorGuidance interface', () => {
    test('getSuggestions should return suggestions for registered codes', () => {
      const suggestions = registry.getSuggestions('ERR_FILE_NOT_FOUND')
      
      expect(Array.isArray(suggestions)).toBe(true)
      expect(suggestions.length).toBeGreaterThan(0)
      expect(suggestions[0]).toBeDefined()
      expect(typeof suggestions[0]).toBe('string')
    })

    test('getSuggestions should accept context parameter', () => {
      const suggestions = registry.getSuggestions('ERR_FILE_NOT_FOUND', { path: '/test/path' })
      
      expect(Array.isArray(suggestions)).toBe(true)
    })

    test('getSuggestions should return default suggestions for unknown codes', () => {
      const suggestions = registry.getSuggestions('ERR_UNKNOWN_CODE')
      
      expect(Array.isArray(suggestions)).toBe(true)
      expect(suggestions.length).toBeGreaterThan(0)
    })

    test('getTroubleshootingUrl should return troubleshooting URL', () => {
      const url = registry.getTroubleshootingUrl('ERR_FILE_NOT_FOUND')
      
      expect(url).toBeDefined()
      expect(url).toContain('troubleshooting')
    })

    test('getTroubleshootingUrl should return base troubleshooting URL for unknown codes', () => {
      const url = registry.getTroubleshootingUrl('ERR_NONEXISTENT')
      
      expect(url).toBeDefined()
      expect(url).toContain('troubleshooting')
    })

    test('formatError should format error with suggestions', () => {
      const formatted = registry.formatError('ERR_FILE_NOT_FOUND', 'File /test.txt not found')
      
      expect(formatted).toContain('ERR_FILE_NOT_FOUND')
      expect(formatted).toContain('File /test.txt not found')
      expect(formatted).toContain('Suggestions')
    })

    test('formatError should use provided suggestions when given', () => {
      const customSuggestions = ['Check the file path', 'Verify permissions']
      const formatted = registry.formatError('ERR_FILE_NOT_FOUND', 'File not found', customSuggestions)
      
      expect(formatted).toContain('Check the file path')
      expect(formatted).toContain('Verify permissions')
    })

    test('formatError should include documentation URL', () => {
      const formatted = registry.formatError('ERR_FILE_NOT_FOUND', 'File not found')
      
      expect(formatted).toContain('Documentation')
      expect(formatted).toContain('docs.loopwork.ai')
    })
  })

  describe('error message and entry methods', () => {
    test('getMessage should return message for registered codes', () => {
      const message = registry.getMessage('ERR_FILE_NOT_FOUND')
      
      expect(message).toBeDefined()
      expect(message).toContain('not found')
    })

    test('getMessage should return undefined for unknown codes', () => {
      const message = registry.getMessage('ERR_NONEXISTENT')
      
      expect(message).toBeUndefined()
    })

    test('getErrorEntry should return full entry for registered codes', () => {
      const entry = registry.getErrorEntry('ERR_FILE_NOT_FOUND')
      
      expect(entry).toBeDefined()
      expect(entry?.code).toBe('ERR_FILE_NOT_FOUND')
      expect(entry?.message).toBeDefined()
      expect(entry?.docsUrl).toBeDefined()
      expect(entry?.suggestions).toBeInstanceOf(Array)
    })

    test('getErrorEntry should return undefined for unknown codes', () => {
      const entry = registry.getErrorEntry('ERR_NONEXISTENT')
      
      expect(entry).toBeUndefined()
    })

    test('getAllEntries should return all entries', () => {
      const entries = registry.getAllEntries()
      
      expect(Array.isArray(entries)).toBe(true)
      expect(entries.length).toBe(registry.size())
      
      // Verify entry structure
      if (entries.length > 0) {
        const entry = entries[0]
        expect(entry.code).toBeDefined()
        expect(entry.message).toBeDefined()
        expect(entry.docsUrl).toBeDefined()
        expect(entry.suggestions).toBeInstanceOf(Array)
      }
    })
  })

  describe('registry modification methods', () => {
    test('registerError should add new error with full metadata', () => {
      const code = 'ERR_CUSTOM_TEST'
      const message = 'Custom test error'
      const docsPath = 'custom-test'
      const suggestions = ['Check custom config', 'Verify test setup']
      
      registry.registerError(code, message, docsPath, suggestions)
      
      expect(registry.has(code)).toBe(true)
      expect(registry.getMessage(code)).toBe(message)
      expect(registry.getDocsUrl(code)).toContain('custom-test')
      expect(registry.getSuggestions(code)).toEqual(suggestions)
    })

    test('unregister should remove error code', () => {
      const code = 'ERR_FILE_NOT_FOUND'
      
      expect(registry.has(code)).toBe(true)
      
      const result = registry.unregister(code)
      
      expect(result).toBe(true)
      expect(registry.has(code)).toBe(false)
    })

    test('unregister should return false for unknown codes', () => {
      const result = registry.unregister('ERR_NONEXISTENT')
      
      expect(result).toBe(false)
    })

    test('clear should remove all error codes', () => {
      expect(registry.isEmpty()).toBe(false)
      expect(registry.size()).toBeGreaterThan(0)
      
      registry.clear()
      
      expect(registry.isEmpty()).toBe(true)
      expect(registry.size()).toBe(0)
    })

    test('size should return correct count', () => {
      const count = registry.size()
      
      expect(count).toBeGreaterThan(0)
      expect(count).toBe(registry.getAllCodes().length)
    })
  })

  describe('unknown error code handling', () => {
    test('should handle completely unknown codes gracefully', () => {
      const unknownCode = 'ERR_COMPLETELY_UNKNOWN_12345'
      
      expect(registry.has(unknownCode)).toBe(false)
      expect(registry.getMessage(unknownCode)).toBeUndefined()
      
      // Should not throw
      const docsUrl = registry.getDocsUrl(unknownCode)
      const suggestions = registry.getSuggestions(unknownCode)
      const troubleshootingUrl = registry.getTroubleshootingUrl(unknownCode)
      const formatted = registry.formatError(unknownCode, 'Some error occurred')
      
      expect(docsUrl).toBeDefined()
      expect(suggestions).toBeInstanceOf(Array)
      expect(suggestions.length).toBeGreaterThan(0)
      expect(troubleshootingUrl).toBeDefined()
      expect(formatted).toContain(unknownCode)
    })

    test('should provide helpful suggestions for unknown codes', () => {
      const suggestions = registry.getSuggestions('ERR_UNKNOWN_CODE')
      
      expect(suggestions.length).toBeGreaterThan(0)
      expect(suggestions.some(s => s.toLowerCase().includes('debug'))).toBe(true)
      expect(suggestions.some(s => s.toLowerCase().includes('log'))).toBe(true)
    })

    test('should generate documentation URLs for unknown codes', () => {
      const code = 'ERR_CUSTOM_ERROR'
      const url = registry.getDocsUrl(code)
      
      expect(url).toContain(code)
      expect(url).toContain('unknown')
    })
  })

  describe('singleton instance', () => {
    test('centralErrorRegistry should be a CentralErrorRegistry instance', () => {
      expect(centralErrorRegistry).toBeInstanceOf(CentralErrorRegistry)
    })

    test('centralErrorRegistry should have error codes', () => {
      expect(centralErrorRegistry.size()).toBeGreaterThan(0)
      expect(centralErrorRegistry.has('ERR_UNKNOWN')).toBe(true)
    })
  })

  describe('helper functions', () => {
    test('getErrorDocsUrl should return URL for known code', () => {
      const url = getErrorDocsUrl('ERR_FILE_NOT_FOUND')
      
      expect(url).toBeDefined()
      expect(url).toContain('docs.loopwork.ai')
    })

    test('getErrorDocsUrl should return URL for unknown code', () => {
      const url = getErrorDocsUrl('ERR_NONEXISTENT')
      
      expect(url).toBeDefined()
      expect(url).toContain('ERR_NONEXISTENT')
    })

    test('getErrorSuggestions should return suggestions for known code', () => {
      const suggestions = getErrorSuggestions('ERR_CLI_NOT_FOUND')
      
      expect(Array.isArray(suggestions)).toBe(true)
      expect(suggestions.length).toBeGreaterThan(0)
    })

    test('getErrorSuggestions should accept context', () => {
      const suggestions = getErrorSuggestions('ERR_FILE_NOT_FOUND', { path: '/test' })
      
      expect(Array.isArray(suggestions)).toBe(true)
    })

    test('formatErrorMessage should format error correctly', () => {
      const formatted = formatErrorMessage('ERR_TASK_NOT_FOUND', 'Task TASK-001 not found')
      
      expect(formatted).toContain('ERR_TASK_NOT_FOUND')
      expect(formatted).toContain('Task TASK-001 not found')
      expect(formatted).toContain('Suggestions')
    })

    test('formatErrorMessage should use provided suggestions', () => {
      const customSuggestions = ['Custom suggestion 1', 'Custom suggestion 2']
      const formatted = formatErrorMessage('ERR_UNKNOWN', 'Unknown error', customSuggestions)
      
      expect(formatted).toContain('Custom suggestion 1')
      expect(formatted).toContain('Custom suggestion 2')
    })
  })

  describe('URL generation', () => {
    test('should generate correct documentation URLs', () => {
      const tests: [string, string][] = [
        ['ERR_FILE_NOT_FOUND', 'file-not-found'],
        ['ERR_CONFIG_INVALID', 'config-invalid'],
        ['ERR_CLI_NOT_FOUND', 'cli-not-found'],
        ['ERR_TASK_NOT_FOUND', 'task-not-found'],
        ['ERR_UNKNOWN', 'unknown']
      ]

      for (const [code, expectedPath] of tests) {
        const url = registry.getDocsUrl(code)
        expect(url).toContain(expectedPath)
      }
    })

    test('should generate correct troubleshooting URLs', () => {
      const tests: [string, string][] = [
        ['ERR_FILE_NOT_FOUND', 'troubleshooting'],
        ['ERR_CONFIG_INVALID', 'troubleshooting'],
        ['ERR_UNKNOWN', 'troubleshooting']
      ]

      for (const [code, expectedPath] of tests) {
        const url = registry.getTroubleshootingUrl(code)
        expect(url).toContain(expectedPath)
      }
    })
  })
})
