import { describe, expect, test, beforeEach, afterEach } from 'bun:test'
import { OpenCodeIntegrationOptions, discoverOpenCodeModels, createOpenCodeModel, filterByProvider, withOpenCode, OpenCodeProviders } from '../index'

/**
 * index Tests
 * 
 * Auto-generated test suite for index
 */

describe('index', () => {

  describe('OpenCodeIntegrationOptions', () => {
    test('should be defined', () => {
      expect(OpenCodeIntegrationOptions).toBeDefined()
    })
  })

  describe('discoverOpenCodeModels', () => {
    test('should be a function', () => {
      expect(typeof discoverOpenCodeModels).toBe('function')
    })

    test('should execute without throwing', () => {
      expect(() => discoverOpenCodeModels()).not.toThrow()
    })
  })

  describe('createOpenCodeModel', () => {
    test('should be a function', () => {
      expect(typeof createOpenCodeModel).toBe('function')
    })

    test('should execute without throwing', () => {
      expect(() => createOpenCodeModel()).not.toThrow()
    })
  })

  describe('filterByProvider', () => {
    test('should be a function', () => {
      expect(typeof filterByProvider).toBe('function')
    })

    test('should execute without throwing', () => {
      expect(() => filterByProvider()).not.toThrow()
    })
  })

  describe('withOpenCode', () => {
    test('should be a function', () => {
      expect(typeof withOpenCode).toBe('function')
    })

    test('should execute without throwing', () => {
      expect(() => withOpenCode()).not.toThrow()
    })
  })

  describe('OpenCodeProviders', () => {
    test('should be defined', () => {
      expect(OpenCodeProviders).toBeDefined()
    })
  })
})
