import { describe, expect, test, beforeEach, afterEach } from 'bun:test'
import { CliInvokeOptions, CliInvokeResult, ICliInvoker, ICliInvokerRegistry } from '../contracts/invoker'

/**
 * invoker Tests
 * 
 * Auto-generated test suite for invoker
 */

describe('invoker', () => {

  describe('CliInvokeOptions', () => {
    test('should be defined', () => {
      expect(CliInvokeOptions).toBeDefined()
    })
  })

  describe('CliInvokeResult', () => {
    test('should be defined', () => {
      expect(CliInvokeResult).toBeDefined()
    })
  })

  describe('ICliInvoker', () => {
    test('should be defined', () => {
      expect(ICliInvoker).toBeDefined()
    })
  })

  describe('ICliInvokerRegistry', () => {
    test('should be defined', () => {
      expect(ICliInvokerRegistry).toBeDefined()
    })
  })
})
