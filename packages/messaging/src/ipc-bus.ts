import { EventEmitter } from 'events'
import type {
  IMessageBus,
  InternalEvent,
  EventHandler,
  EventFilter,
  EventSubscription,
  MessageBusStats,
} from '@loopwork-ai/contracts'

/**
 * Interface for a process-like object with IPC capabilities
 * Compatible with Node.js ChildProcess and the global process object
 */
export interface IpcProcess {
  send?(message: any, sendHandle?: any, options?: any, callback?: (error: Error | null) => void): boolean
  on(event: 'message', listener: (message: any, sendHandle: any) => void): this
  off(event: 'message', listener: (message: any, sendHandle: any) => void): this
  connected?: boolean
}

/**
 * Message protocol wrapper for IPC messages
 */
interface IpcMessageWrapper<TPayload = unknown> {
  __ipc_type: 'loopwork:event'
  event: InternalEvent<TPayload>
}

/**
 * IpcMessageBus - Message bus implementation over IPC
 * 
 * Bridges the IMessageBus interface across process boundaries.
 * Serializes events and sends them via the underlying IPC channel.
 */
export class IpcMessageBus implements IMessageBus {
  private process: IpcProcess
  private subscriptions: Map<string, Set<{
    handler: EventHandler
    filter?: EventFilter
    isActive: boolean
  }>> = new Map()
  
  private stats: MessageBusStats = {
    messagesSent: 0,
    messagesReceived: 0,
    activeSubscriptions: 0,
    eventsPublished: 0
  }

  private messageHandler: (message: any) => void

  /**
   * Create a new IpcMessageBus
   * @param targetProcess The process to communicate with (defaults to global process)
   */
  constructor(targetProcess?: IpcProcess) {
    // If no process provided, use global process (for child processes)
    // We cast to unknown first because global process type signature varies
    this.process = (targetProcess || process) as unknown as IpcProcess

    if (!this.process.send) {
      console.warn('[IpcMessageBus] Warning: Target process does not have a send method. IPC may not be active.')
    }

    this.messageHandler = this.handleIncomingMessage.bind(this)
    this.process.on('message', this.messageHandler)
  }

  /**
   * Send a message to the target process
   */
  async send<TPayload = unknown>(event: InternalEvent<TPayload>): Promise<void> {
    if (!this.process.connected && this.process.connected !== undefined) {
      throw new Error('IPC channel is disconnected')
    }

    if (!this.process.send) {
      throw new Error('IPC send method is not available')
    }

    const wrapper: IpcMessageWrapper<TPayload> = {
      __ipc_type: 'loopwork:event',
      event
    }

    try {
      this.process.send(wrapper)
      this.stats.messagesSent++
    } catch (error) {
      throw new Error(`Failed to send IPC message: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  /**
   * Subscribe to messages from the target process
   */
  subscribe<TPayload = unknown>(
    topic: string,
    handler: EventHandler<TPayload>,
    filter?: EventFilter<TPayload>
  ): EventSubscription {
    if (!this.subscriptions.has(topic)) {
      this.subscriptions.set(topic, new Set())
    }

    const subscription = {
      handler: handler as EventHandler,
      filter: filter as EventFilter,
      isActive: true
    }

    this.subscriptions.get(topic)!.add(subscription)
    this.stats.activeSubscriptions++

    return {
      unsubscribe: () => {
        if (!subscription.isActive) return
        
        subscription.isActive = false
        const topicSubs = this.subscriptions.get(topic)
        if (topicSubs) {
          topicSubs.delete(subscription)
          if (topicSubs.size === 0) {
            this.subscriptions.delete(topic)
          }
        }
        this.stats.activeSubscriptions--
      },
      get isActive() {
        return subscription.isActive
      }
    }
  }

  /**
   * Get current bus statistics
   */
  getStats(): MessageBusStats {
    return { ...this.stats }
  }

  /**
   * Clear all subscriptions and detach listener
   */
  clear(): void {
    this.subscriptions.clear()
    this.process.off('message', this.messageHandler)
    this.stats = {
      messagesSent: 0,
      messagesReceived: 0,
      activeSubscriptions: 0,
      eventsPublished: 0
    }
  }

  /**
   * Handle incoming IPC messages
   */
  private handleIncomingMessage(message: any): void {
    // Validate message format
    if (!message || typeof message !== 'object' || message.__ipc_type !== 'loopwork:event' || !message.event) {
      return
    }

    const event = message.event as InternalEvent
    const topic = event.topic
    
    // Find subscribers for this topic
    const topicSubs = this.subscriptions.get(topic)
    if (!topicSubs) return

    this.stats.messagesReceived++

    // Notify subscribers
    for (const sub of topicSubs) {
      if (!sub.isActive) continue
      
      if (sub.filter && !sub.filter(event)) {
        continue
      }

      try {
        // We don't await handlers here to avoid blocking the message loop
        // consistent with standard EventEmitter behavior
        void Promise.resolve(sub.handler(event)).catch(err => {
          console.error(`[IpcMessageBus] Error in handler for topic ${topic}:`, err)
        })
      } catch (err) {
        console.error(`[IpcMessageBus] Error executing handler for topic ${topic}:`, err)
      }
    }
  }
}
