import { describe, expect, test, beforeEach, afterEach } from 'bun:test'
import {
  TopicMatchMode,
  DEFAULT_SINGLE_WILDCARD,
  DEFAULT_MULTI_WILDCARD,
  matchTopicPattern,
  type InternalEvent,
  type EventSubscription,
  type MessageBusStats,
  type BusOptions,
  type IMessageBus,
  type IEventBus,
  type TopicMatch,
  type EventBusOptions,
  type WildcardPattern
} from '../messaging'

/**
 * messaging Tests
 *
 * Auto-generated test suite for messaging
 */

describe('messaging', () => {
  describe('TopicMatchMode', () => {
    test('should be defined', () => {
      expect(TopicMatchMode).toBeDefined()
      expect(typeof TopicMatchMode).toBe('object')
    })
  })

  describe('DEFAULT_SINGLE_WILDCARD', () => {
    test('should be defined', () => {
      expect(DEFAULT_SINGLE_WILDCARD).toBeDefined()
      expect(DEFAULT_SINGLE_WILDCARD).toBe('*')
    })
  })

  describe('DEFAULT_MULTI_WILDCARD', () => {
    test('should be defined', () => {
      expect(DEFAULT_MULTI_WILDCARD).toBeDefined()
      expect(DEFAULT_MULTI_WILDCARD).toBe('**')
    })
  })

  describe('matchTopicPattern', () => {
    test('should be a function', () => {
      expect(typeof matchTopicPattern).toBe('function')
    })

    test('should execute without throwing', () => {
      expect(() => matchTopicPattern('test.*', 'test.topic')).not.toThrow()
    })

    test('should match exact topics', () => {
      const result = matchTopicPattern('test.topic', 'test.topic')
      expect(result.matched).toBe(true)
      expect(result.mode).toBe(TopicMatchMode.EXACT)
    })

    test('should match wildcard patterns', () => {
      const result = matchTopicPattern('test.*.event', 'test.topic.event')
      expect(result.matched).toBe(true)
    })

    test('should return non-match for different topics', () => {
      const result = matchTopicPattern('test.topic', 'other.topic')
      expect(result.matched).toBe(false)
    })
  })
})
