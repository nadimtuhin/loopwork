import { describe, test, expect, mock, beforeEach, afterEach } from 'bun:test'
import { createGitAutoCommitPlugin, type GitAutoCommitOptions } from '../src/plugins/git-autocommit'
import type { TaskContext, PluginTaskResult } from '../src/contracts/plugin'
import { execSync } from 'child_process'

// Mock execSync
const mockExecSync = mock(() => '')
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

    // Mock git rev-parse to throw (not a git repo)
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

    // Should only check if git repo
    expect(mockExecSync).toHaveBeenCalledWith('git rev-parse --is-inside-work-tree', { stdio: 'pipe' })
  })

  test('should skip commit if no changes', async () => {
    const plugin = createGitAutoCommitPlugin({ skipIfNoChanges: true })

    mockExecSync.mockImplementation((cmd: string) => {
      if (cmd.includes('git rev-parse')) {
        return '/path/to/.git'
      }
      if (cmd.includes('git status --porcelain')) {
        return '' // No changes
      }
      return ''
    })

    const context: TaskContext = {
      task: {
        id: 'TASK-001',
        title: 'Test task',
        description: 'Test description',
        status: 'completed',
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

    // Should check for changes
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

    // Should add all files
    expect(mockExecSync).toHaveBeenCalledWith('git add -A', { stdio: 'pipe' })

    // Should create commit with proper message
    const commitCalls = mockExecSync.mock.calls.filter((call: any) =>
      call[0]?.includes('git commit')
    )
    expect(commitCalls.length).toBe(1)

    const commitMessage = commitCalls[0][0]
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
      },
      config: {} as any,
      iteration: 1,
      startTime: new Date(),
      namespace: 'default',
    }

    const result: PluginTaskResult = {
      duration: 1.5,
      success: false, // Task failed
    }

    await plugin.onTaskComplete!(context, result)

    // Should not commit
    const commitCalls = mockExecSync.mock.calls.filter((call: any) =>
      call[0]?.includes('git commit')
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

    // Should not throw error
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

    // Should not call any git commands
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
      call[0]?.includes('git commit')
    )
    expect(commitCalls.length).toBe(1)

    const commitMessage = commitCalls[0][0]
    // Should truncate and add ...
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

    // Should add all files with git add -A
    expect(mockExecSync).toHaveBeenCalledWith('git add -A', { stdio: 'pipe' })

    // Should create commit
    const commitCalls = mockExecSync.mock.calls.filter((call: any) =>
      call[0]?.includes('git commit')
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
        // First call (onTaskStart): only file1.txt exists
        // Second call (onTaskComplete): file1.txt and file2.txt exist
        // Format is: XY<space>filename (X=index, Y=worktree)
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
      },
      config: {} as any,
      iteration: 1,
      startTime: new Date(),
      namespace: 'default',
    }

    // Simulate task start
    await plugin.onTaskStart!(context)

    // Simulate task completion
    context.task.status = 'completed'
    const result: PluginTaskResult = {
      duration: 1.5,
      success: true,
    }

    await plugin.onTaskComplete!(context, result)

    // Should NOT add all files (no git add -A)
    const addAllCalls = mockExecSync.mock.calls.filter((call: any) =>
      call[0]?.includes('git add -A')
    )
    expect(addAllCalls.length).toBe(0)

    // Should add only file2.txt (the new file)
    const addCalls = mockExecSync.mock.calls.filter((call: any) =>
      call[0]?.includes('git add') && call[0]?.includes('file2.txt')
    )
    expect(addCalls.length).toBe(1)

    // Should create commit
    const commitCalls = mockExecSync.mock.calls.filter((call: any) =>
      call[0]?.includes('git commit')
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
        return 'file1.txt\n' // Only file1.txt is staged
      }
      return ''
    })

    const context: TaskContext = {
      task: {
        id: 'TASK-001',
        title: 'Test task',
        description: 'Test description',
        status: 'completed',
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

    // Should NOT add any files (no git add commands)
    const addCalls = mockExecSync.mock.calls.filter((call: any) =>
      call[0]?.includes('git add')
    )
    expect(addCalls.length).toBe(0)

    // Should create commit with only staged files
    const commitCalls = mockExecSync.mock.calls.filter((call: any) =>
      call[0]?.includes('git commit')
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
        // Same files before and after
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
      },
      config: {} as any,
      iteration: 1,
      startTime: new Date(),
      namespace: 'default',
    }

    // Simulate task start
    await plugin.onTaskStart!(context)

    // Simulate task completion
    context.task.status = 'completed'
    const result: PluginTaskResult = {
      duration: 1.5,
      success: true,
    }

    await plugin.onTaskComplete!(context, result)

    // Should not create commit (no task-specific changes)
    const commitCalls = mockExecSync.mock.calls.filter((call: any) =>
      call[0]?.includes('git commit')
    )
    expect(commitCalls.length).toBe(0)
  })
})
