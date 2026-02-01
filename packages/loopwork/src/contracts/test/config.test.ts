import { describe, expect, test, beforeEach, afterEach } from 'bun:test'
import { LoopworkConfig, DEFAULT_CONFIG } from '../contracts/config'

/**
 * config Tests
 * 
 * Auto-generated test suite for config
 */

describe('config', () => {

  describe('LoopworkConfig', () => {
    test('should be defined', () => {
      expect(LoopworkConfig).toBeDefined()
    })
  })

  describe('DEFAULT_CONFIG', () => {
    test('should be defined', () => {
      expect(DEFAULT_CONFIG).toBeDefined()
    })
  })
})
