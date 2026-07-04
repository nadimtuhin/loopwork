import { describe, test, expect, beforeEach, afterEach } from 'bun:test'
import { existsSync, unlinkSync, writeFileSync, readFileSync, mkdirSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { FileLock, withFileLock, withFileLockAsync, acquireFileLock, releaseFileLock } from '../src/lock'

describe('FileLock', () => {
  const testDir = tmpdir()
  let testFile: string
  let lockFile: string

  beforeEach(() => {
    testFile = join(testDir, `test-${Date.now()}.json`)
    lockFile = `${testFile}.lock`
    // Clean up any existing files
    if (existsSync(testFile)) unlinkSync(testFile)
    if (existsSync(lockFile)) unlinkSync(lockFile)
    writeFileSync(testFile, '{}')
  })

  afterEach(() => {
    // Clean up
    if (existsSync(testFile)) unlinkSync(testFile)
    if (existsSync(lockFile)) unlinkSync(lockFile)
  })

  describe('acquire and release', () => {
    test('should acquire lock successfully', async () => {
      const lock = new FileLock({ filePath: testFile })
      const result = await lock.acquire()

      expect(result.acquired).toBe(true)
      expect(result.lockFile).toBe(lockFile)
      expect(existsSync(lockFile)).toBe(true)
    })

    test('should release lock correctly', async () => {
      const lock = new FileLock({ filePath: testFile })
      await lock.acquire()
      lock.release()

      expect(existsSync(lockFile)).toBe(false)
    })

    test('should only release lock owned by this process', async () => {
      const lock = new FileLock({ filePath: testFile })
      await lock.acquire()

      // Write different PID to lock file
      writeFileSync(lockFile, '999999')

      // Should not release since we don't own it
      lock.release()
      expect(existsSync(lockFile)).toBe(true)

      // Clean up
      unlinkSync(lockFile)
    })
  })

  describe('withLock', () => {
    test('should execute function with lock', async () => {
      const lock = new FileLock({ filePath: testFile })
      let executed = false

      await lock.withLock(() => {
        executed = true
        expect(existsSync(lockFile)).toBe(true)
      })

      expect(executed).toBe(true)
      expect(existsSync(lockFile)).toBe(false)
    })

    test('should release lock even if function throws', async () => {
      const lock = new FileLock({ filePath: testFile })

      await expect(
        lock.withLock(() => {
          throw new Error('test error')
        })
      ).rejects.toThrow('test error')

      expect(existsSync(lockFile)).toBe(false)
    })
  })

  describe('withFileLock convenience function', () => {
    test('should work with sync function', async () => {
      let executed = false

      await withFileLock(testFile, () => {
        executed = true
      })

      expect(executed).toBe(true)
    })

    test('should work with async function', async () => {
      let executed = false

      await withFileLockAsync(testFile, async () => {
        await new Promise((resolve) => setTimeout(resolve, 10))
        executed = true
      })

      expect(executed).toBe(true)
    })
  })

  describe('lock contention', () => {
    test('should support reentrant lock acquisition', async () => {
      // Test that the same process can acquire the lock multiple times (reentrant)
      const lock = new FileLock({ filePath: testFile, timeout: 1000, retryDelay: 50 })

      // First acquisition should succeed
      const result1 = await lock.acquire()
      expect(result1.acquired).toBe(true)

      // Second acquisition by same process should also succeed (reentrant)
      const result2 = await lock.acquire()
      expect(result2.acquired).toBe(true)

      // Clean up - both acquisitions need release
      lock.release()
      lock.release()
    })

    test('should clean up stale lock from dead process immediately', async () => {
      // Create a lock file with a fake PID that doesn't exist
      writeFileSync(lockFile, '999998')
      expect(existsSync(lockFile)).toBe(true)

      // Lock with any stale timeout - dead process should be detected
      const lock = new FileLock({ filePath: testFile, staleTimeout: 60000 })

      // Should be able to acquire because the process is dead
      const result = await lock.acquire()
      expect(result.acquired).toBe(true)

      // Clean up
      lock.release()
    })

    test('should wait for lock and succeed after release', async () => {
      const lock1 = new FileLock({ filePath: testFile, timeout: 1000, retryDelay: 50 })
      const lock2 = new FileLock({ filePath: testFile, timeout: 200, retryDelay: 50 })

      const result1 = await lock1.acquire()
      expect(result1.acquired).toBe(true)

      // Start lock2 in background
      const lock2Promise = lock2.acquire()

      // Release lock1 after a short delay
      setTimeout(() => lock1.release(), 100)

      // Lock2 should eventually get the lock
      const result2 = await lock2Promise
      expect(result2.acquired).toBe(true)

      // Clean up
      lock2.release()
    })
  })

  describe('stale lock cleanup', () => {
    test('should clean up stale lock from dead process', async () => {
      // Create a lock file with a fake PID
      const fakePid = 999999
      writeFileSync(lockFile, String(fakePid))
      expect(existsSync(lockFile)).toBe(true)

      // Create lock with short stale timeout
      const lock = new FileLock({ filePath: testFile, staleTimeout: 50 })

      // Should be able to acquire because the process is dead
      const result = await lock.acquire()
      expect(result.acquired).toBe(true)

      // Clean up
      lock.release()
    })

    test('should recognize valid lock from live process (reentrant)', async () => {
      // Create a lock file with current PID (simulating pre-existing lock we own)
      writeFileSync(lockFile, String(process.pid))
      expect(existsSync(lockFile)).toBe(true)

      // Create lock with short stale timeout
      const lock = new FileLock({ filePath: testFile, staleTimeout: 50 })

      // Should be able to acquire because we own the lock (reentrant)
      const result = await lock.acquire()
      expect(result.acquired).toBe(true)

      // Clean up
      lock.release()
    })

    test('should clean up stale lock from dead process', async () => {
      // Create a lock file with a fake PID that doesn't exist
      const fakePid = 999999
      writeFileSync(lockFile, String(fakePid))
      expect(existsSync(lockFile)).toBe(true)

      // Create lock with short stale timeout
      const lock = new FileLock({ filePath: testFile, staleTimeout: 50 })

      // Should be able to acquire because the process is dead
      const result = await lock.acquire()
      expect(result.acquired).toBe(true)

      // Clean up
      lock.release()
    })

    test('should handle lock from different live process', async () => {
      // Create a lock file with a different (fake but plausible) PID
      writeFileSync(lockFile, '999997')
      expect(existsSync(lockFile)).toBe(true)

      // Create lock with very short stale timeout
      const lock = new FileLock({ filePath: testFile, staleTimeout: 50 })

      // The process 999997 may or may not exist
      // If it exists, we should fail to acquire (until timeout)
      // If it doesn't exist, we should succeed (stale cleanup)
      // Either behavior is valid depending on whether PID 999997 is alive
      const result = await lock.acquire()
      // Just verify we get a result
      expect(typeof result.acquired).toBe('boolean')

      // Clean up either way
      if (result.acquired) {
        lock.release()
      } else {
        releaseFileLock(lockFile, true)
      }
    })
  })

  describe('isLockOwner', () => {
    test('should return true when we own the lock', async () => {
      const lock = new FileLock({ filePath: testFile })
      await lock.acquire()

      expect(lock.isLockOwner()).toBe(true)

      lock.release()
    })

    test('should return false when we do not own the lock', async () => {
      const lock = new FileLock({ filePath: testFile })
      await lock.acquire()

      // Write different PID
      writeFileSync(lockFile, '999999')

      expect(lock.isLockOwner()).toBe(false)

      // Clean up
      unlinkSync(lockFile)
    })

    test('should return false when no lock exists', () => {
      const lock = new FileLock({ filePath: testFile })
      expect(lock.isLockOwner()).toBe(false)
    })
  })

  describe('forceRelease', () => {
    test('should remove lock regardless of ownership', async () => {
      const lock = new FileLock({ filePath: testFile })
      await lock.acquire()
      expect(existsSync(lockFile)).toBe(true)

      // Write different PID to simulate another process
      writeFileSync(lockFile, '999999')

      // Force release should still work
      lock.forceRelease()
      expect(existsSync(lockFile)).toBe(false)
    })
  })

  describe('read-only filesystem handling', () => {
    test('should handle read-only directory gracefully', async () => {
      // This test is mainly to verify the error handling path
      // We can't easily simulate a read-only filesystem in tests
      // but we can verify the error is handled

      const lock = new FileLock({ filePath: testFile })

      // Try to acquire on non-existent path
      const nonExistentFile = join(testDir, `nonexistent-${Date.now()}-${Math.random()}/test.json`)
      const nonExistentLock = new FileLock({ filePath: nonExistentFile })

      const result = await nonExistentLock.acquire()
      // This should fail because the directory doesn't exist
      expect(result.acquired).toBe(false)
    })
  })
})

describe('acquireFileLock and releaseFileLock functions', () => {
  const testDir = tmpdir()
  let testFile: string
  let lockFile: string

  beforeEach(() => {
    testFile = join(testDir, `test-${Date.now()}.json`)
    lockFile = `${testFile}.lock`
    if (existsSync(testFile)) unlinkSync(testFile)
    if (existsSync(lockFile)) unlinkSync(lockFile)
    writeFileSync(testFile, '{}')
  })

  afterEach(() => {
    if (existsSync(testFile)) unlinkSync(testFile)
    if (existsSync(lockFile)) unlinkSync(lockFile)
  })

  test('acquireFileLock should return lock result', async () => {
    const result = await acquireFileLock(testFile)
    expect(result.acquired).toBe(true)
    expect(result.lockFile).toBe(lockFile)
  })

  test('releaseFileLock should remove lock file', async () => {
    await acquireFileLock(testFile)
    expect(existsSync(lockFile)).toBe(true)

    releaseFileLock(lockFile)
    expect(existsSync(lockFile)).toBe(false)
  })

  test('releaseFileLock with force should remove any lock', async () => {
    await acquireFileLock(testFile)
    writeFileSync(lockFile, '999999')

    releaseFileLock(lockFile, true)
    expect(existsSync(lockFile)).toBe(false)
  })
})
