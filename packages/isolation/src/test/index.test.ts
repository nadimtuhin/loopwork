import { describe, expect, test } from 'bun:test'
import { LocalIsolationProvider, defaultProvider } from '../index'

describe('index', () => {
  describe('LocalIsolationProvider', () => {
    test('should instantiate without errors', () => {
      const instance = new LocalIsolationProvider()
      expect(instance).toBeDefined()
      expect(instance).toBeInstanceOf(LocalIsolationProvider)
    })

    test('should maintain instance identity', () => {
      const instance1 = new LocalIsolationProvider()
      const instance2 = new LocalIsolationProvider()
      expect(instance1).not.toBe(instance2)
    })
  })

  describe('defaultProvider', () => {
    test('should be defined', () => {
      expect(defaultProvider).toBeDefined()
    })
  })
})
