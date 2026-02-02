import { describe, expect, test } from 'bun:test'
import { PtySpawner, type PtySpawnerOptions, isPtyAvailable } from '../pty'

/**
 * pty spawner Tests
 * 
 * Auto-generated test suite for pty spawner
 */

describe('pty spawner', () => {

  describe('PtySpawner', () => {
    test('should instantiate without errors', () => {
      const instance = new PtySpawner()
      expect(instance).toBeDefined()
      expect(instance).toBeInstanceOf(PtySpawner)
    })

    test('should maintain instance identity', () => {
      const instance1 = new PtySpawner()
      const instance2 = new PtySpawner()
      expect(instance1).not.toBe(instance2)
    })
  })

  describe('PtySpawnerOptions', () => {
    test('should be defined as a type', () => {
      const options: PtySpawnerOptions = {}
      expect(options).toBeDefined()
    })
  })

  describe('isPtyAvailable', () => {
    test('should be a function', () => {
      expect(typeof isPtyAvailable).toBe('function')
    })

    test('should execute without throwing', () => {
      expect(() => isPtyAvailable()).not.toThrow()
    })
  })
})
