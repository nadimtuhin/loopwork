/**
 * Network Interceptor for API Simulation
 *
 * Provides the ability to intercept and mock network requests
 * for chaos engineering and testing purposes.
 */

export interface InterceptedRequest {
  url: string
  method: string
  headers: Record<string, string>
  body?: string
}

export interface MockResponse {
  status: number
  statusText: string
  headers: Record<string, string>
  body: string
  delayMs?: number
}

export interface InterceptionRule {
  id: string
  pattern: RegExp | string
  method?: string
  response?: MockResponse
  error?: string
  delayMs?: number
  probability?: number
}

export interface InterceptionStats {
  totalRequests: number
  interceptedRequests: number
  mockedResponses: number
  errorsInjected: number
  delayedRequests: number
}

type FetchFn = typeof fetch

export class NetworkInterceptor {
  private originalFetch: FetchFn | null = null
  private rules: InterceptionRule[] = []
  private isActive = false
  private stats: InterceptionStats = {
    totalRequests: 0,
    interceptedRequests: 0,
    mockedResponses: 0,
    errorsInjected: 0,
    delayedRequests: 0,
  }
  private onRequestCallbacks: ((request: InterceptedRequest) => void)[] = []

  start(): void {
    if (this.isActive) return

    this.originalFetch = globalThis.fetch.bind(globalThis)
    this.isActive = true

    globalThis.fetch = this.createInterceptedFetch()
  }

  stop(): void {
    if (!this.isActive || !this.originalFetch) return

    globalThis.fetch = this.originalFetch
    this.isActive = false
    this.originalFetch = null
  }

  addRule(rule: InterceptionRule): void {
    this.rules.push(rule)
  }

  removeRule(ruleId: string): void {
    this.rules = this.rules.filter(r => r.id !== ruleId)
  }

  clearRules(): void {
    this.rules = []
  }

  onRequest(callback: (request: InterceptedRequest) => void): () => void {
    this.onRequestCallbacks.push(callback)
    return () => {
      this.onRequestCallbacks = this.onRequestCallbacks.filter(cb => cb !== callback)
    }
  }

  getStats(): InterceptionStats {
    return { ...this.stats }
  }

  resetStats(): void {
    this.stats = {
      totalRequests: 0,
      interceptedRequests: 0,
      mockedResponses: 0,
      errorsInjected: 0,
      delayedRequests: 0,
    }
  }

  get active(): boolean {
    return this.isActive
  }

  private createInterceptedFetch(): FetchFn {
    const interceptor = this

    const interceptedFetch = async (
      input: Request | string | URL,
      init?: RequestInit
    ): Promise<Response> => {
      interceptor.stats.totalRequests++

      const url = typeof input === 'string' ? input : input.toString()
      const method = init?.method || 'GET'
      const headers: Record<string, string> = {}

      if (init?.headers) {
        if (init.headers instanceof Headers) {
          init.headers.forEach((value, key) => {
            headers[key] = value
          })
        } else if (Array.isArray(init.headers)) {
          init.headers.forEach(([key, value]) => {
            headers[key] = value
          })
        } else {
          Object.assign(headers, init.headers)
        }
      }

      const body = init?.body?.toString()

      const interceptedRequest: InterceptedRequest = {
        url,
        method,
        headers,
        body,
      }

      // Notify listeners
      interceptor.onRequestCallbacks.forEach(cb => {
        try {
          cb(interceptedRequest)
        } catch {
          // Ignore errors in callbacks
        }
      })

      // Find matching rule
      const matchingRule = interceptor.findMatchingRule(interceptedRequest)

      if (matchingRule) {
        interceptor.stats.interceptedRequests++

        // Apply delay if specified
        if (matchingRule.delayMs && matchingRule.delayMs > 0) {
          interceptor.stats.delayedRequests++
          await new Promise(resolve => setTimeout(resolve, matchingRule.delayMs))
        }

        // Inject error if specified
        if (matchingRule.error && matchingRule.probability && Math.random() < matchingRule.probability) {
          interceptor.stats.errorsInjected++
          throw new Error(matchingRule.error)
        }

        // Return mock response if specified
        if (matchingRule.response) {
          interceptor.stats.mockedResponses++

          if (matchingRule.response.delayMs && matchingRule.response.delayMs > 0) {
            await new Promise(resolve => setTimeout(resolve, matchingRule.response!.delayMs))
          }

          return new Response(matchingRule.response.body, {
            status: matchingRule.response.status,
            statusText: matchingRule.response.statusText,
            headers: matchingRule.response.headers,
          })
        }
      }

      // Fall through to original fetch
      if (!interceptor.originalFetch) {
        throw new Error('Network interceptor: original fetch not available')
      }

      return interceptor.originalFetch(input, init)
    }

    return interceptedFetch as FetchFn
  }

  private findMatchingRule(request: InterceptedRequest): InterceptionRule | undefined {
    for (const rule of this.rules) {
      // Check method match if specified
      if (rule.method && rule.method !== request.method) {
        continue
      }

      // Check URL pattern match
      let matches = false
      if (typeof rule.pattern === 'string') {
        matches = request.url.includes(rule.pattern)
      } else {
        matches = rule.pattern.test(request.url)
      }

      if (matches) {
        // Check probability
        if (rule.probability !== undefined && Math.random() >= rule.probability) {
          continue
        }
        return rule
      }
    }
    return undefined
  }
}

/**
 * Singleton instance for global use
 */
let globalInterceptor: NetworkInterceptor | null = null

/**
 * Get or create the global network interceptor
 */
export function getGlobalNetworkInterceptor(): NetworkInterceptor {
  if (!globalInterceptor) {
    globalInterceptor = new NetworkInterceptor()
  }
  return globalInterceptor
}

/**
 * Reset the global interceptor (useful for testing)
 */
export function resetGlobalNetworkInterceptor(): void {
  if (globalInterceptor) {
    globalInterceptor.stop()
    globalInterceptor = null
  }
}
