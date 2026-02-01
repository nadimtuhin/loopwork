import { describe, test, expect, beforeEach, afterEach } from 'bun:test'
import {
  NetworkInterceptor,
  InterceptionRule,
  getGlobalNetworkInterceptor,
  resetGlobalNetworkInterceptor,
} from '../src/network-interceptor'

describe('NetworkInterceptor', () => {
  let interceptor: NetworkInterceptor

  beforeEach(() => {
    interceptor = new NetworkInterceptor()
  })

  afterEach(() => {
    interceptor.stop()
    resetGlobalNetworkInterceptor()
  })

  test('should start and stop interception', () => {
    expect(interceptor.active).toBe(false)
    
    interceptor.start()
    expect(interceptor.active).toBe(true)
    
    interceptor.stop()
    expect(interceptor.active).toBe(false)
  })

  test('should not start twice', () => {
    interceptor.start()
    const originalFetch = globalThis.fetch
    
    interceptor.start()
    expect(globalThis.fetch).toBe(originalFetch)
  })

  test('should intercept matching requests', async () => {
    const rule: InterceptionRule = {
      id: 'test-1',
      pattern: '/api/test',
      response: {
        status: 200,
        statusText: 'OK',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ success: true }),
      },
    }

    interceptor.addRule(rule)
    interceptor.start()

    const response = await fetch('https://example.com/api/test')
    
    expect(response.status).toBe(200)
    expect(response.statusText).toBe('OK')
    
    const body = await response.json()
    expect(body).toEqual({ success: true })
    
    const stats = interceptor.getStats()
    expect(stats.totalRequests).toBe(1)
    expect(stats.interceptedRequests).toBe(1)
    expect(stats.mockedResponses).toBe(1)
  })

  test('should apply delay to requests', async () => {
    const rule: InterceptionRule = {
      id: 'test-delay',
      pattern: '/api/delay',
      response: {
        status: 200,
        statusText: 'OK',
        headers: {},
        body: 'delayed',
        delayMs: 50,
      },
    }

    interceptor.addRule(rule)
    interceptor.start()

    const start = Date.now()
    await fetch('https://example.com/api/delay')
    const duration = Date.now() - start

    expect(duration).toBeGreaterThanOrEqual(50)
    
    const stats = interceptor.getStats()
    expect(stats.mockedResponses).toBe(1)
  })

  test('should inject errors based on probability', async () => {
    const rule: InterceptionRule = {
      id: 'test-error',
      pattern: '/api/error',
      error: 'Injected network error',
      probability: 1,
    }

    interceptor.addRule(rule)
    interceptor.start()

    expect(fetch('https://example.com/api/error')).rejects.toThrow('Injected network error')
    
    const stats = interceptor.getStats()
    expect(stats.errorsInjected).toBe(1)
  })

  test('should match by HTTP method', async () => {
    const rule: InterceptionRule = {
      id: 'test-post',
      pattern: '/api/users',
      method: 'POST',
      response: {
        status: 201,
        statusText: 'Created',
        headers: {},
        body: JSON.stringify({ id: 1 }),
      },
    }

    interceptor.addRule(rule)
    interceptor.start()

    const postResponse = await fetch('https://example.com/api/users', {
      method: 'POST',
      body: JSON.stringify({ name: 'Test' }),
    })
    
    expect(postResponse.status).toBe(201)

    const getResponse = await fetch('https://example.com/api/users')
    
    expect(getResponse.status).not.toBe(201)
  })

  test('should use regex patterns', async () => {
    const rule: InterceptionRule = {
      id: 'test-regex',
      pattern: /\/api\/users\/\d+/,
      response: {
        status: 200,
        statusText: 'OK',
        headers: {},
        body: JSON.stringify({ id: 123, name: 'User' }),
      },
    }

    interceptor.addRule(rule)
    interceptor.start()

    const response = await fetch('https://example.com/api/users/123')
    const body = await response.json() as { id: number; name: string }
    
    expect(body.id).toBe(123)
  })

  test('should call onRequest callbacks', async () => {
    const requests: string[] = []
    
    interceptor.onRequest((req) => {
      requests.push(req.url)
    })
    
    interceptor.start()

    await fetch('https://example.com/api/test')
    
    expect(requests).toContain('https://example.com/api/test')
  })

  test('should remove rules by id', async () => {
    const rule: InterceptionRule = {
      id: 'test-remove',
      pattern: '/api/remove',
      response: {
        status: 200,
        statusText: 'OK',
        headers: {},
        body: 'mocked',
      },
    }

    interceptor.addRule(rule)
    interceptor.removeRule('test-remove')
    interceptor.start()

    const stats = interceptor.getStats()
    expect(stats.interceptedRequests).toBe(0)
  })

  test('should clear all rules', () => {
    interceptor.addRule({
      id: 'rule-1',
      pattern: '/api/1',
      response: { status: 200, statusText: 'OK', headers: {}, body: '1' },
    })
    
    interceptor.addRule({
      id: 'rule-2',
      pattern: '/api/2',
      response: { status: 200, statusText: 'OK', headers: {}, body: '2' },
    })

    interceptor.clearRules()
    interceptor.start()

    const stats = interceptor.getStats()
    expect(stats.interceptedRequests).toBe(0)
  })

  test('should reset stats', async () => {
    const rule: InterceptionRule = {
      id: 'test-stats',
      pattern: '/api/stats',
      response: {
        status: 200,
        statusText: 'OK',
        headers: {},
        body: 'test',
      },
    }

    interceptor.addRule(rule)
    interceptor.start()

    await fetch('https://example.com/api/stats')
    
    expect(interceptor.getStats().totalRequests).toBe(1)
    
    interceptor.resetStats()
    
    expect(interceptor.getStats().totalRequests).toBe(0)
  })

  test('should use probability to randomly match', async () => {
    const rule: InterceptionRule = {
      id: 'test-prob',
      pattern: '/api/prob',
      response: {
        status: 200,
        statusText: 'OK',
        headers: {},
        body: 'mocked',
      },
      probability: 0.5,
    }

    interceptor.addRule(rule)
    interceptor.start()

    let interceptedCount = 0
    for (let i = 0; i < 100; i++) {
      interceptor.resetStats()
      await fetch('https://example.com/api/prob')
      if (interceptor.getStats().interceptedRequests > 0) {
        interceptedCount++
      }
    }

    expect(interceptedCount).toBeGreaterThan(20)
    expect(interceptedCount).toBeLessThan(80)
  })
})

describe('Global Network Interceptor', () => {
  afterEach(() => {
    resetGlobalNetworkInterceptor()
  })

  test('should return same instance', () => {
    const interceptor1 = getGlobalNetworkInterceptor()
    const interceptor2 = getGlobalNetworkInterceptor()
    
    expect(interceptor1).toBe(interceptor2)
  })

  test('should reset global interceptor', () => {
    const interceptor = getGlobalNetworkInterceptor()
    interceptor.start()
    
    resetGlobalNetworkInterceptor()
    
    const newInterceptor = getGlobalNetworkInterceptor()
    expect(newInterceptor).not.toBe(interceptor)
    expect(newInterceptor.active).toBe(false)
  })
})
