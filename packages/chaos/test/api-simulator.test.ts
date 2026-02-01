import { describe, test, expect, beforeEach, afterEach } from 'bun:test'
import { ApiSimulator, ApiEndpointConfig } from '../src/api-simulator'
import { resetGlobalNetworkInterceptor } from '../src/network-interceptor'

describe('ApiSimulator', () => {
  let simulator: ApiSimulator

  beforeEach(() => {
    simulator = new ApiSimulator()
  })

  afterEach(() => {
    simulator.stop()
    resetGlobalNetworkInterceptor()
  })

  test('should start and stop', () => {
    expect(simulator.active).toBe(false)
    
    simulator.start()
    expect(simulator.active).toBe(true)
    
    simulator.stop()
    expect(simulator.active).toBe(false)
  })

  test('should mock endpoint with string body', async () => {
    simulator.start()

    const config: ApiEndpointConfig = {
      path: '/api/users',
      response: {
        status: 200,
        body: JSON.stringify({ users: [] }),
      },
    }

    simulator.mockEndpoint(config)

    const response = await fetch('https://example.com/api/users')
    const data = await response.json() as { users: unknown[] }

    expect(response.status).toBe(200)
    expect(data.users).toEqual([])
  })

  test('should mock endpoint with object body', async () => {
    simulator.start()

    const config: ApiEndpointConfig = {
      path: '/api/posts',
      response: {
        status: 201,
        body: { id: 1, title: 'Test Post' },
      },
    }

    simulator.mockEndpoint(config)

    const response = await fetch('https://example.com/api/posts')
    const data = await response.json() as { id: number; title: string }

    expect(response.status).toBe(201)
    expect(data).toEqual({ id: 1, title: 'Test Post' })
  })

  test('should mock endpoint with custom headers', async () => {
    simulator.start()

    const config: ApiEndpointConfig = {
      path: '/api/data',
      response: {
        status: 200,
        headers: { 'x-custom': 'value' },
        body: 'data',
      },
    }

    simulator.mockEndpoint(config)

    const response = await fetch('https://example.com/api/data')

    expect(response.headers.get('x-custom')).toBe('value')
  })

  test('should mock endpoint with specific method', async () => {
    simulator.start()

    const config: ApiEndpointConfig = {
      path: '/api/users',
      method: 'POST',
      response: {
        status: 201,
        body: { id: 1 },
      },
    }

    simulator.mockEndpoint(config)

    const postResponse = await fetch('https://example.com/api/users', {
      method: 'POST',
      body: JSON.stringify({ name: 'Test' }),
    })
    expect(postResponse.status).toBe(201)

    const getResponse = await fetch('https://example.com/api/users')
    expect(getResponse.status).not.toBe(201)
  })

  test('should add latency to requests', async () => {
    simulator.start()

    simulator.addLatency('/api/slow', 50)

    const start = Date.now()
    await fetch('https://example.com/api/slow')
    const duration = Date.now() - start

    expect(duration).toBeGreaterThanOrEqual(50)
  })

  test('should mock API errors', async () => {
    simulator.start()

    simulator.mockApiError('/api/error', 'Service Unavailable', 1)

    expect(fetch('https://example.com/api/error')).rejects.toThrow('Service Unavailable')
  })

  test('should apply network chaos - latency', async () => {
    simulator.start()

    simulator.applyNetworkChaos({
      enabled: true,
      latency: {
        enabled: true,
        minMs: 30,
        maxMs: 30,
        probability: 1,
      },
    })

    const start = Date.now()
    await fetch('https://example.com/api/test')
    const duration = Date.now() - start

    expect(duration).toBeGreaterThanOrEqual(30)
  })

  test('should apply network chaos - errors', async () => {
    simulator.start()

    simulator.applyNetworkChaos({
      enabled: true,
      errors: {
        enabled: true,
        types: ['Connection refused'],
        probability: 1,
      },
    })

    expect(fetch('https://example.com/api/test')).rejects.toThrow('Connection refused')
  })

  test('should apply network chaos - timeout', async () => {
    simulator.start()

    simulator.applyNetworkChaos({
      enabled: true,
      timeout: {
        enabled: true,
        probability: 1,
      },
    })

    expect(fetch('https://example.com/api/test')).rejects.toThrow('Request timeout')
  })

  test('should clear all rules', async () => {
    simulator.start()

    simulator.mockEndpoint({
      path: '/api/1',
      response: { body: '1' },
    })

    simulator.mockEndpoint({
      path: '/api/2',
      response: { body: '2' },
    })

    simulator.clearAll()

    const stats = simulator.getStats()
    expect(stats.interceptedRequests).toBe(0)
  })

  test('should track stats', async () => {
    simulator.start()

    simulator.mockEndpoint({
      path: '/api/track',
      response: { body: 'tracked' },
    })

    await fetch('https://example.com/api/track')

    const stats = simulator.getStats()
    expect(stats.totalRequests).toBe(1)
    expect(stats.interceptedRequests).toBe(1)
    expect(stats.mockedResponses).toBe(1)
  })

  test('should reset stats', async () => {
    simulator.start()

    simulator.mockEndpoint({
      path: '/api/reset',
      response: { body: 'reset' },
    })

    await fetch('https://example.com/api/reset')
    expect(simulator.getStats().totalRequests).toBe(1)

    simulator.resetStats()
    expect(simulator.getStats().totalRequests).toBe(0)
  })

  test('should call onRequest callback', async () => {
    const urls: string[] = []

    simulator.onRequest((req) => {
      urls.push(req.url)
    })

    simulator.start()

    simulator.mockEndpoint({
      path: '/api/callback',
      response: { body: 'callback' },
    })

    await fetch('https://example.com/api/callback')

    expect(urls).toContain('https://example.com/api/callback')
  })

  test('should apply network chaos with baseUrl pattern', async () => {
    simulator.start()

    const ruleIds = simulator.applyNetworkChaos(
      {
        enabled: true,
        latency: {
          enabled: true,
          minMs: 20,
          maxMs: 20,
          probability: 1,
        },
      },
      'https://api.example.com'
    )

    expect(ruleIds.length).toBeGreaterThan(0)

    simulator.mockEndpoint({
      path: 'https://api.example.com/users',
      response: { body: JSON.stringify({ users: [] }) },
    })

    const start = Date.now()
    await fetch('https://api.example.com/users')
    const duration = Date.now() - start

    expect(duration).toBeGreaterThanOrEqual(20)
  })

  test('should return rule id from mockEndpoint', () => {
    simulator.start()

    const ruleId = simulator.mockEndpoint({
      path: '/api/rule',
      response: { body: 'rule' },
    })

    expect(ruleId).toMatch(/^mock-\d+-/)
  })

  test('should use regex path pattern', async () => {
    simulator.start()

    simulator.mockEndpoint({
      path: /\/api\/items\/\d+/,
      response: {
        body: JSON.stringify({ item: true }),
      },
    })

    const response = await fetch('https://example.com/api/items/123')
    const data = await response.json() as { item: boolean }

    expect(data.item).toBe(true)
  })
})
