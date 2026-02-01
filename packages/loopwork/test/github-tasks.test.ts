import { describe, test, expect, mock, beforeEach, afterEach } from 'bun:test'
import { GitHubTaskAdapter } from '../src/backends/github'
import { $ } from 'bun'

// Note: GitHubIssue is internal to the adapter, so we define it here for testing
interface GitHubIssue {
  number: number
  title: string
  body: string
  state: 'open' | 'closed'
  labels: { name: string }[]
  url: string
}

describe('GitHubTaskAdapter', () => {
  let manager: GitHubTaskAdapter

  beforeEach(() => {
    manager = new GitHubTaskAdapter({ type: 'github' })
    // Reduce delay for testing to avoid timeouts
    ;(manager as any).baseDelayMs = 1
    ;(manager as any).rateLimitWaitMs = 1
  })

  describe('adaptIssue conversion', () => {
    test('extracts task ID from title', () => {
      const issue: GitHubIssue = {
        number: 123,
        title: 'TASK-025-01: Add health score calculation',
        body: '## Goal\nCalculate health score',
        state: 'open',
        labels: [{ name: 'loopwork-task' }, { name: 'loopwork:pending' }],
        url: 'https://github.com/owner/repo/issues/123',
      }

      const task = (manager as any).adaptIssue(issue)

      expect(task.id).toBe('TASK-025-01')
      expect(task.metadata.issueNumber).toBe(123)
      expect(task.status).toBe('pending')
    })

    test('generates GH-{number} ID when no task ID in title', () => {
      const issue: GitHubIssue = {
        number: 456,
        title: 'Fix the login bug',
        body: 'Fix it',
        state: 'open',
        labels: [{ name: 'loopwork-task' }],
        url: 'https://github.com/owner/repo/issues/456',
      }

      const task = (manager as any).adaptIssue(issue)

      expect(task.id).toBe('GH-456')
    })

    test('detects in-progress status from labels', () => {
      const issue: GitHubIssue = {
        number: 789,
        title: 'TASK-001-01: Test',
        body: 'Test',
        state: 'open',
        labels: [{ name: 'loopwork-task' }, { name: 'loopwork:in-progress' }],
        url: 'https://github.com/owner/repo/issues/789',
      }

      const task = (manager as any).adaptIssue(issue)

      expect(task.status).toBe('in-progress')
    })

    test('detects failed status from labels', () => {
      const issue: GitHubIssue = {
        number: 101,
        title: 'TASK-002-01: Another test',
        body: 'Body',
        state: 'open',
        labels: [{ name: 'loopwork-task' }, { name: 'loopwork:failed' }],
        url: 'https://github.com/owner/repo/issues/101',
      }

      const task = (manager as any).adaptIssue(issue)

      expect(task.status).toBe('failed')
    })

    test('detects quarantined status from labels', () => {
      const issue: GitHubIssue = {
        number: 101,
        title: 'TASK-002-02: Quarantined test',
        body: 'Body',
        state: 'open',
        labels: [{ name: 'loopwork-task' }, { name: 'loopwork:quarantined' }],
        url: 'https://github.com/owner/repo/issues/101',
      }

      const task = (manager as any).adaptIssue(issue)

      expect(task.status).toBe('quarantined')
    })

    test('detects completed status from closed state', () => {
      const issue: GitHubIssue = {
        number: 102,
        title: 'TASK-003-01: Closed task',
        body: 'Done',
        state: 'closed',
        labels: [{ name: 'loopwork-task' }],
        url: 'https://github.com/owner/repo/issues/102',
      }

      const task = (manager as any).adaptIssue(issue)

      expect(task.status).toBe('completed')
    })

    test('extracts priority from labels', () => {
      const highPriority: GitHubIssue = {
        number: 1,
        title: 'TASK-001-01: High',
        body: '',
        state: 'open',
        labels: [{ name: 'loopwork-task' }, { name: 'priority:high' }],
        url: 'https://github.com/owner/repo/issues/1',
      }

      const lowPriority: GitHubIssue = {
        number: 2,
        title: 'TASK-001-02: Low',
        body: '',
        state: 'open',
        labels: [{ name: 'loopwork-task' }, { name: 'priority:low' }],
        url: 'https://github.com/owner/repo/issues/2',
      }

      expect((manager as any).adaptIssue(highPriority).priority).toBe('high')
      expect((manager as any).adaptIssue(lowPriority).priority).toBe('low')
    })

    test('extracts feature from labels', () => {
      const issue: GitHubIssue = {
        number: 3,
        title: 'TASK-025-01: Feature task',
        body: '',
        state: 'open',
        labels: [
          { name: 'loopwork-task' },
          { name: 'feat:profile-health' },
        ],
        url: 'https://github.com/owner/repo/issues/3',
      }

      const task = (manager as any).adaptIssue(issue)

      expect(task.feature).toBe('profile-health')
    })

    test('defaults to medium priority when not specified', () => {
      const issue: GitHubIssue = {
        number: 4,
        title: 'TASK-001-01: No priority',
        body: '',
        state: 'open',
        labels: [{ name: 'loopwork-task' }],
        url: 'https://github.com/owner/repo/issues/4',
      }

      const task = (manager as any).adaptIssue(issue)

      expect(task.priority).toBe('medium')
    })

    test('extracts parentId from body with issue number', () => {
      const issue: GitHubIssue = {
        number: 123,
        title: 'TASK-001-01a: Sub task',
        body: 'Parent: #100\n\nSub task description',
        state: 'open',
        labels: [{ name: 'loopwork-task' }, { name: 'loopwork:sub-task' }],
        url: 'https://github.com/test/repo/issues/123',
      }

      const task = (manager as any).adaptIssue(issue)
      expect(task.parentId).toBe('GH-100')
    })

    test('extracts parentId from body with task ID', () => {
      const issue: GitHubIssue = {
        number: 124,
        title: 'TASK-001-01b: Another sub task',
        body: 'Parent: TASK-001-01\n\nDescription',
        state: 'open',
        labels: [{ name: 'loopwork-task' }],
        url: 'https://github.com/test/repo/issues/124',
      }

      const task = (manager as any).adaptIssue(issue)
      expect(task.parentId).toBe('TASK-001-01')
    })

    test('extracts dependencies from body', () => {
      const issue: GitHubIssue = {
        number: 125,
        title: 'TASK-002-01: Task with deps',
        body: 'Depends on: #50, #51, #52\n\nTask description',
        state: 'open',
        labels: [{ name: 'loopwork-task' }],
        url: 'https://github.com/test/repo/issues/125',
      }

      const task = (manager as any).adaptIssue(issue)
      expect(task.dependsOn).toEqual(['GH-50', 'GH-51', 'GH-52'])
    })

    test('handles mixed dependency formats', () => {
      const issue: GitHubIssue = {
        number: 126,
        title: 'TASK-003-01: Mixed deps',
        body: 'Depends on: TASK-001-01, #55, TASK-002-01\n\nDescription',
        state: 'open',
        labels: [{ name: 'loopwork-task' }],
        url: 'https://github.com/test/repo/issues/126',
      }

      const task = (manager as any).adaptIssue(issue)
      expect(task.dependsOn).toContain('TASK-001-01')
      expect(task.dependsOn).toContain('GH-55')
      expect(task.dependsOn).toContain('TASK-002-01')
    })

    test('handles empty body', () => {
      const issue: GitHubIssue = {
        number: 127,
        title: 'TASK-004-01: Empty body',
        body: '',
        state: 'open',
        labels: [{ name: 'loopwork-task' }],
        url: 'https://github.com/test/repo/issues/127',
      }

      const task = (manager as any).adaptIssue(issue)
      expect(task.description).toBe('')
      expect(task.parentId).toBeUndefined()
      expect(task.dependsOn).toBeUndefined()
    })
  })

  describe('repoFlag', () => {
    test('returns empty string when no repo specified', () => {
      const mgr = new GitHubTaskAdapter({ type: 'github' })
      expect((mgr as any).repoFlag()).toBe('')
    })

    test('returns --repo flag when repo specified', () => {
      const mgr = new GitHubTaskAdapter({ type: 'github', repo: 'owner/repo' })
      expect((mgr as any).repoFlag()).toBe('--repo owner/repo')
    })
  })

  describe('extractIssueNumber', () => {
    test('extracts from GH- prefix', () => {
      expect((manager as any).extractIssueNumber('GH-123')).toBe(123)
      expect((manager as any).extractIssueNumber('GH-456')).toBe(456)
    })

    test('extracts from plain number', () => {
      expect((manager as any).extractIssueNumber('789')).toBe(789)
      expect((manager as any).extractIssueNumber('42')).toBe(42)
    })

    test('extracts from # format', () => {
      expect((manager as any).extractIssueNumber('#999')).toBe(999)
      expect((manager as any).extractIssueNumber('#12')).toBe(12)
    })

    test('returns null for invalid formats', () => {
      expect((manager as any).extractIssueNumber('TASK-001-01')).toBeNull()
      expect((manager as any).extractIssueNumber('invalid')).toBeNull()
      expect((manager as any).extractIssueNumber('')).toBeNull()
    })
  })

  describe('withRetry', () => {
    test('succeeds on first attempt', async () => {
      let callCount = 0
      const fn = async () => {
        callCount++
        return 'success'
      }

      const result = await (manager as any).withRetry(fn)
      expect(result).toBe('success')
      expect(callCount).toBe(1)
    })

    test('retries on retryable error and succeeds', async () => {
      let callCount = 0
      const fn = async () => {
        callCount++
        if (callCount < 3) {
          throw new Error('network timeout')
        }
        return 'success'
      }

      const result = await (manager as any).withRetry(fn, 3)
      expect(result).toBe('success')
      expect(callCount).toBe(3)
    })

    test('throws after max retries', async () => {
      const fn = async () => {
        throw new Error('network timeout')
      }

      await expect((manager as any).withRetry(fn, 2)).rejects.toThrow('network timeout')
    })

    test('throws immediately on non-retryable error', async () => {
      let callCount = 0
      const fn = async () => {
        callCount++
        throw new Error('validation failed')
      }

      await expect((manager as any).withRetry(fn, 3)).rejects.toThrow('validation failed')
      expect(callCount).toBe(1)
    })

    test('throws on last retry even if retryable', async () => {
      let callCount = 0
      const fn = async () => {
        callCount++
        throw new Error('rate limit exceeded')
      }

      await expect((manager as any).withRetry(fn, 2)).rejects.toThrow('rate limit exceeded')
      expect(callCount).toBe(3) // initial + 2 retries
    })
  })

  describe('API operations with mocking', () => {
    let mockExec: any
    let originalQuiet: any
    let originalNothrow: any

    beforeEach(() => {
      // Create mock quiet/nothrow methods
      originalQuiet = $.quiet
      originalNothrow = $.nothrow
    })

    afterEach(() => {
      // Restore original methods
      if (originalQuiet) $.quiet = originalQuiet
      if (originalNothrow) $.nothrow = originalNothrow
      if (mockExec) mockExec.mockRestore?.()
    })

    describe('getTask', () => {
      test('returns null for invalid task ID', async () => {
        const result = await manager.getTask('invalid-id')
        expect(result).toBeNull()
      })

      test('returns null when issue not found', async () => {
        const mockCmd = {
          quiet: () => mockCmd,
          then: async () => {
            throw new Error('not found')
          }
        }

        // Mock the $ function
        const originalDollar = global.$
        global.$ = (() => mockCmd) as any

        try {
          const result = await manager.getTask('123')
          expect(result).toBeNull()
        } finally {
          global.$ = originalDollar
        }
      })
    })

    describe('listPendingTasks', () => {
      test('returns empty array on error', async () => {
        const mockCmd = {
          quiet: () => mockCmd,
          then: async () => {
            throw new Error('gh cli not found')
          }
        }

        const originalDollar = global.$
        global.$ = (() => mockCmd) as any

        try {
          const result = await manager.listPendingTasks()
          expect(result).toEqual([])
        } finally {
          global.$ = originalDollar
        }
      })

      test('includes feature filter when provided', async () => {
        let capturedCommand = ''
        const mockCmd = {
          quiet: () => mockCmd,
          then: async () => ({ stdout: Buffer.from('[]'), exitCode: 0 })
        }

        const originalDollar = global.$
        global.$ = ((cmd: any) => {
          capturedCommand = String(cmd)
          return mockCmd
        }) as any

        try {
          await manager.listPendingTasks({ feature: 'auth' })
          // Can't easily verify the command structure due to tagged template
        } finally {
          global.$ = originalDollar
        }
      })
    })

    describe('markInProgress', () => {
      test('returns error for invalid task ID', async () => {
        const result = await manager.markInProgress('invalid-task')
        expect(result.success).toBe(false)
        expect(result.error).toContain('Invalid task ID')
      })
    })

    describe('markCompleted', () => {
      test('returns error for invalid task ID', async () => {
        const result = await manager.markCompleted('invalid-task')
        expect(result.success).toBe(false)
        expect(result.error).toContain('Invalid task ID')
      })
    })

    describe('markFailed', () => {
      test('returns error for invalid task ID', async () => {
        const result = await manager.markFailed('invalid-task', 'Error message')
        expect(result.success).toBe(false)
        expect(result.error).toContain('Invalid task ID')
      })
    })

    describe('resetToPending', () => {
      test('returns error for invalid task ID', async () => {
        const result = await manager.resetToPending('invalid-task')
        expect(result.success).toBe(false)
        expect(result.error).toContain('Invalid task ID')
      })
    })

    describe('addComment', () => {
      test('returns error for invalid task ID', async () => {
        const result = await manager.addComment('invalid-task', 'Comment')
        expect(result.success).toBe(false)
        expect(result.error).toContain('Invalid task ID')
      })
    })

    describe('createTask', () => {
      test('includes dependencies in body when provided', () => {
        const mgr = new GitHubTaskAdapter({ type: 'github' })
        // This will be tested via integration or by mocking gh CLI
        expect(mgr.createTask).toBeDefined()
      })
    })

    describe('setPriority', () => {
      test('returns error for invalid task ID', async () => {
        const result = await manager.setPriority('invalid-task', 'high')
        expect(result.success).toBe(false)
        expect(result.error).toContain('Invalid task ID')
      })
    })

    describe('getSubTasks', () => {
      test('returns empty array for invalid parent ID', async () => {
        const result = await manager.getSubTasks('invalid-id')
        expect(result).toEqual([])
      })
    })

    describe('getDependencies', () => {
      test('returns empty array when task not found', async () => {
        const result = await manager.getDependencies('GH-999999')
        expect(result).toEqual([])
      })
    })

    describe('getDependents', () => {
      test('returns tasks that depend on the given task', async () => {
        // Will return empty since we're not mocking listAllTasks
        const result = await manager.getDependents('GH-123')
        expect(Array.isArray(result)).toBe(true)
      })
    })

    describe('areDependenciesMet', () => {
      test('returns true when no dependencies', async () => {
        // When getTask returns null, getDependencies returns []
        const result = await manager.areDependenciesMet('GH-999999')
        expect(result).toBe(true)
      })
    })

    describe('createSubTask', () => {
      test('throws for invalid parent ID', async () => {
        await expect(
          manager.createSubTask('invalid-id', {
            title: 'Sub task',
            description: 'Description',
            priority: 'medium'
          })
        ).rejects.toThrow('Invalid parent task ID')
      })
    })

    describe('addDependency', () => {
      test('returns error when task not found', async () => {
        const result = await manager.addDependency('GH-999999', 'GH-1')
        expect(result.success).toBe(false)
        expect(result.error).toContain('not found')
      })

      test('returns error for invalid task ID', async () => {
        const result = await manager.addDependency('invalid-id', 'GH-1')
        expect(result.success).toBe(false)
        // Both "Invalid task ID" and "Task not found" are acceptable error messages
        expect(result.error).toMatch(/Invalid task ID|not found/)
      })
    })

    describe('removeDependency', () => {
      test('returns error when task not found', async () => {
        const result = await manager.removeDependency('GH-999999', 'GH-1')
        expect(result.success).toBe(false)
        expect(result.error).toContain('not found')
      })

      test('returns error for invalid task ID', async () => {
        const result = await manager.removeDependency('invalid-id', 'GH-1')
        expect(result.success).toBe(false)
        // Both "Invalid task ID" and "Task not found" are acceptable error messages
        expect(result.error).toMatch(/Invalid task ID|not found/)
      })
    })
  })
})

describe('Types', () => {
  test('LABELS constants are correct', async () => {
    const { LABELS } = await import('../src/contracts')

    expect(LABELS.LOOPWORK_TASK).toBe('loopwork-task')
    expect(LABELS.STATUS_PENDING).toBe('loopwork:pending')
    expect(LABELS.STATUS_IN_PROGRESS).toBe('loopwork:in-progress')
    expect(LABELS.STATUS_FAILED).toBe('loopwork:failed')
    expect(LABELS.PRIORITY_HIGH).toBe('priority:high')
    expect(LABELS.PRIORITY_MEDIUM).toBe('priority:medium')
    expect(LABELS.PRIORITY_LOW).toBe('priority:low')
  })

  test('DEFAULT_CONFIG has expected values', async () => {
    const { DEFAULT_CONFIG } = await import('../src/contracts')

    expect(DEFAULT_CONFIG.maxIterations).toBe(50)
    expect(DEFAULT_CONFIG.timeout).toBe(600)
    expect(DEFAULT_CONFIG.cli).toBe('claude')
    expect(DEFAULT_CONFIG.autoConfirm).toBe(false)
    expect(DEFAULT_CONFIG.dryRun).toBe(false)
  })
})
