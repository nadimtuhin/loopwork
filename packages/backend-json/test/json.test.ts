import { describe, expect, test } from 'bun:test'
import { JsonTaskAdapter } from '../src/index'
import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'

/**
 * JSON Backend Tests
 * 
 * Test suite for JsonTaskAdapter
 */

describe('JsonTaskAdapter', () => {
  test('should instantiate without errors', () => {
    const instance = new JsonTaskAdapter({ type: 'json' })
    expect(instance).toBeDefined()
    expect(instance).toBeInstanceOf(JsonTaskAdapter)
  })

  test('should maintain instance identity', () => {
    const instance1 = new JsonTaskAdapter({ type: 'json' })
    const instance2 = new JsonTaskAdapter({ type: 'json' })
    expect(instance1).not.toBe(instance2)
  })

  test('should have correct name property', () => {
    const instance = new JsonTaskAdapter({ type: 'json' })
    expect(instance.name).toBe('json')
  })
})


describe('JsonTaskAdapter locking', () => {
  test('holds the lock until an async callback settles', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'json-lock-'))
    const adapter = new JsonTaskAdapter({ type: 'json', tasksFile: path.join(dir, 'tasks.json') })
    const lockFile = path.join(dir, 'tasks.json.lock')
    const withLock = (adapter as unknown as {
      withLock<T>(fn: () => T | Promise<T>): Promise<T>
    }).withLock.bind(adapter)

    let lockedAfterAwait = false
    await withLock(async () => {
      await new Promise(r => setTimeout(r, 20))
      lockedAfterAwait = fs.existsSync(lockFile)
    })

    expect(lockedAfterAwait).toBe(true)
    expect(fs.existsSync(lockFile)).toBe(false)
    fs.rmSync(dir, { recursive: true, force: true })
  })
})
