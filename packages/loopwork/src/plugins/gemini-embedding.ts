/**
 * Gemini Embedding Provider
 *
 * Provides embeddings using Google Gemini API
 */

import type { EmbeddingProvider } from '../contracts/embedding'

export class GeminiEmbeddingProvider implements EmbeddingProvider {
  async embed( _text: string): Promise<number[]> {
    throw new Error('Gemini embeddings not implemented')
  }

  async embedBatch( _texts: string[]): Promise<number[][]> {
    throw new Error('Gemini embeddings not implemented')
  }
}

export function createGeminiEmbeddingProvider(): GeminiEmbeddingProvider {
  return new GeminiEmbeddingProvider()
}
