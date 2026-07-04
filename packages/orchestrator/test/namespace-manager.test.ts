import { describe, test, expect, beforeEach, afterEach } from 'bun:test'
import fs from 'fs'
import path from 'path'
import os from 'os'
import { NamespaceManager } from '../src/namespace-manager'

describe('NamespaceManager', () => {
  let tempDir: string
  let manager: NamespaceManager

  beforeEach(async () => {
    tempDir = path.join(os.tmpdir(), `loopwork-test-${Math.random().toString(36).slice(2)}`)
    fs.mkdirSync(tempDir, { recursive: true })
    manager = new NamespaceManager({ projectRoot: tempDir })
    await manager.initialize()
  })

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true })
  })

  test('should initialize and create .loopwork directory', () => {
    expect(fs.existsSync(path.join(tempDir, '.loopwork'))).toBe(true)
    expect(fs.existsSync(path.join(tempDir, '.loopwork', 'runs'))).toBe(true)
  })

  test('should create a new namespace', async () => {
    const ns = await manager.createNamespace('test-ns', 'Test Description')
    expect(ns).toBeDefined()
    expect(ns?.id).toBe('test-ns')
    expect(ns?.description).toBe('Test Description')
    expect(fs.existsSync(path.join(tempDir, '.loopwork', 'runs', 'test-ns'))).toBe(true)
    expect(fs.existsSync(path.join(tempDir, '.loopwork', 'state-test-ns.json'))).toBe(true)
  })

  test('should list namespaces including default', async () => {
    await manager.createNamespace('ns-1')
    await manager.createNamespace('ns-2')
    
    const namespaces = manager.listNamespaces()
    expect(namespaces.length).toBe(3)
    expect(namespaces.map(n => n.id)).toContain('default')
    expect(namespaces.map(n => n.id)).toContain('ns-1')
    expect(namespaces.map(n => n.id)).toContain('ns-2')
  })

  test('should get namespace metadata', async () => {
    await manager.createNamespace('meta-test', 'Meta data')
    const ns = manager.getNamespace('meta-test')
    expect(ns).toBeDefined()
    expect(ns?.id).toBe('meta-test')
    expect(ns?.description).toBe('Meta data')
  })

  test('should delete a namespace', async () => {
    await manager.createNamespace('delete-me')
    expect(manager.getNamespace('delete-me')).toBeDefined()
    
    const result = await manager.deleteNamespace('delete-me')
    expect(result.success).toBe(true)
    expect(manager.getNamespace('delete-me')).toBeUndefined()
  })

  test('should lock and unlock a namespace', async () => {
    await manager.createNamespace('lock-test')
    
    const lockResult = await manager.lockNamespace('lock-test')
    expect(lockResult.success).toBe(true)
    expect(await manager.isNamespaceLocked('lock-test')).toBe(true)
    
    const unlockResult = await manager.unlockNamespace('lock-test')
    expect(unlockResult.success).toBe(true)
    expect(await manager.isNamespaceLocked('lock-test')).toBe(false)
  })

  test('should handle stale locks', async () => {
    const id = 'stale-test'
    await manager.createNamespace(id)
    const lockPath = path.join(tempDir, '.loopwork', `state-${id}.lock`)
    fs.mkdirSync(lockPath)
    
    const past = new Date(Date.now() - 60000)
    fs.utimesSync(lockPath, past, past)
    
    expect(await manager.isNamespaceLocked(id)).toBe(false)
    
    const lockResult = await manager.lockNamespace(id)
    expect(lockResult.success).toBe(true)
  })

  test('should validate namespace names', async () => {
    expect(await manager.createNamespace('Invalid Name')).toBeNull()
    expect(await manager.createNamespace('invalid/path')).toBeNull()
    expect(await manager.createNamespace('very-long-namespace-name-that-exceeds-fifty-characters-limit')).toBeNull()
    expect(await manager.createNamespace('valid-ns')).not.toBeNull()
  })
})
