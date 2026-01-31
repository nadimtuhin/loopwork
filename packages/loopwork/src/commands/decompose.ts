/**
 * Decompose Command
 *
 * Takes a natural language prompt and uses AI to decompose it into
 * structured tasks with PRD files.
 *
 * Usage:
 *   loopwork d "Build a REST API for user authentication"
 *   loopwork d --feature auth "Add login and logout endpoints"
 *   loopwork d --parent AUTH-001 "Add password reset functionality"
 */

import fs from 'fs'
import path from 'path'
import { spawn } from 'child_process'
import { logger, separator, Table, CompletionSummary } from '../core/utils'
import { getConfig } from '../core/config'
import type { DecomposeJsonOutput } from '../contracts/output'
import { LoopworkError } from '../core/errors'

interface DecomposeOptions {
  feature?: string
  parent?: string
  priority?: 'high' | 'medium' | 'low' | 'background'
  cli?: string
  model?: string
  dryRun?: boolean
  yes?: boolean
  json?: boolean
}

interface GeneratedTask {
  id: string
  title: string
  description: string
  priority: 'high' | 'medium' | 'low' | 'background'
  dependsOn?: string[]
}

const DECOMPOSE_PROMPT = `You are a task decomposition expert. Given a user's request, break it down into well-structured, actionable tasks.

## Rules:
1. Create 2-6 tasks depending on complexity
2. Each task should be completable in 1-2 hours by an AI coding assistant
3. Tasks should be ordered by dependency (earlier tasks first)
4. Use clear, imperative titles (e.g., "Create user model", "Add authentication middleware")
5. Include enough detail in descriptions for implementation
6. Mark the first foundational task as "high" priority, others as "medium", "low", or "background" (for non-essential tasks)

## Output Format:
Return ONLY valid JSON (no markdown, no explanation) in this exact format:
{
  "tasks": [
    {
      "id": "TASK-001",
      "title": "Short imperative title",
      "description": "Detailed description with requirements, acceptance criteria, and implementation hints",
      "priority": "high",
      "dependsOn": []
    },
    {
      "id": "TASK-002",
      "title": "Another task title",
      "description": "Description here",
      "priority": "medium",
      "dependsOn": ["TASK-001"]
    }
  ],
  "feature": "suggested-feature-name"
}

## User Request:
`

export async function decompose(prompt: string, options: DecomposeOptions): Promise<void> {
  const isJsonMode = options.json === true

  if (!isJsonMode) {
    logger.info('Decomposing prompt into tasks...')
    logger.info(`Prompt: "${prompt}"`)
    logger.raw(separator('light'))
  }

  // Load config to find tasks file
  const config = await getConfig({})
  const tasksFile = config.backend?.tasksFile || '.specs/tasks/tasks.json'
  const tasksDir = path.dirname(tasksFile)

  // Ensure tasks directory exists
  if (!fs.existsSync(tasksDir)) {
    fs.mkdirSync(tasksDir, { recursive: true })
  }

  // Generate tasks using AI
  const fullPrompt = DECOMPOSE_PROMPT + prompt

  if (!isJsonMode) {
    logger.info(`Using ${options.cli || 'claude'} to decompose...`)
  }

  let aiResponse: string
  try {
    aiResponse = await callAI(fullPrompt, options.cli || 'claude', options.model)
  } catch (error) {
    if (isJsonMode) {
      console.error(JSON.stringify({
        command: 'decompose',
        timestamp: new Date().toISOString(),
        error: `Failed to call AI: ${error}`,
      }))
    } else {
      logger.error(`Failed to call AI: ${error}`)
    }
    process.exit(1)
  }

  // Parse the response
  let generated: { tasks: GeneratedTask[], feature?: string }
  try {
    // Extract JSON from response (in case there's extra text)
    const jsonMatch = aiResponse.match(/\{[\s\S]*\}/)
    if (!jsonMatch) {
      throw new LoopworkError(
        'ERR_UNKNOWN',
        'No JSON found in AI response',
        [
          'Check if the AI CLI is working correctly',
          'Try running the command again',
          'Verify the model supports JSON output',
        ]
      )
    }
    generated = JSON.parse(jsonMatch[0])
  } catch (error) {
    logger.error(`Failed to parse AI response: ${error}`)
    logger.error('Raw response:')
    logger.raw(aiResponse)
    process.exit(1)
  }

  if (!generated.tasks || !Array.isArray(generated.tasks)) {
    logger.error('Invalid response: missing tasks array')
    process.exit(1)
  }

  // Determine feature name
  const feature = options.feature || generated.feature || 'default'

  // Generate unique task IDs based on existing tasks
  const existingIds = await getExistingTaskIds(tasksFile)
  const prefix = feature.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8) || 'TASK'
  const tasks = assignTaskIds(generated.tasks, prefix, existingIds, options.parent)

  // JSON output mode
  if (isJsonMode) {
    const output: DecomposeJsonOutput = {
      command: 'decompose',
      timestamp: new Date().toISOString(),
      input: {
        description: prompt,
        taskId: options.parent,
        namespace: feature,
      },
      tasks: tasks.map(t => ({
        id: t.id,
        title: t.title,
        status: 'pending',
        priority: t.priority || 'medium',
        dependencies: t.dependsOn,
        prdPath: options.dryRun ? undefined : path.join(tasksDir, `${t.id}.md`),
      })),
      summary: {
        totalTasks: tasks.length,
        topLevel: options.parent ? 0 : tasks.length,
        subtasks: options.parent ? tasks.length : 0,
      },
    }

    if (options.dryRun) {
      output.dryRun = true
    }

    logger.raw(JSON.stringify(output, null, 2))
    return
  }

  // Show preview
  logger.raw('')
  logger.info('Generated Tasks:')
  logger.raw(separator('heavy'))

  const table = new Table(['ID', 'Title', 'Priority', 'Dependencies'])
  for (const task of tasks) {
    const deps = task.dependsOn?.length ? task.dependsOn.join(', ') : '-'
    table.addRow([task.id, task.title, task.priority || 'medium', deps])
  }
  logger.raw(table.render())

  logger.raw('')
  logger.raw(separator('heavy'))
  logger.info(`Total: ${tasks.length} tasks`)
  logger.info(`Feature: ${feature}`)
  if (options.parent) {
    logger.info(`Parent: ${options.parent}`)
  }

  if (options.dryRun) {
    logger.warn('Dry run - no files created')
    return
  }

  // Confirm unless --yes
  if (!options.yes) {
    const confirmed = await confirm('Create these tasks?')
    if (!confirmed) {
      logger.info('Cancelled')
      return
    }
  }

  await _saveTasks(tasks, feature, tasksFile, tasksDir, options.parent)

  logger.raw('')

  const summary = new CompletionSummary('Task Decomposition Complete')
  summary.setStats({
    completed: tasks.length,
    failed: 0,
    skipped: 0
  })
  summary.addNextSteps([
    `loopwork run --feature ${feature}  # Run these tasks`,
    `loopwork dashboard                 # View in dashboard`,
    `${tasksFile}                       # Edit tasks.json`
  ])

  logger.raw('')
  logger.raw(summary.render())
  logger.raw('')
}

async function callAI(prompt: string, cli: string, model?: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const args: string[] = []
    let useStdin = false
    const env = { ...process.env }

    if (cli === 'claude') {
      // Match CliExecutor behavior: use -p mode with --dangerously-skip-permissions
      args.push('-p', '--dangerously-skip-permissions', '--output-format', 'text')
      if (model) args.push('--model', model)
      useStdin = true
    } else if (cli === 'opencode') {
      // OpenCode passes prompt as argument, not stdin
      env['OPENCODE_PERMISSION'] = '{"*":"allow"}'
      args.push('run')
      if (model) args.push('--model', model)
      args.push(prompt)
    } else if (cli === 'gemini') {
      if (model) args.push('--model', model)
      args.push(prompt)
    }

    const child = spawn(cli, args, {
      stdio: ['pipe', 'pipe', 'pipe'],
      env
    })

    let stdout = ''
    let stderr = ''

    // Timeout after 5 minutes (300 seconds)
    const timeoutMs = 300 * 1000
    const timer = setTimeout(() => {
      child.kill('SIGTERM')
      setTimeout(() => child.kill('SIGKILL'), 5000)
      reject(new Error(`CLI timed out after ${timeoutMs / 1000}s`))
    }, timeoutMs)

    child.stdout.on('data', (data) => {
      stdout += data.toString()
    })

    child.stderr.on('data', (data) => {
      stderr += data.toString()
    })

    child.on('close', (code) => {
      clearTimeout(timer)
      if (code === 0) {
        resolve(stdout)
      } else {
        reject(new Error(`CLI exited with code ${code}: ${stderr || stdout}`))
      }
    })

    child.on('error', (error) => {
      clearTimeout(timer)
      reject(error)
    })

    // Send prompt to stdin only for CLIs that expect it
    if (useStdin) {
      child.stdin.write(prompt)
    }
    child.stdin.end()
  })
}

async function getExistingTaskIds(tasksFile: string): Promise<Set<string>> {
  const ids = new Set<string>()

  if (fs.existsSync(tasksFile)) {
    try {
      const content = fs.readFileSync(tasksFile, 'utf-8')
      const data = JSON.parse(content)
      if (data.tasks && Array.isArray(data.tasks)) {
        for (const task of data.tasks) {
          ids.add(task.id)
        }
      }
    } catch {
      // Ignore parse errors
    }
  }

  return ids
}

function assignTaskIds(
  tasks: GeneratedTask[],
  prefix: string,
  existingIds: Set<string>,
  parentId?: string
): GeneratedTask[] {
  // Find the next available number for this prefix
  let nextNum = 1
  for (const id of existingIds) {
    const match = id.match(new RegExp(`^${prefix}-(\\d+)`))
    if (match) {
      const num = parseInt(match[1], 10)
      if (num >= nextNum) {
        nextNum = num + 1
      }
    }
  }

  // Map old IDs to new IDs
  const idMap = new Map<string, string>()
  const result: GeneratedTask[] = []

  for (let i = 0; i < tasks.length; i++) {
    const task = tasks[i]
    let newId: string

    if (parentId) {
      // Sub-tasks use parent ID + letter suffix
      const suffix = String.fromCharCode(97 + i) // a, b, c, ...
      newId = `${parentId}${suffix}`
    } else {
      // Top-level tasks use prefix + number
      newId = `${prefix}-${String(nextNum).padStart(3, '0')}`
      nextNum++
    }

    idMap.set(task.id, newId)

    result.push({
      ...task,
      id: newId,
      dependsOn: task.dependsOn?.map(dep => idMap.get(dep) || dep)
    })
  }

  return result
}

async function _saveTasks(
  tasks: GeneratedTask[],
  feature: string,
  tasksFile: string,
  tasksDir: string,
  parentId?: string
): Promise<void> {
  // Load existing tasks.json or create new
  let data: { tasks: unknown[], features?: Record<string, unknown> } = { tasks: [], features: {} }

  if (fs.existsSync(tasksFile)) {
    try {
      data = JSON.parse(fs.readFileSync(tasksFile, 'utf-8'))
    } catch {
      // Start fresh if parse error
    }
  }

  // Add new tasks
  for (const task of tasks) {
    // Add to tasks array
    data.tasks.push({
      id: task.id,
      status: 'pending',
      priority: task.priority,
      title: task.title,
      feature,
      ...(parentId && { parentId }),
      ...(task.dependsOn?.length && { dependsOn: task.dependsOn })
    })

    // Create PRD file
    const prdPath = path.join(tasksDir, `${task.id}.md`)
    const prdContent = generatePRD(task)
    fs.writeFileSync(prdPath, prdContent)
    logger.info(`Created ${prdPath}`)
  }

  // Add feature if not exists
  if (!data.features) {
    data.features = {}
  }
  if (!data.features[feature]) {
    data.features[feature] = {
      name: feature.charAt(0).toUpperCase() + feature.slice(1).replace(/-/g, ' '),
      description: `Tasks for ${feature}`
    }
  }

  // Save tasks.json
  fs.writeFileSync(tasksFile, JSON.stringify(data, null, 2))
}

function generatePRD(task: GeneratedTask): string {
  return `# ${task.id}: ${task.title}

## Goal
${task.description}

## Requirements
- Implement the functionality described above
- Follow existing code patterns and conventions
- Add appropriate error handling

## Success Criteria
- [ ] Feature implemented as described
- [ ] Code follows project conventions
- [ ] No new errors or warnings introduced
`
}

async function confirm(message: string): Promise<boolean> {
  // Check if stdin is a TTY
  if (!process.stdin.isTTY) {
    return true
  }

  return new Promise((resolve) => {
    const readline = require('readline')
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    })

    rl.question(`${message} [Y/n] `, (answer: string) => {
      rl.close()
      resolve(answer.toLowerCase() !== 'n')
    })
  })
}
