import { describe, expect, test, beforeEach, afterEach } from 'bun:test'
import {
  OpenAIEmbeddingProvider,
  createOpenAIEmbeddingProvider,
  type OpenAIEmbeddingConfig,
} from '../openai'

type FetchMock = (
  url: string | URL | Request,
  init?: RequestInit
) => Promise<Response>

describe('OpenAIEmbeddingProvider', () => {
  const originalFetch = globalThis.fetch as FetchMock
  const originalEnv = process.env.OPENAI_API_KEY

  beforeEach(() => {
    process.env.OPENAI_API_KEY = 'test-api-key'
  })

  afterEach(() => {
    globalThis.fetch = originalFetch
    process.env.OPENAI_API_KEY = originalEnv
  })

  describe('constructor', () => {
    test('should instantiate without errors', () => {
      const instance = new OpenAIEmbeddingProvider()
      expect(instance).toBeDefined()
      expect(instance.name).toBe('openai-embedding')
    })

    test('should accept custom config', () => {
      const config: OpenAIEmbeddingConfig = {
        apiKey: 'custom-key',
        model: 'text-embedding-3-large',
        dimensions: 256,
        baseUrl: 'https://custom.openai.com',
        timeoutMs: 5000,
      }
      const instance = new OpenAIEmbeddingProvider(config)
      expect(instance).toBeDefined()
      expect(instance.name).toBe('openai-embedding')
    })

    test('should use environment variable for API key', () => {
      process.env.OPENAI_API_KEY = 'env-api-key'
      const instance = new OpenAIEmbeddingProvider()
      expect(instance).toBeDefined()
    })
  })

  describe('createOpenAIEmbeddingProvider', () => {
    test('should be a function', () => {
      expect(typeof createOpenAIEmbeddingProvider).toBe('function')
    })

    test('should create provider without config', () => {
      const provider = createOpenAIEmbeddingProvider()
      expect(provider).toBeInstanceOf(OpenAIEmbeddingProvider)
      expect(provider.name).toBe('openai-embedding')
    })

    test('should create provider with config', () => {
      const config: OpenAIEmbeddingConfig = {
        apiKey: 'test-key',
        model: 'text-embedding-3-small',
      }
      const provider = createOpenAIEmbeddingProvider(config)
      expect(provider).toBeInstanceOf(OpenAIEmbeddingProvider)
    })
  })

  describe('embed', () => {
    test('should throw error when API key is not configured', async () => {
      process.env.OPENAI_API_KEY = ''
      const provider = new OpenAIEmbeddingProvider()

      expect(provider.embed('test text')).rejects.toThrow('OpenAI API key not configured')
    })

    test('should make correct API request', async () => {
      let capturedRequest: RequestInit | undefined
      let capturedUrl: string | undefined

      globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
        capturedUrl = url.toString()
        capturedRequest = init

        return new Response(
          JSON.stringify({
            data: [{ embedding: [0.1, 0.2, 0.3] }],
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        )
      }) as FetchMock

      const provider = new OpenAIEmbeddingProvider({
        apiKey: 'test-key',
        model: 'text-embedding-3-small',
      })

      await provider.embed('test text')

      expect(capturedUrl).toBe('https://api.openai.com/v1/embeddings')
      expect(capturedRequest?.method).toBe('POST')
      expect(capturedRequest?.headers).toMatchObject({
        'Content-Type': 'application/json',
        'Authorization': 'Bearer test-key',
      })

      const body = JSON.parse(capturedRequest?.body as string)
      expect(body).toMatchObject({
        model: 'text-embedding-3-small',
        input: ['test text'],
      })
    })

    test('should return embedding from response', async () => {
      globalThis.fetch = (async () => {
        return new Response(
          JSON.stringify({
            data: [{ embedding: [0.1, 0.2, 0.3, 0.4, 0.5] }],
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        )
      }) as FetchMock

      const provider = new OpenAIEmbeddingProvider({ apiKey: 'test-key' })
      const result = await provider.embed('test text')

      expect(result).toEqual([0.1, 0.2, 0.3, 0.4, 0.5])
    })

    test('should include dimensions when specified', async () => {
      let capturedBody: Record<string, unknown> | undefined

      globalThis.fetch = (async (_url: string | URL | Request, init?: RequestInit) => {
        capturedBody = JSON.parse(init?.body as string)

        return new Response(
          JSON.stringify({
            data: [{ embedding: [0.1, 0.2] }],
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        )
      }) as FetchMock

      const provider = new OpenAIEmbeddingProvider({
        apiKey: 'test-key',
        dimensions: 2,
      })

      await provider.embed('test text')

      expect(capturedBody?.dimensions).toBe(2)
    })
  })

  describe('embedBatch', () => {
    test('should make correct API request for multiple texts', async () => {
      let capturedBody: Record<string, unknown> | undefined

      globalThis.fetch = (async (_url: string | URL | Request, init?: RequestInit) => {
        capturedBody = JSON.parse(init?.body as string)

        return new Response(
          JSON.stringify({
            data: [
              { embedding: [0.1, 0.2] },
              { embedding: [0.3, 0.4] },
            ],
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        )
      }) as FetchMock

      const provider = new OpenAIEmbeddingProvider({ apiKey: 'test-key' })
      const result = await provider.embedBatch(['text1', 'text2'])

      expect(capturedBody?.input).toEqual(['text1', 'text2'])
      expect(result).toHaveLength(2)
      expect(result[0]).toEqual([0.1, 0.2])
      expect(result[1]).toEqual([0.3, 0.4])
    })
  })

  describe('error handling', () => {
    test('should throw RateLimitError on 429 status', async () => {
      globalThis.fetch = (async () => {
        return new Response(
          JSON.stringify({ error: { message: 'Rate limit exceeded' } }),
          { status: 429, headers: { 'Content-Type': 'application/json' } }
        )
      }) as FetchMock

      const provider = new OpenAIEmbeddingProvider({ apiKey: 'test-key' })

      try {
        await provider.embed('test')
        expect(false).toBe(true)
      } catch (error: any) {
        expect(error.name).toBe('RateLimitError')
        expect(error.code).toBe(429)
      }
    })

    test('should throw error with timeout message on transient error', async () => {
      globalThis.fetch = (async () => {
        return new Response(
          JSON.stringify({ error: { message: 'Internal server error' } }),
          { status: 500, headers: { 'Content-Type': 'application/json' } }
        )
      }) as FetchMock

      const provider = new OpenAIEmbeddingProvider({ apiKey: 'test-key' })

      expect(provider.embed('test')).rejects.toThrow('Transient error')
    })
  })
})
