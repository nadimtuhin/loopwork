import { IEmbeddingProvider, IEmbeddingConfig } from '@loopwork-ai/contracts'
import { RateLimitError, isRateLimitError, isTransientError } from '@loopwork-ai/resilience'

export type OpenAIEmbeddingConfig = IEmbeddingConfig & {
  dimensions?: number
}

export class OpenAIEmbeddingProvider implements IEmbeddingProvider {
  readonly name = 'openai-embedding'

  private apiKey: string
  private model: string
  private dimensions?: number
  private baseUrl: string
  private timeoutMs: number

  constructor(config: OpenAIEmbeddingConfig = {}) {
    this.apiKey = config.apiKey || process.env.OPENAI_API_KEY || ''
    this.model = config.model || 'text-embedding-3-small'
    this.dimensions = config.dimensions
    this.baseUrl = config.baseUrl || 'https://api.openai.com/v1'
    this.timeoutMs = config.timeoutMs || 30000
  }

  async embed(text: string): Promise<number[]> {
    const response = await this.callEmbeddingApi([text])
    return response[0]
  }

  async embedBatch(texts: string[]): Promise<number[][]> {
    return this.callEmbeddingApi(texts)
  }

  private async callEmbeddingApi(texts: string[]): Promise<number[][]> {
    if (!this.apiKey) {
      throw new Error('OpenAI API key not configured. Set OPENAI_API_KEY env var or pass apiKey in config.')
    }

    const body: Record<string, unknown> = {
      model: this.model,
      input: texts,
    }

    if (this.dimensions) {
      body.dimensions = this.dimensions
    }

    try {
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), this.timeoutMs)

      const response = await fetch(`${this.baseUrl}/embeddings`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      })

      clearTimeout(timeoutId)

      if (!response.ok) {
        const errorText = await response.text()
        const errorMessage = `OpenAI API error: ${response.status} - ${errorText}`

        if (response.status === 429 || isRateLimitError(errorText)) {
          throw new RateLimitError(errorMessage, response.status)
        }

        if (isTransientError(errorText) || response.status >= 500) {
          throw new Error(`Transient error: ${errorMessage}`)
        }

        throw new Error(errorMessage)
      }

      const data = await response.json() as { data: { embedding: number[] }[] }

      return data.data.map(item => item.embedding)
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        throw new Error(`OpenAI API timeout after ${this.timeoutMs}ms`)
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
}

export function createOpenAIEmbeddingProvider(config?: OpenAIEmbeddingConfig): OpenAIEmbeddingProvider {
  return new OpenAIEmbeddingProvider(config)
}
