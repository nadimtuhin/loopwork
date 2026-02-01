import { describe, expect, test, beforeEach, afterEach } from 'bun:test'
import { isPtyFunctional, createSpawner, getDefaultSpawner, resetDefaultSpawner } from '../index'

/**
 * index Tests
 * 
 * Auto-generated test suite for index
 */

describe('index', () => {

  describe('isPtyFunctional', () => {
    test('should be a function', () => {
      expect(typeof isPtyFunctional).toBe('function')
    })

    test('should execute without throwing', () => {
      expect(() => isPtyFunctional()).not.toThrow()
    })
  })

  describe('createSpawner', () => {
    test('should be a function', () => {
      expect(typeof createSpawner).toBe('function')
    })

    test('should execute without throwing', () => {
      expect(() => createSpawner()).not.toThrow()
    })
  })

  describe('getDefaultSpawner', () => {
    test('should be a function', () => {
      expect(typeof getDefaultSpawner).toBe('function')
    })

    test('should execute without throwing', () => {
      expect(() => getDefaultSpawner()).not.toThrow()
    })
  })

  describe('resetDefaultSpawner', () => {
    test('should be a function', () => {
      expect(typeof resetDefaultSpawner).toBe('function')
    })

    test('should execute without throwing', () => {
      expect(() => resetDefaultSpawner()).not.toThrow()
    })
  })
})
