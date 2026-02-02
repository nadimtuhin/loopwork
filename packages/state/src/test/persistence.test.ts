import { describe, expect, test, beforeEach, afterEach } from 'bun:test'
import fs from 'fs'
import path from 'path'
import os from 'os'
import { FilePersistenceLayer } from '../persistence/file'

describe('FilePersistenceLayer', () => {
  let testDir: string
  let persistence: FilePersistenceLayer

  beforeEach(() => {
    testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'state-test-'))
    persistence = new FilePersistenceLayer({ baseDir: testDir })
  })

  afterEach(() => {
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true, force: true })
    }
  })

  test('should initialize directory', async () => {
    // We start with a fresh temp dir which exists, 
    // but initialize might create it if we passed a non-existent subpath.
    // Let's test non-existent subpath case
    const subDir = path.join(testDir, 'subdir')
    persistence = new FilePersistenceLayer({ baseDir: subDir })
    await persistence.initialize()
    expect(fs.existsSync(subDir)).toBe(true)
  })

  test('should set and get values', async () => {
    const key = 'test-key'
    const value = { foo: 'bar' }
    await persistence.set(key, value)
    
    const retrieved = await persistence.get(key)
    expect(retrieved).toEqual(value)
  })

  test('should return null for non-existent keys', async () => {
    const retrieved = await persistence.get('non-existent')
    expect(retrieved).toBeNull()
  })

  test('should delete keys', async () => {
    const key = 'delete-me'
    await persistence.set(key, 'value')
    await persistence.delete(key)
    expect(await persistence.exists(key)).toBe(false)
  })

  test('should list keys', async () => {
    await persistence.set('key1', 1)
    await persistence.set('key2', 2)
    
    const keys = await persistence.keys()
    expect(keys).toContain('key1')
    expect(keys).toContain('key2')
    expect(keys.length).toBe(2)
  })

  test('should acquire and release lock', async () => {
    const lockName = 'my-lock'
    const lock = await persistence.acquireLock(lockName)
    
    expect(lock).not.toBeNull()
    expect(lock!.lockId).toBeDefined()
    expect(await persistence.isLocked(lockName)).toBe(true)

    await persistence.releaseLock(lock!.lockId)
    expect(await persistence.isLocked(lockName)).toBe(false)
  })

  test('should prevent double locking', async () => {
    const lockName = 'double-lock'
    const lock1 = await persistence.acquireLock(lockName)
    expect(lock1).not.toBeNull()

    // Try to acquire same lock with short timeout
    const lock2 = await persistence.acquireLock(lockName, { timeout: 100, retryInterval: 50 })
    expect(lock2).toBeNull()

    await persistence.releaseLock(lock1!.lockId)
  })

  test('atomic update should work', async () => {
    const key = 'counter'
    await persistence.set(key, { count: 0 })

    await persistence.atomicUpdate(key, (current: any) => {
      return { count: current.count + 1 }
    })

    const result = await persistence.get<any>(key)
    expect(result.count).toBe(1)
  })
})
