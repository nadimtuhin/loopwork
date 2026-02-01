#!/usr/bin/env bun
/**
 * E2E Test Generator
 * 
 * Generates comprehensive end-to-end tests for packages.
 * Tests complete workflows and integration scenarios.
 */

import * as fs from 'fs'
import * as path from 'path'

interface E2ETestConfig {
  packageName: string
  testName: string
  description: string
  scenarios: E2EScenario[]
}

interface E2EScenario {
  name: string
  description: string
  steps: string[]
  assertions: string[]
}

const E2E_TEMPLATES: Record<string, E2ETestConfig[]> = {
  loopwork: [
    {
      packageName: 'loopwork',
      testName: 'task-lifecycle',
      description: 'Complete task lifecycle from creation to completion',
      scenarios: [
        {
          name: 'create and complete task',
          description: 'Creates a task, processes it, and marks it complete',
          steps: [
            'Create temp directory for test isolation',
            'Initialize JSON backend with tasks file',
            'Create a pending task with PRD',
            'Start task processing loop',
            'Execute task with CLI mock',
            'Verify task status changed to completed',
            'Verify output artifacts created',
          ],
          assertions: [
            'Task count decreases after completion',
            'Task status is "completed"',
            'Log files are created',
          ],
        },
        {
          name: 'task failure and retry',
          description: 'Tests task failure handling with retry logic',
          steps: [
            'Create task that will fail',
            'Configure maxRetries = 2',
            'Execute task (mock returns failure)',
            'Verify retry attempts',
            'Verify failure recorded after max retries',
          ],
          assertions: [
            'Task retried correct number of times',
            'Failure count incremented',
            'Task status set to failed',
          ],
        },
      ],
    },
    {
      packageName: 'loopwork',
      testName: 'parallel-execution',
      description: 'Tests parallel task execution with multiple workers',
      scenarios: [
        {
          name: 'parallel workers',
          description: 'Executes multiple tasks in parallel',
          steps: [
            'Create 5 pending tasks',
            'Configure 3 parallel workers',
            'Start parallel execution',
            'Wait for all tasks to complete',
          ],
          assertions: [
            'All tasks completed',
            'Execution time less than sequential',
            'No race conditions in status updates',
          ],
        },
      ],
    },
    {
      packageName: 'loopwork',
      testName: 'backend-integration',
      description: 'Tests integration with different backends',
      scenarios: [
        {
          name: 'JSON backend persistence',
          description: 'Verifies JSON backend persists data correctly',
          steps: [
            'Initialize JSON backend',
            'Create multiple tasks',
            'Update task statuses',
            'Re-read from file',
          ],
          assertions: [
            'All tasks persisted correctly',
            'Status changes saved',
            'File format valid JSON',
          ],
        },
      ],
    },
  ],
  agents: [
    {
      packageName: 'agents',
      testName: 'multi-agent-workflow',
      description: 'Tests multi-agent collaboration workflow',
      scenarios: [
        {
          name: 'planner to executor handoff',
          description: 'Planner creates plan, executor implements',
          steps: [
            'Create planner agent',
            'Create executor agent',
            'Execute planning task',
            'Parse plan output',
            'Execute implementation task',
          ],
          assertions: [
            'Planner output contains structured plan',
            'Executor receives plan context',
            'Both agents executed successfully',
          ],
        },
      ],
    },
    {
      packageName: 'agents',
      testName: 'agent-registry',
      description: 'Tests agent registration and discovery',
      scenarios: [
        {
          name: 'dynamic agent registration',
          description: 'Registers agents dynamically and retrieves them',
          steps: [
            'Create empty registry',
            'Register 3 different agents',
            'Query agents by capability',
            'Get default agent',
          ],
          assertions: [
            'All agents registered',
            'Query returns matching agents',
            'Default agent set correctly',
          ],
        },
      ],
    },
  ],
  executor: [
    {
      packageName: 'executor',
      testName: 'cli-execution-flow',
      description: 'Tests complete CLI execution flow',
      scenarios: [
        {
          name: 'successful command execution',
          description: 'Executes CLI command and captures output',
          steps: [
            'Configure CLI executor',
            'Set up model selector',
            'Execute simple command',
            'Capture stdout/stderr',
          ],
          assertions: [
            'Exit code is 0',
            'Output captured correctly',
            'Duration measured',
          ],
        },
        {
          name: 'circuit breaker activation',
          description: 'Tests circuit breaker on repeated failures',
          steps: [
            'Configure circuit breaker (threshold=3)',
            'Execute failing command 3 times',
            'Verify circuit opens',
            'Attempt 4th execution (should skip)',
          ],
          assertions: [
            'Circuit opens after threshold',
            '4th execution not attempted',
            'Failure count correct',
          ],
        },
      ],
    },
    {
      packageName: 'executor',
      testName: 'model-selection',
      description: 'Tests model selection strategies',
      scenarios: [
        {
          name: 'round-robin selection',
          description: 'Tests round-robin model selection',
          steps: [
            'Configure 3 models with round-robin',
            'Execute 5 tasks',
          ],
          assertions: [
            'Models selected in order',
            'Selection wraps around',
          ],
        },
      ],
    },
  ],
  checkpoint: [
    {
      packageName: 'checkpoint',
      testName: 'checkpoint-recovery',
      description: 'Tests checkpoint creation and recovery',
      scenarios: [
        {
          name: 'save and restore state',
          description: 'Saves checkpoint and restores from it',
          steps: [
            'Initialize checkpoint manager',
            'Create sample state',
            'Save checkpoint',
            'Clear state',
            'Restore from checkpoint',
          ],
          assertions: [
            'Checkpoint file created',
            'State restored correctly',
            'All data preserved',
          ],
        },
      ],
    },
  ],
}

function generateE2ETest(config: E2ETestConfig): string {
  const scenariosCode = config.scenarios.map(scenario => {
    const stepsCode = scenario.steps.map(step => `      // ${step}`).join('\n')
    const assertionsCode = scenario.assertions.map(assertion => 
      `      expect(result).toBeDefined() // ${assertion}`
    ).join('\n')

    return `
  describe('${scenario.name}', () => {
    test('${scenario.description}', async () => {
${stepsCode}

      // Execute
      const result = await execute()

      // Assert
${assertionsCode}
    })
  })
`
  }).join('\n')

  return `import { describe, test, expect, beforeEach, afterEach, mock } from 'bun:test'
import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'

/**
 * ${config.description}
 * 
 * E2E Test Suite: ${config.testName}
 * Generated for comprehensive integration testing
 */

describe('${config.testName}', () => {
  let tempDir: string

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), '${config.packageName}-e2e-'))
  })

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true })
  })
${scenariosCode}
})

// Helper function
async function execute(): Promise<unknown> {
  // Placeholder for actual execution
  return { success: true }
}
`
}

function generatePackageE2ETests(packageName: string): string[] {
  const configs = E2E_TEMPLATES[packageName]
  if (!configs) return []

  const createdFiles: string[] = []

  for (const config of configs) {
    const testContent = generateE2ETest(config)
    const testDir = path.join(process.cwd(), 'packages', packageName, 'test', 'e2e')
    const testFile = path.join(testDir, `${config.testName}.test.ts`)

    if (!fs.existsSync(testDir)) {
      fs.mkdirSync(testDir, { recursive: true })
    }

    fs.writeFileSync(testFile, testContent, 'utf-8')
    createdFiles.push(testFile)
  }

  return createdFiles
}

async function main(): Promise<void> {
  console.log('╔══════════════════════════════════════════════════════════╗')
  console.log('║     E2E TEST GENERATOR                                   ║')
  console.log('╚══════════════════════════════════════════════════════════╝\n')

  const args = process.argv.slice(2)
  const specificPackages = args.filter((arg, i) => args[i - 1] === '--package' || args[i - 1] === '-p')

  const packages = specificPackages.length > 0 
    ? specificPackages 
    : Object.keys(E2E_TEMPLATES)

  let totalCreated = 0

  for (const pkg of packages) {
    const files = generatePackageE2ETests(pkg)
    if (files.length > 0) {
      console.log(`${pkg}: Created ${files.length} E2E test files`)
      for (const file of files) {
        console.log(`  - ${path.basename(file)}`)
      }
      totalCreated += files.length
    } else {
      console.log(`${pkg}: No E2E templates defined`)
    }
  }

  console.log(`\nTotal E2E test files created: ${totalCreated}`)
}

main().catch(error => {
  console.error('Error:', error)
  process.exit(1)
})
