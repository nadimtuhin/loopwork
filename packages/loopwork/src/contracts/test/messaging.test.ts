import { describe, expect, test, beforeEach, afterEach } from 'bun:test'
import { Message, MessageSubscription, MessageBusStats, MessageBusOptions, IMessageBus, AgentMetadata, BROADCAST_ALL, BROADCAST_MANAGERS, BROADCAST_WORKERS, AgentId, MessageRecipient, MessageHandler, MessageFilter } from '../contracts/messaging'

/**
 * messaging Tests
 * 
 * Auto-generated test suite for messaging
 */

describe('messaging', () => {

  describe('Message', () => {
    test('should be defined', () => {
      expect(Message).toBeDefined()
    })
  })

  describe('MessageSubscription', () => {
    test('should be defined', () => {
      expect(MessageSubscription).toBeDefined()
    })
  })

  describe('MessageBusStats', () => {
    test('should be defined', () => {
      expect(MessageBusStats).toBeDefined()
    })
  })

  describe('MessageBusOptions', () => {
    test('should be defined', () => {
      expect(MessageBusOptions).toBeDefined()
    })
  })

  describe('IMessageBus', () => {
    test('should be defined', () => {
      expect(IMessageBus).toBeDefined()
    })
  })

  describe('AgentMetadata', () => {
    test('should be defined', () => {
      expect(AgentMetadata).toBeDefined()
    })
  })

  describe('BROADCAST_ALL', () => {
    test('should be defined', () => {
      expect(BROADCAST_ALL).toBeDefined()
    })
  })

  describe('BROADCAST_MANAGERS', () => {
    test('should be defined', () => {
      expect(BROADCAST_MANAGERS).toBeDefined()
    })
  })

  describe('BROADCAST_WORKERS', () => {
    test('should be defined', () => {
      expect(BROADCAST_WORKERS).toBeDefined()
    })
  })

  describe('AgentId', () => {
    test('should be defined', () => {
      expect(AgentId).toBeDefined()
    })
  })

  describe('MessageRecipient', () => {
    test('should be defined', () => {
      expect(MessageRecipient).toBeDefined()
    })
  })

  describe('MessageHandler', () => {
    test('should be defined', () => {
      expect(MessageHandler).toBeDefined()
    })
  })

  describe('MessageFilter', () => {
    test('should be defined', () => {
      expect(MessageFilter).toBeDefined()
    })
  })
})
