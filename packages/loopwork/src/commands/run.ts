import fs from 'fs'
import path from 'path'
import { getConfig } from '../core/config'
import { StateManager } from '../core/state'
import { createBackend, type TaskBackend, type Task } from '../backends'
import { CliExecutor } from '../core/cli'
import { logger } from '../core/utils'
import { plugins } from '../plugins'
import { createCostTrackingPlugin } from '../../../cost-tracking/src/index'
import { createTelegramHookPlugin } from '../../../telegram/src/notifications'
import type { TaskContext } from '../contracts/plugin'

function generateSuccessCriteria(task: Task): string[] {
  const criteria: string[] = []
  const desc = task.description.toLowerCase()
  const title = task.title.toLowerCase()

  if (desc.includes('test') || title.includes('test')) {
    criteria.push('All related tests pass (`bun test` or `yarn test`)')
  }

  if (desc.includes('api') || desc.includes('endpoint') || desc.includes('graphql')) {
    criteria.push('API endpoint is functional and returns expected responses')
    criteria.push('GraphQL schema validates (no SDL errors)')
  }

  if (desc.includes('component') || desc.includes('page') || desc.includes('ui') || desc.includes('button')) {
    criteria.push('Component renders without errors')
    criteria.push('UI matches the requirements described in the PRD')
  }

  if (desc.includes('database') || desc.includes('migration') || desc.includes('prisma') || desc.includes('model')) {
    criteria.push('Database migrations apply cleanly')
    criteria.push('Prisma schema is valid (`yarn rw prisma validate`)')
  }

  if (desc.includes('fix') || desc.includes('bug') || title.includes('fix')) {
    criteria.push('The bug is fixed and no longer reproducible')
    criteria.push('No regression in related functionality')
  }

  if (desc.includes('refactor') || title.includes('refactor')) {
    criteria.push('Code behavior is unchanged after refactoring')
    criteria.push('Existing tests still pass')
  }

  if (criteria.length === 0) {
    criteria.push('Implementation matches the PRD requirements')
    criteria.push('No type errors (`yarn rw type-check`)')
    criteria.push('Code follows project conventions')
  }

  return criteria
}

function generateFailureCriteria(task: Task): string[] {
  const criteria: string[] = []
  const desc = task.description.toLowerCase()

  criteria.push('Type errors exist after changes')
  criteria.push('Tests fail that were passing before')

  if (desc.includes('auth') || desc.includes('password') || desc.includes('login') || desc.includes('security')) {
    criteria.push('Security vulnerabilities introduced (injection, XSS, etc.)')
  }

  if (desc.includes('api') || desc.includes('interface') || desc.includes('contract')) {
    criteria.push('Breaking changes to existing API contracts')
  }

  return criteria
}

function buildPrompt(task: Task, retryContext: string = ''): string {
  const url = task.metadata?.url || task.metadata?.prdFile || ''
  const urlLine = url ? `\nSource: ${url}` : ''

  const successCriteria = generateSuccessCriteria(task)
  const failureCriteria = generateFailureCriteria(task)

  return `# Task: ${task.id}

## Title
${task.title}

## PRD (Product Requirements)
${task.description}

## Success Criteria
The task is considered COMPLETE when:
${successCriteria.map(c => `- [ ] ${c}`).join('\n')}

## Failure Criteria
The task should be marked FAILED if:
${failureCriteria.map(c => `- ${c}`).join('\n')}

## Instructions
1. Read the PRD carefully and understand the requirements
2. Implement the task as described
3. Verify against the success criteria above
4. Run relevant tests to verify your changes
5. If tests fail, fix the issues before marking complete

${retryContext ? `## Previous Attempt Context\n${retryContext}` : ''}

## Important
- Follow the project's coding style (no semicolons, single quotes, 2-space indent)
- Run \`yarn rw type-check\` before tests
- Self-verify against success criteria before marking complete
${urlLine}
`
}

export async function run(options: any = {}) {
  const config = await getConfig(options)
  const stateManager = new StateManager(config)
  const backend: TaskBackend = createBackend(config.backend)
  const cliExecutor = new CliExecutor(config)

  await plugins.runHook('onBackendReady', backend)

  if (config.resume) {
    const state = stateManager.loadState()
    if (!state) {
      logger.error('Cannot resume: no saved state')
      process.exit(1)
    }
    config.startTask = String(state.lastIssue)
    config.outputDir = state.lastOutputDir
    logger.info(`Resuming from task ${state.lastIssue}, iteration ${state.lastIteration}`)
  }

  if (!stateManager.acquireLock()) {
    process.exit(1)
  }

  let currentTaskId: string | null = null
  let currentIteration = 0

  const cleanup = () => {
    logger.warn('\nReceived interrupt signal. Saving state...')
    cliExecutor.killCurrent()
    if (currentTaskId) {
      const stateRef = parseInt(currentTaskId.replace(/\D/g, ''), 10) || 0
      stateManager.saveState(stateRef, currentIteration)
      logger.info('State saved. Resume with: --resume')
    }
    stateManager.releaseLock()
    process.exit(130)
  }

  process.on('SIGINT', cleanup)
  process.on('SIGTERM', cleanup)

  fs.mkdirSync(config.outputDir, { recursive: true })
  fs.mkdirSync(path.join(config.outputDir, 'logs'), { recursive: true })

  const namespace = stateManager.getNamespace()

  try {
    await plugins.register(createCostTrackingPlugin(config.projectRoot, namespace))
    logger.debug('Cost tracking plugin registered')
  } catch (e: any) {
    logger.debug(`Cost tracking plugin not registered: ${e.message}`)
  }

  const telegramToken = process.env.TELEGRAM_BOT_TOKEN || (config as any).telegram?.botToken
  const telegramChatId = process.env.TELEGRAM_CHAT_ID || (config as any).telegram?.chatId
  if (telegramToken && telegramChatId) {
    try {
      await plugins.register(createTelegramHookPlugin({
        botToken: telegramToken,
        chatId: telegramChatId,
      }))
      logger.info('Telegram notifications enabled')
    } catch (e: any) {
      logger.debug(`Telegram plugin not registered: ${e.message}`)
    }
  }

  await plugins.runHook('onLoopStart', namespace)

  logger.info('Loopwork Starting')
  logger.info('─────────────────────────────────────')
  logger.info(`Backend:        ${backend.name}`)
  if (config.backend.type === 'github') {
    logger.info(`Repo:           ${config.backend.repo || '(current)'}`)
  } else {
    logger.info(`Tasks File:     ${config.backend.tasksFile}`)
  }
  logger.info(`Feature:        ${config.feature || 'all'}`)
  logger.info(`Max Iterations: ${config.maxIterations}`)
  logger.info(`Timeout:        ${config.timeout}s per task`)
  logger.info(`CLI:            ${config.cli}`)
  logger.info(`Session ID:     ${config.sessionId}`)
  logger.info(`Output Dir:     ${config.outputDir}`)
  logger.info(`Dry Run:        ${config.dryRun}`)
  logger.info('─────────────────────────────────────')

  const pendingCount = await backend.countPending({ feature: config.feature })
  logger.info(`Pending tasks: ${pendingCount}`)

  if (pendingCount === 0) {
    logger.success('No pending tasks found!')
    stateManager.releaseLock()
    return
  }

  let iteration = 0
  let tasksCompleted = 0
  let tasksFailed = 0
  let consecutiveFailures = 0
  let retryContext = ''
  const maxRetries = config.maxRetries ?? 3
  const retryCount: Map<string, number> = new Map()

  while (iteration < config.maxIterations) {
    iteration++
    cliExecutor.resetFallback()

    if (consecutiveFailures >= (config.circuitBreakerThreshold ?? 5)) {
      logger.error(`Circuit breaker: ${consecutiveFailures} consecutive failures`)
      break
    }

    let task: Task | null = null

    if (config.startTask && iteration === 1) {
      task = await backend.getTask(config.startTask)
    } else {
      task = await backend.findNextTask({ feature: config.feature })
    }

    if (!task) {
      logger.success('No more pending tasks!')
      break
    }

    console.log('')
    logger.info('═══════════════════════════════════════════════════════════════')
    logger.info(`Iteration ${iteration} / ${config.maxIterations}`)
    logger.info(`Task:     ${task.id}`)
    logger.info(`Title:    ${task.title}`)
    logger.info(`Priority: ${task.priority}`)
    logger.info(`Feature:  ${task.feature || 'none'}`)
    if (task.metadata?.url) {
      logger.info(`URL:      ${task.metadata.url}`)
    }
    logger.info('═══════════════════════════════════════════════════════════════')
    console.log('')

    currentTaskId = task.id
    currentIteration = iteration
    const stateRef = parseInt(task.id.replace(/\D/g, ''), 10) || iteration
    stateManager.saveState(stateRef, iteration)

    if (config.dryRun) {
      logger.warn(`[DRY RUN] Would execute: ${task.id}`)
      logger.debug(`PRD preview:\n${task.description?.substring(0, 300)}...`)
      continue
    }

    await backend.markInProgress(task.id)

    const taskContext: TaskContext = {
      task,
      iteration,
      startTime: new Date(),
      namespace,
    }

    await plugins.runHook('onTaskStart', taskContext)

    const prompt = buildPrompt(task, retryContext)
    retryContext = ''

    const promptFile = path.join(config.outputDir, 'logs', `iteration-${iteration}-prompt.md`)
    fs.writeFileSync(promptFile, prompt)

    const outputFile = path.join(config.outputDir, 'logs', `iteration-${iteration}-output.txt`)

    const exitCode = await cliExecutor.execute(prompt, outputFile, config.timeout)

    if (exitCode === 0) {
      const comment = `Completed by Loopwork\n\nBackend: ${backend.name}\nSession: ${config.sessionId}\nIteration: ${iteration}`
      await backend.markCompleted(task.id, comment)

      let output = ''
      try {
        if (fs.existsSync(outputFile)) {
          output = fs.readFileSync(outputFile, 'utf-8')
        }
      } catch {}

      const duration = (Date.now() - taskContext.startTime.getTime()) / 1000
      await plugins.runHook('onTaskComplete', taskContext, { output, duration, success: true })

      tasksCompleted++
      consecutiveFailures = 0
      retryCount.delete(task.id)
      logger.success(`Task ${task.id} completed!`)
    } else {
      const currentRetries = retryCount.get(task.id) || 0

      if (currentRetries < maxRetries - 1) {
        retryCount.set(task.id, currentRetries + 1)
        logger.warn(`Task ${task.id} failed, retrying (${currentRetries + 2}/${maxRetries})...`)

        await backend.resetToPending(task.id)

        let logExcerpt = ''
        try {
          if (fs.existsSync(outputFile)) {
            const content = fs.readFileSync(outputFile, 'utf-8')
            logExcerpt = content.slice(-1000)
          }
        } catch {}

        retryContext = `## Previous Attempt Failed\nAttempt ${currentRetries + 1} failed. Log excerpt:\n\`\`\`\n${logExcerpt}\n\`\`\``

        await new Promise(r => setTimeout(r, config.retryDelay ?? 3000))
        continue
      } else {
        const errorMsg = `Max retries (${maxRetries}) reached\n\nSession: ${config.sessionId}\nIteration: ${iteration}`
        await backend.markFailed(task.id, errorMsg)

        await plugins.runHook('onTaskFailed', taskContext, errorMsg)

        tasksFailed++
        consecutiveFailures++
        retryCount.delete(task.id)
        logger.error(`Task ${task.id} failed after ${maxRetries} attempts`)
      }
    }

    await new Promise(r => setTimeout(r, config.taskDelay ?? 2000))
  }

  console.log('')
  logger.info('═══════════════════════════════════════════════════════════════')
  logger.info('Loopwork Complete')
  logger.info('═══════════════════════════════════════════════════════════════')
  logger.info(`Backend:         ${backend.name}`)
  logger.info(`Iterations:      ${iteration}`)
  logger.info(`Tasks Completed: ${tasksCompleted}`)
  logger.info(`Tasks Failed:    ${tasksFailed}`)
  logger.info(`Session ID:      ${config.sessionId}`)
  logger.info(`Output Dir:      ${config.outputDir}`)
  console.log('')

  const finalPending = await backend.countPending({ feature: config.feature })
  logger.info(`Final Status: ${finalPending} pending`)

  if (finalPending === 0) {
    logger.success('All tasks completed!')
    stateManager.clearState()
  }

  const loopDuration = Date.now() - (stateManager.loadState()?.startedAt || Date.now())
  await plugins.runHook('onLoopEnd', namespace, {
    completed: tasksCompleted,
    failed: tasksFailed,
    duration: loopDuration / 1000,
  })

  stateManager.releaseLock()
}
