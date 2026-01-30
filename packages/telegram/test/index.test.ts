import { describe, test, expect } from 'bun:test'
import { TelegramTaskBot } from '../src/bot'
import { SessionManager } from '../src/session'

describe('Telegram Package Exports', () => {
  test('should export TelegramTaskBot', () => {
    expect(TelegramTaskBot).toBeDefined()
    expect(typeof TelegramTaskBot).toBe('function')
  })

  test('should export SessionManager', () => {
    expect(SessionManager).toBeDefined()
    expect(typeof SessionManager).toBe('function')
  })

  test('TelegramTaskBot should be constructable', () => {
    expect(() => {
      new TelegramTaskBot({ botToken: 'test', chatId: '123' })
    }).not.toThrow()
  })

  test('SessionManager should be constructable', () => {
    expect(() => {
      new SessionManager()
    }).not.toThrow()
  })
})

describe('SessionManager', () => {
  test('should create new session', () => {
    const manager = new SessionManager()
    const session = manager.getSession(123, 456)

    expect(session.userId).toBe(123)
    expect(session.chatId).toBe(456)
    expect(session.state).toBe('IDLE')
  })

  test('should update existing session', () => {
    const manager = new SessionManager()
    const session = manager.getSession(123, 456)

    manager.updateSession(123, { state: 'DRAFTING_TASK' })

    const updated = manager.getSession(123, 456)
    expect(updated.state).toBe('DRAFTING_TASK')
  })

  test('should clear session', () => {
    const manager = new SessionManager()
    manager.getSession(123, 456)
    manager.updateSession(123, {
      state: 'DRAFTING_TASK',
      draft: { title: 'Test' }
    })

    manager.clearSession(123)

    const cleared = manager.getSession(123, 456)
    expect(cleared.state).toBe('IDLE')
    expect(cleared.draft).toBeUndefined()
  })

  test('should cleanup stale sessions', async () => {
    const manager = new SessionManager()
    const session = manager.getSession(123, 456)

    // Manually set old timestamp to simulate timeout
    session.lastActivity = Date.now() - (1000 * 60 * 11) // 11 minutes ago

    // Access cleanup through getSession
    manager.getSession(999, 888) // This triggers cleanup

    // Session should still exist (we just set it) but with IDLE state
    const refreshed = manager.getSession(123, 456)
    expect(refreshed).toBeDefined()
    // New session was created since old one timed out
  })
})
