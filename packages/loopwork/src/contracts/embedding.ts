/**
 * Embedding Contract
 *
 * Types for embedding providers and vector operations
 */

export interface EmbeddingProvider {
  name: string
  embed(text: string): Promise<number[]>
  embedBatch(texts: string[]): Promise<number[][]>
}

export interface EmbeddingConfig {
  provider: string
  model?: string
  dimensions?: number
  apiKey?: string
}

export interface EmbeddingProviderFactory {
  create(config: EmbeddingConfig): EmbeddingProvider
}
