/**
 * Messaging Package
 *
 * Implementation of the messaging system for Loopwork.
 * Provides message bus and event bus functionality.
 */

// Re-export contracts for convenience
export type {
  InternalEvent,
  EventHandler,
  EventSubscription,
  EventFilter,
  MessageBusStats,
  BusOptions,
  IMessageBus,
  IEventBus,
  WildcardPattern,
  TopicMatchMode,
  TopicMatch,
  EventBusOptions,
  DEFAULT_SINGLE_WILDCARD,
  DEFAULT_MULTI_WILDCARD,
  matchTopicPattern,
} from '@loopwork-ai/contracts'

// Export LocalEventBus implementation
export { LocalEventBus, createEvent } from './local-bus'
export { IpcMessageBus } from './ipc-bus'

// Export version info
export const VERSION = '0.1.0'
