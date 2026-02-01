/**
 * Gemini Embedding Provider
 *
 * Provides embeddings using Google Gemini API
 */

import type { EmbeddingProvider } from '../contracts/embedding'

export interface GeminiEmbeddingConfig {
  apiKey?: string
  model?: string
  baseUrl?: string
}

export class GeminiEmbeddingProvider implements EmbeddingProvider {
  readonly name = 'gemini-embedding'

  private apiKey: string
  private model: string
  private baseUrl: string

  constructor(config: GeminiEmbeddingConfig = {}) {
    this.apiKey = config.apiKey || process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || ''
    this.model = config.model || 'embedding-001'
    this.baseUrl = config.baseUrl || 'https://generativelanguage.googleapis.com/v1beta'
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
      throw new Error('Gemini API key not configured. Set GEMINI_API_KEY or GOOGLE_API_KEY env var, or pass apiKey in config.')
    }

    const response = await fetch(`${this.baseUrl}/models/${this.model}:embedContent?key=${this.apiKey}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        content: {
          parts: texts.map(text => ({ text })),
        },
      }),
    })

    if (!response.ok) {
      const error = await response.text()
      throw new Error(`Gemini API error: ${response.status} - ${error}`)
    }

    const data = await response.json() as { embedding: { values: number[] }[] }

    return data.embedding.map(item => item.values)
  }
}

export function createGeminiEmbeddingProvider(config?: GeminiEmbeddingConfig): GeminiEmbeddingProvider {
  return new GeminiEmbeddingProvider(config)
}
