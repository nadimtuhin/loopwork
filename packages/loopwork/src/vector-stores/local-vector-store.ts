/**
 * Local Vector Store
 *
 * In-memory vector store implementation with cosine similarity search
 */

import type { VectorStore, Document, SearchOptions, SearchResult } from '../contracts/vector-store'

export class LocalVectorStore implements VectorStore {
  private documents: Map<string, Document> = new Map()

  async add(documents: Document[]): Promise<void> {
    for (const doc of documents) {
      this.documents.set(doc.id, doc)
    }
  }

  async search(query: string | number[], options?: SearchOptions): Promise<SearchResult[]> {
    let queryEmbedding: number[]

    // Handle both string queries (embed the text) and pre-computed embeddings
    if (typeof query === 'string') {
      // For string queries, we need to find documents that contain the query text
      // Since we don't have an embedding provider here, do a simple text search
      const results: SearchResult[] = []
      const queryLower = query.toLowerCase()
      const limit = options?.limit || 5

      for (const doc of this.documents.values()) {
        if (doc.content.toLowerCase().includes(queryLower)) {
          // Simple relevance score based on content match
          const score = this.calculateTextMatchScore(queryLower, doc.content.toLowerCase())
          if (options?.threshold === undefined || score >= options.threshold) {
            results.push({ document: doc, score })
            if (results.length >= limit) break
          }
        }
      }

      return results.sort((a, b) => b.score - a.score)
    }

    // For embedding queries, use cosine similarity
    queryEmbedding = query

    const results: SearchResult[] = []
    const limit = options?.limit || 5
    const threshold = options?.threshold

    for (const doc of this.documents.values()) {
      if (!doc.embedding) continue

      const score = this.cosineSimilarity(queryEmbedding, doc.embedding)

      if (threshold === undefined || score >= threshold) {
        results.push({ document: doc, score })
      }
    }

    // Sort by score descending and limit results
    return results
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
  }

  async delete(id: string): Promise<void> {
    this.documents.delete(id)
  }

  async clear(): Promise<void> {
    this.documents.clear()
  }

  /**
   * Calculate cosine similarity between two vectors
   */
  private cosineSimilarity(a: number[], b: number[]): number {
    if (a.length !== b.length) return 0

    let dotProduct = 0
    let normA = 0
    let normB = 0

    for (let i = 0; i < a.length; i++) {
      dotProduct += a[i] * b[i]
      normA += a[i] * a[i]
      normB += b[i] * b[i]
    }

    const denominator = Math.sqrt(normA) * Math.sqrt(normB)
    if (denominator === 0) return 0

    return dotProduct / denominator
  }

  /**
   * Calculate a simple text match score
   */
  private calculateTextMatchScore(query: string, content: string): number {
    const queryWords = query.split(/\s+/)
    const contentWords = content.split(/\s+/)

    let matchCount = 0
    for (const queryWord of queryWords) {
      if (contentWords.includes(queryWord)) {
        matchCount++
      }
    }

    return matchCount / queryWords.length
  }
}
