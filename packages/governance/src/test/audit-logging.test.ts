import { describe, expect, test, beforeEach, afterEach } from 'bun:test'
import { AuditLogManager, createAuditLoggingPlugin, withAuditLogging } from '../audit-logging'

describe('audit-logging', () => {
  describe('AuditLogManager', () => {
    test('should instantiate', () => {
      const instance = new AuditLogManager('test-dir')
      expect(instance).toBeDefined()
      expect(instance).toBeInstanceOf(AuditLogManager)
    })
  })

  describe('createAuditLoggingPlugin', () => {
    test('should be a function', () => {
      expect(typeof createAuditLoggingPlugin).toBe('function')
    })
  })
})
