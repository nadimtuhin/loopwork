import {
  NetworkInterceptor,
  InterceptionRule,
  MockResponse,
  InterceptedRequest,
  InterceptionStats,
} from './network-interceptor'

export interface ApiEndpointConfig {
  method?: string
  path: string | RegExp
  response: {
    status?: number
    statusText?: string
    headers?: Record<string, string>
    body: string | object
    delayMs?: number
  }
  error?: string
  errorProbability?: number
  delayMs?: number
  probability?: number
}

export interface NetworkChaosConfig {
  enabled?: boolean
  latency?: {
    enabled?: boolean
    minMs?: number
    maxMs?: number
    probability?: number
  }
  errors?: {
    enabled?: boolean
    types?: string[]
    probability?: number
  }
  rateLimit?: {
    enabled?: boolean
    requestsPerSecond?: number
  }
  timeout?: {
    enabled?: boolean
    probability?: number
  }
}

export class ApiSimulator {
  private interceptor: NetworkInterceptor
  private activeRules: string[] = []

  constructor(interceptor?: NetworkInterceptor) {
    this.interceptor = interceptor || new NetworkInterceptor()
  }

  start(): void {
    this.interceptor.start()
  }

  stop(): void {
    this.interceptor.stop()
    this.clearAll()
  }

  mockEndpoint(config: ApiEndpointConfig): string {
    const ruleId = `mock-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`

    const body =
      typeof config.response.body === 'string'
        ? config.response.body
        : JSON.stringify(config.response.body)

    const mockResponse: MockResponse = {
      status: config.response.status || 200,
      statusText: config.response.statusText || 'OK',
      headers: config.response.headers || { 'content-type': 'application/json' },
      body,
      delayMs: config.response.delayMs,
    }

    const rule: InterceptionRule = {
      id: ruleId,
      pattern: config.path,
      method: config.method,
      response: mockResponse,
      error: config.error,
      delayMs: config.delayMs,
      probability: config.probability ?? 1,
    }

    this.interceptor.addRule(rule)
    this.activeRules.push(ruleId)

    return ruleId
  }

  mockApiError(
    pattern: string | RegExp,
    errorMessage: string,
    probability?: number,
    method?: string
  ): string {
    const ruleId = `error-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`

    const rule: InterceptionRule = {
      id: ruleId,
      pattern,
      method,
      error: errorMessage,
      probability: probability ?? 1,
    }

    this.interceptor.addRule(rule)
    this.activeRules.push(ruleId)

    return ruleId
  }

  addLatency(
    pattern: string | RegExp,
    delayMs: number,
    probability?: number,
    method?: string
  ): string {
    const ruleId = `latency-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`

    const rule: InterceptionRule = {
      id: ruleId,
      pattern,
      method,
      delayMs,
      probability: probability ?? 1,
    }

    this.interceptor.addRule(rule)
    this.activeRules.push(ruleId)

    return ruleId
  }

  applyNetworkChaos(config: NetworkChaosConfig, baseUrl?: string | RegExp): string[] {
    const ruleIds: string[] = []

    if (!config.enabled) return ruleIds

    const pattern = baseUrl || /.*/

    if (config.latency?.enabled) {
      const minMs = config.latency.minMs ?? 100
      const maxMs = config.latency.maxMs ?? 1000
      const delayMs = Math.floor(Math.random() * (maxMs - minMs + 1)) + minMs

      const id = this.addLatency(
        pattern,
        delayMs,
        config.latency.probability ?? 0.5
      )
      ruleIds.push(id)
    }

    if (config.errors?.enabled) {
      const errorTypes = config.errors.types || ['Network timeout', 'Connection refused']
      const errorMessage = errorTypes[Math.floor(Math.random() * errorTypes.length)]

      const id = this.mockApiError(
        pattern,
        errorMessage,
        config.errors.probability ?? 0.3
      )
      ruleIds.push(id)
    }

    if (config.timeout?.enabled) {
      const id = this.mockApiError(
        pattern,
        'Request timeout',
        config.timeout.probability ?? 0.2
      )
      ruleIds.push(id)
    }

    return ruleIds
  }

  clearAll(): void {
    for (const ruleId of this.activeRules) {
      this.interceptor.removeRule(ruleId)
    }
    this.activeRules = []
  }

  onRequest(callback: (request: InterceptedRequest) => void): () => void {
    return this.interceptor.onRequest(callback)
  }

  getStats(): InterceptionStats {
    return this.interceptor.getStats()
  }

  resetStats(): void {
    this.interceptor.resetStats()
  }

  get active(): boolean {
    return this.interceptor.active
  }
}
