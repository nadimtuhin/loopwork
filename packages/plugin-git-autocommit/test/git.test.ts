import { describe, test, expect, mock, beforeEach } from 'bun:test'
import { createGitAutoCommitPlugin } from '../src/index'
import type { TaskContext, PluginTaskResult } from '@loopwork-ai/contracts'

const mockExecSync = mock((cmd: string, options?: any) => '')

mock.module('child_process', () => ({
  execSync: mockExecSync,
}))

describe('Git Auto-Commit Plugin', () => {
  beforeEach(() => {
    mockExecSync.mockClear()
  })

  test('should create plugin with default options', () => {
    const plugin = createGitAutoCommitPlugin()

    expect(plugin.name).toBe('git-autocommit')
    expect(plugin.classification).toBe('enhancement')
    expect(plugin.onTaskComplete).toBeDefined()
  })

  test('should skip commit if not a git repository', async () => {
    const plugin = createGitAutoCommitPlugin()

    mockExecSync.mockImplementation((cmd: string) => {
      if (cmd.includes('git rev-parse')) {
        throw new Error('not a git repository')
      }
      return ''
    })

    const context: TaskContext = {
      task: {
        id: 'TASK-001',
        title: 'Test task',
        description: 'Test description',
        status: 'completed',
        priority: 'medium',
      },
      config: {} as any,
      iteration: 1,
      startTime: new Date(),
      namespace: 'default',
    }

    const result: PluginTaskResult = {
      duration: 1.5,
      success: true,
    }

    await plugin.onTaskComplete!(context, result)

    expect(mockExecSync).toHaveBeenCalledWith('git rev-parse --is-inside-work-tree', { stdio: 'pipe' })
  })

  test('should skip commit if no changes', async () => {
    const plugin = createGitAutoCommitPlugin({ skipIfNoChanges: true })

    mockExecSync.mockImplementation((cmd: string) => {
      if (cmd.includes('git rev-parse')) {
        return '/path/to/.git'
      }
      if (cmd.includes('git status --porcelain')) {
        return '' 
      }
      return ''
    })

    const context: TaskContext = {
      task: {
        id: 'TASK-001',
        title: 'Test task',
        description: 'Test description',
        status: 'completed',
        priority: 'medium',
      },
      config: {} as any,
      iteration: 1,
      startTime: new Date(),
      namespace: 'default',
    }

    const result: PluginTaskResult = {
      duration: 1.5,
      success: true,
    }

    await plugin.onTaskComplete!(context, result)

    expect(mockExecSync).toHaveBeenCalledWith('git status --porcelain', { stdio: 'pipe' })
  })

  test('should create commit with task details', async () => {
    const plugin = createGitAutoCommitPlugin({
      enabled: true,
      addAll: true,
      coAuthor: 'Test AI <test@example.com>',
    })

    mockExecSync.mockImplementation((cmd: string) => {
      if (cmd.includes('git rev-parse')) {
        return '/path/to/.git'
      }
      if (cmd.includes('git status --porcelain')) {
        return 'M file.txt\n'
      }
      if (cmd.includes('git diff --cached')) {
        return 'file.txt\n'
      }
      return ''
    })

    const context: TaskContext = {
      task: {
        id: 'AUTH-001',
        title: 'Add user authentication',
        description: 'Implement JWT-based authentication',
        status: 'completed',
        priority: 'high',
      },
      config: {} as any,
      iteration: 5,
      startTime: new Date(),
      namespace: 'auth',
    }

    const result: PluginTaskResult = {
      duration: 2.5,
      success: true,
    }

    await plugin.onTaskComplete!(context, result)

    expect(mockExecSync).toHaveBeenCalledWith('git add -A', { stdio: 'pipe' })

    const commitCalls = mockExecSync.mock.calls.filter((call: any) =>
      String(call[0]).includes('git commit')
    )
    expect(commitCalls.length).toBe(1)

    const commitMessage = String(commitCalls[0][0])
    expect(commitMessage).toContain('feat(AUTH-001): Add user authentication')
    expect(commitMessage).toContain('Task: AUTH-001')
    expect(commitMessage).toContain('Iteration: 5')
    expect(commitMessage).toContain('Namespace: auth')
    expect(commitMessage).toContain('Co-Authored-By: Test AI <test@example.com>')
  })

  test('should skip commit if task failed', async () => {
    const plugin = createGitAutoCommitPlugin()

    mockExecSync.mockImplementation((cmd: string) => {
      if (cmd.includes('git rev-parse')) {
        return '/path/to/.git'
      }
      return ''
    })

    const context: TaskContext = {
      task: {
        id: 'TASK-001',
        title: 'Test task',
        description: 'Test description',
        status: 'failed',
        priority: 'low',
      },
      config: {} as any,
      iteration: 1,
      startTime: new Date(),
      namespace: 'default',
    }

    const result: PluginTaskResult = {
      duration: 1.5,
      success: false,
    }

    await plugin.onTaskComplete!(context, result)

    const commitCalls = mockExecSync.mock.calls.filter((call: any) =>
      String(call[0]).includes('git commit')
    )
    expect(commitCalls.length).toBe(0)
  })

  test('should handle git commit errors gracefully', async () => {
    const plugin = createGitAutoCommitPlugin()

    mockExecSync.mockImplementation((cmd: string) => {
      if (cmd.includes('git rev-parse')) {
        return '/path/to/.git'
      }
      if (cmd.includes('git status --porcelain')) {
        return 'M file.txt\n'
      }
      if (cmd.includes('git diff --cached')) {
        return 'file.txt\n'
      }
      if (cmd.includes('git commit')) {
        throw new Error('Git commit failed')
      }
      return ''
    })

    const context: TaskContext = {
      task: {
        id: 'TASK-001',
        title: 'Test task',
        description: 'Test description',
        status: 'completed',
        priority: 'medium',
      },
      config: {} as any,
      iteration: 1,
      startTime: new Date(),
      namespace: 'default',
    }

    const result: PluginTaskResult = {
      duration: 1.5,
      success: true,
    }

    await expect(plugin.onTaskComplete!(context, result)).resolves.toBeUndefined()
  })

  test('should respect enabled flag', async () => {
    const plugin = createGitAutoCommitPlugin({ enabled: false })

    mockExecSync.mockImplementation((cmd: string) => {
      return ''
    })

    const context: TaskContext = {
      task: {
        id: 'TASK-001',
        title: 'Test task',
        description: 'Test description',
        status: 'completed',
        priority: 'medium',
      },
      config: {} as any,
      iteration: 1,
      startTime: new Date(),
      namespace: 'default',
    }

    const result: PluginTaskResult = {
      duration: 1.5,
      success: true,
    }

    await plugin.onTaskComplete!(context, result)

    expect(mockExecSync).not.toHaveBeenCalled()
  })

  test('should truncate long descriptions', async () => {
    const plugin = createGitAutoCommitPlugin()

    mockExecSync.mockImplementation((cmd: string) => {
      if (cmd.includes('git rev-parse')) {
        return '/path/to/.git'
      }
      if (cmd.includes('git status --porcelain')) {
        return 'M file.txt\n'
      }
      if (cmd.includes('git diff --cached')) {
        return 'file.txt\n'
      }
      return ''
    })

    const longDescription = Array.from({ length: 10 }, (_, i) => `Line ${i + 1}`).join('\n')

    const context: TaskContext = {
      task: {
        id: 'TASK-001',
        title: 'Test task',
        description: longDescription,
        status: 'completed',
        priority: 'medium',
      },
      config: {} as any,
      iteration: 1,
      startTime: new Date(),
      namespace: 'default',
    }

    const result: PluginTaskResult = {
      duration: 1.5,
      success: true,
    }

    await plugin.onTaskComplete!(context, result)

    const commitCalls = mockExecSync.mock.calls.filter((call: any) =>
      String(call[0]).includes('git commit')
    )
    expect(commitCalls.length).toBe(1)

    const commitMessage = String(commitCalls[0][0])
    expect(commitMessage).toContain('...')
    expect(commitMessage).toContain('Line 1')
    expect(commitMessage).toContain('Line 5')
    expect(commitMessage).not.toContain('Line 10')
  })

  test('scope: "all" should commit all changed files', async () => {
    const plugin = createGitAutoCommitPlugin({ scope: 'all', addAll: true })

    mockExecSync.mockImplementation((cmd: string) => {
      if (cmd.includes('git rev-parse')) {
        return '/path/to/.git'
      }
      if (cmd.includes('git status --porcelain')) {
        return ' M file1.txt\n M file2.txt\n M file3.txt\n'
      }
      if (cmd.includes('git diff --cached')) {
        return 'file1.txt\nfile2.txt\nfile3.txt\n'
      }
      return ''
    })

    const context: TaskContext = {
      task: {
        id: 'TASK-001',
        title: 'Test task',
        description: 'Test description',
        status: 'completed',
        priority: 'medium',
      },
      config: {} as any,
      iteration: 1,
      startTime: new Date(),
      namespace: 'default',
    }

    const result: PluginTaskResult = {
      duration: 1.5,
      success: true,
    }

    await plugin.onTaskComplete!(context, result)

    expect(mockExecSync).toHaveBeenCalledWith('git add -A', { stdio: 'pipe' })

    const commitCalls = mockExecSync.mock.calls.filter((call: any) =>
      String(call[0]).includes('git commit')
    )
    expect(commitCalls.length).toBe(1)
  })

  test('scope: "task-only" should only commit files changed during task', async () => {
    const plugin = createGitAutoCommitPlugin({ scope: 'task-only' })

    let statusCallCount = 0
    mockExecSync.mockImplementation((cmd: string) => {
      if (cmd.includes('git rev-parse')) {
        return '/path/to/.git'
      }
      if (cmd.includes('git status --porcelain')) {
        statusCallCount++
        if (statusCallCount === 1) {
          return ' M file1.txt\n'
        }
        return ' M file1.txt\n M file2.txt\n'
      }
      if (cmd.includes('git diff --cached')) {
        return 'file2.txt\n'
      }
      if (cmd.includes('git add')) {
        return ''
      }
      return ''
    })

    const context: TaskContext = {
      task: {
        id: 'TASK-001',
        title: 'Test task',
        description: 'Test description',
        status: 'in-progress',
        priority: 'medium',
      },
      config: {} as any,
      iteration: 1,
      startTime: new Date(),
      namespace: 'default',
    }

    await plugin.onTaskStart!(context)

    context.task.status = 'completed'
    const result: PluginTaskResult = {
      duration: 1.5,
      success: true,
    }

    await plugin.onTaskComplete!(context, result)

    const addAllCalls = mockExecSync.mock.calls.filter((call: any) =>
      String(call[0]).includes('git add -A')
    )
    expect(addAllCalls.length).toBe(0)

    const addCalls = mockExecSync.mock.calls.filter((call: any) =>
      String(call[0]).includes('git add') && String(call[0]).includes('file2.txt')
    )
    expect(addCalls.length).toBe(1)

    const commitCalls = mockExecSync.mock.calls.filter((call: any) =>
      String(call[0]).includes('git commit')
    )
    expect(commitCalls.length).toBe(1)
  })

  test('scope: "staged-only" should only commit already staged files', async () => {
    const plugin = createGitAutoCommitPlugin({ scope: 'staged-only' })

    mockExecSync.mockImplementation((cmd: string) => {
      if (cmd.includes('git rev-parse')) {
        return '/path/to/.git'
      }
      if (cmd.includes('git status --porcelain')) {
        return 'M  file1.txt\n M file2.txt\n'
      }
      if (cmd.includes('git diff --cached')) {
        return 'file1.txt\n' 
      }
      return ''
    })

    const context: TaskContext = {
      task: {
        id: 'TASK-001',
        title: 'Test task',
        description: 'Test description',
        status: 'completed',
        priority: 'medium',
      },
      config: {} as any,
      iteration: 1,
      startTime: new Date(),
      namespace: 'default',
    }

    const result: PluginTaskResult = {
      duration: 1.5,
      success: true,
    }

    await plugin.onTaskComplete!(context, result)

    const addCalls = mockExecSync.mock.calls.filter((call: any) =>
      String(call[0]).includes('git add')
    )
    expect(addCalls.length).toBe(0)

    const commitCalls = mockExecSync.mock.calls.filter((call: any) =>
      String(call[0]).includes('git commit')
    )
    expect(commitCalls.length).toBe(1)
  })

  test('scope: "task-only" should skip commit if no task-specific changes', async () => {
    const plugin = createGitAutoCommitPlugin({ scope: 'task-only' })

    mockExecSync.mockImplementation((cmd: string) => {
      if (cmd.includes('git rev-parse')) {
        return '/path/to/.git'
      }
      if (cmd.includes('git status --porcelain')) {
        return ' M file1.txt\n'
      }
      return ''
    })

    const context: TaskContext = {
      task: {
        id: 'TASK-001',
        title: 'Test task',
        description: 'Test description',
        status: 'in-progress',
        priority: 'medium',
      },
      config: {} as any,
      iteration: 1,
      startTime: new Date(),
      namespace: 'default',
    }

    await plugin.onTaskStart!(context)

    context.task.status = 'completed'
    const result: PluginTaskResult = {
      duration: 1.5,
      success: true,
    }

    await plugin.onTaskComplete!(context, result)

    const commitCalls = mockExecSync.mock.calls.filter((call: any) =>
      String(call[0]).includes('git commit')
    )
    expect(commitCalls.length).toBe(0)
  })
})
