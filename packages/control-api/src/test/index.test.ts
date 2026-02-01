import { describe, expect, test, beforeEach, afterEach } from 'bun:test'
import { withControlApi, createControlApi } from '../index'

/**
 * index Tests
 * 
 * Auto-generated test suite for index
 */

describe('index', () => {

  describe('withControlApi', () => {
    test('should be a function', () => {
      expect(typeof withControlApi).toBe('function')
    })

    test('should execute without throwing', () => {
      expect(() => withControlApi()).not.toThrow()
    })
  })

  describe('createControlApi', () => {
    test('should be a function', () => {
      expect(typeof createControlApi).toBe('function')
    })

    test('should execute without throwing', () => {
      expect(() => createControlApi()).not.toThrow()
    })
  })
})
