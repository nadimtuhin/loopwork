import { describe, expect, test, beforeEach, afterEach } from 'bun:test'
import { createMcpPlugin, withMCP } from '../index'

/**
 * index Tests
 * 
 * Auto-generated test suite for index
 */

describe('index', () => {

  describe('createMcpPlugin', () => {
    test('should be a function', () => {
      expect(typeof createMcpPlugin).toBe('function')
    })

    test('should execute without throwing', () => {
      expect(() => createMcpPlugin()).not.toThrow()
    })
  })

  describe('withMCP', () => {
    test('should be a function', () => {
      expect(typeof withMCP).toBe('function')
    })

    test('should execute without throwing', () => {
      expect(() => withMCP()).not.toThrow()
    })
  })
})
