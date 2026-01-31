import type { IMessageBus, Message, MessageHandler, MessageFilter, MessageSubscription, MessageBusStats } from '../contracts/messaging'

export class MessageBus implements IMessageBus {
  private handlers: { handler: MessageHandler; filter?: MessageFilter }[] = []
  private stats: MessageBusStats = {
    messagesSent: 0,
    messagesReceived: 0,
    activeSubscriptions: 0
  }

  async send(message: Message): Promise<void> {
    this.stats.messagesSent++
    for (const { handler, filter } of this.handlers) {
      if (!filter || filter(message)) {
        this.stats.messagesReceived++
        await Promise.resolve(handler(message))
      }
    }
  }

  subscribe(handler: MessageHandler, filter?: MessageFilter): MessageSubscription {
    const entry = { handler, filter }
    this.handlers.push(entry)
    this.stats.activeSubscriptions++

    return {
      unsubscribe: () => {
        this.handlers = this.handlers.filter(h => h !== entry)
        this.stats.activeSubscriptions--
      }
    }
  }

  getStats(): MessageBusStats {
    return { ...this.stats }
  }
}

export function createMessageBus(): IMessageBus {
  return new MessageBus()
}
