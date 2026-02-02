import fs from 'fs'
import path from 'path'

interface LocalVectorStoreConfig {
  path?: string
  dimensions?: number
}

interface Document {
  id: string
  content: string
  embedding?: number[]
  metadata?: Record<string, unknown>
}

interface SearchOptions {
  limit?: number
  threshold?: number
  filter?: Record<string, unknown>
}

interface SearchResult {
  document: Document
  score: number
}

interface StoredDocument extends Document {
  id: string
  content: string
  embedding?: number[]
  metadata?: Record<string, unknown>
}

interface StoreData {
  documents: StoredDocument[]
}

const DEFAULT_LOCK_TIMEOUT_MS = 5000
const LOCK_STALE_TIMEOUT_MS = 30000
const LOCK_RETRY_DELAY_MS = 100

interface NodeJSError extends Error {
  code?: string
}

function isNodeJSError(error: unknown): error is NodeJSError {
  return error instanceof Error && 'code' in error
}

export class LocalVectorStore {
  private storePath: string
  private lockFile: string
  private documents: Map<string, StoredDocument>

  constructor(config: LocalVectorStoreConfig = {}) {
    this.storePath = config.path || path.join(process.cwd(), '.vector-store', 'data.json')
    this.lockFile = `${this.storePath}.lock`
    this.documents = new Map()

    const dir = path.dirname(this.storePath)
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true })
    }
  }

  private load(): void {
    try {
      if (!fs.existsSync(this.storePath)) {
        this.documents = new Map()
        return
      }

      const content = fs.readFileSync(this.storePath, 'utf-8')
      const data: StoreData = JSON.parse(content)
      this.documents = new Map(data.documents.map(doc => [doc.id, doc]))
    } catch (error) {
      console.error('Failed to load vector store:', error)
      this.documents = new Map()
    }
  }

  private save(): void {
    try {
      const data: StoreData = {
        documents: Array.from(this.documents.values())
      }
      const content = JSON.stringify(data, null, 2)
      fs.writeFileSync(this.storePath, content)
    } catch (error) {
      throw new Error(`Failed to save vector store: ${error}`)
    }
  }

  private async acquireLock(timeout = DEFAULT_LOCK_TIMEOUT_MS): Promise<boolean> {
    const startTime = Date.now()

    while (Date.now() - startTime < timeout) {
      try {
        fs.writeFileSync(this.lockFile, String(process.pid), { flag: 'wx' })
        return true
      } catch (e: unknown) {
        if (isNodeJSError(e) && e.code === 'EEXIST') {
          try {
            const lockContent = fs.readFileSync(this.lockFile, 'utf-8')
            const lockPid = parseInt(lockContent, 10)
            const lockStat = fs.statSync(this.lockFile)
            const lockAge = Date.now() - lockStat.mtimeMs

            if (lockAge > LOCK_STALE_TIMEOUT_MS) {
              fs.unlinkSync(this.lockFile)
              continue
            }

            try {
              process.kill(lockPid, 0)
            } catch {
              fs.unlinkSync(this.lockFile)
              continue
            }
          } catch {
            try {
              fs.unlinkSync(this.lockFile)
            } catch {
            }
            continue
          }

          await new Promise(r => setTimeout(r, LOCK_RETRY_DELAY_MS))
        } else {
          return false
        }
      }
    }

    return false
  }

  private releaseLock(): void {
    try {
      const content = fs.readFileSync(this.lockFile, 'utf-8')
      if (parseInt(content, 10) === process.pid) {
        fs.unlinkSync(this.lockFile)
      }
    } catch {
    }
  }

  private async withLock<T>(fn: () => T): Promise<T> {
    const acquired = await this.acquireLock()
    if (!acquired) {
      throw new Error('Failed to acquire file lock')
    }

    try {
      return fn()
    } finally {
      this.releaseLock()
    }
  }

  async add(documents: Document[]): Promise<void> {
    await this.withLock(() => {
      this.load()

      for (const doc of documents) {
        const storedDoc: StoredDocument = {
          id: doc.id,
          content: doc.content,
          embedding: doc.embedding,
          metadata: doc.metadata
        }
        this.documents.set(doc.id, storedDoc)
      }

      this.save()
    })
  }

  async search(query: string | number[], options?: SearchOptions): Promise<SearchResult[]> {
    this.load()

    const results: SearchResult[] = []
    const limit = options?.limit || 5
    const threshold = options?.threshold
    const filter = options?.filter

    if (typeof query === 'string') {
      const queryLower = query.toLowerCase()

      for (const doc of this.documents.values()) {
        if (filter && doc.metadata) {
          const matches = Object.entries(filter).every(([key, value]) =>
            doc.metadata![key] === value
          )
          if (!matches) continue
        }

        if (doc.content.toLowerCase().includes(queryLower)) {
          const score = this.calculateTextMatchScore(queryLower, doc.content.toLowerCase())
          if (threshold === undefined || score >= threshold) {
            results.push({ document: doc, score })
            if (results.length >= limit) break
          }
        }
      }
    } else {
      const queryEmbedding = query

      for (const doc of this.documents.values()) {
        if (filter && doc.metadata) {
          const matches = Object.entries(filter).every(([key, value]) =>
            doc.metadata![key] === value
          )
          if (!matches) continue
        }

        if (!doc.embedding) continue

        const score = this.cosineSimilarity(queryEmbedding, doc.embedding)

        if (threshold === undefined || score >= threshold) {
          results.push({ document: doc, score })
        }
      }
    }

    return results
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
  }

  async delete(id: string): Promise<void> {
    await this.withLock(() => {
      this.load()
      this.documents.delete(id)
      this.save()
    })
  }

  async clear(): Promise<void> {
    await this.withLock(() => {
      this.load()
      this.documents.clear()
      this.save()
    })
  }

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

export type { Document, SearchOptions, SearchResult }
