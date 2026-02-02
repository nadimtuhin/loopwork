import { describe, expect, test, beforeEach, afterEach } from 'bun:test'
import {
  GeminiEmbeddingProvider,
  createGeminiEmbeddingProvider,
  type GeminiEmbeddingConfig,
} from '../gemini'

type FetchMock = (
  url: string | URL | Request,
  init?: RequestInit
) => Promise<Response>

describe('GeminiEmbeddingProvider', () => {
  const originalFetch = globalThis.fetch
  const originalGeminiEnv = process.env.GEMINI_API_KEY
  const originalGoogleEnv = process.env.GOOGLE_API_KEY

  beforeEach(() => {
    process.env.GEMINI_API_KEY = 'test-api-key'
    process.env.GOOGLE_API_KEY = undefined
  })

  afterEach(() => {
    globalThis.fetch = originalFetch
    process.env.GEMINI_API_KEY = originalGeminiEnv
    process.env.GOOGLE_API_KEY = originalGoogleEnv
  })


  describe('constructor', () => {
    test('should instantiate without errors', () => {
      const instance = new GeminiEmbeddingProvider()
      expect(instance).toBeDefined()
      expect(instance.name).toBe('gemini-embedding')
    })

    test('should accept custom config', () => {
      const config: GeminiEmbeddingConfig = {
        apiKey: 'custom-key',
        model: 'embedding-002',
        baseUrl: 'https://custom.generativeai.googleapis.com',
        timeoutMs: 5000,
      }
      const instance = new GeminiEmbeddingProvider(config)
      expect(instance).toBeDefined()
      expect(instance.name).toBe('gemini-embedding')
    })

    test('should use GEMINI_API_KEY environment variable', () => {
      process.env.GEMINI_API_KEY = 'env-api-key'
      const instance = new GeminiEmbeddingProvider()
      expect(instance).toBeDefined()
    })

    test('should use GOOGLE_API_KEY as fallback', () => {
      process.env.GEMINI_API_KEY = undefined
      process.env.GOOGLE_API_KEY = 'google-env-key'
      const instance = new GeminiEmbeddingProvider()
      expect(instance).toBeDefined()
    })
  })

  describe('createGeminiEmbeddingProvider', () => {
    test('should be a function', () => {
      expect(typeof createGeminiEmbeddingProvider).toBe('function')
    })

    test('should create provider without config', () => {
      const provider = createGeminiEmbeddingProvider()
      expect(provider).toBeInstanceOf(GeminiEmbeddingProvider)
      expect(provider.name).toBe('gemini-embedding')
    })

    test('should create provider with config', () => {
      const config: GeminiEmbeddingConfig = {
        apiKey: 'test-key',
        model: 'embedding-001',
      }
      const provider = createGeminiEmbeddingProvider(config)
      expect(provider).toBeInstanceOf(GeminiEmbeddingProvider)
    })
  })

  describe('embed', () => {
    test('should throw error when API key is not configured', async () => {
      process.env.GEMINI_API_KEY = undefined
      process.env.GOOGLE_API_KEY = undefined
      const provider = new GeminiEmbeddingProvider()

      expect(provider.embed('test text')).rejects.toThrow('Gemini API key not configured')
    })

    test('should make correct API request', async () => {
      let capturedUrl: string | undefined
      let capturedRequest: RequestInit | undefined

      globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
        capturedUrl = url.toString()
        capturedRequest = init

        return new Response(
          JSON.stringify({
            embedding: { values: [0.1, 0.2, 0.3] },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        )
      }) as unknown as typeof fetch

      const provider = new GeminiEmbeddingProvider({
        apiKey: 'test-key',
        model: 'embedding-001',
      })

      await provider.embed('test text')

      expect(capturedUrl).toContain('generativelanguage.googleapis.com')
      expect(capturedUrl).toContain('models/embedding-001:embedContent')
      expect(capturedUrl).toContain('key=test-key')
      expect(capturedRequest?.method).toBe('POST')
      expect(capturedRequest?.headers).toMatchObject({
        'Content-Type': 'application/json',
      })

      const body = JSON.parse(capturedRequest?.body as string)
      expect(body).toMatchObject({
        content: {
          parts: [{ text: 'test text' }],
        },
      })
    })

    test('should return embedding from response', async () => {
      globalThis.fetch = (async () => {
        return new Response(
          JSON.stringify({
            embedding: { values: [0.1, 0.2, 0.3, 0.4, 0.5] },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        )
      }) as unknown as typeof fetch

      const provider = new GeminiEmbeddingProvider({ apiKey: 'test-key' })
      const result = await provider.embed('test text')

      expect(result).toEqual([0.1, 0.2, 0.3, 0.4, 0.5])
    })
  })

  describe('embedBatch', () => {
    test('should make correct API request for multiple texts', async () => {
      let capturedBody: Record<string, unknown> | undefined
      let capturedUrl: string | undefined

      globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
        capturedUrl = url.toString()
        capturedBody = JSON.parse(init?.body as string)

        return new Response(
          JSON.stringify({
            embeddings: [
              { values: [0.1, 0.2] },
              { values: [0.3, 0.4] },
            ],
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        )
      }) as unknown as typeof fetch

      const provider = new GeminiEmbeddingProvider({ apiKey: 'test-key' })
      const result = await provider.embedBatch(['text1', 'text2'])

      expect(capturedUrl).toContain(':batchEmbedContents')
      expect(capturedBody?.requests).toHaveLength(2)
      expect(capturedBody?.requests[0].content.parts[0].text).toBe('text1')
      expect(capturedBody?.requests[1].content.parts[0].text).toBe('text2')
      
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
      }) as unknown as typeof fetch

      const provider = new GeminiEmbeddingProvider({ apiKey: 'test-key' })

      try {
        await provider.embed('test')
        expect(false).toBe(true)
      } catch (error: any) {
        expect(error.name).toBe('RateLimitError')
        expect(error.code).toBe(429)
      }
    })

    test('should throw error with transient error message on 5xx', async () => {
      globalThis.fetch = (async () => {
        return new Response(
          JSON.stringify({ error: { message: 'Internal server error' } }),
          { status: 500, headers: { 'Content-Type': 'application/json' } }
        )
      }) as unknown as typeof fetch

      const provider = new GeminiEmbeddingProvider({ apiKey: 'test-key' })

      expect(provider.embed('test')).rejects.toThrow('Transient error')
    })
  })
})
