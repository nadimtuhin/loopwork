import { describe, expect, test, beforeEach, afterEach } from 'bun:test'
import { execFileSync } from 'child_process'
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { createCommit, createStash, checkoutFiles } from '../src/utils/git'
import { rollbackFiles, type GitSnapshot } from '../src/utils/git-snapshots'

/**
 * Commit/stash messages come from task titles (e.g. GitHub issue titles) and
 * file names come from whatever the AI wrote to disk. Neither may reach a shell.
 */
describe('git utils: no shell interpretation of untrusted input', () => {
  let repo: string
  const git = (...args: string[]) =>
    execFileSync('git', args, { cwd: repo, stdio: 'pipe' }).toString().trim()

  beforeEach(() => {
    repo = mkdtempSync(join(tmpdir(), 'loopwork-git-inj-'))
    git('init', '-q')
    git('config', 'user.email', 'test@example.com')
    git('config', 'user.name', 'Test')
    git('config', 'commit.gpgsign', 'false')
    writeFileSync(join(repo, 'a.txt'), 'a')
    git('add', '-A')
    git('commit', '-q', '-m', 'init')
  })

  afterEach(() => {
    rmSync(repo, { recursive: true, force: true })
  })

  test('createCommit does not execute command substitution after a backslash', () => {
    writeFileSync(join(repo, 'b.txt'), 'b')
    const message = 'fix \\$(touch PWNED_COMMIT)'
    const hash = createCommit(message, true, repo)

    expect(existsSync(join(repo, 'PWNED_COMMIT'))).toBe(false)
    expect(hash).toBeTruthy()
    expect(git('log', '-1', '--format=%B')).toBe(message)
  })

  test('createCommit handles a message ending in a backslash', () => {
    writeFileSync(join(repo, 'c.txt'), 'c')
    const message = 'path C:\\dir\\'
    expect(createCommit(message, true, repo)).toBeTruthy()
    expect(git('log', '-1', '--format=%B')).toBe(message)
  })

  test('createStash does not execute command substitution after a backslash', () => {
    writeFileSync(join(repo, 'a.txt'), 'changed')
    const ref = createStash('snap \\$(touch PWNED_STASH)', repo)

    expect(existsSync(join(repo, 'PWNED_STASH'))).toBe(false)
    expect(ref).toBe('stash@{0}')
  })

  test('checkoutFiles does not execute command substitution in file names', () => {
    const evil = '$(touch PWNED_CHECKOUT)'
    writeFileSync(join(repo, evil), 'v1')
    git('add', '-A')
    git('commit', '-q', '-m', 'evil file')
    const hash = git('rev-parse', 'HEAD')
    writeFileSync(join(repo, evil), 'v2')

    expect(checkoutFiles(hash, [evil], repo)).toBe(true)
    expect(existsSync(join(repo, 'PWNED_CHECKOUT'))).toBe(false)
  })

  test('rollbackFiles does not execute command substitution in file names', async () => {
    const hash = git('rev-parse', 'HEAD')
    const evil = '$(touch PWNED_ROLLBACK)'
    writeFileSync(join(repo, evil), 'new')

    const snapshot: GitSnapshot = {
      id: 'snap_test', timestamp: 0, taskId: 'T-1', iteration: 1,
      hash, hasStash: false, description: 'test',
    }
    const cwd = process.cwd()
    process.chdir(repo)
    try {
      await rollbackFiles(snapshot, [evil])
    } finally {
      process.chdir(cwd)
    }

    expect(existsSync(join(repo, 'PWNED_ROLLBACK'))).toBe(false)
    // The file did not exist in the snapshot, so it is removed
    expect(existsSync(join(repo, evil))).toBe(false)
  })
})
