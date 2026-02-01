import { describe, test, expect, mock, beforeEach } from 'bun:test'
import * as git from '../../src/utils/git'
import * as snapshots from '../../src/utils/git-snapshots'

const mockExecSync = mock((_cmd: string) => '')
mock.module('child_process', () => ({
  execSync: mockExecSync,
}))

describe('Git Utilities & Snapshots', () => {
  beforeEach(() => {
    mockExecSync.mockClear()
  })

  describe('Git Utilities', () => {
    test('isGitRepo should return true if git rev-parse succeeds', () => {
      mockExecSync.mockImplementation((_cmd: string) => '')
      expect(git.isGitRepo()).toBe(true)
    })

    test('isGitRepo should return false if git rev-parse fails', () => {
      mockExecSync.mockImplementation((_cmd: string) => {
        throw new Error('not a repo')
      })
      expect(git.isGitRepo()).toBe(false)
    })

    test('hasChanges should return true if git status is not empty', () => {
      mockExecSync.mockImplementation((_cmd: string) => ' M file.txt')
      expect(git.hasChanges()).toBe(true)
    })

    test('getCurrentHash should return current commit hash', () => {
      mockExecSync.mockImplementation((_cmd: string) => 'abcdef123456\n')
      expect(git.getCurrentHash()).toBe('abcdef123456')
    })

    test('createCommit should call git add and git commit', () => {
      mockExecSync.mockImplementation((cmd: string) => {
        if (cmd.includes('git rev-parse HEAD')) return 'newhash'
        return ''
      })
      
      const hash = git.createCommit('test message')
      expect(hash).toBe('newhash')
      expect(mockExecSync).toHaveBeenCalledWith('git add -A', expect.any(Object))
      expect(mockExecSync).toHaveBeenCalledWith(expect.stringContaining('git commit -m'), expect.any(Object))
    })

    test('createStash should call git stash push', () => {
      mockExecSync.mockImplementation((cmd: string) => {
        if (cmd.includes('git stash list')) return 'Loopwork Snapshot: test - Before task execution'
        return ''
      })
      
      const ref = git.createStash('test - Before task execution')
      expect(ref).toBe('stash@{0}')
      expect(mockExecSync).toHaveBeenCalledWith(expect.stringContaining('git stash push'), expect.any(Object))
    })
  })

  describe('Git Snapshots', () => {
    const mockContext: any = {
      task: { id: 'TASK-001' },
      iteration: 1
    }

    test('takeSnapshot should create a snapshot without stash if no changes', async () => {
      mockExecSync.mockImplementation((cmd: string) => {
        if (cmd.includes('git rev-parse --is-inside-work-tree')) return ''
        if (cmd.includes('git rev-parse HEAD')) return 'basehash'
        if (cmd.includes('git status --porcelain')) return ''
        return ''
      })

      const snapshot = await snapshots.takeSnapshot(mockContext)
      expect(snapshot).not.toBeNull()
      expect(snapshot?.hash).toBe('basehash')
      expect(snapshot?.hasStash).toBe(false)
    })

    test('takeSnapshot should create a stash if there are changes', async () => {
      mockExecSync.mockImplementation((cmd: string) => {
        if (cmd.includes('git rev-parse --is-inside-work-tree')) return ''
        if (cmd.includes('git rev-parse HEAD')) return 'basehash'
        if (cmd.includes('git status --porcelain')) return ' M file.txt'
        if (cmd.includes('git stash list')) return 'Loopwork Snapshot: TASK-001 - Before task execution'
        return ''
      })

      const snapshot = await snapshots.takeSnapshot(mockContext)
      expect(snapshot?.hasStash).toBe(true)
      expect(snapshot?.stashRef).toBe('stash@{0}')
    })

    test('rollbackToSnapshot should reset and apply stash', async () => {
      const snapshot: snapshots.GitSnapshot = {
        id: 'snap1',
        timestamp: Date.now(),
        taskId: 'TASK-001',
        iteration: 1,
        hash: 'basehash',
        hasStash: true,
        stashRef: 'stash@{0}',
        description: 'test'
      }

      mockExecSync.mockImplementation(() => '')

      const result = await snapshots.rollbackToSnapshot(snapshot)
      expect(result).toBe(true)
      expect(mockExecSync).toHaveBeenCalledWith('git reset --hard basehash', expect.any(Object))
      expect(mockExecSync).toHaveBeenCalledWith('git stash apply stash@{0}', expect.any(Object))
    })
  })
})
