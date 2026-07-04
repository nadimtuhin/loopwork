import { describe, expect, test, beforeEach, afterEach } from 'bun:test'
import { CompositeNotificationProvider } from '../src/composite-provider'
import type { INotificationProvider, NotificationOptions } from '@loopwork-ai/contracts'

/**
 * CompositeNotificationProvider Tests
 *
 * Tests for the composite provider that aggregates multiple notification channels
 */

describe('CompositeNotificationProvider', () => {
  describe(' instantiation', () => {
    test('should instantiate without errors', () => {
      const provider = new CompositeNotificationProvider()
      expect(provider).toBeDefined()
      expect(provider).toBeInstanceOf(CompositeNotificationProvider)
    })

    test('should have default name "composite"', () => {
      const provider = new CompositeNotificationProvider()
      expect(provider.name).toBe('composite')
    })
  })

  describe('provider management', () => {
    test('should start with no providers', () => {
      const provider = new CompositeNotificationProvider()
      expect(provider.getProviderCount()).toBe(0)
      expect(provider.getProviderNames()).toEqual([])
    })

    test('should add a provider', () => {
      const provider = new CompositeNotificationProvider()
      const mockProvider = createMockProvider('test')

      provider.addProvider(mockProvider)

      expect(provider.getProviderCount()).toBe(1)
      expect(provider.getProviderNames()).toEqual(['test'])
    })

    test('should add multiple providers', () => {
      const provider = new CompositeNotificationProvider()
      const mockProvider1 = createMockProvider('provider1')
      const mockProvider2 = createMockProvider('provider2')

      provider.addProvider(mockProvider1)
      provider.addProvider(mockProvider2)

      expect(provider.getProviderCount()).toBe(2)
      expect(provider.getProviderNames()).toEqual(['provider1', 'provider2'])
    })

    test('should remove a provider by name', () => {
      const provider = new CompositeNotificationProvider()
      const mockProvider = createMockProvider('test')

      provider.addProvider(mockProvider)
      expect(provider.getProviderCount()).toBe(1)

      const removed = provider.removeProvider('test')
      expect(removed).toBe(true)
      expect(provider.getProviderCount()).toBe(0)
    })

    test('should return false when removing non-existent provider', () => {
      const provider = new CompositeNotificationProvider()

      const removed = provider.removeProvider('nonexistent')
      expect(removed).toBe(false)
    })
  })

  describe('notify', () => {
    test('should broadcast to all providers', async () => {
      const provider = new CompositeNotificationProvider()
      const mock1 = createMockProvider('mock1')
      const mock2 = createMockProvider('mock2')

      provider.addProvider(mock1)
      provider.addProvider(mock2)

      await provider.notify('test message')

      expect(mock1.lastMessage).toBe('test message')
      expect(mock2.lastMessage).toBe('test message')
    })

    test('should pass options to all providers', async () => {
      const provider = new CompositeNotificationProvider()
      const mock = createMockProvider('mock')

      provider.addProvider(mock)

      const options: NotificationOptions = {
        title: 'Test Title',
        priority: 'high',
      }

      await provider.notify('test', options)

      expect(mock.lastOptions).toEqual(options)
    })

    test('should continue when one provider fails', async () => {
      const provider = new CompositeNotificationProvider()
      const failingProvider = createFailingProvider('failing')
      const successProvider = createMockProvider('success')

      provider.addProvider(failingProvider)
      provider.addProvider(successProvider)

      // Should not throw - use direct await instead of expect
      await provider.notify('test')

      // Success provider should still receive the message
      expect(successProvider.lastMessage).toBe('test')
    })

    test('should handle empty provider list gracefully', async () => {
      const provider = new CompositeNotificationProvider()

      // Should not throw
      await provider.notify('test')
    })
  })

  describe('verify', () => {
    test('should verify all successful providers', async () => {
      const provider = new CompositeNotificationProvider()
      const mock1 = createVerifyingProvider('mock1', true)
      const mock2 = createVerifyingProvider('mock2', true)

      provider.addProvider(mock1)
      provider.addProvider(mock2)

      const result = await provider.verify()

      expect(result).toBe(true)
      expect(mock1.verifyCalled).toBe(true)
      expect(mock2.verifyCalled).toBe(true)
    })

    test('should return false when any provider fails verification', async () => {
      const provider = new CompositeNotificationProvider()
      const mock1 = createVerifyingProvider('mock1', true)
      const mock2 = createVerifyingProvider('mock2', false)

      provider.addProvider(mock1)
      provider.addProvider(mock2)

      const result = await provider.verify()

      expect(result).toBe(false)
    })

    test('should return false for empty provider list', async () => {
      const provider = new CompositeNotificationProvider()

      const result = await provider.verify()

      expect(result).toBe(false)
    })
  })
})

// Helper functions to create mock providers

function createMockProvider(name: string): INotificationProvider & {
  lastMessage?: string
  lastOptions?: NotificationOptions
} {
  return {
    name,
    lastMessage: undefined,
    lastOptions: undefined,
    async notify(message: string, options?: NotificationOptions) {
      this.lastMessage = message
      this.lastOptions = options
    },
    async verify() {
      return true
    },
  }
}

function createFailingProvider(name: string): INotificationProvider {
  return {
    name,
    async notify() {
      throw new Error('Provider failed')
    },
    async verify() {
      return true
    },
  }
}

function createVerifyingProvider(
  name: string,
  shouldSucceed: boolean
): INotificationProvider & { verifyCalled: boolean } {
  return {
    name,
    verifyCalled: false,
    async notify() {},
    async verify() {
      this.verifyCalled = true
      return shouldSucceed
    },
  }
}
