import { describe, expect, test, beforeEach, afterEach } from 'bun:test'
import type { ChaosOptions } from '../index'
import { createChaosPlugin, withChaos } from '../index'

describe('index', () => {
  describe('ChaosOptions', () => {
    test('should be a valid type', () => {
      const options: ChaosOptions = { enabled: true }
      expect(options.enabled).toBe(true)
    })
  })

  describe('createChaosPlugin', () => {
    test('should be a function', () => {
      expect(typeof createChaosPlugin).toBe('function')
    })

    test('should execute without throwing', () => {
      expect(() => createChaosPlugin()).not.toThrow()
    })
  })

  describe('withChaos', () => {
    test('should be a function', () => {
      expect(typeof withChaos).toBe('function')
    })

    test('should execute without throwing', () => {
      expect(() => withChaos()).not.toThrow()
    })
  })
})
