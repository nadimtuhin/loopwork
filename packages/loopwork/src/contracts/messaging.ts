/**
 * Messaging System Contracts
 *
 * Types and interfaces for inter-agent messaging
 */

export type AgentId = string

export type MessageRecipient = AgentId | BroadcastTarget

export enum BroadcastTarget {
  ALL = 'broadcast:all',
  MANAGERS = 'broadcast:managers',
  WORKERS = 'broadcast:workers'
}

export const BROADCAST_ALL = BroadcastTarget.ALL
export const BROADCAST_MANAGERS = BroadcastTarget.MANAGERS
export const BROADCAST_WORKERS = BroadcastTarget.WORKERS

export enum MessageType {
  REQUEST = 'request',
  RESPONSE = 'response',
  EVENT = 'event',
  BROADCAST = 'broadcast'
}

export interface Message {
  id: string
  type: MessageType
  from: AgentId
  to: MessageRecipient
  payload: unknown
  timestamp: number
}

export type MessageHandler = (message: Message) => void | Promise<void>

export interface MessageSubscription {
  unsubscribe: () => void
}

export type MessageFilter = (message: Message) => boolean

export interface MessageBusStats {
  messagesSent: number
  messagesReceived: number
  activeSubscriptions: number
}

export interface MessageBusOptions {
  maxQueueSize?: number
  enableLogging?: boolean
}

export interface IMessageBus {
  send(message: Message): Promise<void>
  subscribe(handler: MessageHandler, filter?: MessageFilter): MessageSubscription
  getStats(): MessageBusStats
}

export interface AgentMetadata {
  id: AgentId
  type: string
  status: 'idle' | 'busy' | 'stopped'
}
