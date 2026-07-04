/**
 * Checkpoint Command
 *
 * Manages agent execution checkpoints.
 * Implements ICommand interface for the CLI command system.
 */

import type {
  ICommand,
  CommandContext,
  CommandResult,
  CommandOptions,
} from '@loopwork-ai/contracts'
import type { ICheckpointManager, AgentCheckpoint } from '@loopwork-ai/checkpoint'
import chalk from 'chalk'

export interface CheckpointOptions {
  /** Subcommand to execute (list, show, delete, cleanup) */
  subcommand: string
  /** Arguments for the subcommand */
  args?: string[]
  /** Output as JSON */
  json?: boolean
  /** Max age in days for cleanup */
  maxAgeDays?: number
}

function formatDuration(ms: number): string {
  const seconds = Math.floor(ms / 1000)
  const minutes = Math.floor(seconds / 60)
  const hours = Math.floor(minutes / 60)

  if (hours > 0) {
    return `${hours}h ${minutes % 60}m`
  }
  if (minutes > 0) {
    return `${minutes}m ${seconds % 60}s`
  }
  return `${seconds}s`
}

function formatTimestamp(date: Date): string {
  return date.toISOString().replace('T', ' ').slice(0, 19)
}

export class CheckpointCommand implements ICommand {
  readonly name = 'checkpoint'
  readonly description = 'Manage execution checkpoints'
  readonly usage = '<subcommand> [args...] [options]'
  readonly examples = [
    { command: 'loopwork checkpoint list', description: 'List all checkpoints' },
    { command: 'loopwork checkpoint show <id>', description: 'Show checkpoint details' },
    { command: 'loopwork checkpoint delete <id>', description: 'Delete a checkpoint' },
    { command: 'loopwork checkpoint cleanup --max-age-days 3', description: 'Clean up old checkpoints' },
  ]
  readonly seeAlso = ['loopwork run', 'loopwork start']

  async execute(context: CommandContext, options: CommandOptions): Promise<CommandResult> {
    const opts = options as unknown as CheckpointOptions
    const logger = context.logger
    const subcommand = opts.subcommand || (opts.args?.[0])
    const args = opts.subcommand ? (opts.args || []) : (opts.args?.slice(1) || [])

    // Get checkpoint manager from deps
    const checkpointManager = context.deps?.checkpointManager as ICheckpointManager | undefined

    if (!checkpointManager) {
      return {
        success: false,
        code: 1,
        message: 'Checkpoint manager not available',
      }
    }

    try {
      switch (subcommand) {
        case 'list':
          return await this.listCheckpoints(context, checkpointManager, opts)
        case 'show':
          if (args.length === 0) {
            throw new Error('Missing checkpoint ID. Usage: loopwork checkpoint show <id>')
          }
          return await this.showCheckpoint(context, checkpointManager, args[0], opts)
        case 'delete':
        case 'remove':
          if (args.length === 0) {
            throw new Error('Missing checkpoint ID. Usage: loopwork checkpoint delete <id>')
          }
          return await this.deleteCheckpoint(context, checkpointManager, args[0], opts)
        case 'cleanup':
        case 'prune':
          return await this.cleanupCheckpoints(context, checkpointManager, opts)
        default:
          logger.error(`Unknown subcommand: ${subcommand}`)
          logger.raw('Usage: loopwork checkpoint <subcommand> [args...]')
          logger.raw('')
          logger.raw('Commands:')
          logger.raw('  list        List all checkpoints')
          logger.raw('  show <id>   Show checkpoint details')
          logger.raw('  delete <id> Delete a checkpoint')
          logger.raw('  cleanup     Clean up old checkpoints')
          return {
            success: false,
            code: 1,
            message: `Unknown subcommand: ${subcommand}`,
          }
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      logger.error(message)
      return {
        success: false,
        code: 1,
        message,
      }
    }
  }

  private async listCheckpoints(
    context: CommandContext,
    manager: ICheckpointManager,
    opts: CheckpointOptions
  ): Promise<CommandResult> {
    const logger = context.logger
    
    let checkpointIds: string[] = []
    try {
      checkpointIds = await manager.list()
    } catch (error) {
      if ((error as any).code !== 'ENOENT') throw error
    }

    if (opts.json) {
      logger.raw(JSON.stringify({
        command: 'checkpoint list',
        timestamp: new Date().toISOString(),
        checkpoints: checkpointIds,
        count: checkpointIds.length
      }, null, 2))
      return { success: true, code: 0, message: 'Checkpoints listed' }
    }

    logger.raw('')
    logger.raw(chalk.bold('Loopwork Checkpoints'))
    logger.raw(chalk.gray('─'.repeat(80)))

    if (checkpointIds.length === 0) {
      logger.raw(chalk.gray('No checkpoints found'))
      logger.raw('')
      return { success: true, code: 0, message: 'No checkpoints found' }
    }

    // Simple table implementation
    const headers = ['ID', 'Task', 'Phase', 'Created', 'Age']
    const colWidths = [30, 15, 12, 20, 10]
    
    let headerRow = ''
    headers.forEach((h, i) => {
      headerRow += chalk.bold(h.padEnd(colWidths[i])) + ' '
    })
    logger.raw(headerRow)
    logger.raw(chalk.gray('─'.repeat(colWidths.reduce((a, b) => a + b, 0) + colWidths.length)))

    for (const id of checkpointIds) {
      try {
        const restored = await manager.restore(id)
        if (restored) {
          const cp = restored.checkpoint
          const taskId = cp.taskId || '-'
          const phase = cp.phase
          const timestamp = formatTimestamp(cp.timestamp)
          const age = formatDuration(Date.now() - new Date(cp.timestamp).getTime())
          
          let row = chalk.cyan(id.padEnd(colWidths[0])) + ' '
          row += taskId.padEnd(colWidths[1]) + ' '
          row += phase.padEnd(colWidths[2]) + ' '
          row += timestamp.padEnd(colWidths[3]) + ' '
          row += age.padEnd(colWidths[4])
          logger.raw(row)
        }
      } catch {
        logger.raw(chalk.red(id.padEnd(colWidths[0])) + ' ' + chalk.gray('Error loading'))
      }
    }

    logger.raw('')
    logger.raw(chalk.gray(`Total: ${checkpointIds.length} checkpoint(s)`))
    logger.raw('')

    return { success: true, code: 0, message: 'Checkpoints listed', data: { count: checkpointIds.length } }
  }

  private async showCheckpoint(
    context: CommandContext,
    manager: ICheckpointManager,
    id: string,
    opts: CheckpointOptions
  ): Promise<CommandResult> {
    const logger = context.logger
    const restored = await manager.restore(id)

    if (!restored) {
      throw new Error(`Checkpoint '${id}' not found`)
    }

    const { checkpoint, partialOutput } = restored

    if (opts.json) {
      logger.raw(JSON.stringify({
        command: 'checkpoint show',
        timestamp: new Date().toISOString(),
        checkpoint
      }, null, 2))
      return { success: true, code: 0, message: 'Checkpoint details shown' }
    }

    logger.raw('')
    logger.raw(chalk.bold(`Checkpoint: ${id}`))
    logger.raw(chalk.gray('─'.repeat(40)))

    const details = [
      ['Task ID', checkpoint.taskId || '-'],
      ['Agent Name', (checkpoint as any).agentName || '-'],
      ['Iteration', checkpoint.iteration.toString()],
      ['Phase', checkpoint.phase],
      ['Last Tool', (checkpoint as any).lastToolCall || '-'],
      ['Created', formatTimestamp(checkpoint.timestamp)],
      ['Age', formatDuration(Date.now() - new Date(checkpoint.timestamp).getTime())],
    ]

    details.forEach(([label, value]) => {
      logger.raw(`${chalk.bold(label.padEnd(15))}: ${value}`)
    })

    if (checkpoint.state && Object.keys(checkpoint.state).length > 0) {
      logger.raw('')
      logger.raw(chalk.bold('State:'))
      logger.raw(JSON.stringify(checkpoint.state, null, 2))
    }

    if (partialOutput) {
      logger.raw('')
      logger.raw(chalk.bold('Partial Output:'))
      const preview = partialOutput.length > 500 ? partialOutput.slice(0, 500) + '...' : partialOutput
      logger.raw(chalk.gray(preview))
    }

    logger.raw('')
    return { success: true, code: 0, message: 'Checkpoint details shown' }
  }

  private async deleteCheckpoint(
    context: CommandContext,
    manager: ICheckpointManager,
    id: string,
    opts: CheckpointOptions
  ): Promise<CommandResult> {
    const logger = context.logger
    const checkpointIds = await manager.list()

    if (!checkpointIds.includes(id)) {
      throw new Error(`Checkpoint '${id}' not found`)
    }

    await manager.clear(id)

    if (opts.json) {
      logger.raw(JSON.stringify({
        command: 'checkpoint delete',
        timestamp: new Date().toISOString(),
        deleted: id
      }, null, 2))
      return { success: true, code: 0, message: `Deleted checkpoint ${id}` }
    }

    logger.success(`Deleted checkpoint '${id}'`)
    return { success: true, code: 0, message: `Deleted checkpoint ${id}` }
  }

  private async cleanupCheckpoints(
    context: CommandContext,
    manager: ICheckpointManager,
    opts: CheckpointOptions
  ): Promise<CommandResult> {
    const logger = context.logger
    const maxAgeDays = opts.maxAgeDays ?? 7
    
    const deletedCount = await manager.cleanup(maxAgeDays)

    if (opts.json) {
      logger.raw(JSON.stringify({
        command: 'checkpoint cleanup',
        timestamp: new Date().toISOString(),
        count: deletedCount,
        maxAgeDays
      }, null, 2))
      return { success: true, code: 0, message: 'Checkpoints cleaned up' }
    }

    logger.raw('')
    logger.raw(chalk.bold('Checkpoint Cleanup'))
    logger.raw(chalk.gray('─'.repeat(40)))

    if (deletedCount === 0) {
      logger.info(`No checkpoints older than ${maxAgeDays} day(s) found`)
    } else {
      logger.success(`Deleted ${deletedCount} checkpoint(s) older than ${maxAgeDays} day(s)`)
    }

    logger.raw('')
    return { success: true, code: 0, message: 'Checkpoints cleaned up', data: { deletedCount } }
  }

  validate?(options: CommandOptions): string | undefined {
    const opts = options as unknown as CheckpointOptions
    if (opts.maxAgeDays !== undefined && (isNaN(opts.maxAgeDays) || opts.maxAgeDays < 0)) {
      return 'maxAgeDays must be a non-negative number'
    }
    return undefined
  }
}

export function createCheckpointCommand(): ICommand {
  return new CheckpointCommand()
}
