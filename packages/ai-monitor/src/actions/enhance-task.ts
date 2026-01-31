/**
 * Enhance Task Action
 *
 * Executes task enhancement actions based on detected early exit reasons.
 * Updates PRDs, creates test scaffolding, or splits tasks into sub-tasks.
 */

import fs from 'fs'
import path from 'path'
import { logger } from '../utils'
import type { TaskBackend } from '@loopwork-ai/loopwork/contracts'
import type { ExitReason, TaskEnhancement } from '../types'

// Import LoopworkState from loopwork if available, otherwise use fallback
let LoopworkState: any
try {
  const loopwork = require('@loopwork-ai/loopwork')
  LoopworkState = loopwork.LoopworkState
} catch {
  LoopworkState = class {
    paths: any
    constructor(options: any = {}) {
      const projectRoot = options?.projectRoot || process.cwd()
      const stateDir = path.join(projectRoot, '.loopwork')
      this.paths = {
        tasks: () => path.join(stateDir, 'tasks.json')
      }
    }
  }
}

export interface ExecuteEnhanceTaskOptions {
  taskId: string
  enhancementType: ExitReason
  prdAdditions?: {
    keyFiles?: string[]
    context?: string
    approachHints?: string[]
    nonGoals?: string[]
  }
  splitInto?: string[]
  testScaffolding?: string
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
    content = `# ${taskId}\n\n## Goal\n\nTODO: Define goal\n\n## Requirements\n\nTODO: Define requirements\n`
  }

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

  for (const section of sections) {
    const sectionTitle = section.match(/##\s+(.+)/)?.[1]
    if (sectionTitle && !content.includes(`## ${sectionTitle}`)) {
      content += section + '\n'
    }
  }

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
  const testPath = path.join(root, 'test', `${taskId.toLowerCase()}.test.ts`)

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

/**
 * Execute enhance-task action
 */
export async function executeEnhanceTask(
  options: ExecuteEnhanceTaskOptions,
  projectRoot?: string
): Promise<{ success: boolean; error?: string }> {
  const { taskId, enhancementType, prdAdditions, splitInto, testScaffolding } = options

  logger.info(`AI Monitor: Enhancing task ${taskId} (reason: ${enhancementType})`)

  try {
    // Update PRD if additions provided
    if (prdAdditions) {
      await updatePRD(taskId, prdAdditions, projectRoot)
    }

    // Create test scaffolding if provided
    if (testScaffolding) {
      await createTestScaffolding(taskId, testScaffolding, projectRoot)
    }

    // Log if task splitting is needed (actual splitting requires backend access)
    if (splitInto && splitInto.length > 0) {
      logger.info(`Task ${taskId} should be split into: ${splitInto.join(', ')}`)
      logger.debug('Note: Task splitting requires TaskBackend access - implement via onTaskFailed hook')
    }

    logger.success?.(`AI Monitor: Task ${taskId} enhanced successfully`)
    return { success: true }
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error)
    logger.warn(`AI Monitor: Task enhancement failed for ${taskId}: ${errorMsg}`)
    return { success: false, error: errorMsg }
  }
}
