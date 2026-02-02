import { describe, expect, test, beforeEach, afterEach } from 'bun:test'
import { createAuditQueryManager, queryAuditLogs, exportAuditLogs } from '../audit-query'

describe('audit-query', () => {
  describe('createAuditQueryManager', () => {
    test('should be a function', () => {
      expect(typeof createAuditQueryManager).toBe('function')
    })
  })

  describe('queryAuditLogs', () => {
    test('should be a function', () => {
      expect(typeof queryAuditLogs).toBe('function')
    })
  })

  describe('exportAuditLogs', () => {
    test('should be a function', () => {
      expect(typeof exportAuditLogs).toBe('function')
    })
  })
})
