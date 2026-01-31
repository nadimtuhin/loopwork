import { describe, test, expect, beforeEach } from 'bun:test'
import { FileCheckpointStorage } from '../../src/core/file-storage'
import type { IFileSystem, AgentCheckpoint } from '../../src/contracts'

class MockFileSystem implements IFileSystem {
  private files = new Map<string, string>()
  private directories = new Set<string>()

  private ensureParentDirs(path: string): void {
    const parts = path.split('/')
    for (let i = 1; i < parts.length; i++) {
      const dir = parts.slice(0, i).join('/')
      if (dir) {
        this.directories.add(dir)
      }
    }
  }

  async writeFile(path: string, content: string): Promise<void> {
    this.ensureParentDirs(path)
    this.files.set(path, content)
  }

  async readFile(path: string): Promise<string> {
    const content = this.files.get(path)
    if (content === undefined) {
      throw new Error(`ENOENT: no such file: ${path}`)
    }
    return content
  }

  async appendFile(path: string, content: string): Promise<void> {
    this.ensureParentDirs(path)
    const existing = this.files.get(path) ?? ''
    this.files.set(path, existing + content)
  }

  async exists(path: string): Promise<boolean> {
    return this.files.has(path) || this.directories.has(path)
  }

  async remove(path: string): Promise<void> {
    // Remove all files and dirs that start with this path
    for (const key of this.files.keys()) {
      if (key.startsWith(path)) {
        this.files.delete(key)
      }
    }
    for (const key of this.directories) {
      if (key.startsWith(path)) {
        this.directories.delete(key)
      }
    }
  }

  async readdir(path: string): Promise<string[]> {
    const entries = new Set<string>()
    const prefix = path.endsWith('/') ? path : path + '/'
    for (const key of this.files.keys()) {
      if (key.startsWith(prefix)) {
        const rest = key.slice(prefix.length)
        const firstPart = rest.split('/')[0]
        if (firstPart) {
          entries.add(firstPart)
        }
      }
    }
    return Array.from(entries)
  }

  async stat(path: string): Promise<{ mtime: Date; size: number }> {
    const content = this.files.get(path)
    if (content === undefined) {
      throw new Error(`ENOENT: no such file: ${path}`)
    }
    return { mtime: new Date(), size: content.length }
  }

  async mkdir(path: string): Promise<void> {
    this.directories.add(path)
  }
}

describe('FileCheckpointStorage', () => {
  let fs: MockFileSystem
  let storage: FileCheckpointStorage

  beforeEach(() => {
    fs = new MockFileSystem()
    storage = new FileCheckpointStorage(fs, '.loopwork/agents')
  })

  test('save() writes checkpoint as JSON', async () => {
    const checkpoint: AgentCheckpoint = {
      agentId: 'agent-1',
      taskId: 'task-1',
      agentName: 'executor',
      iteration: 5,
      timestamp: new Date('2025-01-01T00:00:00Z'),
      phase: 'executing',
      lastToolCall: 'Read',
    }

    await storage.save(checkpoint)

    const loaded = await storage.load('agent-1')
    expect(loaded).not.toBeNull()
    expect(loaded?.agentId).toBe('agent-1')
    expect(loaded?.taskId).toBe('task-1')
    expect(loaded?.agentName).toBe('executor')
    expect(loaded?.iteration).toBe(5)
    expect(loaded?.phase).toBe('executing')
    expect(loaded?.lastToolCall).toBe('Read')
  })

  test('load() returns null for non-existent agent', async () => {
    const result = await storage.load('non-existent')
    expect(result).toBeNull()
  })

  test('load() deserializes timestamp correctly', async () => {
    const timestamp = new Date('2025-01-15T10:30:00Z')
    const checkpoint: AgentCheckpoint = {
      agentId: 'agent-2',
      taskId: 'task-2',
      agentName: 'architect',
      iteration: 1,
      timestamp,
      phase: 'started',
    }

    await storage.save(checkpoint)
    const loaded = await storage.load('agent-2')

    expect(loaded?.timestamp).toBeInstanceOf(Date)
    expect(loaded?.timestamp.toISOString()).toBe(timestamp.toISOString())
  })

  test('appendOutput() accumulates output', async () => {
    await storage.appendOutput('agent-3', 'line 1\n')
    await storage.appendOutput('agent-3', 'line 2\n')

    const output = await storage.getOutput('agent-3')
    expect(output).toBe('line 1\nline 2\n')
  })

  test('getOutput() returns empty string for non-existent agent', async () => {
    const output = await storage.getOutput('non-existent')
    expect(output).toBe('')
  })

  test('delete() removes checkpoint and output', async () => {
    const checkpoint: AgentCheckpoint = {
      agentId: 'agent-4',
      taskId: 'task-4',
      agentName: 'writer',
      iteration: 0,
      timestamp: new Date(),
      phase: 'completed',
    }

    await storage.save(checkpoint)
    await storage.appendOutput('agent-4', 'some output')

    await storage.delete('agent-4')

    expect(await storage.load('agent-4')).toBeNull()
    expect(await storage.getOutput('agent-4')).toBe('')
  })

  test('list() returns all agent IDs', async () => {
    await storage.save({
      agentId: 'agent-a',
      taskId: 't1',
      agentName: 'a',
      iteration: 0,
      timestamp: new Date(),
      phase: 'started',
    })
    await storage.save({
      agentId: 'agent-b',
      taskId: 't2',
      agentName: 'b',
      iteration: 0,
      timestamp: new Date(),
      phase: 'started',
    })

    const ids = await storage.list()
    expect(ids).toContain('agent-a')
    expect(ids).toContain('agent-b')
    expect(ids.length).toBe(2)
  })

  test('cleanup() removes old checkpoints', async () => {
    const oldDate = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000) // 10 days ago
    const recentDate = new Date()

    await storage.save({
      agentId: 'old-agent',
      taskId: 't1',
      agentName: 'a',
      iteration: 0,
      timestamp: oldDate,
      phase: 'completed',
    })
    await storage.save({
      agentId: 'recent-agent',
      taskId: 't2',
      agentName: 'b',
      iteration: 0,
      timestamp: recentDate,
      phase: 'executing',
    })

    const deleted = await storage.cleanup(7) // 7 days max age

    expect(deleted).toBe(1)
    expect(await storage.load('old-agent')).toBeNull()
    expect(await storage.load('recent-agent')).not.toBeNull()
  })
})
