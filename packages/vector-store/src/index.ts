export {
  OpenAIEmbeddingProvider,
  createOpenAIEmbeddingProvider,
  type OpenAIEmbeddingConfig,
} from './providers/openai'

export {
  GeminiEmbeddingProvider,
  createGeminiEmbeddingProvider,
  type GeminiEmbeddingConfig,
} from './providers/gemini'

export type { IEmbeddingProvider, IEmbeddingConfig } from '@loopwork-ai/contracts'

export { LocalVectorStore } from './local-store'
export type { Document, SearchOptions, SearchResult } from './local-store'
