/**
 * Local Vector Store
 *
 * In-memory vector store implementation
 */

import type { VectorStore, Document, SearchOptions, SearchResult } from '../contracts/vector-store'

export class LocalVectorStore implements VectorStore {
  private documents: Map<string, Document> = new Map()

  async add(document: Document): Promise<void> {
    this.documents.set(document.id, document)
  }

  async search(_embedding: number[], _options?: SearchOptions): Promise<SearchResult[]> {
    // Stub implementation - returns empty results
    return []
  }

  async delete(id: string): Promise<void> {
    this.documents.delete(id)
  }

  async clear(): Promise<void> {
    this.documents.clear()
  }
}
