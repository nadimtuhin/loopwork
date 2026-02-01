/**
 * OpenAI Embedding Provider
 *
 * Provides embeddings using OpenAI API
 */

import type { EmbeddingProvider } from '../contracts/embedding'

export interface OpenAIEmbeddingConfig {
  apiKey?: string
  model?: string
  dimensions?: number
  baseUrl?: string
}

export class OpenAIEmbeddingProvider implements EmbeddingProvider {
  readonly name = 'openai-embedding'

  private apiKey: string
  private model: string
  private dimensions?: number
  private baseUrl: string

  constructor(config: OpenAIEmbeddingConfig = {}) {
    this.apiKey = config.apiKey || process.env.OPENAI_API_KEY || ''
    this.model = config.model || 'text-embedding-3-small'
    this.dimensions = config.dimensions
    this.baseUrl = config.baseUrl || 'https://api.openai.com/v1'
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

    const response = await fetch(`${this.baseUrl}/embeddings`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify(body),
    })

    if (!response.ok) {
      const error = await response.text()
      throw new Error(`OpenAI API error: ${response.status} - ${error}`)
    }

    const data = await response.json() as { data: { embedding: number[] }[] }

    return data.data.map(item => item.embedding)
  }
}

export function createOpenAIEmbeddingProvider(config?: OpenAIEmbeddingConfig): OpenAIEmbeddingProvider {
  return new OpenAIEmbeddingProvider(config)
}
