/**
 * Vector Store Contract
 *
 * Types for vector storage and similarity search
 */

export interface Document {
  id: string
  content: string
  embedding?: number[]
  metadata?: Record<string, unknown>
}

export interface SearchOptions {
  limit?: number
  threshold?: number
  filter?: Record<string, unknown>
}

export interface SearchResult {
  document: Document
  score: number
}

export interface VectorStore {
  add(documents: Document[]): Promise<void>
  search(query: string | number[], options?: SearchOptions): Promise<SearchResult[]>
  delete(id: string): Promise<void>
  clear(): Promise<void>
}

export interface VectorStoreConfig {
  type: string
  dimensions: number
  path?: string
}

export interface VectorStoreFactory {
  create(config: VectorStoreConfig): VectorStore
}
