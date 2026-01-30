import fs from 'fs'
import path from 'path'
import chalk from 'chalk'
import { getConfig, type Config } from '../core/config'
import { StateManager } from '../core/state'
import { createBackend, type TaskBackend, type Task } from '../backends'
import { CliExecutor } from '../core/cli'
import { logger } from '../core/utils'
import { plugins, createAIMonitor } from '../plugins'
import { createCostTrackingPlugin } from '../../../cost-tracking/src/index'
import { createTelegramHookPlugin } from '../../../telegram/src/notifications'
import type { TaskContext } from '../contracts/plugin'
import type { ICliExecutor } from '../contracts/executor'
import type { IStateManager, IStateManagerConstructor } from '../contracts/state'
import { LoopworkError, handleError } from '../core/errors'
import { ParallelRunner, type ParallelState } from '../core/parallel-runner'

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

/**
 * Run command - core task execution loop
 *
 * This is the main entry point for programmatic usage.
 * For CLI registration, use createRunCommand() instead.
 *
 * @param options - Runtime options (can override config file)
 */
export interface RunLogger {
  startSpinner(message: string): void
  stopSpinner(message?: string, symbol?: string): void
  info(message: string): void
  success(message: string): void
  warn(message: string): void
  error(message: string): void
  debug(message: string): void
  setLogFile(filePath: string): void
}

export interface RunDeps {
  getConfig?: typeof getConfig
  StateManagerClass?: IStateManagerConstructor
  createBackend?: typeof createBackend
  CliExecutorClass?: new (config: Config) => ICliExecutor
  logger?: RunLogger
  handleError?: typeof handleError
  process?: NodeJS.Process
  plugins?: typeof plugins
  createCostTrackingPlugin?: typeof createCostTrackingPlugin
  createTelegramHookPlugin?: typeof createTelegramHookPlugin
}

function resolveDeps(deps: RunDeps = {}) {
  return {
    getConfig: deps.getConfig ?? getConfig,
    StateManagerClass: deps.StateManagerClass ?? (StateManager as unknown as IStateManagerConstructor),
    createBackend: deps.createBackend ?? createBackend,
    CliExecutorClass: deps.CliExecutorClass ?? (CliExecutor as unknown as new (config: Config) => ICliExecutor),
    logger: deps.logger ?? logger,
    handleError: deps.handleError ?? handleError,
    process: deps.process ?? process,
    plugins: deps.plugins ?? plugins,
    createCostTrackingPlugin: deps.createCostTrackingPlugin ?? createCostTrackingPlugin,
    createTelegramHookPlugin: deps.createTelegramHookPlugin ?? createTelegramHookPlugin,
  }
}

export async function run(options: Record<string, unknown> = {}, deps: RunDeps = {}): Promise<void> {
  const {
    getConfig: loadConfig,
    StateManagerClass,
    createBackend: makeBackend,
    CliExecutorClass,
    logger: activeLogger,
    handleError: handleLoopworkError,
    process: runtimeProcess,
    plugins: activePlugins,
    createCostTrackingPlugin: makeCostTrackingPlugin,
    createTelegramHookPlugin: makeTelegramHookPlugin,
  } = resolveDeps(deps)

  activeLogger.startSpinner('Initializing Loopwork...')
  const config = await loadConfig(options)
  const stateManager: IStateManager = new StateManagerClass(config)
  const backend: TaskBackend = makeBackend(config.backend)
  const cliExecutor = new CliExecutorClass(config)

  await activePlugins.runHook('onBackendReady', backend)
  activeLogger.stopSpinner('Loopwork initialized')

  if (config.resume) {
    const state = stateManager.loadState()
    if (!state) {
      const stateDir = path.resolve(config.projectRoot, '.loopwork')
      handleLoopworkError(new LoopworkError(
        'Cannot resume: no saved state found',
        [
          'State is created after your first task execution starts',
          `Check if ${stateDir} directory exists`,
          'Run without --resume to start a new session',
          'State is cleared when all tasks complete successfully'
        ]
      ))
      runtimeProcess.exit(1)
    }
    config.startTask = String(state.lastIssue)
    config.outputDir = state.lastOutputDir
    activeLogger.info(`Resuming from task ${state.lastIssue}, iteration ${state.lastIteration}`)
  }

  if (!stateManager.acquireLock()) {
    const lockFile = path.resolve(config.projectRoot, '.loopwork', 'loopwork.lock')
    handleLoopworkError(new LoopworkError(
      'Failed to acquire lock: another Loopwork instance is running',
      [
        'Wait for the other instance to finish',
        'Or manually remove the lock file if the process is no longer running:',
        `  rm ${lockFile}`,
        'Check for running Loopwork processes: ps aux | grep loopwork'
      ]
    ))
    runtimeProcess.exit(1)
  }

  let currentTaskId: string | null = null
  let currentIteration = 0

  const cleanup = async () => {
    activeLogger.warn('\nReceived interrupt signal. Saving state...')

    // Clean up processes (kills current + orphans)
    await cliExecutor.cleanup().catch(err => {
      activeLogger.debug(`Process cleanup failed: ${err.message}`)
    })

    if (currentTaskId) {
      const stateRef = parseInt(currentTaskId.replace(/\D/g, ''), 10) || 0
      stateManager.saveState(stateRef, currentIteration)
      activeLogger.info('State saved. Resume with: --resume')
    }
    stateManager.releaseLock()
    runtimeProcess.exit(130)
  }

  runtimeProcess.on('SIGINT', () => {
    cleanup().catch(() => {
      runtimeProcess.exit(130)
    })
  })
  runtimeProcess.on('SIGTERM', () => {
    cleanup().catch(() => {
      runtimeProcess.exit(130)
    })
  })

  fs.mkdirSync(config.outputDir, { recursive: true })
  fs.mkdirSync(path.join(config.outputDir, 'logs'), { recursive: true })
  activeLogger.setLogFile(path.join(config.outputDir, 'loopwork.log'))

  const namespace = config.namespace || stateManager.getNamespace?.() || 'default'

  try {
    await activePlugins.register(makeCostTrackingPlugin(config.projectRoot, namespace))
    activeLogger.debug('Cost tracking plugin registered')
  } catch (e: unknown) {
    activeLogger.debug(`Cost tracking plugin not registered: ${e instanceof Error ? e.message : String(e)}`)
  }

  const telegramToken = runtimeProcess.env.TELEGRAM_BOT_TOKEN || (config as { telegram?: { botToken?: string } }).telegram?.botToken
  const telegramChatId = runtimeProcess.env.TELEGRAM_CHAT_ID || (config as { telegram?: { chatId?: string } }).telegram?.chatId
  if (telegramToken && telegramChatId) {
    try {
      await activePlugins.register(makeTelegramHookPlugin({
        botToken: telegramToken,
        chatId: telegramChatId,
      }))
      activeLogger.info('Telegram notifications enabled')
    } catch (e: unknown) {
      activeLogger.debug(`Telegram plugin not registered: ${(e as Error).message}`)
    }
  }

  if (options.withAiMonitor) {
    try {
      await activePlugins.register(createAIMonitor())
      activeLogger.info('AI Monitor enabled')
    } catch (e: unknown) {
      activeLogger.debug(`AI Monitor not registered: ${e instanceof Error ? e.message : String(e)}`)
    }
  }

  await activePlugins.runHook('onLoopStart', namespace)

  activeLogger.info('Loopwork Starting')
  activeLogger.info('─────────────────────────────────────')
  activeLogger.info(`Backend:        ${backend.name}`)
  if (config.backend.type === 'github') {
    activeLogger.info(`Repo:           ${config.backend.repo || '(current)'}`)
  } else {
    activeLogger.info(`Tasks File:     ${config.backend.tasksFile}`)
  }
  activeLogger.info(`Feature:        ${config.feature || 'all'}`)
  activeLogger.info(`Max Iterations: ${config.maxIterations}`)
  activeLogger.info(`Timeout:        ${config.timeout}s per task`)
  activeLogger.info(`CLI:            ${config.cli}`)
  activeLogger.info(`Parallel:       ${config.parallel > 1 ? `${config.parallel} workers` : 'off (sequential)'}`)
  if (config.parallel > 1) {
    activeLogger.info(`Failure Mode:   ${config.parallelFailureMode}`)
  }
  activeLogger.info(`Session ID:     ${config.sessionId}`)
  activeLogger.info(`Output Dir:     ${config.outputDir}`)
  activeLogger.info(`Dry Run:        ${config.dryRun}`)
  activeLogger.info('─────────────────────────────────────')

  let pendingCount = 0
  try {
    activeLogger.startSpinner('Fetching pending tasks...')
    pendingCount = await backend.countPending({ feature: config.feature })
    activeLogger.stopSpinner(`Found ${pendingCount} pending tasks`)
  } catch (error: unknown) {
    const suggestions: string[] = ['Check backend connectivity and permissions']
    if (config.backend.type === 'json') {
      suggestions.push(`Verify tasks file exists: ${config.backend.tasksFile}`)
      suggestions.push('Ensure the file is valid JSON')
    } else if (config.backend.type === 'github') {
      suggestions.push('Check GitHub token (GITHUB_TOKEN env var)')
      suggestions.push('Verify network connectivity')
    }
    handleLoopworkError(new LoopworkError(
      `Failed to count pending tasks: ${error.message}`,
      suggestions
    ))
    stateManager.releaseLock()
    runtimeProcess.exit(1)
  }

  if (pendingCount === 0) {
    activeLogger.info('No pending tasks found')
    runtimeProcess.stdout.write('\n')
    activeLogger.info('💡 Create tasks in .specs/tasks/tasks.json')
    activeLogger.info('💡 Or run: npx loopwork task-new')
    runtimeProcess.stdout.write('\n')
    stateManager.releaseLock()
    return
  }

  // Branch: Parallel execution mode
  if (config.parallel > 1) {
    await runParallel(
      config,
      backend,
      cliExecutor,
      stateManager,
      namespace,
      activePlugins,
      activeLogger,
      handleLoopworkError,
      runtimeProcess
    )
    return
  }

  // Sequential execution mode (original behavior)
  let iteration = 0
  let tasksCompleted = 0
  let tasksFailed = 0
  let consecutiveFailures = 0
  let retryContext = ''
  const maxRetries = config.maxRetries ?? 3
  const retryCount: Map<string, number> = new Map()

  while (iteration < (config.maxIterations || 50)) {
    iteration++
    cliExecutor.resetFallback()

    if (consecutiveFailures >= (config.circuitBreakerThreshold ?? 5)) {
      handleLoopworkError(new LoopworkError(
        `Circuit breaker activated: ${consecutiveFailures} consecutive task failures`,
        [
          'The circuit breaker stops execution after too many failures to prevent wasting resources',
          'Resume from the last successful state: npx loopwork --resume',
          `Adjust threshold in config: circuitBreakerThreshold (current: ${config.circuitBreakerThreshold ?? 5})`,
          'Review failed task logs in the output directory for patterns',
          'Check if there are systemic issues (missing dependencies, config errors, etc.)'
        ]
      ))
      break
    }

    let task: Task | null = null

    try {
      activeLogger.startSpinner('Searching for next task...')
      if (config.startTask && iteration === 1) {
        task = await backend.getTask(config.startTask)
      } else {
        task = await backend.findNextTask({ feature: config.feature })
      }
      
      if (task) {
        activeLogger.stopSpinner(`Found task ${task.id}: ${task.title}`)
      } else {
        activeLogger.stopSpinner('No more pending tasks')
      }
    } catch (error: unknown) {
      const suggestions: string[] = []
      if (config.backend.type === 'json') {
        suggestions.push('Check if tasks file exists and has correct format')
        suggestions.push(`Verify file path: ${config.backend.tasksFile}`)
        suggestions.push('Ensure you have read permissions for the tasks file')
      } else if (config.backend.type === 'github') {
        suggestions.push('Check your GitHub token permissions (GITHUB_TOKEN env var)')
        suggestions.push('Verify repository access and network connectivity')
        suggestions.push(`Check repo format: ${config.backend.repo || '(current repo)'}`)
      }
      handleLoopworkError(new LoopworkError(
        `Failed to fetch task from backend: ${error.message}`,
        suggestions
      ))
      stateManager.releaseLock()
      runtimeProcess.exit(1)
    }

    if (!task) {
      activeLogger.success('No more pending tasks!')
      break
    }

    runtimeProcess.stdout.write('\n')
    activeLogger.info('═══════════════════════════════════════════════════════════════')
    activeLogger.info(`Iteration ${iteration} / ${config.maxIterations}`)
    activeLogger.info(`Task:     ${task.id}`)
    activeLogger.info(`Title:    ${task.title}`)
    activeLogger.info(`Priority: ${task.priority}`)
    activeLogger.info(`Feature:  ${task.feature || 'none'}`)
    if (task.metadata?.url) {
      activeLogger.info(`URL:      ${task.metadata.url}`)
    }
    activeLogger.info('═══════════════════════════════════════════════════════════════')
    runtimeProcess.stdout.write('\n')

    currentTaskId = task.id
    currentIteration = iteration
    const stateRef = parseInt(task.id.replace(/\D/g, ''), 10) || iteration
    stateManager.saveState(stateRef, iteration)

    if (config.dryRun) {
      activeLogger.warn(`[DRY RUN] Would execute: ${task.id}`)
      activeLogger.debug(`PRD preview:\n${task.description?.substring(0, 300)}...`)
      continue
    }

    try {
      await backend.markInProgress(task.id)
    } catch (error: unknown) {
      handleLoopworkError(new LoopworkError(
        `Failed to mark task ${task.id} as in-progress: ${error.message}`,
        [
          'Check file/database permissions for the backend',
          'Ensure the task ID is valid and exists',
          'If using JSON backend, check for file lock conflicts'
        ]
      ))
      continue
    }

    const taskContext: TaskContext = {
      task,
      iteration,
      startTime: new Date(),
      namespace,
    }

    await activePlugins.runHook('onTaskStart', taskContext)

    const prompt = buildPrompt(task, retryContext)
    retryContext = ''

    const promptFile = path.join(config.outputDir, 'logs', `iteration-${iteration}-prompt.md`)
    fs.writeFileSync(promptFile, prompt)

    const outputFile = path.join(config.outputDir, 'logs', `iteration-${iteration}-output.txt`)

    let exitCode: number
    try {
      activeLogger.startSpinner(`Executing task ${task.id}...`)
      exitCode = await cliExecutor.execute(prompt, outputFile, config.timeout || 600, task.id)
      activeLogger.stopSpinner()
    } catch (error: unknown) {
      if (error instanceof LoopworkError) {
        handleLoopworkError(error)
        
        try {
          await backend.resetToPending(task.id)
        } catch {}
        
        activeLogger.info('\\n💡 Resolve the issue above and restart with: npx loopwork --resume')
        stateManager.releaseLock()
        runtimeProcess.exit(1)
      }
      throw error
    }

    if (exitCode === 0) {
      const comment = `Completed by Loopwork\n\nBackend: ${backend.name}\nSession: ${config.sessionId}\nIteration: ${iteration}`
      try {
        await backend.markCompleted(task.id, comment)
      } catch (error: unknown) {
        handleLoopworkError(new LoopworkError(
          `Task succeeded but failed to mark as completed in backend: ${error.message}`,
          [
            'The task execution was successful but could not be saved',
            'Check backend connectivity and permissions',
            'You may need to manually mark the task as completed'
          ]
        ))
        continue
      }

      let output = ''
      try {
        if (fs.existsSync(outputFile)) {
          output = fs.readFileSync(outputFile, 'utf-8')
        }
      } catch {}

      const duration = (Date.now() - taskContext.startTime.getTime()) / 1000
      await activePlugins.runHook('onTaskComplete', taskContext, { output, duration, success: true })

      tasksCompleted++
      consecutiveFailures = 0
      retryCount.delete(task.id)
      activeLogger.success(`Task ${task.id} completed!`)
    } else {
      const currentRetries = retryCount.get(task.id) || 0

      if (currentRetries < maxRetries - 1) {
        retryCount.set(task.id, currentRetries + 1)
        activeLogger.warn(`Task ${task.id} failed, retrying (${currentRetries + 2}/${maxRetries})...`)

        try {
          await backend.resetToPending(task.id)
        } catch (error: unknown) {
          handleLoopworkError(new LoopworkError(
            `Failed to reset task ${task.id} to pending: ${error.message}`,
            [
              'Check backend connectivity and permissions',
              'The task may need manual intervention'
            ]
          ))
          continue
        }

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

        try {
          await backend.markFailed(task.id, errorMsg)
        } catch (error: unknown) {
          handleLoopworkError(new LoopworkError(
            `Task failed and could not be marked as failed in backend: ${error.message}`,
            [
              'The task execution failed multiple times',
              'Backend operation also failed - check connectivity',
              'Manual intervention may be required'
            ]
          ))
        }

        await activePlugins.runHook('onTaskFailed', taskContext, errorMsg)

        tasksFailed++
        consecutiveFailures++
        retryCount.delete(task.id)

        runtimeProcess.stdout.write('\n')
        activeLogger.error(`Task ${task.id} failed after ${maxRetries} attempts`)
        
        let lastOutput = ''
        try {
          if (fs.existsSync(outputFile)) {
            const content = fs.readFileSync(outputFile, 'utf-8')
            const lines = content.split('\n').filter(l => l.trim())
            lastOutput = lines.slice(-10).join('\n')
          }
        } catch {}

        if (lastOutput) {
          runtimeProcess.stdout.write('\n')
          runtimeProcess.stdout.write(chalk.gray('Last 10 lines of output:') + '\n')
          runtimeProcess.stdout.write(chalk.gray('─────────────────────────────────────') + '\n')
          runtimeProcess.stdout.write(chalk.dim(lastOutput) + '\n')
          runtimeProcess.stdout.write(chalk.gray('─────────────────────────────────────') + '\n')
          runtimeProcess.stdout.write('\n')
        }

        const prdPath = task.metadata?.prdFile || `.specs/tasks/${task.id}.md`
        activeLogger.info(`💡 Check task requirements in ${prdPath}`)
        activeLogger.info(`💡 Check full output: ${outputFile}`)
        activeLogger.info(`💡 Skip task: npx loopwork --skip ${task.id}`)
        activeLogger.info(`💡 Adjust retry limit in config: maxRetries (current: ${maxRetries})`)
        runtimeProcess.stdout.write('\n')
      }
    }

    await new Promise(r => setTimeout(r, config.taskDelay ?? 2000))
  }

  runtimeProcess.stdout.write('\n')
  activeLogger.info('═══════════════════════════════════════════════════════════════')
  activeLogger.info('Loopwork Complete')
  activeLogger.info('═══════════════════════════════════════════════════════════════')
  activeLogger.info(`Backend:         ${backend.name}`)
  activeLogger.info(`Iterations:      ${iteration}`)
  activeLogger.info(`Tasks Completed: ${tasksCompleted}`)
  activeLogger.info(`Tasks Failed:    ${tasksFailed}`)
  activeLogger.info(`Session ID:      ${config.sessionId}`)
  activeLogger.info(`Output Dir:      ${config.outputDir}`)
  runtimeProcess.stdout.write('\n')

  let finalPending = 0
  try {
    finalPending = await backend.countPending({ feature: config.feature })
    activeLogger.info(`Final Status: ${finalPending} pending`)
  } catch (error: unknown) {
    activeLogger.warn(`Could not get final task count: ${error.message}`)
  }

  if (finalPending === 0) {
    activeLogger.success('All tasks completed!')
    stateManager.clearState()
  }

  const loopDuration = Date.now() - (stateManager.loadState()?.startedAt || Date.now())
  await activePlugins.runHook('onLoopEnd', namespace, {
    completed: tasksCompleted,
    failed: tasksFailed,
    duration: loopDuration / 1000,
  })

  stateManager.releaseLock()
}

/**
 * Run in parallel mode
 */
async function runParallel(
  config: Config,
  backend: TaskBackend,
  cliExecutor: ICliExecutor,
  stateManager: IStateManager,
  namespace: string,
  activePlugins: typeof plugins,
  activeLogger: RunLogger,
  handleLoopworkError: typeof handleError,
  runtimeProcess: NodeJS.Process
): Promise<void> {
  const parallelRunner = new ParallelRunner({
    config,
    backend,
    cliExecutor,
    logger: activeLogger,
    onTaskStart: async (context) => {
      await activePlugins.runHook('onTaskStart', context)
    },
    onTaskComplete: async (context, result) => {
      await activePlugins.runHook('onTaskComplete', context, result)
    },
    onTaskFailed: async (context, error) => {
      await activePlugins.runHook('onTaskFailed', context, error)
    },
    buildPrompt,
  })

  // Handle interrupt signals
  const parallelCleanup = async () => {
    activeLogger.warn('\nReceived interrupt signal. Saving parallel state...')
    parallelRunner.abort()

    // Clean up processes
    await cliExecutor.cleanup().catch(err => {
      activeLogger.debug(`Process cleanup failed: ${err.message}`)
    })

    // Save parallel state for resume
    const state = parallelRunner.getState()
    saveParallelState(config.projectRoot, config.namespace || 'default', state)

    // Reset interrupted tasks
    await parallelRunner.resetInterruptedTasks(state.interruptedTasks)

    activeLogger.info('State saved. Resume with: --resume')
    stateManager.releaseLock()
    runtimeProcess.exit(130)
  }

  // Override signal handlers for parallel mode
  runtimeProcess.removeAllListeners('SIGINT')
  runtimeProcess.removeAllListeners('SIGTERM')
  runtimeProcess.on('SIGINT', () => {
    parallelCleanup().catch(() => runtimeProcess.exit(130))
  })
  runtimeProcess.on('SIGTERM', () => {
    parallelCleanup().catch(() => runtimeProcess.exit(130))
  })

  // Check for resume state
  if (config.resume) {
    const parallelState = loadParallelState(config.projectRoot, config.namespace || 'default')
    if (parallelState && parallelState.interruptedTasks.length > 0) {
      activeLogger.info(`Resuming ${parallelState.interruptedTasks.length} interrupted task(s)`)
      await parallelRunner.resetInterruptedTasks(parallelState.interruptedTasks)
    }
  }

  try {
    const stats = await parallelRunner.run({ feature: config.feature })

    runtimeProcess.stdout.write('\n')
    activeLogger.info('═══════════════════════════════════════════════════════════════')
    activeLogger.info('Loopwork Complete (Parallel Mode)')
    activeLogger.info('═══════════════════════════════════════════════════════════════')
    activeLogger.info(`Backend:         ${backend.name}`)
    activeLogger.info(`Workers:         ${stats.workers}`)
    activeLogger.info(`Tasks Completed: ${stats.completed}`)
    activeLogger.info(`Tasks Failed:    ${stats.failed}`)
    activeLogger.info(`Duration:        ${stats.duration.toFixed(1)}s`)
    activeLogger.info(`Session ID:      ${config.sessionId}`)
    activeLogger.info(`Output Dir:      ${config.outputDir}`)

    if (stats.tasksPerWorker) {
      activeLogger.info(`Tasks/Worker:    ${stats.tasksPerWorker.map((c, i) => `W${i}:${c}`).join(', ')}`)
    }
    runtimeProcess.stdout.write('\n')

    let finalPending = 0
    try {
      finalPending = await backend.countPending({ feature: config.feature })
      activeLogger.info(`Final Status: ${finalPending} pending`)
    } catch (error: unknown) {
      activeLogger.warn(`Could not get final task count: ${(error as Error).message}`)
    }

    if (finalPending === 0) {
      activeLogger.success('All tasks completed!')
      stateManager.clearState()
      clearParallelState(config.projectRoot, config.namespace || 'default')
    }

    await activePlugins.runHook('onLoopEnd', namespace, stats)
  } catch (error) {
    if (error instanceof LoopworkError) {
      handleLoopworkError(error)
    } else {
      activeLogger.error(`Parallel execution error: ${error}`)
    }
  } finally {
    stateManager.releaseLock()
  }
}

/**
 * Save parallel state for resume
 */
function saveParallelState(projectRoot: string, namespace: string, state: ParallelState): void {
  const stateDir = path.join(projectRoot, '.loopwork')
  fs.mkdirSync(stateDir, { recursive: true })

  const suffix = namespace === 'default' ? '' : `-${namespace}`
  const stateFile = path.join(stateDir, `parallel-state${suffix}.json`)

  fs.writeFileSync(stateFile, JSON.stringify(state, null, 2))
}

/**
 * Load parallel state for resume
 */
function loadParallelState(projectRoot: string, namespace: string): ParallelState | null {
  const suffix = namespace === 'default' ? '' : `-${namespace}`
  const stateFile = path.join(projectRoot, '.loopwork', `parallel-state${suffix}.json`)

  if (!fs.existsSync(stateFile)) {
    return null
  }

  try {
    const content = fs.readFileSync(stateFile, 'utf-8')
    return JSON.parse(content) as ParallelState
  } catch {
    return null
  }
}

/**
 * Clear parallel state after successful completion
 */
function clearParallelState(projectRoot: string, namespace: string): void {
  const suffix = namespace === 'default' ? '' : `-${namespace}`
  const stateFile = path.join(projectRoot, '.loopwork', `parallel-state${suffix}.json`)

  try {
    if (fs.existsSync(stateFile)) {
      fs.unlinkSync(stateFile)
    }
  } catch {
    // Ignore cleanup errors
  }
}

/**
 * Create the run command configuration for CLI registration
 *
 * This returns a command object suitable for use with commander or similar CLI frameworks.
 * The run() function is exposed separately for programmatic usage.
 */
export function createRunCommand() {
  return {
    name: 'run',
    description: 'Execute the main task automation loop',
    usage: '[options]',
    examples: [
      { command: 'loopwork run', description: 'Run with config file settings' },
      { command: 'loopwork run --resume', description: 'Resume from saved state' },
      { command: 'loopwork run --feature auth', description: 'Process only auth-tagged tasks' },
      { command: 'loopwork run --dry-run', description: 'Preview tasks without executing' },
      { command: 'loopwork run --max-iterations 10 --timeout 300', description: 'Custom limits' },
      { command: 'loopwork run --parallel', description: 'Run with 2 parallel workers' },
      { command: 'loopwork run --parallel 3', description: 'Run with 3 parallel workers' },
      { command: 'loopwork run --sequential', description: 'Force sequential mode' },
    ],
    seeAlso: [
      'loopwork start    Start with optional daemon mode',
      'loopwork init     Initialize a new project',
      'loopwork status   Check running processes',
    ],
    handler: run,
  }
}
