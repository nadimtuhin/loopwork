import { describe, expect, test, beforeEach, afterEach } from 'bun:test'
import {
  type SpawnSubagentOutput,
  type SpawnSubagentDeps,
  spawnSubagent,
  SpawnSubagentInputSchema,
  spawnSubagentTool,
  type SpawnSubagentInput,
} from '../spawn-subagent'

describe('spawn-subagent', () => {
  describe('SpawnSubagentOutput type', () => {
    test('should be defined', () => {
      const output: SpawnSubagentOutput = {
        agentId: 'test',
        status: 'spawned',
        message: 'test',
      }
      expect(output).toBeDefined()
    })
  })

  describe('SpawnSubagentDeps type', () => {
    test('should be defined', () => {
      const deps: SpawnSubagentDeps = {}
      expect(deps).toBeDefined()
    })
  })

  describe('spawnSubagent', () => {
    test('should be a function', () => {
      expect(typeof spawnSubagent).toBe('function')
    })

    test('should execute without throwing', async () => {
      expect(async () => await spawnSubagent({
        agentName: 'test',
        taskId: 'TASK-001',
        taskTitle: 'Test',
        taskDescription: 'Test',
      }, {})).not.toThrow()
    })
  })

  describe('SpawnSubagentInputSchema', () => {
    test('should be defined', () => {
      expect(SpawnSubagentInputSchema).toBeDefined()
    })
  })

  describe('spawnSubagentTool', () => {
    test('should be defined', () => {
      expect(spawnSubagentTool).toBeDefined()
    })
  })

  describe('SpawnSubagentInput type', () => {
    test('should be defined', () => {
      const input: SpawnSubagentInput = {
        agentName: 'test',
        taskId: 'TASK-001',
        taskTitle: 'Test',
        taskDescription: 'Test',
      }
      expect(input).toBeDefined()
    })
  })
})
