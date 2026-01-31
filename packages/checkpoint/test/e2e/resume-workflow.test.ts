import { describe, test, expect, beforeEach, afterEach } from 'bun:test'
import { createCheckpointManager } from '../../src/factories/create-manager'
import { FileCheckpointStorage } from '../../src/core/file-storage'
import type { IFileSystem, ICheckpointManager } from '../../src/contracts'

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

describe('Resume Workflow E2E', () => {
  let fs: InMemoryFileSystem
  let manager: ICheckpointManager

  beforeEach(() => {
    fs = new InMemoryFileSystem()
    const storage = new FileCheckpointStorage(fs, '.loopwork/agents')
    manager = createCheckpointManager({ storage })
  })

  test('simulate interrupt and resume workflow', async () => {
    const agentId = 'resume-agent-1'

    // Phase 1: Start execution
    await manager.onEvent(agentId, {
      type: 'execution_start',
      taskId: 'TASK-RESUME',
      agentName: 'executor',
    })

    // Simulate some work
    await manager.onEvent(agentId, { type: 'iteration', iteration: 5 })
    await manager.onEvent(agentId, { type: 'tool_call', toolName: 'Read' })

    // Phase 2: Interrupt
    await manager.onEvent(agentId, {
      type: 'interrupt',
      reason: 'User pressed Ctrl+C',
    })

    // Phase 3: Verify state was preserved
    const restored = await manager.restore(agentId)

    expect(restored).not.toBeNull()
    expect(restored?.checkpoint.phase).toBe('interrupted')
    expect(restored?.checkpoint.iteration).toBe(5)
    expect(restored?.checkpoint.taskId).toBe('TASK-RESUME')

    // Phase 4: Resume - can continue from where we left off
    await manager.onEvent(agentId, { type: 'iteration', iteration: 6 })
    await manager.onEvent(agentId, { type: 'tool_call', toolName: 'Write' })

    const resumedState = await manager.restore(agentId)
    expect(resumedState?.checkpoint.iteration).toBe(6)
    expect(resumedState?.checkpoint.lastToolCall).toBe('Write')
    expect(resumedState?.checkpoint.phase).toBe('executing')
  })

  test('complete workflow clears checkpoint on success', async () => {
    const agentId = 'complete-agent'

    await manager.onEvent(agentId, {
      type: 'execution_start',
      taskId: 'TASK-COMPLETE',
      agentName: 'executor',
    })

    await manager.onEvent(agentId, { type: 'iteration', iteration: 10 })

    await manager.onEvent(agentId, {
      type: 'execution_end',
      success: true,
    })

    // Verify completed state
    const completed = await manager.restore(agentId)
    expect(completed?.checkpoint.phase).toBe('completed')

    // Clean up after successful completion
    await manager.clear(agentId)

    const cleared = await manager.restore(agentId)
    expect(cleared).toBeNull()
  })
})
