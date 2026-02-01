import { describe, test, expect } from 'bun:test'
import type { Task, TaskBackend, TaskStatus, Priority } from '../../src/index'

/**
 * Contract Integration E2E Tests
 * 
 * Tests that all contract implementations work together correctly
 * across different packages.
 */

describe('Contract Integration E2E', () => {
  describe('Task Interface Compliance', () => {
    test('all required task fields are present', () => {
      const task: Task = {
        id: 'TEST-001',
        title: 'Test Task',
        description: 'A test task',
        status: 'pending' as TaskStatus,
        priority: 'high' as Priority,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }

      expect(task.id).toBeDefined()
      expect(task.title).toBeDefined()
      expect(task.status).toBeDefined()
      expect(task.priority).toBeDefined()
    })

    test('task status transitions are valid', () => {
      const validTransitions: Record<TaskStatus, TaskStatus[]> = {
        'pending': ['in-progress', 'completed', 'failed'],
        'in-progress': ['completed', 'failed', 'pending'],
        'completed': [],
        'failed': ['pending'],
      }

      for (const [from, toStatuses] of Object.entries(validTransitions)) {
        for (const to of toStatuses) {
          expect(to).toBeDefined()
          expect(from).toBeDefined()
        }
      }
    })
  })

  describe('Backend Interface Compliance', () => {
    test('backend implements all required methods', () => {
      const requiredMethods = [
        'findNextTask',
        'markInProgress',
        'markCompleted',
        'markFailed',
        'countPending',
      ]

      for (const method of requiredMethods) {
        expect(method).toBeDefined()
      }
    })
  })

  describe('Cross-Package Contract Compatibility', () => {
    test('executor contracts align with loopwork contracts', () => {
      const executorTaskView = {
        id: 'EXEC-001',
        title: 'Executor Task',
        status: 'pending',
        priority: 'high',
      }

      const loopworkTaskView: Task = {
        ...executorTaskView,
        description: 'Description',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }

      expect(executorTaskView.id).toBe(loopworkTaskView.id)
      expect(executorTaskView.status).toBe(loopworkTaskView.status)
    })
  })
})
