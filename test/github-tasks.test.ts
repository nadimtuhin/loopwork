import { describe, test, expect, mock, beforeEach } from 'bun:test'
import { GitHubTaskAdapter } from '../src/backends/github'

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
    expect(DEFAULT_CONFIG.cli).toBe('opencode')
    expect(DEFAULT_CONFIG.autoConfirm).toBe(false)
    expect(DEFAULT_CONFIG.dryRun).toBe(false)
  })
})
