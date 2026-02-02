import { describe, test, expect, beforeEach, afterEach } from 'bun:test'
import fs from 'fs'
import path from 'path'
import { LocalVectorStore } from '../src/local-store'
import type { Document } from '../src/local-store'

describe('LocalVectorStore', () => {
  let store: LocalVectorStore
  let tempDir: string
  let storePath: string

  beforeEach(() => {
    tempDir = path.join(process.cwd(), '.test-vector-store')
    storePath = path.join(tempDir, 'data.json')

    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true })
    }

    store = new LocalVectorStore({ path: storePath })
  })

  afterEach(() => {
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true })
    }
  })

  test('add documents to empty store', async () => {
    const documents: Document[] = [
      {
        id: 'doc-1',
        content: 'First document content',
        embedding: [0.1, 0.2, 0.3],
        metadata: { category: 'test' }
      },
      {
        id: 'doc-2',
        content: 'Second document content',
        embedding: [0.4, 0.5, 0.6],
        metadata: { category: 'production' }
      }
    ]

    await store.add(documents)

    expect(fs.existsSync(storePath)).toBe(true)

    const content = fs.readFileSync(storePath, 'utf-8')
    const data = JSON.parse(content)
    expect(data.documents).toHaveLength(2)
  })

  test('add documents to existing store', async () => {
    const documents: Document[] = [
      {
        id: 'doc-1',
        content: 'First document',
        embedding: [0.1, 0.2, 0.3]
      }
    ]

    await store.add(documents)

    const moreDocuments: Document[] = [
      {
        id: 'doc-2',
        content: 'Second document',
        embedding: [0.4, 0.5, 0.6]
      }
    ]

    await store.add(moreDocuments)

    const content = fs.readFileSync(storePath, 'utf-8')
    const data = JSON.parse(content)
    expect(data.documents).toHaveLength(2)
  })

  test('search with text query returns matching documents', async () => {
    const documents: Document[] = [
      {
        id: 'doc-1',
        content: 'Hello world from TypeScript',
        embedding: [0.1, 0.2, 0.3]
      },
      {
        id: 'doc-2',
        content: 'Hello world from JavaScript',
        embedding: [0.4, 0.5, 0.6]
      },
      {
        id: 'doc-3',
        content: 'Goodbye world from Python',
        embedding: [0.7, 0.8, 0.9]
      }
    ]

    await store.add(documents)

    const results = await store.search('TypeScript')

    expect(results).toHaveLength(1)
    expect(results[0].document.id).toBe('doc-1')
    expect(results[0].document.content).toContain('TypeScript')
    expect(results[0].score).toBeGreaterThan(0)
  })

  test('search with embedding query returns similar documents', async () => {
    const documents: Document[] = [
      {
        id: 'doc-1',
        content: 'Similar document one',
        embedding: [0.1, 0.2, 0.3]
      },
      {
        id: 'doc-2',
        content: 'Similar document two',
        embedding: [0.15, 0.25, 0.35]
      },
      {
        id: 'doc-3',
        content: 'Different document',
        embedding: [0.9, 0.8, 0.7]
      }
    ]

    await store.add(documents)

    const queryEmbedding = [0.1, 0.2, 0.3]
    const results = await store.search(queryEmbedding)

    expect(results.length).toBeGreaterThan(0)
    expect(results[0].document.id).toBe('doc-1')
    expect(results[0].score).toBeGreaterThan(results[1]?.score || 0)
  })

  test('search respects threshold', async () => {
    const documents: Document[] = [
      {
        id: 'doc-1',
        content: 'High similarity document',
        embedding: [0.1, 0.2, 0.3]
      },
      {
        id: 'doc-2',
        content: 'Low similarity document',
        embedding: [0.9, 0.8, 0.7]
      }
    ]

    await store.add(documents)

    const queryEmbedding = [0.1, 0.2, 0.3]
    const results = await store.search(queryEmbedding, { threshold: 0.9 })

    expect(results.length).toBe(1)
    expect(results[0].document.id).toBe('doc-1')
  })

  test('search respects limit', async () => {
    const documents: Document[] = [
      {
        id: 'doc-1',
        content: 'Document one',
        embedding: [0.1, 0.2, 0.3]
      },
      {
        id: 'doc-2',
        content: 'Document two',
        embedding: [0.15, 0.25, 0.35]
      },
      {
        id: 'doc-3',
        content: 'Document three',
        embedding: [0.2, 0.3, 0.4]
      }
    ]

    await store.add(documents)

    const results = await store.search('Document', { limit: 2 })

    expect(results.length).toBeLessThanOrEqual(2)
  })

  test('search with metadata filter', async () => {
    const documents: Document[] = [
      {
        id: 'doc-1',
        content: 'Document with category A',
        embedding: [0.1, 0.2, 0.3],
        metadata: { category: 'A' }
      },
      {
        id: 'doc-2',
        content: 'Document with category B',
        embedding: [0.4, 0.5, 0.6],
        metadata: { category: 'B' }
      }
    ]

    await store.add(documents)

    const results = await store.search('Document', { filter: { category: 'A' } })

    expect(results.length).toBe(1)
    expect(results[0].document.id).toBe('doc-1')
  })

  test('search on empty store returns empty results', async () => {
    const results = await store.search('query')

    expect(results).toHaveLength(0)
  })

  test('delete document by id', async () => {
    const documents: Document[] = [
      {
        id: 'doc-1',
        content: 'First document',
        embedding: [0.1, 0.2, 0.3]
      },
      {
        id: 'doc-2',
        content: 'Second document',
        embedding: [0.4, 0.5, 0.6]
      }
    ]

    await store.add(documents)
    await store.delete('doc-1')

    const content = fs.readFileSync(storePath, 'utf-8')
    const data = JSON.parse(content)
    expect(data.documents).toHaveLength(1)
    expect(data.documents[0].id).toBe('doc-2')
  })

  test('clear all documents', async () => {
    const documents: Document[] = [
      {
        id: 'doc-1',
        content: 'First document',
        embedding: [0.1, 0.2, 0.3]
      },
      {
        id: 'doc-2',
        content: 'Second document',
        embedding: [0.4, 0.5, 0.6]
      }
    ]

    await store.add(documents)
    await store.clear()

    const content = fs.readFileSync(storePath, 'utf-8')
    const data = JSON.parse(content)
    expect(data.documents).toHaveLength(0)
  })

  test('handles concurrent writes with file locking', async () => {
    const documents: Document[] = [
      {
        id: 'doc-1',
        content: 'First document',
        embedding: [0.1, 0.2, 0.3]
      },
      {
        id: 'doc-2',
        content: 'Second document',
        embedding: [0.4, 0.5, 0.6]
      }
    ]

    const addPromises = [
      store.add([{ id: 'doc-1', content: 'First', embedding: [0.1, 0.2, 0.3] }]),
      store.add([{ id: 'doc-2', content: 'Second', embedding: [0.4, 0.5, 0.6] }]),
      store.add([{ id: 'doc-3', content: 'Third', embedding: [0.7, 0.8, 0.9] }])
    ]

    await Promise.all(addPromises)

    const content = fs.readFileSync(storePath, 'utf-8')
    const data = JSON.parse(content)
    expect(data.documents.length).toBeGreaterThanOrEqual(2)
  })

  test('updates existing document by adding same id', async () => {
    const documents: Document[] = [
      {
        id: 'doc-1',
        content: 'Original content',
        embedding: [0.1, 0.2, 0.3]
      }
    ]

    await store.add(documents)

    const updatedDocuments: Document[] = [
      {
        id: 'doc-1',
        content: 'Updated content',
        embedding: [0.4, 0.5, 0.6],
        metadata: { version: 2 }
      }
    ]

    await store.add(updatedDocuments)

    const content = fs.readFileSync(storePath, 'utf-8')
    const data = JSON.parse(content)
    expect(data.documents).toHaveLength(1)
    expect(data.documents[0].content).toBe('Updated content')
    expect(data.documents[0].embedding).toEqual([0.4, 0.5, 0.6])
    expect(data.documents[0].metadata).toEqual({ version: 2 })
  })
})
