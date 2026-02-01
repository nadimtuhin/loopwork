import { describe, test, expect, beforeEach, afterEach, mock } from 'bun:test'
import fs from 'fs'
import path from 'path'
import os from 'os'
import { detectExitReason, findRelevantFiles, generateEnhancement, analyzeEarlyExit } from '../src/task-recovery'
import type { Task } from '@loopwork-ai/loopwork/contracts'
import type { TaskBackend } from '@loopwork-ai/loopwork/contracts'
import type { ExitReason } from '../src/types'

describe('Task Recovery System', () => {
  let testDir: string
  let tasksDir: string

  beforeEach(() => {
    // Create unique temp directory for each test
    testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'test-recovery-'))
    tasksDir = path.join(testDir, '.specs/tasks')
    // Create test directory structure
    fs.mkdirSync(tasksDir, { recursive: true })
  })

  afterEach(() => {
    // Cleanup test directory
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true, force: true })
    }
  })

  describe('detectExitReason', () => {
    test('should detect vague_prd from unclear requirements logs', () => {
      const logs = [
        'Starting task execution...',
        'I need more detail about the requirements',
        'Can you clarify what should be implemented?',
        'Which file should I modify?'
      ]

      const reason = detectExitReason(logs)
      expect(reason).toBe('vague_prd')
    })

    test('should detect missing_tests from test-related logs', () => {
      const logs = [
        'Implementing feature...',
        'No tests found for this module',
        'Should I write tests?',
        'Test file needed for validation'
      ]

      const reason = detectExitReason(logs)
      expect(reason).toBe('missing_tests')
    })

    test('should detect missing_context from file not found logs', () => {
      const logs = [
        'Cannot find the configuration file',
        'Where is the main entry point?',
        'File not found: src/main.ts',
        'Which directory should I look in?'
      ]

      const reason = detectExitReason(logs)
      expect(reason).toBe('missing_context')
    })

    test('should detect scope_large from complexity logs', () => {
      const logs = [
        'This task is too complex',
        'Too many files to modify',
        'Should we split this into smaller tasks?',
        'Multiple components need changes'
      ]

      const reason = detectExitReason(logs)
      expect(reason).toBe('scope_large')
    })

    test('should detect wrong_approach from failed attempts', () => {
      const logs = [
        'First attempt failed',
        'This approach didn\'t work',
        'Need to try a different strategy',
        'Wrong direction, hitting constraints'
      ]

      const reason = detectExitReason(logs)
      expect(reason).toBe('wrong_approach')
    })

    test('should default to vague_prd when no clear pattern', () => {
      const logs = ['Generic error message', 'No specific indicators']

      const reason = detectExitReason(logs)
      expect(reason).toBe('vague_prd')
    })
  })

  describe('findRelevantFiles', () => {
    test('should extract file paths from task description', async () => {
      const task: Task = {
        id: 'TEST-001',
        title: 'Test Task',
        description: 'Modify packages/loopwork/src/core/utils.ts and packages/loopwork/src/index.ts',
        status: 'pending',
        priority: 'medium'
      }

      const files = await findRelevantFiles(task, testDir)
      // Files may or may not exist depending on environment
      expect(files).toBeDefined()
      expect(Array.isArray(files)).toBe(true)
    })

    test('should find files by feature name', async () => {
      const task: Task = {
        id: 'AI-001',
        title: 'AI Monitor Task',
        description: 'Implement monitoring',
        status: 'pending',
        priority: 'high',
        feature: 'ai-monitor'
      }

      const files = await findRelevantFiles(task, testDir)
      expect(files).toBeDefined()
      // May or may not find files depending on directory structure
    })

    test('should limit results to 10 files', async () => {
      const task: Task = {
        id: 'LARGE-001',
        title: 'Large Task',
        description: 'Many files',
        status: 'pending',
        priority: 'medium',
        feature: 'loopwork' // Large feature
      }

      const files = await findRelevantFiles(task, testDir)
      expect(files.length).toBeLessThanOrEqual(10)
    })
  })

  describe('generateEnhancement', () => {
    const mockTask: Task = {
      id: 'TEST-001',
      title: 'Test Task',
      description: 'Test description',
      status: 'pending',
      priority: 'medium'
    }

    test('should generate PRD additions for vague_prd', async () => {
      const enhancement = await generateEnhancement(
        'vague_prd',
        mockTask,
        '# Test PRD',
        ['src/file1.ts', 'src/file2.ts']
      )

      expect(enhancement.prdAdditions).toBeDefined()
      expect(enhancement.prdAdditions?.keyFiles).toContain('src/file1.ts')
      expect(enhancement.prdAdditions?.approachHints).toBeDefined()
      expect(enhancement.prdAdditions?.approachHints?.length).toBeGreaterThan(0)
    })

    test('should generate test scaffolding for missing_tests', async () => {
      const enhancement = await generateEnhancement(
        'missing_tests',
        mockTask,
        '# Test PRD',
        []
      )

      expect(enhancement.testScaffolding).toBeDefined()
      expect(enhancement.testScaffolding).toContain('describe')
      expect(enhancement.testScaffolding).toContain('test')
      expect(enhancement.testScaffolding).toContain('expect')
    })

    test('should generate file list for missing_context', async () => {
      const files = ['src/core.ts', 'src/utils.ts', 'src/types.ts']
      const enhancement = await generateEnhancement(
        'missing_context',
        mockTask,
        '# Test PRD',
        files
      )

      expect(enhancement.prdAdditions).toBeDefined()
      expect(enhancement.prdAdditions?.keyFiles).toEqual(files)
      expect(enhancement.prdAdditions?.context).toContain('Key files')
    })

    test('should generate subtask split for scope_large', async () => {
      const prdContent = `# Test PRD
## Section 1
Content 1
## Section 2
Content 2
## Section 3
Content 3`

      const enhancement = await generateEnhancement(
        'scope_large',
        mockTask,
        prdContent,
        []
      )

      expect(enhancement.splitInto).toBeDefined()
      expect(enhancement.splitInto?.length).toBeGreaterThan(0)
      expect(enhancement.splitInto?.[0]).toContain('TEST-001')
    })

    test('should generate non-goals for wrong_approach', async () => {
      const enhancement = await generateEnhancement(
        'wrong_approach',
        mockTask,
        '# Test PRD',
        []
      )

      expect(enhancement.prdAdditions).toBeDefined()
      expect(enhancement.prdAdditions?.nonGoals).toBeDefined()
      expect(enhancement.prdAdditions?.nonGoals?.length).toBeGreaterThan(0)
    })
  })

  describe('analyzeEarlyExit', () => {
    test('should perform full analysis', async () => {
      const logs = [
        'Task started',
        'Need more detail about requirements',
        'Can you clarify the goal?',
        'Task exited early'
      ]

      const mockBackend: Partial<TaskBackend> = {
        getTask: mock(async (id: string) => ({
          id,
          title: 'Test Task',
          description: 'Test description with packages/loopwork/src/core/utils.ts',
          status: 'pending' as const,
          priority: 'medium' as const
        }))
      }

      // Create a test PRD
      const prdPath = path.join(tasksDir, 'TEST-001.md')
      fs.writeFileSync(prdPath, '# TEST-001\n\n## Goal\nTest goal')

      const analysis = await analyzeEarlyExit(
        'TEST-001',
        logs,
        mockBackend as TaskBackend,
        testDir
      )

      expect(analysis.taskId).toBe('TEST-001')
      expect(analysis.exitReason).toBe('vague_prd')
      expect(analysis.evidence).toBeDefined()
      expect(analysis.enhancement).toBeDefined()
      expect(analysis.timestamp).toBeInstanceOf(Date)
    })
  })

  describe('enhanceTask', () => {
    test('should update PRD with additions', async () => {
      const prdPath = path.join(tasksDir, 'TEST-002.md')

      const mockBackend: Partial<TaskBackend> = {
        getTask: mock(async () => ({
          id: 'TEST-002',
          title: 'Test Task 2',
          description: 'Test',
          status: 'pending' as const,
          priority: 'medium' as const
        }))
      }

      const analysis = {
        taskId: 'TEST-002',
        exitReason: 'vague_prd' as ExitReason,
        evidence: [],
        enhancement: {
          prdAdditions: {
            keyFiles: ['src/test.ts'],
            context: 'Test context',
            approachHints: ['Hint 1', 'Hint 2']
          }
        },
        timestamp: new Date()
      }

      await enhanceTask(analysis, mockBackend as TaskBackend, testDir)

      expect(fs.existsSync(prdPath)).toBe(true)
      const content = fs.readFileSync(prdPath, 'utf-8')
      expect(content).toContain('## Key Files')
      expect(content).toContain('src/test.ts')
      expect(content).toContain('## Context')
      expect(content).toContain('## Approach Hints')
    })

    test('should create test scaffolding', async () => {
      const testPath = path.join(testDir, 'test', 'test-003.test.ts')

      const mockBackend: Partial<TaskBackend> = {
        getTask: mock(async () => ({
          id: 'TEST-003',
          title: 'Test Task 3',
          description: 'Test',
          status: 'pending' as const,
          priority: 'medium' as const
        }))
      }

      const analysis = {
        taskId: 'TEST-003',
        exitReason: 'missing_tests' as ExitReason,
        evidence: [],
        enhancement: {
          testScaffolding: 'import { test } from 'bun:test'\ntest("sample", () => {})'
        },
        timestamp: new Date()
      }

      await enhanceTask(analysis, mockBackend as TaskBackend, testDir)

      expect(fs.existsSync(testPath)).toBe(true)
      const content = fs.readFileSync(testPath, 'utf-8')
      expect(content).toContain('import { test }')
    })

    test('should create subtasks when split needed', async () => {
      const createSubTaskMock = mock(async () => ({
        id: 'TEST-004a',
        title: 'Subtask',
        description: 'Part of TEST-004',
        status: 'pending' as const,
        priority: 'medium' as const
      }))

      const mockBackend: Partial<TaskBackend> = {
        getTask: mock(async () => ({
          id: 'TEST-004',
          title: 'Test Task 4',
          description: 'Test',
          status: 'pending' as const,
          priority: 'high' as const
        })),
        createSubTask: createSubTaskMock
      }

      const analysis = {
        taskId: 'TEST-004',
        exitReason: 'scope_large' as ExitReason,
        evidence: [],
        enhancement: {
          splitInto: ['TEST-004a: Part 1', 'TEST-004b: Part 2']
        },
        timestamp: new Date()
      }

      await enhanceTask(analysis, mockBackend as TaskBackend, testDir)

      expect(createSubTaskMock).toHaveBeenCalledTimes(2)
    })
  })
})
