/**
 * Memory Retriever
 *
 * Retrieves relevant context from vector store based on queries.
 * Supports semantic search and keyword-based retrieval.
 */

import type { VectorStore, SearchResult, Document } from '../contracts/vector-store'
import type { EmbeddingProvider } from '../contracts/embedding'

export interface RetrievalOptions {
  /** Maximum number of results to retrieve */
  limit?: number

  /** Minimum similarity score threshold (0-1) */
  threshold?: number

  /** Filter documents by metadata */
  filter?: Record<string, unknown>

  /** Whether to use semantic search (embedding-based) or keyword search */
  useSemanticSearch?: boolean

  /** Maximum tokens for retrieved content */
  maxTokens?: number

  /** Whether to include document metadata in results */
  includeMetadata?: boolean
}

export interface RetrievalResult {
  document: Document
  score: number
  relevance: 'high' | 'medium' | 'low'
}

export interface RetrievalStats {
  totalDocumentsSearched: number
  resultsReturned: number
  totalTokens: number
  searchTimeMs: number
}

export interface RetrieverOptions {
  vectorStore: VectorStore
  embeddingProvider?: EmbeddingProvider
  defaultLimit?: number
  defaultThreshold?: number
}

/**
 * Memory Retriever - Retrieves relevant context from vector store
 */
export class MemoryRetriever {
  private vectorStore: VectorStore
  private embeddingProvider?: EmbeddingProvider
  private defaultLimit: number
  private defaultThreshold: number

  constructor(options: RetrieverOptions) {
    this.vectorStore = options.vectorStore
    this.embeddingProvider = options.embeddingProvider
    this.defaultLimit = options.defaultLimit ?? 10
    this.defaultThreshold = options.defaultThreshold ?? 0.5
  }

  /**
   * Retrieve relevant documents based on a query
   */
  async retrieve(query: string, options: RetrievalOptions = {}): Promise<RetrievalResult[]> {
    const limit = options.limit ?? this.defaultLimit
    const threshold = options.threshold ?? this.defaultThreshold
    const useSemanticSearch = options.useSemanticSearch ?? true
    const maxTokens = options.maxTokens
    const includeMetadata = options.includeMetadata ?? true

    const startTime = Date.now()

    // Perform search based on mode
    let searchResults: SearchResult[]

    if (useSemanticSearch && this.embeddingProvider) {
      // Semantic search with embeddings
      searchResults = await this.vectorStore.search(query, {
        limit: limit * 2, // Get extra results for filtering
        threshold,
        filter: options.filter,
      })
    } else {
      // Keyword-based search
      searchResults = await this.vectorStore.search(query, {
        limit: limit * 2,
        threshold,
        filter: options.filter,
      })
    }

    // Filter and format results
    const results: RetrievalResult[] = searchResults.slice(0, limit).map((result) => ({
      document: result.document,
      score: result.score,
      relevance: this.calculateRelevance(result.score),
    }))

    // Apply token limit if specified
    if (maxTokens) {
      return this.applyTokenLimit(results, maxTokens)
    }

    // Record stats
    const searchTimeMs = Date.now() - startTime
    const totalTokens = results.reduce((sum, r) => sum + this.estimateTokens(r.document.content), 0)

    return results
  }

  /**
   * Retrieve documents with detailed statistics
   */
  async retrieveWithStats(
    query: string,
    options: RetrievalOptions = {}
  ): Promise<{ results: RetrievalResult[]; stats: RetrievalStats }> {
    const limit = options.limit ?? this.defaultLimit
    const threshold = options.threshold ?? this.defaultThreshold
    const useSemanticSearch = options.useSemanticSearch ?? true

    const startTime = Date.now()

    let searchResults: SearchResult[]

    if (useSemanticSearch && this.embeddingProvider) {
      searchResults = await this.vectorStore.search(query, {
        limit: limit * 2,
        threshold,
        filter: options.filter,
      })
    } else {
      searchResults = await this.vectorStore.search(query, {
        limit: limit * 2,
        threshold,
        filter: options.filter,
      })
    }

    const results: RetrievalResult[] = searchResults.slice(0, limit).map((result) => ({
      document: result.document,
      score: result.score,
      relevance: this.calculateRelevance(result.score),
    }))

    // Apply token limit if specified
    if (options.maxTokens) {
      const limitedResults = this.applyTokenLimit(results, options.maxTokens)
      const totalTokens = limitedResults.reduce((sum, r) => sum + this.estimateTokens(r.document.content), 0)

      return {
        results: limitedResults,
        stats: {
          totalDocumentsSearched: searchResults.length,
          resultsReturned: limitedResults.length,
          totalTokens,
          searchTimeMs: Date.now() - startTime,
        },
      }
    }

    const totalTokens = results.reduce((sum, r) => sum + this.estimateTokens(r.document.content), 0)

    return {
      results,
      stats: {
        totalDocumentsSearched: searchResults.length,
        resultsReturned: results.length,
        totalTokens,
        searchTimeMs: Date.now() - startTime,
      },
    }
  }

  /**
   * Retrieve and format results as context string for AI prompts
   */
  async retrieveAsContext(
    query: string,
    options: RetrievalOptions = {}
  ): Promise<{ context: string; stats: RetrievalStats }> {
    const { results, stats } = await this.retrieveWithStats(query, {
      ...options,
      includeMetadata: true,
    })

    const contextParts: string[] = []

    for (let i = 0; i < results.length; i++) {
      const result = results[i]
      const metadata = result.document.metadata

      let sourceInfo = `Source ${i + 1}`
      if (metadata?.filePath) {
        sourceInfo = `File: ${metadata.filePath}`
        if (metadata.lineStart !== undefined) {
          sourceInfo += `:${metadata.lineStart}-${metadata.lineEnd ?? ''}`
        }
      }

      contextParts.push(
        `[${sourceInfo}] (relevance: ${result.relevance}, score: ${result.score.toFixed(3)})\n` +
          result.document.content
      )
    }

    return {
      context: contextParts.join('\n\n---\n\n'),
      stats,
    }
  }

  /**
   * Batch retrieve for multiple queries
   */
  async retrieveBatch(
    queries: Array<{ query: string; options?: RetrievalOptions }>
  ): Promise<Map<string, RetrievalResult[]>> {
    const results = new Map<string, RetrievalResult[]>()

    await Promise.all(
      queries.map(async ({ query, options }) => {
        const retrievalResults = await this.retrieve(query, options)
        results.set(query, retrievalResults)
      })
    )

    return results
  }

  /**
   * Calculate relevance category based on score
   */
  private calculateRelevance(score: number): 'high' | 'medium' | 'low' {
    if (score >= 0.8) return 'high'
    if (score >= 0.5) return 'medium'
    return 'low'
  }

  /**
   * Estimate token count for content (rough approximation)
   */
  private estimateTokens(content: string): number {
    // Average of 4 characters per token
    return Math.ceil(content.length / 4)
  }

  /**
   * Apply token limit to results, keeping most relevant first
   */
  private applyTokenLimit(results: RetrievalResult[], maxTokens: number): RetrievalResult[] {
    const limited: RetrievalResult[] = []
    let totalTokens = 0

    for (const result of results) {
      const docTokens = this.estimateTokens(result.document.content)

      if (totalTokens + docTokens <= maxTokens) {
        limited.push(result)
        totalTokens += docTokens
      } else {
        // Truncate the last document if it would exceed the limit
        const remainingTokens = maxTokens - totalTokens
        if (remainingTokens > 0 && limited.length > 0) {
          const lastResult = limited[limited.length - 1]
          const truncatedContent = this.truncateToTokens(
            lastResult.document.content,
            remainingTokens
          )
          lastResult.document = {
            ...lastResult.document,
            content: truncatedContent,
          }
        }
        break
      }
    }

    return limited
  }

  /**
   * Truncate content to fit within token limit
   */
  private truncateToTokens(content: string, maxTokens: number): string {
    const approximateCharsPerToken = 4
    const maxChars = maxTokens * approximateCharsPerToken

    if (content.length <= maxChars) {
      return content
    }

    return content.slice(0, maxChars) + '...'
  }
}

/**
 * Create a MemoryRetriever from config
 */
export function createMemoryRetriever(
  vectorStore: VectorStore,
  embeddingProvider?: EmbeddingProvider
): MemoryRetriever {
  return new MemoryRetriever({
    vectorStore,
    embeddingProvider,
  })
}
