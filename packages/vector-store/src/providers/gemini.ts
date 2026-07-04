import { IEmbeddingProvider, IEmbeddingConfig } from '@loopwork-ai/contracts'
import { RateLimitError, isRateLimitError, isTransientError } from '@loopwork-ai/resilience'

export type GeminiEmbeddingConfig = IEmbeddingConfig

export class GeminiEmbeddingProvider implements IEmbeddingProvider {
  readonly name = 'gemini-embedding'

  private apiKey: string
  private model: string
  private baseUrl: string
  private timeoutMs: number

  constructor(config: GeminiEmbeddingConfig = {}) {
    this.apiKey = config.apiKey || process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || ''
    this.model = config.model || 'embedding-001'
    this.baseUrl = config.baseUrl || 'https://generativelanguage.googleapis.com/v1beta'
    this.timeoutMs = config.timeoutMs || 30000
  }

  async embed(text: string): Promise<number[]> {
    if (!this.apiKey) {
      throw new Error('Gemini API key not configured. Set GEMINI_API_KEY or GOOGLE_API_KEY env var, or pass apiKey in config.')
    }

    try {
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), this.timeoutMs)

      const response = await fetch(`${this.baseUrl}/models/${this.model}:embedContent?key=${this.apiKey}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          content: {
            parts: [{ text }],
          },
        }),
        signal: controller.signal,
      })

      clearTimeout(timeoutId)

      if (!response.ok) {
        await this.handleError(response)
      }

      const data = await response.json() as { embedding: { values: number[] } }
      return data.embedding.values
    } catch (error) {
      this.handleRequestError(error)
      throw error
    }
  }

  async embedBatch(texts: string[]): Promise<number[][]> {
    if (!this.apiKey) {
      throw new Error('Gemini API key not configured. Set GEMINI_API_KEY or GOOGLE_API_KEY env var, or pass apiKey in config.')
    }

    try {
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), this.timeoutMs)

      const requests = texts.map(text => ({
        model: `models/${this.model}`,
        content: {
          parts: [{ text }],
        },
      }))

      const response = await fetch(`${this.baseUrl}/models/${this.model}:batchEmbedContents?key=${this.apiKey}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ requests }),
        signal: controller.signal,
      })

      clearTimeout(timeoutId)

      if (!response.ok) {
        await this.handleError(response)
      }

      const data = await response.json() as { embeddings: { values: number[] }[] }
      return data.embeddings.map(item => item.values)
    } catch (error) {
      this.handleRequestError(error)
      throw error
    }
  }

  private async handleError(response: Response): Promise<never> {
    const errorText = await response.text()
    const errorMessage = `Gemini API error: ${response.status} - ${errorText}`

    if (response.status === 429 || isRateLimitError(errorText)) {
      throw new RateLimitError(errorMessage, response.status)
    }

    if (isTransientError(errorText) || response.status >= 500) {
      throw new Error(`Transient error: ${errorMessage}`)
    }

    throw new Error(errorMessage)
  }

  private handleRequestError(error: unknown): void {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error(`Gemini API timeout after ${this.timeoutMs}ms`)
    }

    if (error instanceof RateLimitError) {
      throw error
    }

    if (isRateLimitError(error)) {
      throw new RateLimitError(String(error), 429)
    }

    if (isTransientError(error)) {
      throw new Error(`Transient error: ${error}`)
    }

    throw error
  }
}

export function createGeminiEmbeddingProvider(config?: GeminiEmbeddingConfig): GeminiEmbeddingProvider {
  return new GeminiEmbeddingProvider(config)
}
