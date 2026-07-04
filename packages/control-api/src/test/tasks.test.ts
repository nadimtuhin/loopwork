import { describe, expect, test, beforeEach } from 'bun:test'
import { ControlServer } from '../server'
import { Task, TaskBackend } from '@loopwork-ai/loopwork/contracts'

describe('Tasks API', () => {
  let backend: any
  let server: ControlServer

  const mockTasks: Task[] = [
    {
      id: 'TASK-1',
      title: 'Task 1',
      description: 'Description 1',
      status: 'pending',
      priority: 'high',
      feature: 'auth',
      timestamps: { createdAt: '2023-01-01T10:00:00Z' },
      metadata: { custom: 'value' }
    },
    {
      id: 'TASK-2',
      title: 'Task 2',
      description: 'Description 2',
      status: 'completed',
      priority: 'medium',
      feature: 'api',
      timestamps: { createdAt: '2023-01-01T11:00:00Z' }
    },
    {
      id: 'TASK-3',
      title: 'Task 3',
      description: 'Description 3',
      status: 'pending',
      priority: 'low',
      feature: 'auth',
      timestamps: { createdAt: '2023-01-01T09:00:00Z' }
    }
  ]

  beforeEach(() => {
    backend = {
      listTasks: async () => [...mockTasks],
      getTask: async (id: string) => mockTasks.find(t => t.id === id) || null
    }
    server = new ControlServer({ backend })
  })

  test('GET /tasks should return all tasks with metadata and timestamps', async () => {
    const res = await server['app'].request('/tasks')
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.data).toHaveLength(3)
    expect(body.meta.total).toBe(3)
    expect(body.data[0].timestamps).toBeDefined()
    expect(body.data[0].metadata).toBeDefined()
    expect(body.data[0].metadata.custom).toBe('value')
  })

  test('GET /tasks with status filter', async () => {
    backend.listTasks = async (opts: any) => {
      if (opts.status?.includes('pending')) {
        return mockTasks.filter(t => t.status === 'pending')
      }
      return []
    }
    const res = await server['app'].request('/tasks?status=pending')
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.data).toHaveLength(2)
    expect(body.data.every((t: any) => t.status === 'pending')).toBe(true)
  })

  test('GET /tasks with sorting', async () => {
    const res = await server['app'].request('/tasks?sort=createdAt&order=desc')
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.data[0].id).toBe('TASK-2')
    expect(body.data[1].id).toBe('TASK-1')
    expect(body.data[2].id).toBe('TASK-3')
  })

  test('GET /tasks with priority sorting', async () => {
    const res = await server['app'].request('/tasks?sort=priority&order=desc')
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.data[0].priority).toBe('high')
    expect(body.data[1].priority).toBe('medium')
    expect(body.data[2].priority).toBe('low')
  })

  test('GET /tasks with multiple status filters', async () => {
    backend.listTasks = async (opts: any) => {
      if (opts.status?.includes('pending') && opts.status?.includes('completed')) {
        return mockTasks
      }
      return []
    }
    const res = await server['app'].request('/tasks?status=pending,completed')
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.data).toHaveLength(3)
  })
  test('GET /tasks with pagination', async () => {
    const res = await server['app'].request('/tasks?limit=1&offset=1')
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.data).toHaveLength(1)
    expect(body.data[0].id).toBe('TASK-2')
    expect(body.meta.limit).toBe(1)
    expect(body.meta.offset).toBe(1)
    expect(body.meta.total).toBe(3)
  })

  test('GET /tasks with non-existent sort field', async () => {
    const res = await server['app'].request('/tasks?sort=nonExistent')
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.data).toHaveLength(3)
  })
  test('GET /tasks with field selection', async () => {
    const res = await server['app'].request('/tasks?fields=id,title')
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.data[0]).toEqual({ id: 'TASK-1', title: 'Task 1' })
  })

  test('GET /tasks/:id should return specific task', async () => {
    const res = await server['app'].request('/tasks/TASK-1')
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.data.id).toBe('TASK-1')
  })

  test('GET /tasks/:id should return 404 for non-existent task', async () => {
    const res = await server['app'].request('/tasks/NON-EXISTENT')
    expect(res.status).toBe(404)
  })
})
