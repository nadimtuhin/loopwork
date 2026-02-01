/**
 * Embeddings Plugin
 *
 * Provides embedding and vector store management
 */

import type { ConfigWrapper } from '../contracts'
import type { EmbeddingProvider } from '../contracts/embedding'
import type { VectorStore } from '../contracts/vector-store'
import { LocalVectorStore } from '../vector-stores/local-vector-store'
import { createOpenAIEmbeddingProvider, type OpenAIEmbeddingConfig } from './openai-embedding'
import { createGeminiEmbeddingProvider, type GeminiEmbeddingConfig } from './gemini-embedding'

export interface EmbeddingPluginOptions {
  provider?: EmbeddingProvider
  providerType?: 'openai' | 'gemini'
  providerConfig?: OpenAIEmbeddingConfig | GeminiEmbeddingConfig
}

export interface VectorStorePluginOptions {
  store?: VectorStore
}

export function createEmbeddingProvider(type: 'openai' | 'gemini' = 'openai', config?: Record<string, unknown>): EmbeddingProvider {
  switch (type) {
    case 'openai':
      return createOpenAIEmbeddingProvider(config as OpenAIEmbeddingConfig)
    case 'gemini':
      return createGeminiEmbeddingProvider(config as GeminiEmbeddingConfig)
    default:
      throw new Error(`Unknown embedding provider type: ${type}`)
  }
}

export function createVectorStore(): VectorStore {
  return new LocalVectorStore()
}

export function withEmbeddings(options: EmbeddingPluginOptions = {}): ConfigWrapper {
  return (config) => {
    // Store embedding provider in config for later use
    return {
      ...config,
      _embeddingProvider: options.provider || (options.providerType ? createEmbeddingProvider(options.providerType, options.providerConfig as Record<string, unknown>) : undefined),
    }
  }
}

export function withVectorStore(options: VectorStorePluginOptions = {}): ConfigWrapper {
  return (config) => {
    // Store vector store in config for later use
    return {
      ...config,
      _vectorStore: options.store || createVectorStore(),
    }
  }
}

export function withEmbeddingAndVectorStore(
  embeddingOptions: EmbeddingPluginOptions = {},
  vectorStoreOptions: VectorStorePluginOptions = {}
): ConfigWrapper {
  return (config) => {
    const provider = embeddingOptions.provider ||
      (embeddingOptions.providerType ? createEmbeddingProvider(embeddingOptions.providerType, embeddingOptions.providerConfig as Record<string, unknown>) : undefined)
    const store = vectorStoreOptions.store || createVectorStore()

    return {
      ...config,
      _embeddingProvider: provider,
      _vectorStore: store,
    }
  }
}

// Re-export providers for direct usage
export { createOpenAIEmbeddingProvider, type OpenAIEmbeddingConfig } from './openai-embedding'
export { createGeminiEmbeddingProvider, type GeminiEmbeddingConfig } from './gemini-embedding'
