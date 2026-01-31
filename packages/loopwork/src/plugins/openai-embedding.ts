/**
 * OpenAI Embedding Provider
 *
 * Provides embeddings using OpenAI API
 */

import type { EmbeddingProvider } from '../contracts/embedding'

export class OpenAIEmbeddingProvider implements EmbeddingProvider {
  async embed( _text: string): Promise<number[]> {
    throw new Error('OpenAI embeddings not implemented')
  }

  async embedBatch( _texts: string[]): Promise<number[][]> {
    throw new Error('OpenAI embeddings not implemented')
  }
}

export function createOpenAIEmbeddingProvider(): OpenAIEmbeddingProvider {
  return new OpenAIEmbeddingProvider()
}
