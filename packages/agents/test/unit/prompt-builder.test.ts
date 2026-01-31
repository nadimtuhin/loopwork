import { describe, test, expect } from 'bun:test'
import { AgentPromptBuilder } from '../../src/core/prompt-builder'
import type { Task } from '@loopwork-ai/loopwork/contracts'
import type { AgentDefinition } from '../../src/contracts/agent'

describe('AgentPromptBuilder', () => {
  const builder = new AgentPromptBuilder()

  const createTask = (overrides: Partial<Task> = {}): Task => ({
    id: 'TASK-001',
    title: 'Test Task',
    description: 'This is a test task description',
    status: 'pending',
    priority: 'medium',
    ...overrides,
  })

  const createAgent = (overrides: Partial<AgentDefinition> = {}): AgentDefinition => ({
    name: 'test-agent',
    description: 'A test agent',
    prompt: 'You are a helpful assistant',
    ...overrides,
  })

  describe('build()', () => {
    test('builds prompt with task only', () => {
      const task = createTask()

      const prompt = builder.build(task)

      expect(prompt).toContain('TASK-001')
      expect(prompt).toContain('Test Task')
      expect(prompt).toContain('This is a test task description')
    })

    test('includes task priority', () => {
      const task = createTask({ priority: 'high' })

      const prompt = builder.build(task)

      expect(prompt).toContain('high')
    })

    test('builds prompt with agent instructions', () => {
      const task = createTask()
      const agent = createAgent({ prompt: 'You are a code reviewer' })

      const prompt = builder.build(task, agent)

      expect(prompt).toContain('You are a code reviewer')
      expect(prompt).toContain('Test Task')
    })

    test('includes retry context when provided', () => {
      const task = createTask()
      const retryContext = 'Previous attempt failed due to timeout'

      const prompt = builder.build(task, undefined, retryContext)

      expect(prompt).toContain('Previous attempt failed due to timeout')
    })

    test('includes all components when fully specified', () => {
      const task = createTask({
        id: 'FULL-001',
        title: 'Full Test',
        description: 'Complete test',
      })
      const agent = createAgent({ prompt: 'Be thorough' })
      const retryContext = 'Try again with more care'

      const prompt = builder.build(task, agent, retryContext)

      expect(prompt).toContain('FULL-001')
      expect(prompt).toContain('Full Test')
      expect(prompt).toContain('Complete test')
      expect(prompt).toContain('Be thorough')
      expect(prompt).toContain('Try again with more care')
    })

    test('handles task with feature field', () => {
      const task = createTask({ feature: 'authentication' })

      const prompt = builder.build(task)

      expect(prompt).toContain('authentication')
    })

    test('handles task with metadata', () => {
      const task = createTask({
        metadata: { labels: ['urgent', 'frontend'] },
      })

      const prompt = builder.build(task)

      // Metadata should be serialized in prompt
      expect(prompt).toContain('urgent')
    })
  })
})
