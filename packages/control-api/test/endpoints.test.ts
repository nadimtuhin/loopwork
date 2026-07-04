import { describe, expect, it } from 'bun:test'
import { ControlServer } from '../src/server'
import type { TaskBackend, Task } from '@loopwork-ai/loopwork/contracts'

// Mock Backend
const mockTasks: Task[] = [
  { id: 'T1', title: 'Task 1', status: 'pending', priority: 'high', timestamps: { createdAt: '2023-01-01T10:00:00Z' } } as Task,
  { id: 'T2', title: 'Task 2', status: 'completed', priority: 'low', timestamps: { createdAt: '2023-01-02T10:00:00Z' } } as Task,
  { id: 'T3', title: 'Task 3', status: 'pending', priority: 'medium', timestamps: { createdAt: '2023-01-03T10:00:00Z' } } as Task,
]

const mockBackend: TaskBackend = {
  name: 'mock',
  listTasks: async () => mockTasks,
  getTask: async (id) => mockTasks.find(t => t.id === id) || null,
  findNextTask: async () => null,
  markInProgress: async () => ({ success: true }),
  markCompleted: async () => ({ success: true }),
  markFailed: async () => ({ success: true }),
  markQuarantined: async () => ({ success: true }),
  resetToPending: async () => ({ success: true }),
  ping: async () => ({ ok: true, latencyMs: 0 }),
  getSubTasks: async () => [],
  getDependencies: async () => [],
  getDependents: async () => [],
  areDependenciesMet: async () => true,
  countPending: async () => 0,
  listPendingTasks: async () => [],
}

describe('Control API Endpoints', () => {
  it('GET /tasks should list tasks with pagination', async () => {
    const server = new ControlServer({ config: {}, backend: mockBackend })
    // @ts-ignore - Accessing private app for testing
    const app = server.app

    const res = await app.request('/tasks?limit=2&offset=0')
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.data.length).toBe(2)
    expect(json.meta.total).toBe(3)
    expect(json.data[0].id).toBe('T1')
  })

  it('GET /tasks/:id should return specific task', async () => {
    const server = new ControlServer({ config: {}, backend: mockBackend })
    // @ts-ignore
    const app = server.app

    const res = await app.request('/tasks/T2')
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.data.id).toBe('T2')
  })

  it('GET /tasks should support sorting (descending)', async () => {
    const server = new ControlServer({ config: {}, backend: mockBackend })
    // @ts-ignore
    const app = server.app

    // Request sorted by createdAt desc
    const res = await app.request('/tasks?sort=createdAt&order=desc')
    expect(res.status).toBe(200)
    const json = await res.json()
    
    // T3 is newest (Jan 3), T1 is oldest (Jan 1)
    // Should be T3, T2, T1
    expect(json.data[0].id).toBe('T3')
    expect(json.data[1].id).toBe('T2')
    expect(json.data[2].id).toBe('T1')
  })

  it('GET /tasks should support sorting (ascending)', async () => {
    const server = new ControlServer({ config: {}, backend: mockBackend })
    // @ts-ignore
    const app = server.app

    // Request sorted by createdAt asc
    const res = await app.request('/tasks?sort=createdAt&order=asc')
    expect(res.status).toBe(200)
    const json = await res.json()
    
    // Should be T1, T2, T3
    expect(json.data[0].id).toBe('T1')
    expect(json.data[1].id).toBe('T2')
    expect(json.data[2].id).toBe('T3')
  })

  it('GET /tasks should support semantic priority sorting', async () => {
    const server = new ControlServer({ config: {}, backend: mockBackend })
    // @ts-ignore
    const app = server.app

    const res = await app.request('/tasks?sort=priority&order=desc')
    expect(res.status).toBe(200)
    const json = await res.json()
    
    expect(json.data[0].id).toBe('T1')
    expect(json.data[1].id).toBe('T3')
    expect(json.data[2].id).toBe('T2')
  })

  it('GET /tasks should support field selection', async () => {
    const server = new ControlServer({ config: {}, backend: mockBackend })
    // @ts-ignore
    const app = server.app

    const res = await app.request('/tasks?fields=id,status,priority')
    expect(res.status).toBe(200)
    const json = await res.json()
    
    expect(json.data.length).toBe(3)
    // Each task should only have the selected fields
    expect(json.data[0]).not.toHaveProperty('title')
    expect(json.data[0]).not.toHaveProperty('timestamps')
    expect(json.data[0]).toHaveProperty('id')
    expect(json.data[0]).toHaveProperty('status')
    expect(json.data[0]).toHaveProperty('priority')
  })

  it('GET /tasks should support field selection with single field', async () => {
    const server = new ControlServer({ config: {}, backend: mockBackend })
    // @ts-ignore
    const app = server.app

    const res = await app.request('/tasks?fields=id')
    expect(res.status).toBe(200)
    const json = await res.json()
    
    expect(json.data.length).toBe(3)
    // Tasks are sorted by priority by default: T1(high), T3(medium), T2(low)
    expect(json.data[0]).toEqual({ id: 'T1' })
    expect(json.data[1]).toEqual({ id: 'T3' })
    expect(json.data[2]).toEqual({ id: 'T2' })
  })

  it('GET /tasks should support field selection with timestamps', async () => {
    const server = new ControlServer({ config: {}, backend: mockBackend })
    // @ts-ignore
    const app = server.app

    const res = await app.request('/tasks?fields=id,timestamps')
    expect(res.status).toBe(200)
    const json = await res.json()
    
    expect(json.data.length).toBe(3)
    expect(json.data[0]).toHaveProperty('id')
    expect(json.data[0]).toHaveProperty('timestamps')
    expect(json.data[0].timestamps).toHaveProperty('createdAt')
  })
})
