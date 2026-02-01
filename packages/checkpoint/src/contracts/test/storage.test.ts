import { describe, expect, test, beforeEach, afterEach } from 'bun:test'
import { IFileSystem, ICheckpointStorage, ICheckpointManager } from '../contracts/storage'

/**
 * storage Tests
 * 
 * Auto-generated test suite for storage
 */

describe('storage', () => {

  describe('IFileSystem', () => {
    test('should be defined', () => {
      expect(IFileSystem).toBeDefined()
    })
  })

  describe('ICheckpointStorage', () => {
    test('should be defined', () => {
      expect(ICheckpointStorage).toBeDefined()
    })
  })

  describe('ICheckpointManager', () => {
    test('should be defined', () => {
      expect(ICheckpointManager).toBeDefined()
    })
  })
})
