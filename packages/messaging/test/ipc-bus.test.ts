import { describe, test, expect, afterAll, beforeAll } from 'bun:test'
import { spawn, type ChildProcess } from 'node:child_process'
import { join } from 'path'
import { IpcMessageBus } from '../src/ipc-bus'
import { createEvent } from '../src/local-bus'
import type { InternalEvent } from '@loopwork-ai/contracts'

describe('IpcMessageBus Integration', () => {
  let worker: ChildProcess
  let bus: IpcMessageBus
  
  beforeAll(async () => {
    const workerPath = join(__dirname, 'fixtures', 'ipc-worker.ts')
    
    worker = spawn('bun', ['run', workerPath], {
      stdio: ['inherit', 'inherit', 'inherit', 'ipc']
    })

    bus = new IpcMessageBus(worker as any)

    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Worker connection timeout'))
      }, 5000)

      const sub = bus.subscribe('worker:ready', () => {
        clearTimeout(timeout)
        sub.unsubscribe()
        resolve()
      })
    })
  })

  afterAll(() => {
    if (worker) {
      bus.send(createEvent('terminate', {}))
      worker.kill()
    }
  })

  test('should send and receive messages', async () => {
    const payload = { message: 'hello' }
    
    const responsePromise = new Promise<InternalEvent>((resolve) => {
      const sub = bus.subscribe('echo-reply', (event) => {
        sub.unsubscribe()
        resolve(event)
      })
    })

    await bus.send(createEvent('echo', payload))
    
    const response = await responsePromise
    expect(response.topic).toBe('echo-reply')
    expect(response.payload).toEqual(payload)
  })

  test('should handle ping-pong round trip', async () => {
    const responsePromise = new Promise<InternalEvent>((resolve) => {
      const sub = bus.subscribe('pong', (event) => {
        sub.unsubscribe()
        resolve(event)
      })
    })

    const pingEvent = createEvent('ping', {})
    await bus.send(pingEvent)
    
    const response = await responsePromise
    expect(response.topic).toBe('pong')
    expect((response.payload as any).originalId).toBe(pingEvent.id)
  })

  test('should track statistics', () => {
    const stats = bus.getStats()
    expect(stats.messagesSent).toBeGreaterThan(0)
    expect(stats.messagesReceived).toBeGreaterThan(0)
  })

  test('should handle multiple subscribers', async () => {
    let count = 0
    const handler = () => { count++ }

    const sub1 = bus.subscribe('multi-test', handler)
    const sub2 = bus.subscribe('multi-test', handler)

    expect(sub1.isActive).toBe(true)
    expect(sub2.isActive).toBe(true)
    
    sub1.unsubscribe()
    expect(sub1.isActive).toBe(false)
    expect(sub2.isActive).toBe(true)
    
    sub2.unsubscribe()
    expect(sub2.isActive).toBe(false)
  })
})
