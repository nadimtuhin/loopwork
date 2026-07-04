import { describe, expect, test } from 'bun:test'
import type { ErrorContext, ServiceError } from '../index'
import { LoopworkError, ErrorService, createError, reportError, isLoopworkError, errorService } from '../index'

/**
 * index Tests
 * 
 * Auto-generated test suite for index
 */

describe('index', () => {

  describe('LoopworkError', () => {
    test('should instantiate without errors', () => {
      const instance = new LoopworkError('ERR_TEST', 'Test error message')
      expect(instance).toBeDefined()
      expect(instance).toBeInstanceOf(LoopworkError)
      expect(instance.code).toBe('ERR_TEST')
      expect(instance.message).toBe('Test error message')
    })

    test('should maintain instance identity', () => {
      const instance1 = new LoopworkError('ERR_TEST1', 'Test error 1')
      const instance2 = new LoopworkError('ERR_TEST2', 'Test error 2')
      expect(instance1).not.toBe(instance2)
      expect(instance1.code).not.toBe(instance2.code)
    })
  })

  describe('ErrorService', () => {
    test('should instantiate without errors', () => {
      const instance = new ErrorService()
      expect(instance).toBeDefined()
      expect(instance).toBeInstanceOf(ErrorService)
    })

    test('should maintain instance identity', () => {
      const instance1 = new ErrorService()
      const instance2 = new ErrorService()
      expect(instance1).not.toBe(instance2)
    })
  })

  describe('ErrorContext', () => {
    test('should be defined as a type', () => {
      const context: ErrorContext = {
        component: 'test',
        operation: 'test-op'
      }
      expect(context.component).toBe('test')
    })
  })

  describe('ServiceError', () => {
    test('should be defined as a type', () => {
      const error: ServiceError = {
        code: 'ERR_TEST',
        message: 'Test error',
        timestamp: new Date()
      }
      expect(error.code).toBe('ERR_TEST')
    })
  })

  describe('createError', () => {
    test('should be a function', () => {
      expect(typeof createError).toBe('function')
    })

    test('should create LoopworkError instance', () => {
      const error = createError('ERR_TEST', 'Test error message')
      expect(error).toBeInstanceOf(LoopworkError)
      expect(error.code).toBe('ERR_TEST')
      expect(error.message).toBe('Test error message')
    })
  })

  describe('reportError', () => {
    test('should be a function', () => {
      expect(typeof reportError).toBe('function')
    })

    test('should report error without throwing', () => {
      const error = new LoopworkError('ERR_TEST', 'Test error')
      expect(() => reportError(error)).not.toThrow()
    })
  })

  describe('isLoopworkError', () => {
    test('should be a function', () => {
      expect(typeof isLoopworkError).toBe('function')
    })

    test('should correctly identify LoopworkError instances', () => {
      const error = new LoopworkError('ERR_TEST', 'Test error')
      const notError = new Error('Regular error')
      expect(isLoopworkError(error)).toBe(true)
      expect(isLoopworkError(notError)).toBe(false)
      expect(isLoopworkError(null)).toBe(false)
      expect(isLoopworkError(undefined)).toBe(false)
    })
  })

  describe('errorService', () => {
    test('should be defined', () => {
      expect(errorService).toBeDefined()
    })
  })
})
