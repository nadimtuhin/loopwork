/**
 * Index persistence for semantic code indexer
 *
 * Saves and loads index status to enable incremental updates across restarts
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs'
import { dirname } from 'path'
import type { IndexStatus } from '../core/semantic-indexer'

export interface IndexPersistenceOptions {
  indexPath: string
}

/**
 * Persists index status to disk for incremental updates
 */
export class IndexPersistence {
  private indexPath: string

  constructor(options: IndexPersistenceOptions) {
    this.indexPath = options.indexPath
  }

  /**
   * Load index status from disk
   */
  load(): Map<string, IndexStatus> {
    if (!existsSync(this.indexPath)) {
      return new Map()
    }

    try {
      const data = readFileSync(this.indexPath, 'utf-8')
      const parsed = JSON.parse(data) as Record<string, IndexStatus>
      return new Map(Object.entries(parsed))
    } catch {
      return new Map()
    }
  }

  /**
   * Save index status to disk
   */
  save(statusMap: Map<string, IndexStatus>): void {
    const dir = dirname(this.indexPath)
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true })
    }

    const data = Object.fromEntries(statusMap)
    writeFileSync(this.indexPath, JSON.stringify(data, null, 2))
  }

  /**
   * Clear persisted index
   */
  clear(): void {
    if (existsSync(this.indexPath)) {
      writeFileSync(this.indexPath, '{}')
    }
  }
}
