import { describe, expect, test, mock, beforeEach } from 'bun:test'
import { takeSnapshot, rollbackFiles, GitSnapshot } from '../git-snapshots'

// Mock git module
const mockGit = {
  isGitRepo: mock(() => true),
  getCurrentHash: mock(() => 'hash123'),
  hasChanges: mock(() => false),
  createStash: mock(() => 'stash@{0}'),
  getDiffNames: mock(() => ['file1.ts', 'file2.ts']),
  checkoutFiles: mock(() => true),
  rollbackTo: mock(() => true),
  applyStash: mock(() => true)
}

mock.module('../git', () => mockGit)

// Mock child_process for direct execSync calls in rollbackFiles
const mockExecSync = mock(() => '')
mock.module('child_process', () => ({
  execSync: mockExecSync
}))

// Mock fs for unlinkSync
const mockUnlinkSync = mock(() => {})
const mockExistsSync = mock(() => false)
mock.module('fs', () => ({
  existsSync: mockExistsSync,
  mkdirSync: mock(() => {}),
  writeFileSync: mock(() => {}),
  unlinkSync: mockUnlinkSync
}))

describe('git-snapshots', () => {
  beforeEach(() => {
    mockGit.checkoutFiles.mockClear()
    mockExecSync.mockClear()
    mockUnlinkSync.mockClear()
  })

  test('rollbackFiles should checkout existing files', async () => {
    const snapshot: GitSnapshot = {
      id: 'snap1',
      timestamp: 123456,
      taskId: 'TASK-1',
      iteration: 1,
      hash: 'hash123',
      hasStash: false,
      description: 'test'
    }

    // execSync is called to check if file exists (git cat-file)
    // We want it to succeed (return empty string/not throw)
    mockExecSync.mockImplementation(() => '')

    const result = await rollbackFiles(snapshot, ['file1.ts'])

    expect(result).toBe(true)
    // Should verify file existence
    expect(mockExecSync).toHaveBeenCalledWith(expect.stringContaining('git cat-file -e hash123:"file1.ts"'), expect.any(Object))
    // Should checkout file
    expect(mockGit.checkoutFiles).toHaveBeenCalledWith('hash123', ['file1.ts'], expect.any(String))
  })

  test('rollbackFiles should delete new files', async () => {
    const snapshot: GitSnapshot = {
      id: 'snap1',
      timestamp: 123456,
      taskId: 'TASK-1',
      iteration: 1,
      hash: 'hash123',
      hasStash: false,
      description: 'test'
    }

    // execSync throws for new file (git cat-file fails)
    mockExecSync.mockImplementation(() => { throw new Error('Not found') })
    // existsSync returns true for the file on disk
    mockExistsSync.mockReturnValue(true)

    const result = await rollbackFiles(snapshot, ['newfile.ts'])

    expect(result).toBe(true)
    // Should try to check file existence
    expect(mockExecSync).toHaveBeenCalledWith(expect.stringContaining('git cat-file'), expect.any(Object))
    // Should NOT checkout file
    expect(mockGit.checkoutFiles).not.toHaveBeenCalled()
    // Should delete file
    expect(mockUnlinkSync).toHaveBeenCalled()
  })
})
