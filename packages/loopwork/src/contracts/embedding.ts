import type { IEmbeddingProvider, IEmbeddingConfig } from '@loopwork-ai/contracts'

export type EmbeddingProvider = IEmbeddingProvider
export type EmbeddingConfig = IEmbeddingConfig

export interface EmbeddingProviderFactory {
  create(config: EmbeddingConfig): EmbeddingProvider
}
