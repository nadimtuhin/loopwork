import { describe, expect, test, beforeEach, afterEach } from 'bun:test'
import { TuiOptions, startTui } from '../tui/index'

/**
 * index Tests
 * 
 * Auto-generated test suite for index
 */

describe('index', () => {

  describe('TuiOptions', () => {
    test('should be defined', () => {
      expect(TuiOptions).toBeDefined()
    })
  })

  describe('startTui', () => {
    test('should be a function', () => {
      expect(typeof startTui).toBe('function')
    })

    test('should execute without throwing', () => {
      expect(() => startTui()).not.toThrow()
    })
  })
})
