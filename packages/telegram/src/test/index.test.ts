import { describe, expect, test, beforeEach, afterEach } from 'bun:test'
import { withTelegram } from '../index'

/**
 * index Tests
 * 
 * Auto-generated test suite for index
 */

describe('index', () => {

  describe('withTelegram', () => {
    test('should be a function', () => {
      expect(typeof withTelegram).toBe('function')
    })

    test('should execute without throwing', () => {
      expect(() => withTelegram()).not.toThrow()
    })
  })
})
