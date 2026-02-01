import { describe, test, expect, beforeEach, afterEach } from 'bun:test'
import { mkdtempSync, writeFileSync, rmSync, readFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { SemanticCodeIndexer, calculateHash, detectLanguage, chunkCode, type CodeDocument, type IndexStatus,  } from '../src/core/semantic-indexer'
import { IndexPersistence } from '../src/utils/index-persistence'
import { LocalVectorStore } from '../src/vector-stores/local-vector-store'
import type { EmbeddingProvider } from '../src/contracts/embedding'

const mockEmbeddingProvider: EmbeddingProvider = {
  name: 'mock',
  async embed(text: string): Promise<number[]> {
    const hash = text.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0)
    return Array(10).fill(0).map((_, i) => (hash + i) % 100 / 100)
  },
  async embedBatch(texts: string[]): Promise<number[][]> {
    return Promise.all(texts.map(t => this.embed(t)))
  },
}

describe('SemanticCodeIndexer', () => {
  let indexer: SemanticCodeIndexer
  let vectorStore: LocalVectorStore
  let tempDir: string

  beforeEach(() => {
    vectorStore = new LocalVectorStore()
    indexer = new SemanticCodeIndexer({
      embeddingProvider: mockEmbeddingProvider,
      vectorStore,
    })
    tempDir = mkdtempSync(join(tmpdir(), 'semantic-indexer-test-'))
  })

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true })
  })

  test('calculateHash produces consistent hashes', () => {
    const content = 'const x = 1'
    const hash1 = calculateHash(content)
    const hash2 = calculateHash(content)
    expect(hash1).toBe(hash2)
  })

  test('calculateHash produces different hashes for different content', () => {
    const hash1 = calculateHash('const x = 1')
    const hash2 = calculateHash('const x = 2')
    expect(hash1).not.toBe(hash2)
  })

  test('detectLanguage recognizes TypeScript files', () => {
    expect(detectLanguage('file.ts')).toBe('typescript')
    expect(detectLanguage('file.tsx')).toBe('typescript')
  })

  test('detectLanguage recognizes JavaScript files', () => {
    expect(detectLanguage('file.js')).toBe('javascript')
    expect(detectLanguage('file.jsx')).toBe('javascript')
  })

  test('detectLanguage recognizes Python files', () => {
    expect(detectLanguage('file.py')).toBe('python')
  })

  test('detectLanguage returns undefined for unknown extensions', () => {
    expect(detectLanguage('file.xyz')).toBeUndefined()
  })

  test('chunkCode creates chunks for large files', () => {
    const lines = []
    for (let i = 0; i < 100; i++) {
      lines.push(`export function func${i}() { return ${i}; }`)
    }
    const content = lines.join('\n')
    const chunks = chunkCode(content, 'test.ts', 500, 100)
    expect(chunks.length).toBeGreaterThan(1)
  })

  test('chunkCode creates single chunk for small files', () => {
    const content = 'const x = 1'
    const chunks = chunkCode(content, 'test.ts', 1000, 200)
    expect(chunks.length).toBe(1)
    expect(chunks[0].content).toBe(content)
  })

  test('chunkCode tracks line numbers correctly', () => {
    const content = 'line1\nline2\nline3\nline4\nline5'
    const chunks = chunkCode(content, 'test.ts', 20, 5)
    expect(chunks[0].lineStart).toBe(1)
    expect(chunks[chunks.length - 1].lineEnd).toBe(5)
  })

  test('shouldIndexFile respects exclude patterns', () => {
    const indexerWithExcludes = new SemanticCodeIndexer({
      embeddingProvider: mockEmbeddingProvider,
      vectorStore,
      excludePatterns: [/node_modules/],
    })
    expect(indexerWithExcludes.shouldIndexFile('src/index.ts')).toBe(true)
    expect(indexerWithExcludes.shouldIndexFile('node_modules/lodash/index.js')).toBe(false)
  })

  test('shouldIndexFile respects include patterns', () => {
    const indexerWithIncludes = new SemanticCodeIndexer({
      embeddingProvider: mockEmbeddingProvider,
      vectorStore,
      includePatterns: [/\.ts$/],
    })
    expect(indexerWithIncludes.shouldIndexFile('src/index.ts')).toBe(true)
    expect(indexerWithIncludes.shouldIndexFile('src/index.js')).toBe(false)
  })

  test('indexFile creates documents with embeddings', async () => {
    const content = 'export function add(a: number, b: number): number { return a + b }'
    const docIds = await indexer.indexFile('test.ts', content, Date.now())
    expect(docIds.length).toBeGreaterThan(0)
  })

  test('indexFile only re-indexes changed files', async () => {
    const content = 'const x = 1'
    const lastModified = Date.now()

    const docIds1 = await indexer.indexFile('test.ts', content, lastModified)
    const docIds2 = await indexer.indexFile('test.ts', content, lastModified)

    expect(docIds1).toEqual(docIds2)
  })

  test('indexFile updates index when content changes', async () => {
    const content1 = 'const x = 1'
    const content2 = 'const x = 2'

    await indexer.indexFile('test.ts', content1, Date.now())
    const status1 = indexer.getIndexStatus()
    const hash1 = status1.get('test.ts')?.contentHash

    await indexer.indexFile('test.ts', content2, Date.now())
    const status2 = indexer.getIndexStatus()
    const hash2 = status2.get('test.ts')?.contentHash

    expect(hash1).not.toBe(hash2)
  })

  test('removeFile deletes documents from vector store', async () => {
    const content = 'const x = 1'
    const docIds = await indexer.indexFile('test.ts', content, Date.now())
    expect(docIds.length).toBeGreaterThan(0)

    await indexer.removeFile('test.ts')

    const results = await indexer.search('const x', 10)
    expect(results.length).toBe(0)
  })

  test('search returns results sorted by relevance', async () => {
    await indexer.indexFile('math.ts', 'export function add(a: number, b: number) { return a + b }', Date.now())
    await indexer.indexFile('string.ts', 'export function concat(a: string, b: string) { return a + b }', Date.now())

    const results = await indexer.search('add numbers', 10)
    expect(results.length).toBeGreaterThan(0)
    expect((results[0].document as CodeDocument).filePath).toBe('math.ts')
  })

  test('getStats returns correct counts', async () => {
    await indexer.indexFile('file1.ts', 'const x = 1', Date.now())
    await indexer.indexFile('file2.ts', 'const y = 2', Date.now())

    const stats = indexer.getStats()
    expect(stats.totalFiles).toBe(2)
    expect(stats.indexedFiles).toBe(2)
  })

  test('clear removes all documents', async () => {
    await indexer.indexFile('file1.ts', 'const x = 1', Date.now())
    await indexer.indexFile('file2.ts', 'const y = 2', Date.now())

    await indexer.clear()

    const results = await indexer.search('const', 10)
    expect(results.length).toBe(0)
  })

  test('loadIndexStatus restores previous state', () => {
    const statusMap = new Map<string, IndexStatus>([
      ['test.ts', {
        filePath: 'test.ts',
        lastIndexed: Date.now(),
        contentHash: 'abc123',
        documentIds: ['test.ts#chunk-0'],
      }],
    ])

    indexer.loadIndexStatus(statusMap)
    const currentStatus = indexer.getIndexStatus()
    expect(currentStatus.has('test.ts')).toBe(true)
  })
})

describe('IndexPersistence', () => {
  let tempDir: string
  let persistence: IndexPersistence

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'index-persistence-test-'))
    persistence = new IndexPersistence({ indexPath: join(tempDir, 'index.json') })
  })

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true })
  })

  test('save writes index status to disk', () => {
    const statusMap = new Map<string, IndexStatus>([
      ['test.ts', {
        filePath: 'test.ts',
        lastIndexed: 1234567890,
        contentHash: 'abc123',
        documentIds: ['test.ts#chunk-0'],
      }],
    ])

    persistence.save(statusMap)

    const content = readFileSync(join(tempDir, 'index.json'), 'utf-8')
    const parsed = JSON.parse(content)
    expect(parsed['test.ts']).toBeDefined()
    expect(parsed['test.ts'].contentHash).toBe('abc123')
  })

  test('load reads index status from disk', () => {
    const statusMap = new Map<string, IndexStatus>([
      ['test.ts', {
        filePath: 'test.ts',
        lastIndexed: 1234567890,
        contentHash: 'abc123',
        documentIds: ['test.ts#chunk-0'],
      }],
    ])

    persistence.save(statusMap)
    const loaded = persistence.load()

    expect(loaded.has('test.ts')).toBe(true)
    expect(loaded.get('test.ts')?.contentHash).toBe('abc123')
  })

  test('load returns empty map when file does not exist', () => {
    const persistenceNoFile = new IndexPersistence({ indexPath: join(tempDir, 'nonexistent.json') })
    const loaded = persistenceNoFile.load()
    expect(loaded.size).toBe(0)
  })

  test('load returns empty map for invalid JSON', () => {
    writeFileSync(join(tempDir, 'index.json'), 'invalid json')
    const loaded = persistence.load()
    expect(loaded.size).toBe(0)
  })

  test('clear resets the index file', () => {
    const statusMap = new Map<string, IndexStatus>([
      ['test.ts', {
        filePath: 'test.ts',
        lastIndexed: 1234567890,
        contentHash: 'abc123',
        documentIds: ['test.ts#chunk-0'],
      }],
    ])

    persistence.save(statusMap)
    persistence.clear()

    const loaded = persistence.load()
    expect(loaded.size).toBe(0)
  })
})

describe('Integration', () => {
  let tempDir: string
  let indexer: SemanticCodeIndexer
  let vectorStore: LocalVectorStore
  let persistence: IndexPersistence

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'integration-test-'))
    vectorStore = new LocalVectorStore()
    indexer = new SemanticCodeIndexer({
      embeddingProvider: mockEmbeddingProvider,
      vectorStore,
    })
    persistence = new IndexPersistence({ indexPath: join(tempDir, 'index.json') })
  })

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true })
  })

  test('full workflow: index, save, load, search', async () => {
    const content = 'export function add(a: number, b: number) { return a + b }'
    await indexer.indexFile('math.ts', content, Date.now())

    persistence.save(indexer.getIndexStatus())

    const newIndexer = new SemanticCodeIndexer({
      embeddingProvider: mockEmbeddingProvider,
      vectorStore: new LocalVectorStore(),
    })
    newIndexer.loadIndexStatus(persistence.load())

    expect(newIndexer.getIndexStatus().has('math.ts')).toBe(true)
  })

  test('incremental update workflow', async () => {
    const content1 = 'const x = 1'
    const lastModified = Date.now()

    await indexer.indexFile('test.ts', content1, lastModified)
    persistence.save(indexer.getIndexStatus())

    const loadedStatus = persistence.load()
    const newIndexer = new SemanticCodeIndexer({
      embeddingProvider: mockEmbeddingProvider,
      vectorStore,
    })
    newIndexer.loadIndexStatus(loadedStatus)

    const docIds = await newIndexer.indexFile('test.ts', content1, lastModified)
    expect(docIds.length).toBeGreaterThan(0)
  })
})
