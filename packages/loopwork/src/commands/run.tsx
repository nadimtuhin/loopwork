import React from 'react'
import fs from 'fs'
import path from 'path'
import chalk from 'chalk'
import { getConfig, type Config } from '../core/config'
import { StateManager } from '../core/state'
import { createBackend, type TaskBackend, type Task } from '../backends'
import { CliExecutor } from '../core/cli'
import { logger, separator, InkBanner, InkCompletionSummary, renderInk } from '../core/utils'
import { plugins, createAIMonitor } from '../plugins'
import { createCostTrackingPlugin } from '@loopwork-ai/cost-tracking'
import { createTelegramHookPlugin } from '@loopwork-ai/telegram'
import type { TaskContext } from '../contracts/plugin'
import type { ICliExecutor } from '../contracts/executor'
import type { IStateManager, IStateManagerConstructor } from '../contracts/state'
import type { RunLogger } from '../contracts/logger'
import { LoopworkError, handleError } from '../core/errors'
import { ParallelRunner, type ParallelState } from '../core/parallel-runner'
import { RetryBudget } from '../core/retry-budget'
import { failureState } from '../core/failure-state'
import { LoopworkMonitor } from '../monitor'
import type { JsonEvent } from '../contracts/output'



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


export interface RunDeps {
  getConfig?: typeof getConfig
  StateManagerClass?: IStateManagerConstructor
  createBackend?: typeof createBackend
  CliExecutorClass?: new (config: Config, options: unknown) => ICliExecutor
  logger?: RunLogger
  handleError?: typeof handleError
  process?: NodeJS.Process
  plugins?: typeof plugins
  createCostTrackingPlugin?: typeof createCostTrackingPlugin
  createTelegramHookPlugin?: typeof createTelegramHookPlugin
  json?: boolean
}

function resolveDeps(deps: RunDeps = {}) {
  return {
    getConfig: deps.getConfig ?? getConfig,
    StateManagerClass: deps.StateManagerClass ?? (StateManager as unknown as IStateManagerConstructor),
    createBackend: deps.createBackend ?? createBackend,
    CliExecutorClass: deps.CliExecutorClass ?? (CliExecutor as unknown as new (config: Config, options: unknown) => ICliExecutor),
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

  const isJsonMode = options.json === true

  // Note: Verbosity flags are now handled globally via preAction hook in index.ts
  // This ensures consistent behavior across all commands

  // Set output format on logger if supported
  if (isJsonMode && activeLogger.setOutputFormat) {
    activeLogger.setOutputFormat('json')
  }

  if (!isJsonMode) {
    activeLogger.startSpinner('Initializing Loopwork...')
  }
  const config = await loadConfig(options)
  const stateManager: IStateManager = new StateManagerClass(config)
  const backend: TaskBackend = makeBackend(config.backend)

  // Initialize debugger if requested
  let dbg: Record<string, unknown> | undefined
  if (options.debugger) {
    const { Debugger } = await import('../core/debugger')
    dbg = new Debugger()
    dbg.setEnabled(true)
  }

  const cliExecutor = new CliExecutorClass(config, { 
    debugger: dbg,
    pluginRegistry: activePlugins,
    logger: activeLogger
  })

  // Register AI Monitor plugin if --with-ai-monitor flag is set
  if (options.withAIMonitor || options['with-ai-monitor']) {
    const aiMonitor = createAIMonitor({
      enabled: true,
      llmModel: options.model as string | undefined
    })
    activePlugins.register(aiMonitor)
  }

  // Override dynamicTasks config if --no-dynamic-tasks flag is set
  if (options.dynamicTasks === false || options['no-dynamic-tasks']) {
    if (config.dynamicTasks) {
      config.dynamicTasks = {
        ...config.dynamicTasks,
        enabled: false,
      }
    }
  }

  // Initialize orphan watch if configured
  let monitor: LoopworkMonitor | null = null
  if (config.orphanWatch?.enabled) {
    monitor = new LoopworkMonitor(config.projectRoot)
    monitor.startOrphanWatch({
      interval: config.orphanWatch.interval,
      maxAge: config.orphanWatch.maxAge,
      autoKill: config.orphanWatch.autoKill,
      patterns: config.orphanWatch.patterns,
    })
    activeLogger.debug('Orphan watch started')
  }

  await activePlugins.runHook('onBackendReady', backend)
  if (!isJsonMode) {
    activeLogger.stopSpinner('Loopwork initialized')
  }

  // Clean up stale in-progress tasks on startup (unless resuming)
  if (!config.resume && backend.resetAllInProgress) {
    try {
      const result = await backend.resetAllInProgress()
      if (result.success) {
        activeLogger.debug('Reset any stale in-progress tasks to pending')
      }
    } catch (e) {
      activeLogger.debug(`Failed to reset stale tasks: ${e}`)
    }
  }

  if (config.resume) {
    const state = stateManager.loadState()
    if (!state) {
      const stateDir = path.resolve(config.projectRoot, '.loopwork')
      handleLoopworkError(new LoopworkError(
        'ERR_STATE_INVALID',
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
      'ERR_LOCK_CONFLICT',
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
  let currentTaskContext: TaskContext | null = null
  let isCleaningUp = false

  const cleanup = async () => {
    if (isCleaningUp) {
      return // Prevent multiple cleanup calls
    }
    isCleaningUp = true
    activeLogger.warn('\nReceived interrupt signal. Saving state...')

    // Notify plugins of task abort
    if (currentTaskContext) {
      await activePlugins.runHook('onTaskAbort', currentTaskContext)
    }

    // Stop orphan watch if running
    if (monitor) {
      monitor.stopOrphanWatch()
    }

    // Clean up processes (kills current + orphans)
    await cliExecutor.cleanup().catch(err => {
      activeLogger.debug(`Process cleanup failed: ${err.message}`)
    })

    if (currentTaskId) {
      const stateRef = parseInt(currentTaskId.replace(/\D/g, ''), 10) || 0
      stateManager.saveState(stateRef, currentIteration)

      // Reset in-progress task to pending
      try {
        await backend.resetToPending(currentTaskId)
        activeLogger.info(`Task ${currentTaskId} reset to pending`)
      } catch (err) {
        activeLogger.debug(`Failed to reset task: ${err}`)
      }

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

  // Register plugins from config
  if (config.plugins && config.plugins.length > 0) {
    for (const plugin of config.plugins) {
      try {
        activePlugins.register(plugin)
        activeLogger.debug(`Registered plugin: ${plugin.name}`)
      } catch (e) {
        activeLogger.warn(`Failed to register plugin ${plugin.name}: ${e instanceof Error ? e.message : String(e)}`)
      }
    }
  }

  // Load and register dynamic plugins
  if (config.dynamicPlugins && config.dynamicPlugins.length > 0) {
    try {
      const { loadDynamicPlugins } = await import('../core/plugin-loader')
      const loadedPlugins = await loadDynamicPlugins(config.dynamicPlugins, config.projectRoot)
      for (const plugin of loadedPlugins) {
        activePlugins.register(plugin)
        activeLogger.info(`Loaded dynamic plugin: ${plugin.name}`)
      }
    } catch (e) {
      handleLoopworkError(new LoopworkError(
        'ERR_PLUGIN_LOAD',
        `Failed to load dynamic plugins: ${e instanceof Error ? e.message : String(e)}`,
        ['Check your dynamicPlugins configuration in loopwork.config.ts']
      ))
    }
  }

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

  // Display startup configuration
  if (isJsonMode) {
    activeLogger.emitJsonEvent('info', 'run', {
      namespace,
      backend: backend.name,
      backendConfig: config.backend.type === 'github'
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ? { repo: (config.backend as any).repo || '(current)' }
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        : { tasksFile: (config.backend as any).tasksFile },
      feature: config.feature || 'all',
      maxIterations: config.maxIterations,
      timeout: config.timeout,
      cli: config.cli,
      parallel: config.parallel > 1 ? config.parallel : false,
      parallelFailureMode: config.parallel > 1 ? config.parallelFailureMode : undefined,
      sessionId: config.sessionId,
      outputDir: config.outputDir,
      dryRun: config.dryRun,
    })
  } else {
    activeLogger.raw('')
    const startupBannerOutput = await renderInk(
      <InkBanner
        title="Loopwork Starting"
        rows={[
          { key: 'Backend', value: backend.name },
          ...(config.backend?.type === 'github'
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            ? [{ key: 'Repo', value: (config.backend as any).repo || '(current)' }]
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            : (config.backend as any)?.tasksFile
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            ? [{ key: 'Tasks File', value: (config.backend as any).tasksFile }]
            : []),
          { key: 'Feature', value: config.feature || 'all' },
          { key: 'Max Iterations', value: config.maxIterations.toString() },
          { key: 'Timeout', value: `${config.timeout}s per task` },
          { key: 'CLI', value: config.cli },
          { key: 'Parallel', value: config.parallel > 1 ? `${config.parallel} workers` : 'off (sequential)' },
          ...(config.parallel > 1 ? [{ key: 'Failure Mode', value: config.parallelFailureMode }] : []),
          { key: 'Session ID', value: config.sessionId },
          { key: 'Output Dir', value: config.outputDir },
          { key: 'Dry Run', value: config.dryRun.toString() },
        ]}
      />
    )
    activeLogger.raw(startupBannerOutput)
    activeLogger.raw('')
  }

  let pendingCount = 0
  try {
    if (!isJsonMode) {
      activeLogger.startSpinner('Fetching pending tasks...')
    }
    pendingCount = await backend.countPending({ feature: config.feature })
    if (isJsonMode) {
      activeLogger.emitJsonEvent('info', 'run', { pendingTasks: pendingCount })
    } else {
      activeLogger.stopSpinner(`Found ${pendingCount} pending tasks`)
    }
  } catch (error: unknown) {
    const suggestions: string[] = ['Check backend connectivity and permissions']
      if (config.backend.type === 'json') {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        suggestions.push(`Verify tasks file exists: ${(config.backend as any).tasksFile}`)
        suggestions.push('Ensure the file is valid JSON')
    } else if (config.backend.type === 'github') {
      suggestions.push('Check GitHub token (GITHUB_TOKEN env var)')
      suggestions.push('Verify network connectivity')
    }
    handleLoopworkError(new LoopworkError(
      'ERR_BACKEND_INVALID',
      `Failed to count pending tasks: ${error.message}`,
      suggestions
    ))
    stateManager.releaseLock()
    runtimeProcess.exit(1)
  }

  if (pendingCount === 0) {
    if (isJsonMode) {
      activeLogger.emitJsonEvent('info', 'run', { message: 'No pending tasks found' })
    } else {
      activeLogger.info('No pending tasks found')
      activeLogger.raw('')
      activeLogger.info('💡 Create tasks in .specs/tasks/tasks.json')
      activeLogger.info('💡 Or run: npx loopwork task-new')
      activeLogger.raw('')
    }
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
      runtimeProcess,
      isJsonMode
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

  const retryBudget = new RetryBudget(
    config.retryBudget?.maxRetries || 50,
    config.retryBudget?.windowMs || 3600000,
    config.retryBudget?.persistence !== false
  )

  while (iteration < (config.maxIterations || 50)) {
    iteration++
    cliExecutor.resetFallback()

    if (consecutiveFailures >= (config.circuitBreakerThreshold ?? 5)) {
      handleLoopworkError(new LoopworkError(
        'ERR_TASK_INVALID',
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
        // Sync failure state from backend
        if (task.failureCount) {
          failureState.setFailureState(task.id, task.failureCount, task.lastError || 'Previously failed')
        }
      } else {
        activeLogger.stopSpinner('No more pending tasks')
      }
    } catch (error: unknown) {
      const suggestions: string[] = []
      if (config.backend.type === 'json') {
        suggestions.push('Check if tasks file exists and has correct format')
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        suggestions.push(`Verify file path: ${(config.backend as any).tasksFile}`)
        suggestions.push('Ensure you have read permissions for the tasks file')
      } else if (config.backend.type === 'github') {
        suggestions.push('Check your GitHub token permissions (GITHUB_TOKEN env var)')
        suggestions.push('Verify repository access and network connectivity')
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        suggestions.push(`Check repo format: ${(config.backend as any).repo || '(current repo)'}`)
      }
      handleLoopworkError(new LoopworkError(
        'ERR_BACKEND_INVALID',
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

    if (isJsonMode) {
      activeLogger.emitJsonEvent('progress', 'run', {
        iteration,
        maxIterations: config.maxIterations,
        taskId: task.id,
        taskTitle: task.title,
        taskPriority: task.priority,
        taskFeature: task.feature || 'none',
        taskUrl: task.metadata?.url,
      })
    } else {
      activeLogger.raw('')
      activeLogger.raw(separator('heavy'))
      activeLogger.info(`Iteration ${iteration} / ${config.maxIterations}`)
      activeLogger.info(`Task:     ${task.id}`)
      activeLogger.info(`Title:    ${task.title}`)
      activeLogger.info(`Priority: ${task.priority}`)
      activeLogger.info(`Feature:  ${task.feature || 'none'}`)
      if (task.metadata?.url) {
        activeLogger.info(`URL:      ${task.metadata.url}`)
      }
      activeLogger.raw(separator('heavy'))
      activeLogger.raw('')
    }

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
        'ERR_BACKEND_INVALID',
        `Failed to mark task ${task.id} as in-progress: ${error.message}`,
        [
          'Check file/database permissions for the backend',
          'Ensure the task ID is valid and exists',
          'If using JSON backend, check for file lock conflicts'
        ]
      ))
      continue
    }

    const nextModel = cliExecutor.getNextModel?.()
    
    const taskContext: TaskContext = {
      task,
      config,
      iteration,
      startTime: new Date(),
      namespace,
      retryAttempt: retryCount.get(task.id) || 0,
      cli: nextModel?.cli,
      model: nextModel?.model,
      modelDisplayName: nextModel?.displayName,
    }
    currentTaskContext = taskContext

    if (backend.updateTask) {
      await backend.updateTask(task.id, {
        metadata: {
          cli: nextModel?.cli,
          model: nextModel?.model,
          modelDisplayName: nextModel?.displayName,
        }
      })
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
      exitCode = await cliExecutor.execute(prompt, outputFile, config.timeout || 600, { taskId: task.id })
      activeLogger.stopSpinner()
    } catch (error: unknown) {
      // Check for CLI not found error
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      if ((error as any).code === 'ENOENT' && (error as any).syscall === 'spawn') {
        const cliName = config.cli || 'AI CLI'
        handleLoopworkError(new LoopworkError(
          'ERR_CLI_NOT_FOUND',
          `AI CLI '${cliName}' not found in PATH`,
          [
            `Install ${cliName}: https://claude.com/code (or https://opencode.sh)`,
            'Or change CLI in config to a different tool',
            'Ensure the CLI is available in your system PATH'
          ]
        ))
        stateManager.releaseLock()
        runtimeProcess.exit(1)
      }

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
          'ERR_BACKEND_INVALID',
          `Task succeeded but failed to mark as completed in backend: ${error.message}`,
          [
            'The task execution was successful but could not be saved',
            'Check backend connectivity and permissions',
            'You may need to manually mark the task as completed'
          ]
        ))
        if (isJsonMode) {
          activeLogger.emitJsonEvent('error', 'run', {
            taskId: task.id,
            iteration,
            error: 'Failed to mark task as completed in backend',
            message: (error as Error).message,
          })
        }
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
      currentTaskContext = null

      tasksCompleted++
      consecutiveFailures = 0
      retryCount.delete(task.id)
      failureState.clearFailure(task.id)

      if (isJsonMode) {
        activeLogger.emitJsonEvent('success', 'run', {
          taskId: task.id,
          iteration,
          duration,
          completed: true,
          tasksCompleted,
        })
      } else {
        activeLogger.success(`Task ${task.id} completed!`)
      }
    } else {
      const currentRetries = retryCount.get(task.id) || 0
      const hasBudget = config.retryBudget?.enabled !== false && retryBudget.hasBudget()

      if (currentRetries < maxRetries - 1 && hasBudget) {
        retryCount.set(task.id, currentRetries + 1)
        if (config.retryBudget?.enabled !== false) {
          retryBudget.consume()
        }

        if (isJsonMode) {
          activeLogger.emitJsonEvent('warn', 'run', {
            taskId: task.id,
            iteration,
            retry: currentRetries + 2,
            maxRetries,
            message: 'Task failed, retrying',
          })
        } else {
          activeLogger.warn(`Task ${task.id} failed, retrying (${currentRetries + 2}/${maxRetries})...`)
        }

        try {
          await backend.resetToPending(task.id)
        } catch (error: unknown) {
          handleLoopworkError(new LoopworkError(
            'ERR_BACKEND_INVALID',
            `Failed to reset task ${task.id} to pending: ${(error as Error).message}`,
            [
              'Check backend connectivity and permissions',
              'The task may need manual intervention'
            ]
          ))
          if (isJsonMode) {
            activeLogger.emitJsonEvent('error', 'run', {
              taskId: task.id,
              iteration,
              error: 'Failed to reset task to pending',
              message: (error as Error).message,
            })
          }
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

        await activePlugins.runHook('onTaskRetry', taskContext, `Attempt ${currentRetries + 1} failed.`)

        await new Promise(r => setTimeout(r, config.retryDelay ?? 3000))
        continue
      } else {
        const isBudgetExhausted = currentRetries < maxRetries - 1 && !hasBudget
        const errorMsg = isBudgetExhausted
          ? `Retry budget exhausted (${config.retryBudget?.maxRetries || 50} per ${(config.retryBudget?.windowMs || 3600000) / 3600000}h)\n\nSession: ${config.sessionId}\nIteration: ${iteration}`
          : `Max retries (${maxRetries}) reached\n\nSession: ${config.sessionId}\nIteration: ${iteration}`

        try {
          // Record failure in state manager
          failureState.recordFailure(task.id, errorMsg)
          const failureCount = failureState.getFailureCount(task.id)
          const quarantineThreshold = config.quarantineThreshold ?? 3

          if (failureCount >= quarantineThreshold) {
            activeLogger.warn(`⚠️ Task ${task.id} has failed ${failureCount} times. Moving to quarantine (DLQ).`)
            await backend.markQuarantined(task.id, `Exceeded quarantine threshold (${quarantineThreshold}). Last error: ${errorMsg}`)
          } else {
            await backend.markFailed(task.id, errorMsg)
          }
        } catch (error: unknown) {
          handleLoopworkError(new LoopworkError(
            'ERR_BACKEND_INVALID',
            `Task failed and could not be marked as failed in backend: ${(error as Error).message}`,
            [
              'The task execution failed multiple times',
              'Backend operation also failed - check connectivity',
              'Manual intervention may be required'
            ]
          ))
        }

        await activePlugins.runHook('onTaskFailed', taskContext, errorMsg)
        currentTaskContext = null

        tasksFailed++
        consecutiveFailures++
        retryCount.delete(task.id)

        let lastOutput = ''
        try {
          if (fs.existsSync(outputFile)) {
            const content = fs.readFileSync(outputFile, 'utf-8')
            const lines = content.split('\n').filter(l => l.trim())
            lastOutput = lines.slice(-10).join('\n')
          }
        } catch {}

        if (isJsonMode) {
          activeLogger.emitJsonEvent('error', 'run', {
            taskId: task.id,
            iteration,
            failed: true,
            attempts: currentRetries + 1,
            tasksFailed,
            consecutiveFailures,
            lastOutput: lastOutput.substring(0, 500),
            budgetExhausted: isBudgetExhausted,
          })
        } else {
          activeLogger.raw('')
          if (isBudgetExhausted) {
            activeLogger.error(`Task ${task.id} failed: Retry budget exhausted`)
          } else {
            activeLogger.error(`Task ${task.id} failed after ${currentRetries + 1} attempts`)
          }

          if (lastOutput) {
            activeLogger.raw('')
            activeLogger.raw(chalk.gray('Last 10 lines of output:'))
            activeLogger.raw(chalk.gray('─────────────────────────────────────'))
            activeLogger.raw(chalk.dim(lastOutput))
            activeLogger.raw(chalk.gray('─────────────────────────────────────'))
            activeLogger.raw('')
          }

          const prdPath = task.metadata?.prdFile || `.specs/tasks/${task.id}.md`
          activeLogger.info(`💡 Check task requirements in ${prdPath}`)
          activeLogger.info(`💡 Check full output: ${outputFile}`)
          activeLogger.info(`💡 Skip task: npx loopwork --skip ${task.id}`)
          if (!isBudgetExhausted) {
            activeLogger.info(`💡 Adjust retry limit in config: maxRetries (current: ${maxRetries})`)
          } else {
            activeLogger.info(`💡 Increase retry budget in config: retryBudget.maxRetries`)
          }
          activeLogger.raw('')
        }
      }
    }

    await new Promise(r => setTimeout(r, config.taskDelay ?? 2000))
  }

  const loopDuration = Date.now() - (stateManager.loadState()?.startedAt || Date.now())

  let finalPending = 0
  try {
    finalPending = await backend.countPending({ feature: config.feature })
    if (!isJsonMode) {
      activeLogger.info(`Final Status: ${finalPending} pending`)
    }
  } catch (error: unknown) {
    if (!isJsonMode) {
      activeLogger.warn(`Could not get final task count: ${error.message}`)
    }
  }

  if (finalPending === 0) {
    if (!isJsonMode) {
      activeLogger.success('All tasks completed!')
    }
    stateManager.clearState()
  }

  if (isJsonMode) {
    // Emit final result JSON
    activeLogger.emitJsonEvent('result', 'run', {
      summary: {
        totalIterations: iteration,
        tasksCompleted,
        tasksFailed,
        tasksSkipped: 0,
        duration: Math.floor(loopDuration / 1000),
        pendingTasks: finalPending,
      },
      sessionId: config.sessionId,
      outputDir: config.outputDir,
    })
  } else {
    const summaryOutput = await renderInk(
      <InkCompletionSummary
        title="Loopwork Complete"
        stats={{
          completed: tasksCompleted,
          failed: tasksFailed,
          skipped: 0
        }}
        duration={loopDuration}
        nextSteps={[
          `View output: ${config.outputDir}`,
          `Session: ${config.sessionId}`
        ]}
      />
    )
    activeLogger.raw('')
    activeLogger.raw(summaryOutput)
    activeLogger.raw('')
  }

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
  runtimeProcess: NodeJS.Process,
  isJsonMode: boolean = false
): Promise<void> {
  const parallelRunner = new ParallelRunner({
    config,
    backend,
    cliExecutor,
    logger: activeLogger,
    pluginRegistry: activePlugins,
    onTaskStart: async (context) => {
      await activePlugins.runHook('onTaskStart', context)
    },
    onTaskComplete: async (context, result) => {
      await activePlugins.runHook('onTaskComplete', context, result)
    },
    onTaskFailed: async (context, error) => {
      await activePlugins.runHook('onTaskFailed', context, error)
    },
    onTaskRetry: async (context, error) => {
      await activePlugins.runHook('onTaskRetry', context, error)
    },
    onTaskAbort: async (context) => {
      await activePlugins.runHook('onTaskAbort', context)
    },
    onWorkerStatus: async (status) => {
      // Emit worker status to the output renderer for the status bar
      if (activeLogger.emitWorkerStatus) {
        activeLogger.emitWorkerStatus(status)
      }
    },
    buildPrompt,
  })

  // Handle interrupt signals
  let isCleaningUp = false
  const parallelCleanup = async () => {
    if (isCleaningUp) {
      return // Prevent multiple cleanup calls
    }
    isCleaningUp = true
    activeLogger.warn('\nReceived interrupt signal. Saving parallel state...')
    parallelRunner.abort()

    // Notify plugins of task abort
    await parallelRunner.notifyAbort()

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

    let finalPending = 0
    try {
      finalPending = await backend.countPending({ feature: config.feature })
      if (!isJsonMode) {
        activeLogger.info(`Final Status: ${finalPending} pending`)
      }
    } catch (error: unknown) {
      if (!isJsonMode) {
        activeLogger.warn(`Could not get final task count: ${(error as Error).message}`)
      }
    }

    if (finalPending === 0) {
      if (!isJsonMode) {
        activeLogger.success('All tasks completed!')
      }
      stateManager.clearState()
      clearParallelState(config.projectRoot, config.namespace || 'default')
    }

    if (isJsonMode) {
      // Emit final result JSON for parallel mode
      activeLogger.emitJsonEvent('result', 'run', {
        summary: {
          totalIterations: 0, // Not tracked in parallel mode
          tasksCompleted: stats.completed,
          tasksFailed: stats.failed,
          tasksSkipped: 0,
          duration: Math.floor(stats.duration),
          pendingTasks: finalPending,
          workers: stats.workers,
        },
        sessionId: config.sessionId,
        outputDir: config.outputDir,
        mode: 'parallel',
      })
    } else {
      const parallelSummaryOutput = await renderInk(
        <InkCompletionSummary
          title="Loopwork Complete (Parallel Mode)"
          stats={{
            completed: stats.completed,
            failed: stats.failed,
            skipped: 0
          }}
          duration={stats.duration * 1000}
          nextSteps={[
            `Workers: ${stats.workers}`,
            `View output: ${config.outputDir}`,
            `Session: ${config.sessionId}`
          ]}
        />
      )
      activeLogger.raw('')
      activeLogger.raw(parallelSummaryOutput)
      activeLogger.raw('')
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
