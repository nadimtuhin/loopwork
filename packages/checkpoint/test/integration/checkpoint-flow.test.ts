import { describe, test, expect, beforeEach } from 'bun:test'
import { CheckpointManager } from '../../src/core/checkpoint-manager'
import { FileCheckpointStorage } from '../../src/core/file-storage'
import type { IFileSystem, CheckpointEvent } from '../../src/contracts'

class InMemoryFileSystem implements IFileSystem {
  private files = new Map<string, string>()
  private directories = new Set<string>()

  async writeFile(path: string, content: string): Promise<void> {
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
    const existing = this.files.get(path) ?? ''
    this.files.set(path, existing + content)
  }

  async exists(path: string): Promise<boolean> {
    return this.files.has(path) || this.directories.has(path)
  }

  async remove(path: string): Promise<void> {
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

describe('Checkpoint Flow Integration', () => {
  let fs: InMemoryFileSystem
  let storage: FileCheckpointStorage
  let manager: CheckpointManager

  beforeEach(() => {
    fs = new InMemoryFileSystem()
    storage = new FileCheckpointStorage(fs, '.loopwork/agents')
    manager = new CheckpointManager(storage)
  })

  test('full save and restore flow', async () => {
    // Simulate agent execution lifecycle
    await manager.onEvent('agent-full', {
      type: 'execution_start',
      taskId: 'TASK-001',
      agentName: 'executor',
    })

    await manager.onEvent('agent-full', {
      type: 'tool_call',
      toolName: 'Read',
    })

    await manager.onEvent('agent-full', {
      type: 'iteration',
      iteration: 5,
    })

    await storage.appendOutput('agent-full', 'Reading file...\n')
    await storage.appendOutput('agent-full', 'Processing...\n')

    // Restore and verify
    const restored = await manager.restore('agent-full')

    expect(restored).not.toBeNull()
    expect(restored?.checkpoint.agentId).toBe('agent-full')
    expect(restored?.checkpoint.taskId).toBe('TASK-001')
    expect(restored?.checkpoint.agentName).toBe('executor')
    expect(restored?.checkpoint.iteration).toBe(5)
    expect(restored?.checkpoint.lastToolCall).toBe('Read')
    expect(restored?.checkpoint.phase).toBe('executing')
    expect(restored?.partialOutput).toBe('Reading file...\nProcessing...\n')
  })

  test('checkpoint persists custom state', async () => {
    await manager.checkpoint('agent-state', {
      taskId: 'TASK-002',
      agentName: 'architect',
      phase: 'executing',
      state: {
        analysisStep: 3,
        filesAnalyzed: ['file1.ts', 'file2.ts'],
        findings: { errors: 2, warnings: 5 },
      },
    })

    const restored = await manager.restore('agent-state')

    expect(restored?.checkpoint.state).toEqual({
      analysisStep: 3,
      filesAnalyzed: ['file1.ts', 'file2.ts'],
      findings: { errors: 2, warnings: 5 },
    })
  })

  test('multiple agents maintain separate state', async () => {
    await manager.onEvent('agent-a', {
      type: 'execution_start',
      taskId: 'TASK-A',
      agentName: 'executor',
    })

    await manager.onEvent('agent-b', {
      type: 'execution_start',
      taskId: 'TASK-B',
      agentName: 'architect',
    })

    await manager.onEvent('agent-a', {
      type: 'iteration',
      iteration: 10,
    })

    await manager.onEvent('agent-b', {
      type: 'iteration',
      iteration: 3,
    })

    const restoredA = await manager.restore('agent-a')
    const restoredB = await manager.restore('agent-b')

    expect(restoredA?.checkpoint.taskId).toBe('TASK-A')
    expect(restoredA?.checkpoint.iteration).toBe(10)
    expect(restoredB?.checkpoint.taskId).toBe('TASK-B')
    expect(restoredB?.checkpoint.iteration).toBe(3)
  })
})
