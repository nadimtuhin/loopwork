import { describe, test, expect, beforeEach } from 'bun:test'
import { getConfig, getSubagentRegistry, resetSubagentRegistry } from '../src/core/config'
import type { LoopworkConfig } from '../src/contracts/config'

describe('Config Subagent Integration', () => {
  // Reset registry before each test to ensure isolation
  beforeEach(() => {
    resetSubagentRegistry()
  })

  test('config with subagents loads correctly', async () => {
    const config: Partial<LoopworkConfig> = {
      backend: {
        type: 'json',
        tasksFile: '.specs/tasks/tasks.json',
      },
      subagents: [
        {
          name: 'test-agent',
          description: 'Test agent',
          capabilities: ['code-analysis'],
        },
        {
          name: 'qa-agent',
          description: 'QA agent',
          capabilities: ['testing'],
        },
      ],
      defaultSubagent: 'test-agent',
    }

    const registry = getSubagentRegistry(config as LoopworkConfig)

    expect(registry.has('test-agent')).toBe(true)
    expect(registry.has('qa-agent')).toBe(true)
    const defaultAgent = registry.getDefault()
    expect(defaultAgent).toBeDefined()
    expect(defaultAgent?.name).toBe('test-agent')
  })

  test('getSubagentRegistry returns populated registry', () => {
    const config: LoopworkConfig = {
      backend: {
        type: 'json',
        tasksFile: '.specs/tasks/tasks.json',
      },
      subagents: [
        {
          name: 'architect',
          description: 'Architecture specialist',
          capabilities: ['design', 'review'],
        },
      ],
    } as LoopworkConfig

    const registry = getSubagentRegistry(config)

    expect(registry.has('architect')).toBe(true)
    const agent = registry.get('architect')
    expect(agent).toBeDefined()
    expect(agent?.name).toBe('architect')
    expect(agent?.description).toBe('Architecture specialist')
  })

  test('default subagent is set correctly', () => {
    const config: LoopworkConfig = {
      backend: {
        type: 'json',
        tasksFile: '.specs/tasks/tasks.json',
      },
      subagents: [
        {
          name: 'executor',
          description: 'Execution agent',
          capabilities: ['implementation'],
        },
        {
          name: 'reviewer',
          description: 'Review agent',
          capabilities: ['code-review'],
        },
      ],
      defaultSubagent: 'executor',
    } as LoopworkConfig

    const registry = getSubagentRegistry(config)

    const defaultAgent = registry.getDefault()
    expect(defaultAgent).toBeDefined()
    expect(defaultAgent?.name).toBe('executor')
  })

  test('empty subagents array works', () => {
    const config: LoopworkConfig = {
      backend: {
        type: 'json',
        tasksFile: '.specs/tasks/tasks.json',
      },
      subagents: [],
    } as LoopworkConfig

    const registry = getSubagentRegistry(config)

    expect(registry).toBeDefined()
    expect(registry.list()).toHaveLength(0)
  })

  test('config without subagents works', () => {
    const config: LoopworkConfig = {
      backend: {
        type: 'json',
        tasksFile: '.specs/tasks/tasks.json',
      },
    } as LoopworkConfig

    const registry = getSubagentRegistry(config)

    expect(registry).toBeDefined()
    expect(registry.list()).toHaveLength(0)
  })

  test('registry is singleton per config load', () => {
    const config: LoopworkConfig = {
      backend: {
        type: 'json',
        tasksFile: '.specs/tasks/tasks.json',
      },
      subagents: [
        {
          name: 'test-singleton',
          description: 'Test singleton behavior',
          capabilities: ['testing'],
        },
      ],
    } as LoopworkConfig

    const registry1 = getSubagentRegistry(config)
    const registry2 = getSubagentRegistry(config)

    expect(registry1).toBe(registry2)
    expect(registry1.has('test-singleton')).toBe(true)
  })
})
