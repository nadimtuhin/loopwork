import { describe, expect, test, beforeEach, afterEach } from 'bun:test'
import { BudgetConfig, createBudgetManager, version } from '../index'

/**
 * index Tests
 * 
 * Auto-generated test suite for index
 */

describe('index', () => {

  describe('BudgetConfig', () => {
    test('should be defined', () => {
      expect(BudgetConfig).toBeDefined()
    })
  })

  describe('createBudgetManager', () => {
    test('should be a function', () => {
      expect(typeof createBudgetManager).toBe('function')
    })

    test('should execute without throwing', () => {
      expect(() => createBudgetManager()).not.toThrow()
    })
  })

  describe('version', () => {
    test('should be defined', () => {
      expect(version).toBeDefined()
    })
  })
})
