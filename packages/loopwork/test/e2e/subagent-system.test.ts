import { describe, test, expect, beforeEach, afterEach } from 'bun:test'
import { tmpdir } from 'os'
import { join } from 'path'
import { mkdtemp, rm } from 'fs/promises'

// Import from loopwork (re-exports)
import { createRegistry, createExecutor, createResultParser, createCheckpointManager, AgentPromptBuilder, type SubagentDefinition, type ICliRunner, type CliRunOptions, type CliRunResult,  } from '../../src/index'

describe('Subagent System E2E', () => {
  let tempDir: string

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'subagent-e2e-'))
  })

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true })
  })

  describe('Full Workflow: Config → Execute → Parse → Checkpoint', () => {
    test('complete agent lifecycle from registration to result parsing', async () => {
      // 1. Create and register agent
      const registry = createRegistry()
      const agent: SubagentDefinition = {
        name: 'test-agent',
        description: 'Test agent for E2E',
        prompt: 'You are a test agent.',
        model: 'haiku',
        timeout: 60,
      }
      registry.register(agent)
      expect(registry.get('test-agent')).toBeDefined()

      // 2. Create mock CLI runner
      const mockRunner: ICliRunner = {
        async run(options: CliRunOptions): Promise<CliRunResult> {
          return {
            exitCode: 0,
            output: 'Task completed successfully.\nTODO: Add more tests',
            durationMs: 1500,
            timedOut: false,
          }
        }
      }

      // 3. Execute agent
      const executor = createExecutor()
      const task: Task = {
        id: 'TEST-001',
        title: 'Test Task',
        description: 'A test task for E2E testing',
        status: 'pending',
        priority: 'medium',
      }

      const execResult = await executor.execute(agent, task, {
        cliRunner: mockRunner,
        workDir: tempDir,
        timeout: 60,
      })

      expect(execResult.agentId).toBeDefined()
      expect(execResult.exitCode).toBe(0)
      expect(execResult.output).toContain('Task completed')

      // 4. Parse result
      const parser = createResultParser()
      const parseResult = await parser.parse(execResult.output, {
        workDir: tempDir,
        exitCode: execResult.exitCode,
        durationMs: execResult.durationMs,
      })

      expect(parseResult.status).toBe('success')
      expect(parseResult.followUpTasks.length).toBeGreaterThan(0)
      expect(parseResult.followUpTasks[0].title).toContain('Add more tests')

      // 5. Create checkpoint
      const checkpointManager = createCheckpointManager({
        basePath: join(tempDir, '.loopwork/agents'),
      })

      await checkpointManager.onEvent(execResult.agentId, {
        type: 'execution_start',
        taskId: task.id,
        agentName: agent.name,
      })

      await checkpointManager.onEvent(execResult.agentId, {
        type: 'execution_end',
        success: true,
      })

      // 6. Verify checkpoint can be restored
      const restored = await checkpointManager.restore(execResult.agentId)
      expect(restored).toBeDefined()
      expect(restored?.checkpoint.taskId).toBe(task.id)
      expect(restored?.checkpoint.agentName).toBe(agent.name)
      expect(restored?.checkpoint.phase).toBe('completed')
    })

    test('handles agent failure and creates failure checkpoint', async () => {
      const registry = createRegistry()
      const agent: SubagentDefinition = {
        name: 'failing-agent',
        description: 'Agent that fails',
        prompt: 'Fail intentionally',
      }
      registry.register(agent)

      const mockRunner: ICliRunner = {
        async run(): Promise<CliRunResult> {
          return {
            exitCode: 1,
            output: 'ERROR: Something went wrong\nFAILED to complete task',
            durationMs: 500,
            timedOut: false,
          }
        }
      }

      const executor = createExecutor()
      const task: Task = {
        id: 'FAIL-001',
        title: 'Failing Task',
        description: 'This task will fail',
        status: 'pending',
        priority: 'low',
      }

      const execResult = await executor.execute(agent, task, {
        cliRunner: mockRunner,
        workDir: tempDir,
      })

      expect(execResult.exitCode).toBe(1)

      const parser = createResultParser()
      const parseResult = await parser.parse(execResult.output, {
        workDir: tempDir,
        exitCode: 1,
        durationMs: 500,
      })

      expect(parseResult.status).toBe('failure')

      const checkpointManager = createCheckpointManager({
        basePath: join(tempDir, '.loopwork/agents'),
      })

      await checkpointManager.onEvent(execResult.agentId, {
        type: 'execution_end',
        success: false,
      })

      const restored = await checkpointManager.restore(execResult.agentId)
      expect(restored?.checkpoint.phase).toBe('failed')
    })

    test('timeout handling creates interrupted checkpoint', async () => {
      const agent: SubagentDefinition = {
        name: 'slow-agent',
        description: 'Agent that times out',
        prompt: 'Take too long',
        timeout: 1,
      }

      const mockRunner: ICliRunner = {
        async run(): Promise<CliRunResult> {
          return {
            exitCode: -1,
            output: 'Process timed out',
            durationMs: 1000,
            timedOut: true,
          }
        }
      }

      const executor = createExecutor()
      const task: Task = {
        id: 'TIMEOUT-001',
        title: 'Slow Task',
        description: 'This task will timeout',
        status: 'pending',
        priority: 'medium',
      }

      const execResult = await executor.execute(agent, task, {
        cliRunner: mockRunner,
        workDir: tempDir,
      })

      expect(execResult.timedOut).toBe(true)

      const checkpointManager = createCheckpointManager({
        basePath: join(tempDir, '.loopwork/agents'),
      })

      await checkpointManager.onEvent(execResult.agentId, {
        type: 'interrupt',
        reason: 'timeout',
      })

      const restored = await checkpointManager.restore(execResult.agentId)
      expect(restored?.checkpoint.phase).toBe('interrupted')
    })
  })

  describe('Resume Workflow', () => {
    test('can resume from checkpoint with accumulated output', async () => {
      const checkpointManager = createCheckpointManager({
        basePath: join(tempDir, '.loopwork/agents'),
      })

      const agentId = 'resume-test-agent-123'

      // Simulate initial execution with output
      await checkpointManager.onEvent(agentId, {
        type: 'execution_start',
        taskId: 'RESUME-001',
        agentName: 'resume-agent',
      })

      await checkpointManager.checkpoint(agentId, {
        iteration: 3,
        lastToolCall: 'Edit',
        phase: 'executing',
      })

      // Simulate accumulated output
      const storage = (checkpointManager as any).storage
      await storage.appendOutput(agentId, 'Line 1: Processing...\n')
      await storage.appendOutput(agentId, 'Line 2: Still working...\n')

      // Simulate interrupt
      await checkpointManager.onEvent(agentId, {
        type: 'interrupt',
        reason: 'user_cancel',
      })

      // Resume
      const restored = await checkpointManager.restore(agentId)

      expect(restored).toBeDefined()
      expect(restored?.checkpoint.iteration).toBe(3)
      expect(restored?.checkpoint.lastToolCall).toBe('Edit')
      expect(restored?.partialOutput).toContain('Line 1')
      expect(restored?.partialOutput).toContain('Line 2')
    })
  })

  describe('Multi-Agent Coordination', () => {
    test('multiple agents can run with independent checkpoints', async () => {
      const registry = createRegistry()

      registry.register({
        name: 'agent-a',
        description: 'First agent',
        prompt: 'Agent A instructions',
      })

      registry.register({
        name: 'agent-b',
        description: 'Second agent',
        prompt: 'Agent B instructions',
      })

      const checkpointManager = createCheckpointManager({
        basePath: join(tempDir, '.loopwork/agents'),
      })

      // Start both agents
      await checkpointManager.onEvent('agent-a-id', {
        type: 'execution_start',
        taskId: 'TASK-A',
        agentName: 'agent-a',
      })

      await checkpointManager.onEvent('agent-b-id', {
        type: 'execution_start',
        taskId: 'TASK-B',
        agentName: 'agent-b',
      })

      // Progress independently
      await checkpointManager.checkpoint('agent-a-id', { iteration: 5 })
      await checkpointManager.checkpoint('agent-b-id', { iteration: 2 })

      // Verify independence
      const restoreA = await checkpointManager.restore('agent-a-id')
      const restoreB = await checkpointManager.restore('agent-b-id')

      expect(restoreA?.checkpoint.taskId).toBe('TASK-A')
      expect(restoreA?.checkpoint.iteration).toBe(5)

      expect(restoreB?.checkpoint.taskId).toBe('TASK-B')
      expect(restoreB?.checkpoint.iteration).toBe(2)
    })
  })

  describe('Prompt Builder Integration', () => {
    test('builds prompts with agent instructions and task context', () => {
      const promptBuilder = new AgentPromptBuilder()

      const task: Task = {
        id: 'PROMPT-001',
        title: 'Add user authentication',
        description: 'Implement JWT-based authentication for the API',
        status: 'pending',
        priority: 'high',
        feature: 'auth',
      }

      const agent: SubagentDefinition = {
        name: 'security-agent',
        description: 'Security specialist',
        prompt: 'You are a security expert. Follow best practices for authentication.',
      }

      const prompt = promptBuilder.build(task, agent)

      expect(prompt).toContain('PROMPT-001')
      expect(prompt).toContain('Add user authentication')
      expect(prompt).toContain('JWT-based authentication')
      expect(prompt).toContain('security expert')
      expect(prompt).toContain('best practices')
    })

    test('includes retry context when provided', () => {
      const promptBuilder = new AgentPromptBuilder()

      const task: Task = {
        id: 'RETRY-001',
        title: 'Fix failing tests',
        description: 'Some tests are failing',
        status: 'pending',
        priority: 'high',
      }

      const retryContext = 'Previous attempt failed with: TypeError: Cannot read property "foo" of undefined'

      const prompt = promptBuilder.build(task, undefined, retryContext)

      expect(prompt).toContain('RETRY-001')
      expect(prompt).toContain('Fix failing tests')
      expect(prompt).toContain('Previous attempt failed')
      expect(prompt).toContain('TypeError')
    })
  })

  describe('Result Parser Edge Cases', () => {
    test('parses output with no artifacts or tasks', async () => {
      const parser = createResultParser()

      const output = 'Simple output with no special markers.'

      const result = await parser.parse(output, {
        workDir: tempDir,
        exitCode: 0,
        durationMs: 1000,
      })

      expect(result.status).toBe('success')
      expect(result.artifacts).toHaveLength(0)
      expect(result.followUpTasks).toHaveLength(0)
    })

    test('parses output with multiple TODO items', async () => {
      const parser = createResultParser()

      const output = `
Task completed successfully.
TODO: Add unit tests for the new feature
TODO: Update documentation
TODO: Add integration tests
`

      const result = await parser.parse(output, {
        workDir: tempDir,
        exitCode: 0,
        durationMs: 2000,
      })

      expect(result.status).toBe('success')
      expect(result.followUpTasks.length).toBeGreaterThanOrEqual(3)
      expect(result.followUpTasks.some(t => t.title.includes('unit tests'))).toBe(true)
      expect(result.followUpTasks.some(t => t.title.includes('documentation'))).toBe(true)
      expect(result.followUpTasks.some(t => t.title.includes('integration tests'))).toBe(true)
    })

    test('extracts metrics from execution', async () => {
      const parser = createResultParser()

      const output = `
Completed task in 5.3 seconds.
Modified 3 files: src/auth.ts, src/middleware.ts, test/auth.test.ts
Added 247 lines of code.
`

      const result = await parser.parse(output, {
        workDir: tempDir,
        exitCode: 0,
        durationMs: 5300,
      })

      expect(result.status).toBe('success')
      expect(result.metrics).toBeDefined()
      expect(result.metrics.durationMs).toBe(5300)
      expect(result.metrics.exitCode).toBe(0)
    })
  })

  describe('Agent Registry Operations', () => {
    test('can register and retrieve agents by name', () => {
      const registry = createRegistry()

      const agents: SubagentDefinition[] = [
        { name: 'explorer', description: 'Code explorer', prompt: 'Explore code' },
        { name: 'architect', description: 'System architect', prompt: 'Design systems' },
        { name: 'executor', description: 'Code executor', prompt: 'Write code' },
      ]

      agents.forEach(agent => registry.register(agent))

      expect(registry.get('explorer')).toBeDefined()
      expect(registry.get('architect')).toBeDefined()
      expect(registry.get('executor')).toBeDefined()
      expect(registry.get('nonexistent')).toBeUndefined()
    })

    test('can list all registered agents', () => {
      const registry = createRegistry()

      registry.register({ name: 'agent-1', description: 'First', prompt: 'Do 1' })
      registry.register({ name: 'agent-2', description: 'Second', prompt: 'Do 2' })
      registry.register({ name: 'agent-3', description: 'Third', prompt: 'Do 3' })

      const allAgents = registry.list()

      expect(allAgents).toHaveLength(3)
      expect(allAgents.map(a => a.name)).toContain('agent-1')
      expect(allAgents.map(a => a.name)).toContain('agent-2')
      expect(allAgents.map(a => a.name)).toContain('agent-3')
    })

    test('registry prevents duplicate registration', () => {
      const registry = createRegistry()

      registry.register({ name: 'agent', description: 'First version', prompt: 'Do v1' })

      // Second registration with same name should throw
      expect(() => {
        registry.register({ name: 'agent', description: 'Second version', prompt: 'Do v2' })
      }).toThrow('Agent "agent" is already registered')

      const agent = registry.get('agent')
      // First registration remains
      expect(agent?.description).toBe('First version')
      expect(agent?.prompt).toBe('Do v1')
    })
  })

  describe('Checkpoint State Transitions', () => {
    test('tracks complete agent lifecycle phases', async () => {
      const checkpointManager = createCheckpointManager({
        basePath: join(tempDir, '.loopwork/agents'),
      })

      const agentId = 'lifecycle-agent-id'

      // Start
      await checkpointManager.onEvent(agentId, {
        type: 'execution_start',
        taskId: 'LIFECYCLE-001',
        agentName: 'lifecycle-agent',
      })

      let restored = await checkpointManager.restore(agentId)
      expect(restored?.checkpoint.phase).toBe('started')

      // Progress via iteration events (which sets phase to 'executing')
      await checkpointManager.onEvent(agentId, { type: 'iteration', iteration: 1 })
      await checkpointManager.onEvent(agentId, { type: 'iteration', iteration: 2 })
      await checkpointManager.onEvent(agentId, { type: 'iteration', iteration: 3 })

      restored = await checkpointManager.restore(agentId)
      expect(restored?.checkpoint.iteration).toBe(3)
      expect(restored?.checkpoint.phase).toBe('executing')

      // Complete
      await checkpointManager.onEvent(agentId, {
        type: 'execution_end',
        success: true,
      })

      restored = await checkpointManager.restore(agentId)
      expect(restored?.checkpoint.phase).toBe('completed')
    })

    test('handles interrupt and resume cycles', async () => {
      const checkpointManager = createCheckpointManager({
        basePath: join(tempDir, '.loopwork/agents'),
      })

      const agentId = 'interrupt-resume-agent'

      // Initial execution
      await checkpointManager.onEvent(agentId, {
        type: 'execution_start',
        taskId: 'INT-001',
        agentName: 'interrupt-agent',
      })

      await checkpointManager.onEvent(agentId, { type: 'iteration', iteration: 2 })

      // Interrupt
      await checkpointManager.onEvent(agentId, {
        type: 'interrupt',
        reason: 'user_cancel',
      })

      let restored = await checkpointManager.restore(agentId)
      expect(restored?.checkpoint.phase).toBe('interrupted')

      // Resume (new execution start with same context)
      await checkpointManager.onEvent(agentId, {
        type: 'execution_start',
        taskId: 'INT-001',
        agentName: 'interrupt-agent',
      })

      // Continue from where we left off
      await checkpointManager.onEvent(agentId, { type: 'iteration', iteration: 3 })

      restored = await checkpointManager.restore(agentId)
      expect(restored?.checkpoint.iteration).toBe(3)
      expect(restored?.checkpoint.phase).toBe('executing')
    })
  })

  describe('Integration with Task Metadata', () => {
    test('executes agent with task containing full metadata', async () => {
      const executor = createExecutor()

      const mockRunner: ICliRunner = {
        async run(options: CliRunOptions): Promise<CliRunResult> {
          // Verify prompt contains task metadata
          expect(options.prompt).toContain('META-001')
          expect(options.prompt).toContain('feature-x')

          return {
            exitCode: 0,
            output: 'Completed with metadata',
            durationMs: 1000,
            timedOut: false,
          }
        }
      }

      const task: Task = {
        id: 'META-001',
        title: 'Task with metadata',
        description: 'This task has metadata',
        status: 'pending',
        priority: 'high',
        feature: 'feature-x',
        metadata: {
          customField: 'custom-value',
          tags: ['tag1', 'tag2'],
        },
        timestamps: {
          createdAt: new Date().toISOString(),
        },
      }

      const agent: SubagentDefinition = {
        name: 'meta-agent',
        description: 'Metadata aware agent',
        prompt: 'Process metadata',
      }

      const result = await executor.execute(agent, task, {
        cliRunner: mockRunner,
        workDir: tempDir,
      })

      expect(result.exitCode).toBe(0)
      expect(result.taskId).toBe('META-001')
    })
  })

  describe('MCP Tools Integration', () => {
    test('spawn-subagent creates agent with checkpoint', async () => {
      // Import MCP tools
      const { spawnSubagent } = await import('@loopwork-ai/mcp')

      const registry = createRegistry()
      registry.register({
        name: 'mcp-test-agent',
        description: 'Agent for MCP testing',
        prompt: 'Test MCP integration',
      })

      const checkpointManager = createCheckpointManager({
        basePath: join(tempDir, '.loopwork/agents'),
      })

      const result = await spawnSubagent(
        {
          agentName: 'mcp-test-agent',
          taskId: 'MCP-001',
          taskTitle: 'Test MCP Spawn',
          taskDescription: 'Testing MCP spawn-subagent tool',
        },
        {
          registry,
          checkpointManager,
        }
      )

      expect(result.status).toBe('spawned')
      expect(result.agentId).toContain('mcp-test-agent')
      expect(result.agentId).toContain('MCP-001')

      // Verify checkpoint was created
      const restored = await checkpointManager.restore(result.agentId)
      expect(restored).toBeDefined()
      expect(restored?.checkpoint.phase).toBe('started')
      expect(restored?.checkpoint.taskId).toBe('MCP-001')
    })

    test('resume-agent restores interrupted agent', async () => {
      const { spawnSubagent, resumeAgent } = await import('@loopwork-ai/mcp')

      const registry = createRegistry()
      registry.register({
        name: 'resume-test-agent',
        description: 'Agent for resume testing',
        prompt: 'Test resume',
      })

      const checkpointManager = createCheckpointManager({
        basePath: join(tempDir, '.loopwork/agents'),
      })

      // Spawn agent
      const spawnResult = await spawnSubagent(
        {
          agentName: 'resume-test-agent',
          taskId: 'RESUME-MCP-001',
          taskTitle: 'Resume Test',
          taskDescription: 'Testing MCP resume-agent tool',
        },
        { registry, checkpointManager }
      )

      expect(spawnResult.status).toBe('spawned')

      // Simulate work progress
      await checkpointManager.checkpoint(spawnResult.agentId, {
        iteration: 5,
        lastToolCall: 'Edit',
        phase: 'executing',
      })

      // Simulate interrupt
      await checkpointManager.onEvent(spawnResult.agentId, {
        type: 'interrupt',
        reason: 'network_error',
      })

      // Resume agent
      const resumeResult = await resumeAgent(
        { agentId: spawnResult.agentId },
        { checkpointManager }
      )

      expect(resumeResult.status).toBe('resumed')
      expect(resumeResult.checkpoint).toBeDefined()
      expect(resumeResult.checkpoint?.iteration).toBe(5)
      expect(resumeResult.checkpoint?.phase).toBe('interrupted')
    })

    test('spawn-subagent returns error for unknown agent', async () => {
      const { spawnSubagent } = await import('@loopwork-ai/mcp')

      const registry = createRegistry() // Empty registry

      const result = await spawnSubagent(
        {
          agentName: 'nonexistent-agent',
          taskId: 'FAIL-001',
          taskTitle: 'Should Fail',
          taskDescription: 'This should fail',
        },
        { registry }
      )

      expect(result.status).toBe('error')
      expect(result.message).toContain('not found')
      expect(result.agentId).toBe('')
    })

    test('resume-agent returns not_found for missing checkpoint', async () => {
      const { resumeAgent } = await import('@loopwork-ai/mcp')

      const checkpointManager = createCheckpointManager({
        basePath: join(tempDir, '.loopwork/agents'),
      })

      const result = await resumeAgent(
        { agentId: 'nonexistent-agent-id' },
        { checkpointManager }
      )

      expect(result.status).toBe('not_found')
      expect(result.checkpoint).toBeUndefined()
    })

    test('resume-agent detects completed agents', async () => {
      const { spawnSubagent, resumeAgent } = await import('@loopwork-ai/mcp')

      const registry = createRegistry()
      registry.register({
        name: 'complete-agent',
        description: 'Agent that completes',
        prompt: 'Complete quickly',
      })

      const checkpointManager = createCheckpointManager({
        basePath: join(tempDir, '.loopwork/agents'),
      })

      // Spawn and complete
      const spawnResult = await spawnSubagent(
        {
          agentName: 'complete-agent',
          taskId: 'COMPLETE-001',
          taskTitle: 'Complete Test',
          taskDescription: 'Test completion detection',
        },
        { registry, checkpointManager }
      )

      await checkpointManager.onEvent(spawnResult.agentId, {
        type: 'execution_end',
        success: true,
      })

      // Try to resume completed agent
      const resumeResult = await resumeAgent(
        { agentId: spawnResult.agentId },
        { checkpointManager }
      )

      expect(resumeResult.status).toBe('completed')
      expect(resumeResult.message).toContain('already completed')
    })
  })

  describe('Config Integration E2E', () => {
    test('loads agents from config and populates registry', async () => {
      const { getSubagentRegistry, resetSubagentRegistry } = await import('../../src/core/config')

      // Reset for clean test
      resetSubagentRegistry()

      const config = {
        subagents: [
          { name: 'config-agent-1', description: 'First config agent', prompt: 'Do 1' },
          { name: 'config-agent-2', description: 'Second config agent', prompt: 'Do 2' },
          { name: 'config-agent-3', description: 'Third config agent', prompt: 'Do 3' },
        ],
        defaultSubagent: 'config-agent-1',
      } as any

      const registry = getSubagentRegistry(config)

      expect(registry.list()).toHaveLength(3)
      expect(registry.get('config-agent-1')).toBeDefined()
      expect(registry.get('config-agent-2')).toBeDefined()
      expect(registry.get('config-agent-3')).toBeDefined()
      expect(registry.getDefault()?.name).toBe('config-agent-1')

      // Cleanup
      resetSubagentRegistry()
    })

    test('config registry can be used with MCP spawn', async () => {
      const { getSubagentRegistry, resetSubagentRegistry } = await import('../../src/core/config')
      const { spawnSubagent } = await import('@loopwork-ai/mcp')

      resetSubagentRegistry()

      const config = {
        subagents: [
          { name: 'spawnable-agent', description: 'Can be spawned', prompt: 'Execute tasks' },
        ],
      } as any

      const registry = getSubagentRegistry(config)
      const checkpointManager = createCheckpointManager({
        basePath: join(tempDir, '.loopwork/agents'),
      })

      const result = await spawnSubagent(
        {
          agentName: 'spawnable-agent',
          taskId: 'CONFIG-SPAWN-001',
          taskTitle: 'Config Spawn Test',
          taskDescription: 'Testing config integration with MCP spawn',
        },
        { registry, checkpointManager }
      )

      expect(result.status).toBe('spawned')
      expect(result.agentId).toContain('spawnable-agent')

      resetSubagentRegistry()
    })
  })

  describe('Full Loop Integration', () => {
    test('complete flow: config → spawn → execute → parse → checkpoint → cleanup', async () => {
      const { getSubagentRegistry, resetSubagentRegistry } = await import('../../src/core/config')
      const { spawnSubagent } = await import('@loopwork-ai/mcp')

      resetSubagentRegistry()

      // 1. Load config with agents
      const config = {
        subagents: [
          {
            name: 'full-loop-agent',
            description: 'Agent for full loop test',
            prompt: 'You are a full loop test agent. Complete tasks thoroughly.',
            model: 'sonnet',
            timeout: 120,
          },
        ],
        defaultSubagent: 'full-loop-agent',
      } as any

      const registry = getSubagentRegistry(config)
      const checkpointManager = createCheckpointManager({
        basePath: join(tempDir, '.loopwork/agents'),
      })

      // 2. Spawn agent via MCP
      const spawnResult = await spawnSubagent(
        {
          agentName: 'full-loop-agent',
          taskId: 'FULL-LOOP-001',
          taskTitle: 'Complete Feature Implementation',
          taskDescription: 'Implement a new feature with tests',
        },
        { registry, checkpointManager }
      )

      expect(spawnResult.status).toBe('spawned')

      // 3. Simulate execution with mock CLI
      const mockRunner: ICliRunner = {
        async run(options: CliRunOptions): Promise<CliRunResult> {
          return {
            exitCode: 0,
            output: `Feature implemented successfully.
Modified files: src/feature.ts, test/feature.test.ts
TODO: Add integration tests
TODO: Update documentation
Tokens used: 1500`,
            durationMs: 3000,
            timedOut: false,
          }
        }
      }

      const executor = createExecutor()
      const agent = registry.get('full-loop-agent')!
      const task: Task = {
        id: 'FULL-LOOP-001',
        title: 'Complete Feature Implementation',
        description: 'Implement a new feature with tests',
        status: 'in-progress',
        priority: 'high',
      }

      const execResult = await executor.execute(agent, task, {
        cliRunner: mockRunner,
        workDir: tempDir,
        timeout: 120,
      })

      expect(execResult.exitCode).toBe(0)

      // 4. Parse result
      const parser = createResultParser()
      const parseResult = await parser.parse(execResult.output, {
        workDir: tempDir,
        exitCode: execResult.exitCode,
        durationMs: execResult.durationMs,
      })

      expect(parseResult.status).toBe('success')
      expect(parseResult.followUpTasks.length).toBeGreaterThanOrEqual(2)

      // 5. Update checkpoint
      await checkpointManager.onEvent(spawnResult.agentId, {
        type: 'execution_end',
        success: true,
      })

      const finalCheckpoint = await checkpointManager.restore(spawnResult.agentId)
      expect(finalCheckpoint?.checkpoint.phase).toBe('completed')

      // 6. Cleanup
      await checkpointManager.clear(spawnResult.agentId)
      const afterCleanup = await checkpointManager.restore(spawnResult.agentId)
      expect(afterCleanup).toBeNull()

      resetSubagentRegistry()
    })

    test('handles failure and retry flow', async () => {
      const { getSubagentRegistry, resetSubagentRegistry } = await import('../../src/core/config')
      const { spawnSubagent, resumeAgent } = await import('@loopwork-ai/mcp')

      resetSubagentRegistry()

      const config = {
        subagents: [
          { name: 'retry-agent', description: 'Agent for retry test', prompt: 'Retry if needed' },
        ],
      } as any

      const registry = getSubagentRegistry(config)
      const checkpointManager = createCheckpointManager({
        basePath: join(tempDir, '.loopwork/agents'),
      })

      // Spawn
      const spawnResult = await spawnSubagent(
        {
          agentName: 'retry-agent',
          taskId: 'RETRY-001',
          taskTitle: 'Retry Test',
          taskDescription: 'Test retry flow',
        },
        { registry, checkpointManager }
      )

      // First attempt fails
      let attemptCount = 0
      const mockRunner: ICliRunner = {
        async run(): Promise<CliRunResult> {
          attemptCount++
          if (attemptCount === 1) {
            return {
              exitCode: 1,
              output: 'ERROR: Rate limited\nFAILED: Try again later',
              durationMs: 500,
              timedOut: false,
            }
          }
          return {
            exitCode: 0,
            output: 'SUCCESS: Completed on retry',
            durationMs: 1000,
            timedOut: false,
          }
        }
      }

      const executor = createExecutor()
      const agent = registry.get('retry-agent')!
      const task: Task = {
        id: 'RETRY-001',
        title: 'Retry Test',
        description: 'Test retry flow',
        status: 'pending',
        priority: 'medium',
      }

      // First execution fails
      const firstResult = await executor.execute(agent, task, {
        cliRunner: mockRunner,
        workDir: tempDir,
      })
      expect(firstResult.exitCode).toBe(1)

      // Mark as failed
      await checkpointManager.onEvent(spawnResult.agentId, {
        type: 'execution_end',
        success: false,
      })

      // Resume for retry
      const resumeResult = await resumeAgent(
        { agentId: spawnResult.agentId },
        { checkpointManager }
      )
      expect(resumeResult.status).toBe('resumed')

      // Second execution succeeds
      const retryResult = await executor.execute(agent, task, {
        cliRunner: mockRunner,
        workDir: tempDir,
      })
      expect(retryResult.exitCode).toBe(0)

      // Parse success
      const parser = createResultParser()
      const parseResult = await parser.parse(retryResult.output, {
        workDir: tempDir,
        exitCode: 0,
        durationMs: 1000,
      })
      expect(parseResult.status).toBe('success')

      resetSubagentRegistry()
    })
  })

  describe('Checkpoint Cleanup and Lifecycle', () => {
    test('cleanup removes old checkpoints', async () => {
      const checkpointManager = createCheckpointManager({
        basePath: join(tempDir, '.loopwork/agents'),
      })

      // Create multiple checkpoints with different ages
      const now = Date.now()
      const oldAgentId = 'old-agent-' + now
      const newAgentId = 'new-agent-' + now

      // Create old checkpoint (manually set old timestamp)
      await checkpointManager.checkpoint(oldAgentId, {
        taskId: 'OLD-001',
        agentName: 'old-agent',
        phase: 'completed',
      })

      // Create new checkpoint
      await checkpointManager.checkpoint(newAgentId, {
        taskId: 'NEW-001',
        agentName: 'new-agent',
        phase: 'completed',
      })

      // Both should exist
      expect(await checkpointManager.restore(oldAgentId)).toBeDefined()
      expect(await checkpointManager.restore(newAgentId)).toBeDefined()

      // Clear specific checkpoint
      await checkpointManager.clear(oldAgentId)

      // Old should be gone, new should remain
      expect(await checkpointManager.restore(oldAgentId)).toBeNull()
      expect(await checkpointManager.restore(newAgentId)).toBeDefined()
    })

    test('multiple operations on same checkpoint maintain consistency', async () => {
      const checkpointManager = createCheckpointManager({
        basePath: join(tempDir, '.loopwork/agents'),
      })

      const agentId = 'consistency-test-agent'

      // Rapid checkpoint updates
      await checkpointManager.checkpoint(agentId, { taskId: 'T1', iteration: 1, phase: 'started' })
      await checkpointManager.checkpoint(agentId, { taskId: 'T1', iteration: 2, phase: 'executing' })
      await checkpointManager.checkpoint(agentId, { taskId: 'T1', iteration: 3, phase: 'executing' })
      await checkpointManager.checkpoint(agentId, { taskId: 'T1', iteration: 4, phase: 'executing' })
      await checkpointManager.checkpoint(agentId, { taskId: 'T1', iteration: 5, phase: 'completed' })

      const final = await checkpointManager.restore(agentId)
      expect(final?.checkpoint.iteration).toBe(5)
      expect(final?.checkpoint.phase).toBe('completed')
    })
  })

  describe('Agent Selection and Matching', () => {
    test('task metadata specifies which agent to use', async () => {
      const registry = createRegistry()

      registry.register({ name: 'fast-agent', description: 'Quick tasks', prompt: 'Be fast' })
      registry.register({ name: 'thorough-agent', description: 'Complex tasks', prompt: 'Be thorough' })
      registry.register({ name: 'default-agent', description: 'Default', prompt: 'Default behavior' })

      registry.setDefault('default-agent')

      // Task with specific agent
      const task1: Task = {
        id: 'MATCH-001',
        title: 'Quick task',
        description: 'Needs fast execution',
        status: 'pending',
        priority: 'high',
        metadata: { subagent: 'fast-agent' },
      }

      const task2: Task = {
        id: 'MATCH-002',
        title: 'Complex task',
        description: 'Needs thorough analysis',
        status: 'pending',
        priority: 'medium',
        metadata: { subagent: 'thorough-agent' },
      }

      const task3: Task = {
        id: 'MATCH-003',
        title: 'Regular task',
        description: 'No specific agent',
        status: 'pending',
        priority: 'low',
      }

      // Get agent for each task
      const agent1 = registry.get(task1.metadata?.subagent as string) ?? registry.getDefault()
      const agent2 = registry.get(task2.metadata?.subagent as string) ?? registry.getDefault()
      const agent3 = registry.get(task3.metadata?.subagent as string) ?? registry.getDefault()

      expect(agent1?.name).toBe('fast-agent')
      expect(agent2?.name).toBe('thorough-agent')
      expect(agent3?.name).toBe('default-agent')
    })
  })
})
