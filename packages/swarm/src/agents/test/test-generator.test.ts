import { describe, expect, test, beforeEach, afterEach } from 'bun:test'
import { TestGeneratorAgent, createTestGeneratorAgent, TestGeneratorPersona } from '../test-generator'

/**
 * test-generator Tests
 * 
 * Auto-generated test suite for test-generator
 */

describe('test-generator', () => {

  describe('TestGeneratorAgent', () => {
    test('should instantiate without errors', () => {
      const instance = new TestGeneratorAgent({
        targetPackage: 'test',
        sourceFiles: [],
        testFramework: 'bun:test',
        coverageThreshold: 80,
      })
      expect(instance).toBeDefined()
      expect(instance).toBeInstanceOf(TestGeneratorAgent)
    })

    test('should maintain instance identity', () => {
      const config = {
        targetPackage: 'test',
        sourceFiles: [],
        testFramework: 'bun:test' as const,
        coverageThreshold: 80,
      }
      const instance1 = new TestGeneratorAgent(config)
      const instance2 = new TestGeneratorAgent(config)
      expect(instance1).not.toBe(instance2)
    })
  })

  describe('createTestGeneratorAgent', () => {
    test('should be a function', () => {
      expect(typeof createTestGeneratorAgent).toBe('function')
    })

    test('should execute without throwing', () => {
      expect(() => createTestGeneratorAgent({
        targetPackage: 'test',
        sourceFiles: [],
        testFramework: 'bun:test',
        coverageThreshold: 80,
      })).not.toThrow()
    })
  })

  describe('TestGeneratorPersona', () => {
    test('should be defined', () => {
      expect(TestGeneratorPersona).toBeDefined()
    })

    test('should have correct name', () => {
      expect(TestGeneratorPersona.name).toBe('TestGenerator')
    })

    test('should have capabilities', () => {
      expect(TestGeneratorPersona.capabilities).toContain('generate-tests')
    })
  })
})
