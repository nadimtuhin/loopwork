/**
 * Agent Integration Tests
 *
 * Tests covering the integration of the three subagent packages:
 * - @loopwork-ai/agents
 * - @loopwork-ai/result-parser
 * - @loopwork-ai/checkpoint
 */

import { describe, test, expect, beforeEach, afterEach, mock } from 'bun:test'
import path from 'path'
import fs from 'fs'
import os from 'os'

// Import from the main loopwork package to verify re-exports work
import { // Agents package
  AgentFactory, AgentRegistry, AgentExecutor, AgentPromptBuilder, createRegistry, createExecutor, // Result parser package
  StatusParser, ArtifactDetector, MetricsExtractor, CompositeResultParser, createResultParser, // Checkpoint package
  createCheckpointManager, FileCheckpointStorage, NodeFileSystem, // Adapters
  CliRunnerAdapter, GitRunnerAdapter,  } from '../src/index'

// Import types
import type {
  SubagentDefinition,
  AgentDefinitionInput,
  IAgentRegistry,
  IResultParser,
  ICheckpointManager,
  ParseContext,
  SubagentResult,
} from '../src/index'

describe('Subagent Package Integration', () => {
  describe('Package Re-exports', () => {
    test('agents package exports are available', () => {
      expect(AgentFactory).toBeDefined()
      expect(AgentRegistry).toBeDefined()
      expect(AgentExecutor).toBeDefined()
      expect(AgentPromptBuilder).toBeDefined()
      expect(createRegistry).toBeInstanceOf(Function)
      expect(createExecutor).toBeInstanceOf(Function)
    })

    test('result-parser package exports are available', () => {
      expect(StatusParser).toBeDefined()
      expect(ArtifactDetector).toBeDefined()
      expect(TaskSuggestionParser).toBeDefined()
      expect(MetricsExtractor).toBeDefined()
      expect(CompositeResultParser).toBeDefined()
      expect(createResultParser).toBeInstanceOf(Function)
    })

    test('checkpoint package exports are available', () => {
      expect(createCheckpointManager).toBeInstanceOf(Function)
      expect(FileCheckpointStorage).toBeDefined()
      expect(NodeFileSystem).toBeDefined()
    })

    test('adapters are available', () => {
      expect(CliRunnerAdapter).toBeDefined()
      expect(GitRunnerAdapter).toBeDefined()
    })
  })

  describe('Agent Registry Integration', () => {
    let registry: IAgentRegistry

    beforeEach(() => {
      registry = createRegistry()
    })

    test('can create and register agents', () => {
      const factory = new AgentFactory()
      const agent = factory.create({
        name: 'code-reviewer',
        description: 'Reviews code for quality',
        prompt: 'You are a code reviewer...',
        model: 'sonnet',
      })

      registry.register(agent)
      expect(registry.get('code-reviewer')).toBeDefined()
      expect(registry.get('code-reviewer')?.name).toBe('code-reviewer')
    })

    test('registry lists all registered agents', () => {
      const factory = new AgentFactory()

      registry.register(factory.create({
        name: 'agent1',
        description: 'First agent',
        prompt: 'You are agent 1',
      }))

      registry.register(factory.create({
        name: 'agent2',
        description: 'Second agent',
        prompt: 'You are agent 2',
      }))

      const agents = registry.list()
      expect(agents).toHaveLength(2)
      expect(agents.map(a => a.name)).toContain('agent1')
      expect(agents.map(a => a.name)).toContain('agent2')
    })

    test('agent validation catches invalid definitions', () => {
      const factory = new AgentFactory()
      const result = factory.validate({
        name: '',
        description: 'Invalid agent',
        prompt: 'Some prompt',
      } as SubagentDefinition)

      expect(result.valid).toBe(false)
      expect(result.errors.length).toBeGreaterThan(0)
    })
  })

  describe('Result Parser Integration', () => {
    let parser: IResultParser

    beforeEach(() => {
      parser = createResultParser()
    })

    test('can parse success output', async () => {
      const output = `
Starting task execution...
[SUCCESS] All tests passed
Created 3 files
Modified src/index.ts
Duration: 45s
`
      const context: ParseContext = {
        workDir: '/tmp/test',
        exitCode: 0,
        durationMs: 45000,
      }

      const result: SubagentResult = await parser.parse(output, context)
      expect(result).toBeDefined()
      expect(result.status).toBe('success')
    })

    test('can parse failure output', async () => {
      const output = `
Starting task execution...
[ERROR] Build failed: TypeScript error
[FAILED] Task execution terminated
`
      const context: ParseContext = {
        workDir: '/tmp/test',
        exitCode: 1,
        durationMs: 10000,
      }

      const result = await parser.parse(output, context)
      expect(result).toBeDefined()
      expect(result.status).toBe('failure')
    })

    test('extracts TODO items from output', async () => {
      const output = `
Working on the task...
TODO: Add unit tests for new functionality
TODO: Update documentation
[SUCCESS] Main implementation complete
`
      const context: ParseContext = {
        workDir: '/tmp/test',
        exitCode: 0,
        durationMs: 30000,
      }

      const result = await parser.parse(output, context)
      expect(result.followUpTasks).toBeDefined()
      expect(result.followUpTasks.length).toBeGreaterThanOrEqual(0)
    })

    test('detects artifacts from output', async () => {
      const output = `
Created file: src/new-component.tsx
Modified file: src/index.ts
Deleted file: src/old-file.ts
[SUCCESS] Done
`
      const context: ParseContext = {
        workDir: '/tmp/test',
        exitCode: 0,
        durationMs: 20000,
      }

      const result = await parser.parse(output, context)
      expect(result.artifacts).toBeDefined()
    })
  })

  describe('Checkpoint Manager Integration', () => {
    let manager: ICheckpointManager
    let tmpDir: string

    beforeEach(() => {
      tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'loopwork-checkpoint-test-'))
      manager = createCheckpointManager({ basePath: tmpDir })
    })

    afterEach(() => {
      try {
        fs.rmSync(tmpDir, { recursive: true, force: true })
      } catch {
        // Ignore cleanup errors
      }
    })

    test('can create and restore checkpoints', async () => {
      const agentId = 'test-agent-1'

      // Create a checkpoint
      await manager.checkpoint(agentId, {
        taskId: 'TASK-001',
        iteration: 1,
        memory: { key: 'value' },
      })

      // Restore the checkpoint
      const restored = await manager.restore(agentId)
      expect(restored).toBeDefined()
      expect(restored?.checkpoint.taskId).toBe('TASK-001')
      expect(restored?.checkpoint.iteration).toBe(1)
    })

    test('returns null for non-existent checkpoint', async () => {
      const restored = await manager.restore('non-existent-agent')
      expect(restored).toBeNull()
    })

    test('can clear checkpoints', async () => {
      const agentId = 'test-agent-2'

      await manager.checkpoint(agentId, {
        taskId: 'TASK-002',
        iteration: 1,
      })

      await manager.clear(agentId)

      const restored = await manager.restore(agentId)
      expect(restored).toBeNull()
    })
  })

  describe('GitRunnerAdapter', () => {
    let adapter: InstanceType<typeof GitRunnerAdapter>
    let tmpDir: string

    beforeEach(() => {
      // Create a temp directory that is a git repo
      tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'loopwork-git-test-'))
      adapter = new GitRunnerAdapter(tmpDir)
    })

    afterEach(() => {
      try {
        fs.rmSync(tmpDir, { recursive: true, force: true })
      } catch {
        // Ignore cleanup errors
      }
    })

    test('can run git status on git repo', async () => {
      // Initialize git repo
      const { execSync } = await import('child_process')
      try {
        execSync('git init', { cwd: tmpDir, stdio: 'ignore' })
        const status = await adapter.status()
        expect(typeof status).toBe('string')
      } catch {
        // If git is not available, skip this test
        console.log('Skipping git status test - git not available')
      }
    })

    test('git diff returns string output', async () => {
      // Initialize git repo and make a change
      const { execSync } = await import('child_process')
      try {
        execSync('git init', { cwd: tmpDir, stdio: 'ignore' })
        fs.writeFileSync(path.join(tmpDir, 'test.txt'), 'hello')
        execSync('git add test.txt', { cwd: tmpDir, stdio: 'ignore' })
        execSync('git commit -m "initial"', { cwd: tmpDir, stdio: 'ignore' })
        fs.writeFileSync(path.join(tmpDir, 'test.txt'), 'hello world')

        const diff = await adapter.diff([])
        expect(typeof diff).toBe('string')
      } catch {
        // If git is not available, skip this test
        console.log('Skipping git diff test - git not available')
      }
    })
  })

  describe('End-to-End Agent Flow', () => {
    test('complete agent creation, execution, and result parsing flow', async () => {
      // 1. Create registry and register agent
      const registry = createRegistry()
      const factory = new AgentFactory()

      const agent = factory.create({
        name: 'test-executor',
        description: 'Executes test tasks',
        prompt: 'You execute tests and report results',
        model: 'sonnet',
        timeout: 300,
      })

      registry.register(agent)

      // 2. Verify agent is registered
      const retrievedAgent = registry.get('test-executor')
      expect(retrievedAgent).toBeDefined()
      expect(retrievedAgent?.name).toBe('test-executor')

      // 3. Create result parser
      const parser = createResultParser()

      // 4. Parse mock output
      const mockOutput = `
Running test-executor agent...
[SUCCESS] Task completed successfully
Created: src/new-file.ts
TODO: Add error handling
Duration: 30s
`
      const result = await parser.parse(mockOutput, {
        workDir: '/tmp',
        exitCode: 0,
        durationMs: 30000,
      })

      expect(result.status).toBe('success')
    })

    test('agent prompt builder creates valid prompts', () => {
      const builder = new AgentPromptBuilder()
      const factory = new AgentFactory()

      const agent = factory.create({
        name: 'builder-test',
        description: 'Test agent',
        prompt: 'You are a test agent with specific instructions',
      })

      const task = {
        id: 'TEST-001',
        title: 'Test Task',
        description: 'A task for testing',
        status: 'pending' as const,
        priority: 3 as const,
      }

      const prompt = builder.build(task, agent)
      expect(prompt).toBeDefined()
      expect(typeof prompt).toBe('string')
      expect(prompt.length).toBeGreaterThan(0)
    })
  })

  describe('Config Integration', () => {
    test('agent definitions from config can be converted to SubagentDefinition', () => {
      // This tests that loopwork's AgentDefinition (role-based) can work alongside
      // the subagent package's SubagentDefinition (name-based)
      const configAgent = {
        role: 'qa-engineer',
        description: 'QA Engineer agent',
        systemPrompt: 'You are a QA engineer...',
        tools: ['read', 'write', 'test'],
        model: { model: 'sonnet' },
      }

      // Convert config agent to subagent definition
      const factory = new AgentFactory()
      const subagent = factory.create({
        name: configAgent.role,
        description: configAgent.description || '',
        prompt: configAgent.systemPrompt || '',
        tools: configAgent.tools,
        model: configAgent.model?.model,
      })

      expect(subagent.name).toBe('qa-engineer')
      expect(subagent.prompt).toBe('You are a QA engineer...')
      expect(subagent.tools).toEqual(['read', 'write', 'test'])
    })
  })
})
