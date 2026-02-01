/**
 * Semantic Code Indexer
 *
 * Indexes code files with semantic embeddings for intelligent code search.
 * Supports incremental updates to only re-index changed files.
 */

import type { EmbeddingProvider } from '../contracts/embedding'
import type { VectorStore, Document, SearchResult } from '../contracts/vector-store'

export interface CodeDocument extends Document {
  filePath: string
  lastModified: number
  contentHash: string
  language?: string
}

export interface IndexerOptions {
  embeddingProvider: EmbeddingProvider
  vectorStore: VectorStore
  chunkSize?: number
  chunkOverlap?: number
  excludePatterns?: RegExp[]
  includePatterns?: RegExp[]
}

export interface IndexStatus {
  filePath: string
  lastIndexed: number
  contentHash: string
  documentIds: string[]
}

export interface IndexStats {
  totalFiles: number
  indexedFiles: number
  modifiedFiles: number
  removedFiles: number
  errors: number
}

/**
 * Calculates a simple hash of file content for change detection
 */
export function calculateHash(content: string): string {
  let hash = 0
  for (let i = 0; i < content.length; i++) {
    const char = content.charCodeAt(i)
    hash = ((hash << 5) - hash + char) | 0
  }
  return hash.toString(16)
}

/**
 * Detects programming language from file extension
 */
export function detectLanguage(filePath: string): string | undefined {
  const ext = filePath.split('.').pop()?.toLowerCase()
  const langMap: Record<string, string> = {
    ts: 'typescript',
    tsx: 'typescript',
    js: 'javascript',
    jsx: 'javascript',
    py: 'python',
    rs: 'rust',
    go: 'go',
    java: 'java',
    kt: 'kotlin',
    rb: 'ruby',
    php: 'php',
    cpp: 'cpp',
    c: 'c',
    cs: 'csharp',
    swift: 'swift',
    scala: 'scala',
    r: 'r',
    sh: 'bash',
    bash: 'bash',
    zsh: 'zsh',
    json: 'json',
    yaml: 'yaml',
    yml: 'yaml',
    toml: 'toml',
    md: 'markdown',
    html: 'html',
    css: 'css',
    sql: 'sql',
    graphql: 'graphql',
  }
  return ext ? langMap[ext] : undefined
}

/**
 * Splits code into semantic chunks
 */
export function chunkCode(content: string, filePath: string, chunkSize: number = 1000, chunkOverlap: number = 200): Array<{ content: string; lineStart: number; lineEnd: number }> {
  const lines = content.split('\n')
  const chunks: Array<{ content: string; lineStart: number; lineEnd: number }> = []

  // Try to chunk at function/class boundaries when possible
  const boundaryPattern = /^(export\s+)?(async\s+)?(function|class|interface|type|const|let|var)\s+\w+/;
  let currentChunk: string[] = []
  let currentStart = 0
  let currentSize = 0

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    const lineSize = line.length + 1 // +1 for newline

    // Check if this is a good boundary to split
    const isBoundary = boundaryPattern.test(line) && currentSize > chunkSize * 0.5

    if (currentSize + lineSize > chunkSize && currentChunk.length > 0 && isBoundary) {
      // End current chunk
      chunks.push({
        content: currentChunk.join('\n'),
        lineStart: currentStart + 1,
        lineEnd: i,
      })

      // Start new chunk with overlap
      const overlapLines = currentChunk.slice(-Math.floor(chunkOverlap / 50)) // Approximate line count
      currentChunk = [...overlapLines, line]
      currentStart = i - overlapLines.length
      currentSize = currentChunk.reduce((sum, l) => sum + l.length + 1, 0)
    } else {
      currentChunk.push(line)
      currentSize += lineSize
    }
  }

  // Don't forget the last chunk
  if (currentChunk.length > 0) {
    chunks.push({
      content: currentChunk.join('\n'),
      lineStart: currentStart + 1,
      lineEnd: lines.length,
    })
  }

  // If no chunks were created (small file), create one chunk
  if (chunks.length === 0 && lines.length > 0) {
    chunks.push({
      content: content,
      lineStart: 1,
      lineEnd: lines.length,
    })
  }

  return chunks
}

/**
 * Semantic Code Indexer - Indexes code files with embeddings
 */
export class SemanticCodeIndexer {
  private embeddingProvider: EmbeddingProvider
  private vectorStore: VectorStore
  private chunkSize: number
  private chunkOverlap: number
  private excludePatterns: RegExp[]
  private includePatterns: RegExp[]
  private indexStatus: Map<string, IndexStatus> = new Map()

  constructor(options: IndexerOptions) {
    this.embeddingProvider = options.embeddingProvider
    this.vectorStore = options.vectorStore
    this.chunkSize = options.chunkSize ?? 1000
    this.chunkOverlap = options.chunkOverlap ?? 200
    this.excludePatterns = options.excludePatterns ?? [
      /node_modules/,
      /\.git/,
      /dist/,
      /build/,
      /\.loopwork/,
      /\.specs/,
      /coverage/,
      /\.next/,
    ]
    this.includePatterns = options.includePatterns ?? [
      /\.(ts|tsx|js|jsx|py|rs|go|java|rb|php|cpp|c|cs|swift|scala)$/,
    ]
  }

  /**
   * Check if a file should be indexed based on patterns
   */
  shouldIndexFile(filePath: string): boolean {
    // Check exclude patterns
    for (const pattern of this.excludePatterns) {
      if (pattern.test(filePath)) return false
    }

    // Check include patterns
    if (this.includePatterns.length > 0) {
      for (const pattern of this.includePatterns) {
        if (pattern.test(filePath)) return true
      }
      return false
    }

    return true
  }

  /**
   * Load index status from persistence
   */
  loadIndexStatus(statusMap: Map<string, IndexStatus>): void {
    this.indexStatus = new Map(statusMap)
  }

  /**
   * Get current index status
   */
  getIndexStatus(): Map<string, IndexStatus> {
    return new Map(this.indexStatus)
  }

  /**
   * Index a single file
   */
  async indexFile(filePath: string, content: string, lastModified: number): Promise<string[]> {
    const contentHash = calculateHash(content)
    const language = detectLanguage(filePath)

    // Check if file needs re-indexing
    const existingStatus = this.indexStatus.get(filePath)
    if (existingStatus && existingStatus.contentHash === contentHash) {
      return existingStatus.documentIds // No changes, return existing IDs
    }

    // Delete old documents if they exist
    if (existingStatus) {
      for (const docId of existingStatus.documentIds) {
        await this.vectorStore.delete(docId)
      }
    }

    // Chunk the code
    const chunks = chunkCode(content, filePath, this.chunkSize, this.chunkOverlap)

    // Create documents with embeddings
    const documents: CodeDocument[] = []
    const documentIds: string[] = []

    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i]
      const docId = `${filePath}#chunk-${i}`
      documentIds.push(docId)

      // Generate embedding for the chunk
      const embedding = await this.embeddingProvider.embed(chunk.content)

      documents.push({
        id: docId,
        content: chunk.content,
        embedding,
        filePath,
        lastModified,
        contentHash,
        language,
        metadata: {
          lineStart: chunk.lineStart,
          lineEnd: chunk.lineEnd,
          chunkIndex: i,
          totalChunks: chunks.length,
        },
      })
    }

    // Add documents to vector store
    await this.vectorStore.add(documents)

    // Update index status
    this.indexStatus.set(filePath, {
      filePath,
      lastIndexed: Date.now(),
      contentHash,
      documentIds,
    })

    return documentIds
  }

  /**
   * Remove a file from the index
   */
  async removeFile(filePath: string): Promise<void> {
    const status = this.indexStatus.get(filePath)
    if (status) {
      for (const docId of status.documentIds) {
        await this.vectorStore.delete(docId)
      }
      this.indexStatus.delete(filePath)
    }
  }

  /**
   * Search the code index
   */
  async search(query: string, limit: number = 10, threshold?: number): Promise<SearchResult[]> {
    // First try to search with embedding
    try {
      const queryEmbedding = await this.embeddingProvider.embed(query)
      return await this.vectorStore.search(queryEmbedding, { limit, threshold })
    } catch {
      // Fallback to text search if embedding fails
      return await this.vectorStore.search(query, { limit, threshold })
    }
  }

  /**
   * Get index statistics
   */
  getStats(): IndexStats {
    let totalFiles = 0
    let indexedFiles = 0
    const _now = Date.now()

    for (const [_filePath, status] of this.indexStatus) {
      totalFiles++
      if (status.lastIndexed > 0) {
        indexedFiles++
      }
    }

    return {
      totalFiles,
      indexedFiles,
      modifiedFiles: 0, // Would need comparison with filesystem
      removedFiles: 0,
      errors: 0,
    }
  }

  /**
   * Clear the entire index
   */
  async clear(): Promise<void> {
    await this.vectorStore.clear()
    this.indexStatus.clear()
  }
}
