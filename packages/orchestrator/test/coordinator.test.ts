import { describe, test, expect, beforeEach, afterEach } from 'bun:test'
import fs from 'fs'
import path from 'path'
import os from 'os'
import { ClusterCoordinator } from '../src/coordinator'
import { NamespaceManager } from '../src/namespace-manager'
import { CoordinatorConfig } from '@loopwork-ai/contracts'

describe('ClusterCoordinator', () => {
  let tempDir: string
  let coordinator: ClusterCoordinator
  let namespaceManager: NamespaceManager
  let config: CoordinatorConfig

  beforeEach(async () => {
    tempDir = path.join(os.tmpdir(), `loopwork-coord-test-${Math.random().toString(36).slice(2)}`)
    fs.mkdirSync(tempDir, { recursive: true })
    
    namespaceManager = new NamespaceManager({ projectRoot: tempDir })
    coordinator = new ClusterCoordinator(namespaceManager)
    
    config = {
      defaultNamespace: 'default',
      maxConcurrentNamespaces: 2,
      defaultLockTimeout: 5000,
      enableLocking: true
    }
    
    await coordinator.initialize(config)
  })

  afterEach(async () => {
    await coordinator.dispose()
    fs.rmSync(tempDir, { recursive: true, force: true })
  })

  test('should initialize and get namespace manager', () => {
    expect(coordinator.getNamespaceManager()).toBe(namespaceManager)
  })

  test('should check namespace availability based on concurrency', async () => {
    await namespaceManager.createNamespace('ns-1')
    await namespaceManager.createNamespace('ns-2')
    await namespaceManager.createNamespace('ns-3')

    await namespaceManager.lockNamespace('ns-1')
    await namespaceManager.lockNamespace('ns-2')

    expect(await coordinator.isNamespaceAvailable('ns-3')).toBe(false)
    expect(await coordinator.isNamespaceAvailable('ns-1')).toBe(false)

    await namespaceManager.unlockNamespace('ns-1')
    expect(await coordinator.isNamespaceAvailable('ns-3')).toBe(true)
  })

  test('should handle stale locks in isNamespaceAvailable', async () => {
    const id = 'stale-pid-test'
    await namespaceManager.createNamespace(id)
    const lockPath = path.join(tempDir, '.loopwork', `state-${id}.lock`)
    fs.mkdirSync(lockPath)
    
    const pidFile = path.join(lockPath, 'pid')
    fs.writeFileSync(pidFile, '9999999')

    expect(await coordinator.isNamespaceAvailable(id)).toBe(true)
    expect(fs.existsSync(lockPath)).toBe(false)
  })

  test('should orchestrate a task successfully', async () => {
    const result = await coordinator.orchestrate({
      namespace: 'default',
      taskId: 'TASK-1',
      maxIterations: 5
    })

    expect(result.success).toBe(true)
    expect(result.taskId).toBe('TASK-1')
  })

  test('should fail orchestration if namespace is locked', async () => {
    await namespaceManager.lockNamespace('default')
    
    const result = await coordinator.orchestrate({
      namespace: 'default',
      taskId: 'TASK-2',
      maxIterations: 5
    })

    expect(result.success).toBe(false)
    expect(result.error).toContain('is not available')
  })

  test('should track active agents and update cluster state', () => {
    coordinator.registerAgent('default', 'agent-1')
    coordinator.registerAgent('default', 'agent-2')
    
    let state = coordinator.getClusterState()
    expect(state.namespaces.has('default')).toBe(true)
  })

  test('should release lock after orchestration even if it fails', async () => {
    await coordinator.orchestrate({
      namespace: 'default',
      taskId: 'TASK-3',
      maxIterations: 5
    })
    
    expect(await namespaceManager.isNamespaceLocked('default')).toBe(false)
  })

  test('should handle concurrent orchestration requests from different processes', async () => {
    await namespaceManager.createNamespace('ns-concurrent')
    
    const lockPath = path.join(tempDir, '.loopwork', 'state-ns-concurrent.lock')
    fs.mkdirSync(lockPath, { recursive: true })
    fs.writeFileSync(path.join(lockPath, 'pid'), process.ppid.toString())

    const result = await coordinator.orchestrate({ 
      namespace: 'ns-concurrent', 
      taskId: 'TASK-B', 
      maxIterations: 5 
    })

    expect(result.success).toBe(false)
    expect(result.error).toContain('is not available')
  })
})
