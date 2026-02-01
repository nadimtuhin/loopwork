/**
 * Semantic Code Indexer Plugin
 *
 * Provides semantic code indexing with incremental updates
 */

import { readFileSync, statSync, readdirSync } from 'fs'
import { join, extname } from 'path'
import type { ConfigWrapper, LoopworkPlugin, TaskContext, PluginTaskResult } from '../contracts'
import type { EmbeddingProvider } from '../contracts/embedding'
import type { VectorStore } from '../contracts/vector-store'
import { SemanticCodeIndexer, type IndexStats } from '../core/semantic-indexer'
import { IndexPersistence } from '../utils/index-persistence'

export interface SemanticIndexerPluginOptions {
  sourceDir?: string
  indexPath?: string
  filePatterns?: string[]
  excludePatterns?: string[]
  autoIndexOnStart?: boolean
  persistIndex?: boolean
  chunkSize?: number
  chunkOverlap?: number
}

export interface CodeIndexState {
  indexer: SemanticCodeIndexer
  persistence?: IndexPersistence
  stats: IndexStats
  isIndexing: boolean
}

function walkDir(dir: string, extensions: string[], excludeDirs: string[]): string[] {
  const files: string[] = []
  try {
    const entries = readdirSync(dir, { withFileTypes: true })
    for (const entry of entries) {
      const fullPath = join(dir, entry.name)
      if (entry.isDirectory()) {
        if (!excludeDirs.some(ex => entry.name.includes(ex))) {
          files.push(...walkDir(fullPath, extensions, excludeDirs))
        }
      } else if (entry.isFile() && extensions.includes(extname(entry.name))) {
        files.push(fullPath)
      }
    }
  } catch {
    return files
  }
  return files
}

export function createSemanticCodeIndexerPlugin(
  options: SemanticIndexerPluginOptions = {}
): LoopworkPlugin & { getIndexState: () => CodeIndexState | undefined } {
  let indexState: CodeIndexState | undefined

  return {
    name: 'semantic-code-indexer',

    async onConfigLoad(config) {
      const embeddingProvider = (config as unknown as { _embeddingProvider?: EmbeddingProvider })._embeddingProvider
      const vectorStore = (config as unknown as { _vectorStore?: VectorStore })._vectorStore

      if (!embeddingProvider || !vectorStore) {
        return config
      }

      const indexer = new SemanticCodeIndexer({
        embeddingProvider,
        vectorStore,
        chunkSize: options.chunkSize,
        chunkOverlap: options.chunkOverlap,
        excludePatterns: options.excludePatterns?.map(p => new RegExp(p)),
      })

      let persistence: IndexPersistence | undefined
      if (options.persistIndex !== false && options.indexPath) {
        persistence = new IndexPersistence({ indexPath: options.indexPath })
        const savedStatus = persistence.load()
        indexer.loadIndexStatus(savedStatus)
      }

      indexState = {
        indexer,
        persistence,
        stats: { totalFiles: 0, indexedFiles: 0, modifiedFiles: 0, removedFiles: 0, errors: 0 },
        isIndexing: false,
      }

      return config
    },

    async onLoopStart() {
      if (!indexState || options.autoIndexOnStart === false) return

      indexState.isIndexing = true
      const sourceDir = options.sourceDir || '.'
      const extensions = ['.ts', '.tsx', '.js', '.jsx', '.py', '.rs', '.go', '.java', '.rb', '.php']
      const excludeDirs = options.excludePatterns || ['node_modules', 'dist', 'build', '.loopwork', '.specs', '.git', 'coverage']

      try {
        const allFiles = walkDir(sourceDir, extensions, excludeDirs)
        let indexedCount = 0
        let errorCount = 0

        for (const filePath of allFiles) {
          try {
            if (!indexState.indexer.shouldIndexFile(filePath)) continue

            const content = readFileSync(filePath, 'utf-8')
            const stats = statSync(filePath)

            await indexState.indexer.indexFile(filePath, content, stats.mtimeMs)
            indexedCount++
          } catch {
            errorCount++
          }
        }

        if (indexState.persistence) {
          indexState.persistence.save(indexState.indexer.getIndexStatus())
        }

        indexState.stats = {
          totalFiles: allFiles.length,
          indexedFiles: indexedCount,
          modifiedFiles: 0,
          removedFiles: 0,
          errors: errorCount,
        }

      } catch {
      } finally {
        indexState.isIndexing = false
      }
    },

    async onTaskComplete(context: TaskContext, result: PluginTaskResult) {
      if (!indexState || !result.output) return

      const modifiedFiles = result.output.match(/Modified:?\s*(.+\.\w+)/gi)
      if (!modifiedFiles) return

      for (const match of modifiedFiles) {
        const filePath = match.replace(/Modified:?\s*/i, '').trim()
        try {
          const content = readFileSync(filePath, 'utf-8')
          const stats = statSync(filePath)
          await indexState.indexer.indexFile(filePath, content, stats.mtimeMs)
        } catch {}
      }

      if (indexState.persistence) {
        indexState.persistence.save(indexState.indexer.getIndexStatus())
      }
    },

    getIndexState() {
      return indexState
    },
  }
}

export function withSemanticCodeIndexer(options: SemanticIndexerPluginOptions = {}): ConfigWrapper {
  return (config) => {
    const plugin = createSemanticCodeIndexerPlugin(options)

    return {
      ...config,
      _semanticCodeIndexer: plugin,
    }
  }
}

export function getSemanticCodeIndexer(
  config: unknown
): (LoopworkPlugin & { getIndexState: () => CodeIndexState | undefined }) | undefined {
  return (config as unknown as { _semanticCodeIndexer?: ReturnType<typeof createSemanticCodeIndexerPlugin> })._semanticCodeIndexer
}
