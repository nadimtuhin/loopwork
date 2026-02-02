/**
 * Memory Retriever Tests
 */

import { describe, test, expect, beforeEach, mock } from 'bun:test'
import { MemoryRetriever, createMemoryRetriever } from '../../src/memory/retriever'
import type { VectorStore, SearchResult, Document } from '../../src/contracts/vector-store'
import type { EmbeddingProvider } from '../../src/contracts/embedding'

function createMockDocument(id: string, content: string, embedding?: number[]): Document {
  return {
    id,
    content,
    embedding,
    metadata: { filePath: `test-${id}.ts` },
  }
}

function createMockSearchResults(documents: Document[]): SearchResult[] {
  return documents.map((doc, index) => ({
    document: doc,
    score: 1 - index * 0.1, // Decreasing scores
  }))
}

describe('MemoryRetriever', () => {
  let mockVectorStore: VectorStore
  let mockEmbeddingProvider: EmbeddingProvider

  beforeEach(() => {
    mockVectorStore = {
      add: mock(async () => {}),
      search: mock(async (query: string | number[], options?: { limit?: number; threshold?: number }) => {
        const docs = [
          createMockDocument('doc1', 'function test() { return 1; }', [0.9, 0.1]),
          createMockDocument('doc2', 'class TestClass { constructor() {} }', [0.8, 0.2]),
          createMockDocument('doc3', 'interface TestInterface { run(): void; }', [0.7, 0.3]),
        ]
        return createMockSearchResults(docs)
      }),
      delete: mock(async () => {}),
      clear: mock(async () => {}),
    }

    mockEmbeddingProvider = {
      name: 'test',
      embed: mock(async (text: string) => [0.5, 0.5]),
      embedBatch: mock(async (texts: string[]) => texts.map(() => [0.5, 0.5])),
    }
  })

  describe('constructor', () => {
    test('should create retriever with vector store', () => {
      const retriever = new MemoryRetriever({ vectorStore: mockVectorStore })
      expect(retriever).toBeDefined()
    })

    test('should create retriever with vector store and embedding provider', () => {
      const retriever = new MemoryRetriever({
        vectorStore: mockVectorStore,
        embeddingProvider: mockEmbeddingProvider,
      })
      expect(retriever).toBeDefined()
    })

    test('should use default limit and threshold', () => {
      const retriever = new MemoryRetriever({
        vectorStore: mockVectorStore,
        defaultLimit: 5,
        defaultThreshold: 0.3,
      })
      expect(retriever).toBeDefined()
    })
  })

  describe('retrieve', () => {
    test('should retrieve documents from vector store', async () => {
      const retriever = new MemoryRetriever({ vectorStore: mockVectorStore })

      const results = await retriever.retrieve('test query')

      expect(results).toBeDefined()
      expect(Array.isArray(results)).toBe(true)
      expect(results.length).toBeGreaterThan(0)
    })

    test('should limit results to specified count', async () => {
      const retriever = new MemoryRetriever({ vectorStore: mockVectorStore })

      const results = await retriever.retrieve('test query', { limit: 2 })

      expect(results.length).toBeLessThanOrEqual(2)
    })

    test('should respect threshold option', async () => {
      const retriever = new MemoryRetriever({ vectorStore: mockVectorStore })

      const results = await retriever.retrieve('test query', { threshold: 0.7 })

      // With mock scores 1.0, 0.8, 0.7, all should pass threshold 0.7
      for (const result of results) {
        expect(result.score).toBeGreaterThanOrEqual(0.7)
      }
    })

    test('should include relevance categories', async () => {
      const retriever = new MemoryRetriever({ vectorStore: mockVectorStore })

      const results = await retriever.retrieve('test query')

      for (const result of results) {
        expect(['high', 'medium', 'low']).toContain(result.relevance)
      }
    })

    test('should apply token limit when specified', async () => {
      const retriever = new MemoryRetriever({ vectorStore: mockVectorStore })

      const results = await retriever.retrieve('test query', { maxTokens: 100 })

      // All content should fit within token limit
      const totalTokens = results.reduce((sum, r) => Math.ceil(r.document.content.length / 4), 0)
      expect(totalTokens).toBeLessThanOrEqual(100)
    })
  })

  describe('retrieveWithStats', () => {
    test('should return results with statistics', async () => {
      const retriever = new MemoryRetriever({ vectorStore: mockVectorStore })

      const { results, stats } = await retriever.retrieveWithStats('test query')

      expect(results).toBeDefined()
      expect(stats).toBeDefined()
      expect(typeof stats.totalDocumentsSearched).toBe('number')
      expect(typeof stats.resultsReturned).toBe('number')
      expect(typeof stats.totalTokens).toBe('number')
      expect(typeof stats.searchTimeMs).toBe('number')
    })

    test('should track search time', async () => {
      const retriever = new MemoryRetriever({ vectorStore: mockVectorStore })

      const { stats } = await retriever.retrieveWithStats('test query')

      expect(stats.searchTimeMs).toBeGreaterThanOrEqual(0)
    })
  })

  describe('retrieveAsContext', () => {
    test('should format results as context string', async () => {
      const retriever = new MemoryRetriever({ vectorStore: mockVectorStore })

      const { context, stats } = await retriever.retrieveAsContext('test query')

      expect(context).toBeDefined()
      expect(typeof context).toBe('string')
      expect(context.length).toBeGreaterThan(0)
      expect(stats).toBeDefined()
    })

    test('should include source information in context', async () => {
      const retriever = new MemoryRetriever({ vectorStore: mockVectorStore })

      const { context } = await retriever.retrieveAsContext('test query')

      expect(context).toContain('File:')
    })
  })

  describe('retrieveBatch', () => {
    test('should retrieve for multiple queries', async () => {
      const retriever = new MemoryRetriever({ vectorStore: mockVectorStore })

      const results = await retriever.retrieveBatch([
        { query: 'query1' },
        { query: 'query2', options: { limit: 3 } },
      ])

      expect(results.has('query1')).toBe(true)
      expect(results.has('query2')).toBe(true)
      expect(results.get('query1')).toBeDefined()
      expect(results.get('query2')).toBeDefined()
    })
  })
})

describe('createMemoryRetriever', () => {
  test('should create retriever with factory function', () => {
    const mockVectorStore = {
      add: mock(async () => {}),
      search: mock(async () => []),
      delete: mock(async () => {}),
      clear: mock(async () => {}),
    }

    const retriever = createMemoryRetriever(mockVectorStore)
    expect(retriever).toBeDefined()
  })
})
