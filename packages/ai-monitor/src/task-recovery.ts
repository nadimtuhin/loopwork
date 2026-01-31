/**
 * Task Recovery and Enhancement System
 *
 * Analyzes early task exits and enhances task context (PRD, tests, docs)
 * to improve success rate on retry.
 */

import fs from 'fs'
import path from 'path'
import { logger } from './utils'
import type { Task } from '@loopwork-ai/loopwork/contracts'
import type { TaskBackend } from '@loopwork-ai/loopwork/contracts'
import type {
  ExitReason,
  TaskRecoveryAnalysis,
  TaskEnhancement,
  RecoveryStrategy
} from './types'

/**
 * Exit reason detection patterns
 */
const EXIT_PATTERNS = {
  vague_prd: [
    /unclear requirements/i,
    /need more detail/i,
    /what (?:should|do you want)/i,
    /can you clarify/i,
    /which file/i,
    /where should/i
  ],
  missing_tests: [
    /no tests found/i,
    /missing test/i,
    /should (?:i|we) write tests/i,
    /test (?:file|cases?) (?:needed|required)/i
  ],
  missing_context: [
    /cannot find/i,
    /where is/i,
    /file not found/i,
    /which directory/i,
    /path to/i
  ],
  scope_large: [
    /too (?:complex|large)/i,
    /too many (?:changes|files)/i,
    /should (?:break|split) (?:this|into)/i,
    /multiple (?:components|areas)/i
  ],
  wrong_approach: [
    /failed attempt/i,
    /didn't work/i,
    /try (?:a )?different/i,
    /wrong (?:approach|direction)/i,
    /constraint/i,
    /limitation/i
  ]
}

/**
 * Detect exit reason from log patterns
 */
export function detectExitReason(logs: string[]): ExitReason {
  const logText = logs.join('\n')

  // Count matches for each exit reason
  const scores: Record<ExitReason, number> = {
    vague_prd: 0,
    missing_tests: 0,
    missing_context: 0,
    scope_large: 0,
    wrong_approach: 0
  }

  for (const [reason, patterns] of Object.entries(EXIT_PATTERNS)) {
    for (const pattern of patterns) {
      const matches = logText.match(new RegExp(pattern, 'gi'))
      if (matches) {
        scores[reason as ExitReason] += matches.length
      }
    }
  }

  // Return reason with highest score
  let maxScore = 0
  let detectedReason: ExitReason = 'vague_prd' // Default fallback

  for (const [reason, score] of Object.entries(scores)) {
    if (score > maxScore) {
      maxScore = score
      detectedReason = reason as ExitReason
    }
  }

  logger.debug(`Exit reason detected: ${detectedReason} (score: ${maxScore})`)
  return detectedReason
}

/**
 * Find relevant files for a task using simple heuristics
 */
export async function findRelevantFiles(task: Task, projectRoot?: string): Promise<string[]> {
  const relevantFiles: string[] = []
  const root = projectRoot || process.env.PWD || '.'

  // Extract potential file paths from task description
  const filePathPattern = /(?:packages\/[a-z-]+\/src\/[a-z-/]+\.(?:ts|js|tsx|jsx))/gi
  const matches = task.description.match(filePathPattern)
  if (matches) {
    for (const match of matches) {
      const fullPath = path.join(root, match)
      if (fs.existsSync(fullPath)) {
        relevantFiles.push(match)
      }
    }
  }

  // If task has feature, look for related files
  if (task.feature) {
    const featureName = task.feature.toLowerCase()
    const srcDirs = [
      path.join(root, 'packages', featureName, 'src'),
      path.join(root, 'packages/loopwork/src', featureName)
    ]

    for (const dir of srcDirs) {
      if (fs.existsSync(dir)) {
        const files = findFilesRecursive(dir, root)
        relevantFiles.push(...files)
      }
    }
  }

  // Deduplicate and limit to 10 files
  return [...new Set(relevantFiles)].slice(0, 10)
}

/**
 * Recursively find TypeScript/JavaScript files
 */
function findFilesRecursive(dir: string, projectRoot: string): string[] {
  const files: string[] = []

  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true })

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name)

      if (entry.isDirectory()) {
        // Skip node_modules, dist, .git
        if (!['node_modules', 'dist', 'build', '.git'].includes(entry.name)) {
          files.push(...findFilesRecursive(fullPath, projectRoot))
        }
      } else if (entry.isFile() && /\.(ts|js|tsx|jsx)$/.test(entry.name)) {
        // Store relative path from project root
        files.push(path.relative(projectRoot, fullPath))
      }
    }
  } catch (error) {
    logger.debug(`Error reading directory ${dir}: ${error}`)
  }

  return files
}

/**
 * Generate task enhancement based on exit reason
 */
export async function generateEnhancement(
  exitReason: ExitReason,
  task: Task,
  prdContent: string,
  relevantFiles: string[]
): Promise<TaskEnhancement> {
  const enhancement: TaskEnhancement = {}

  switch (exitReason) {
    case 'vague_prd':
      enhancement.prdAdditions = {
        keyFiles: relevantFiles.slice(0, 5),
        context: generateContextFromTask(task),
        approachHints: [
          'Review existing patterns in related files',
          'Follow the project coding style (no semicolons, single quotes)',
          'Use existing utility functions where possible'
        ]
      }
      break

    case 'missing_tests':
      enhancement.testScaffolding = generateTestScaffolding(task)
      enhancement.prdAdditions = {
        approachHints: [
          'Create test file first (TDD approach)',
          'Use Bun test framework (describe, test, expect)',
          'Add tests to test/ directory following existing patterns'
        ]
      }
      break

    case 'missing_context':
      enhancement.prdAdditions = {
        keyFiles: relevantFiles,
        context: `Key files for ${task.feature || 'this task'}:\n${relevantFiles.map(f => `- ${f}`).join('\n')}`
      }
      break

    case 'scope_large':
      enhancement.splitInto = generateSubtasks(task, prdContent)
      break

    case 'wrong_approach':
      enhancement.prdAdditions = {
        nonGoals: [
          'Do not modify core framework unless necessary',
          'Follow existing architecture patterns',
          'Avoid breaking changes to public APIs'
        ],
        approachHints: [
          'Review similar implementations in the codebase',
          'Consider using plugin system for extensibility'
        ]
      }
      break
  }

  return enhancement
}

/**
 * Generate contextual information from task metadata
 */
function generateContextFromTask(task: Task): string {
  const parts: string[] = []

  if (task.feature) {
    parts.push(`Feature: ${task.feature}`)
  }

  if (task.parentId) {
    parts.push(`This is a sub-task of ${task.parentId}`)
  }

  if (task.dependsOn && task.dependsOn.length > 0) {
    parts.push(`Depends on: ${task.dependsOn.join(', ')}`)
  }

  if (task.metadata) {
    const featureName = task.metadata.featureName as string | undefined
    if (featureName) {
      parts.push(`Feature name: ${featureName}`)
    }
  }

  return parts.join('\n')
}

/**
 * Generate test scaffolding content
 */
function generateTestScaffolding(task: Task): string {
  const _testName = task.id.toLowerCase().replace(/-/g, '_')

  return `import { describe, test, expect } from 'bun:test'

describe('${task.title}', () => {
  test('should implement ${task.title}', async () => {
    // TODO: Implement test based on PRD requirements
    expect(true).toBe(false) // Replace with actual test
  })

  test('should handle error cases', async () => {
    // TODO: Add error handling tests
    expect(true).toBe(false) // Replace with actual test
  })
})
`
}

/**
 * Generate subtask suggestions based on PRD content
 */
function generateSubtasks(task: Task, prdContent: string): string[] {
  const subtasks: string[] = []

  // Look for numbered lists or sections in PRD
  const sections = prdContent.match(/^##\s+(.+)$/gm)
  if (sections && sections.length > 2) {
    // PRD has multiple sections, split by major sections
    subtasks.push(
      `${task.id}a: Core implementation`,
      `${task.id}b: Tests and validation`,
      `${task.id}c: Documentation and cleanup`
    )
  } else {
    // Generic split
    subtasks.push(
      `${task.id}a: Implementation part 1`,
      `${task.id}b: Implementation part 2`
    )
  }

  return subtasks
}

/**
 * Main function: Analyze early exit and return recovery analysis
 */
export async function analyzeEarlyExit(
  taskId: string,
  logs: string[],
  backend: TaskBackend,
  projectRoot?: string
): Promise<TaskRecoveryAnalysis> {
  logger.debug(`Analyzing early exit for task ${taskId}`)

  // 1. Detect exit reason
  const exitReason = detectExitReason(logs)

  // 2. Get task metadata
  const task = await backend.getTask(taskId)
  if (!task) {
    throw new Error(`Task ${taskId} not found`)
  }

  // 3. Read PRD content
  const prdPath = getPRDPath(taskId, projectRoot)
  const prdContent = fs.existsSync(prdPath)
    ? fs.readFileSync(prdPath, 'utf-8')
    : ''

  // 4. Find relevant files
  const relevantFiles = await findRelevantFiles(task, projectRoot)

  // 5. Generate enhancement
  const enhancement = await generateEnhancement(
    exitReason,
    task,
    prdContent,
    relevantFiles
  )

  let strategy: RecoveryStrategy = 'context-truncation'
  if (exitReason === 'wrong_approach') {
    strategy = 'model-fallback'
  } else if (exitReason === 'scope_large') {
    strategy = 'task-restart'
  }

  const evidence = logs.slice(-20)

  return {
    taskId,
    exitReason,
    evidence,
    enhancement,
    strategy,
    timestamp: new Date()
  }
}

/**
 * Apply enhancements to task (update PRD, create tests, split tasks)
 */
export async function enhanceTask(
  analysis: TaskRecoveryAnalysis,
  backend: TaskBackend,
  projectRoot?: string
): Promise<void> {
  const { taskId, enhancement } = analysis

  logger.info(`Enhancing task ${taskId} based on ${analysis.exitReason}`)

  // 1. Update PRD if additions present
  if (enhancement.prdAdditions) {
    await updatePRD(taskId, enhancement.prdAdditions, projectRoot)
  }

  // 2. Create test scaffolding if needed
  if (enhancement.testScaffolding) {
    await createTestScaffolding(taskId, enhancement.testScaffolding, projectRoot)
  }

  // 3. Split into subtasks if needed
  if (enhancement.splitInto && backend.createSubTask) {
    const task = await backend.getTask(taskId)
    if (task) {
      for (const subtaskTitle of enhancement.splitInto) {
        await backend.createSubTask(taskId, {
          title: subtaskTitle,
          description: `Part of ${task.title}`,
          priority: task.priority
        })
      }
      logger.info(`Split ${taskId} into ${enhancement.splitInto.length} subtasks`)
    }
  }

  if (analysis.strategy === 'context-truncation') {
    await truncateContext(taskId, projectRoot)
  }

  logger.success?.(`Task ${taskId} enhanced successfully`)
}

async function truncateContext(taskId: string, projectRoot?: string): Promise<void> {
  const prdPath = getPRDPath(taskId, projectRoot)
  if (!fs.existsSync(prdPath)) return

  let content = fs.readFileSync(prdPath, 'utf-8')
  if (!content.includes('## Concise Goal')) {
    const goalMatch = content.match(/## Goal\n([\s\S]+?)(?=\n##|$)/)
    if (goalMatch && goalMatch[1].length > 500) {
      const conciseGoal = goalMatch[1].substring(0, 300) + '... [Truncated for context efficiency]'
      content = content.replace(goalMatch[0], `## Goal\n${goalMatch[1]}\n\n## Concise Goal\n${conciseGoal}`)
      fs.writeFileSync(prdPath, content)
      logger.debug(`Truncated context for ${taskId}`)
    }
  }
}

/**
 * Get PRD file path for a task
 */
function getPRDPath(taskId: string, projectRoot?: string): string {
  const root = projectRoot || process.cwd()
  return path.join(root, '.specs/tasks', `${taskId}.md`)
}

/**
 * Update PRD with additional context
 */
async function updatePRD(
  taskId: string,
  additions: NonNullable<TaskEnhancement['prdAdditions']>,
  projectRoot?: string
): Promise<void> {
  const prdPath = getPRDPath(taskId, projectRoot)

  let content = ''
  if (fs.existsSync(prdPath)) {
    content = fs.readFileSync(prdPath, 'utf-8')
  } else {
    // Create basic PRD structure
    content = `# ${taskId}\n\n## Goal\n\nTODO: Define goal\n\n## Requirements\n\nTODO: Define requirements\n`
  }

  // Build enhancement sections
  const sections: string[] = []

  if (additions.keyFiles && additions.keyFiles.length > 0) {
    sections.push('\n## Key Files\n' + additions.keyFiles.map(f => `- ${f}`).join('\n'))
  }

  if (additions.context) {
    sections.push('\n## Context\n' + additions.context)
  }

  if (additions.approachHints && additions.approachHints.length > 0) {
    sections.push('\n## Approach Hints\n' + additions.approachHints.map(h => `- ${h}`).join('\n'))
  }

  if (additions.nonGoals && additions.nonGoals.length > 0) {
    sections.push('\n## Non-Goals\n' + additions.nonGoals.map(g => `- ${g}`).join('\n'))
  }

  // Append sections if not already present
  for (const section of sections) {
    const sectionTitle = section.match(/##\s+(.+)/)?.[1]
    if (sectionTitle && !content.includes(`## ${sectionTitle}`)) {
      content += section + '\n'
    }
  }

  // Write updated PRD
  const dir = path.dirname(prdPath)
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true })
  }
  fs.writeFileSync(prdPath, content)

  logger.debug(`Updated PRD: ${prdPath}`)
}

/**
 * Create test scaffolding file
 */
async function createTestScaffolding(
  taskId: string,
  scaffolding: string,
  projectRoot?: string
): Promise<void> {
  const root = projectRoot || process.cwd()
  const testPath = path.join(
    root,
    'test',
    `${taskId.toLowerCase()}.test.ts`
  )

  // Don't overwrite existing tests
  if (fs.existsSync(testPath)) {
    logger.debug(`Test file already exists: ${testPath}`)
    return
  }

  const dir = path.dirname(testPath)
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true })
  }

  fs.writeFileSync(testPath, scaffolding)
  logger.debug(`Created test scaffolding: ${testPath}`)
}
