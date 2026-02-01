import { describe, expect, test, beforeEach, mock } from 'bun:test'
import { OfflineQueue } from '../offline-queue'
import { LoopworkState } from '../loopwork-state'
import type { TaskBackend } from '../../contracts/backend'
import fs from 'fs'

const mockWriteFileSync = mock((_path: string, _content: string) => {})
const mockReadFileSync = mock((_path: string) => JSON.stringify([]))
const mockExistsSync = mock((_path: string) => false)
const mockUnlinkSync = mock((_path: string) => {})
const mockRenameSync = mock((_oldPath: string, _newPath: string) => {})
const mockMkdirSync = mock((_path: string, _options: unknown) => {})

mock.module('fs', () => ({
  default: {
    ...fs,
    writeFileSync: mockWriteFileSync,
    readFileSync: mockReadFileSync,
    existsSync: mockExistsSync,
    unlinkSync: mockUnlinkSync,
    renameSync: mockRenameSync,
    mkdirSync: mockMkdirSync,
  },
  writeFileSync: mockWriteFileSync,
  readFileSync: mockReadFileSync,
  existsSync: mockExistsSync,
  unlinkSync: mockUnlinkSync,
  renameSync: mockRenameSync,
  mkdirSync: mockMkdirSync,
}))

describe('OfflineQueue', () => {
  let queue: OfflineQueue
  let state: LoopworkState

  beforeEach(() => {
    state = new LoopworkState({ namespace: 'test-ns' })
    mockWriteFileSync.mockClear()
    mockReadFileSync.mockClear()
    mockExistsSync.mockClear()
    mockUnlinkSync.mockClear()
    mockRenameSync.mockClear()
    mockMkdirSync.mockClear()
  })

  test('should instantiate without errors', () => {
    queue = new OfflineQueue(state)
    expect(queue).toBeDefined()
    expect(queue.size()).toBe(0)
  })

  test('should enqueue operations', async () => {
    queue = new OfflineQueue(state)
    await queue.enqueue({
      type: 'markCompleted',
      taskId: 'TASK-1',
      data: { comment: 'Done' },
      timestamp: Date.now()
    })
    expect(queue.size()).toBe(1)
    const op = queue.getAll()[0]
    expect(op.type).toBe('markCompleted')
    expect(op.taskId).toBe('TASK-1')
  })

  test('should respect maxSize', async () => {
    queue = new OfflineQueue(state, { maxSize: 2 })
    await queue.enqueue({ type: 'op1', taskId: '1', timestamp: Date.now() })
    await queue.enqueue({ type: 'op2', taskId: '2', timestamp: Date.now() })
    await queue.enqueue({ type: 'op3', taskId: '3', timestamp: Date.now() })
    
    expect(queue.size()).toBe(2)
    const ops = queue.getAll()
    expect(ops[0].type).toBe('op2')
    expect(ops[1].type).toBe('op3')
  })

  test('should persist to disk if enabled', async () => {
    queue = new OfflineQueue(state, { persistToDisk: true })
    
    await queue.enqueue({ type: 'op1', taskId: '1', timestamp: 123 })
    
    expect(mockWriteFileSync).toHaveBeenCalled()
    const callArgs = mockWriteFileSync.mock.calls[0]
    expect(callArgs[0]).toContain('offline-queue-test-ns.json')
    const savedContent = JSON.parse(callArgs[1])
    expect(savedContent[0].type).toBe('op1')
  })

  test('should load from disk on instantiation', async () => {
    const savedOps = [{ type: 'saved', taskId: 's1', timestamp: 111 }]
    mockExistsSync.mockImplementation(() => true)
    mockReadFileSync.mockImplementation(() => JSON.stringify(savedOps))

    queue = new OfflineQueue(state, { persistToDisk: true })
    
    expect(mockReadFileSync).toHaveBeenCalled()
    expect(queue.size()).toBe(1)
    expect(queue.getAll()[0].type).toBe('saved')
  })

  test('should clear queue', async () => {
    queue = new OfflineQueue(state, { persistToDisk: true })
    await queue.enqueue({ type: 'op1', taskId: '1', timestamp: Date.now() })
    
    queue.clear()
    expect(queue.size()).toBe(0)
    expect(mockUnlinkSync).toHaveBeenCalled()
  })

  test('should flush operations to backend', async () => {
    queue = new OfflineQueue(state)
    await queue.enqueue({
      type: 'markCompleted',
      taskId: 'TASK-1',
      data: { comment: 'Done' },
      timestamp: Date.now()
    })
    await queue.enqueue({
      type: 'markFailed',
      taskId: 'TASK-2',
      data: { error: 'Failed' },
      timestamp: Date.now()
    })

    const mockBackend = {
      markCompleted: mock(async () => ({ success: true })),
      markFailed: mock(async () => ({ success: true })),
    } as unknown as TaskBackend

    await queue.flush(mockBackend)

    expect((mockBackend as any).markCompleted).toHaveBeenCalledWith('TASK-1', 'Done')
    expect((mockBackend as any).markFailed).toHaveBeenCalledWith('TASK-2', 'Failed')
    expect(queue.size()).toBe(0)
  })

  test('should handle flush failures', async () => {
    const q2 = new OfflineQueue(state)
    await q2.enqueue({ type: 'markCompleted', taskId: 'T1', data: { comment: 'c' }, timestamp: 1 })
    await q2.enqueue({ type: 'markCompleted', taskId: 'T2', data: { comment: 'c' }, timestamp: 2 })

    const backend = {
      markCompleted: mock(async (id: string) => {
        if (id === 'T1') throw new Error('Network error')
        return { success: true }
      })
    } as unknown as TaskBackend

    await q2.flush(backend)

    expect(q2.size()).toBe(1)
    expect(q2.getAll()[0].taskId).toBe('T1')
  })
})
