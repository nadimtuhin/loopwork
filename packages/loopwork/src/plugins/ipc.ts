/**
 * IPC Emitter Plugin
 *
 * Emits structured IPC messages to stdout for parent process communication
 */

import type { LoopworkPlugin } from '../contracts/plugin'
import { randomUUID } from 'crypto'

/**
 * IPC Event Types
 */
export type IPCEventType =
  | 'task_start'
  | 'task_complete'
  | 'task_failed'
  | 'loop_start'
  | 'loop_end'
  | 'question'
  | 'approval_request'
  | 'progress_update'
  | 'log'

/**
 * IPC Message Structure
 */
export interface IPCMessage {
  type: 'ipc'
  version: '1.0'
  event: IPCEventType
  data: unknown
  timestamp: number
  messageId: string
}

/**
 * Write function type for dependency injection
 */
export type IPCWriteFn = (message: string) => void

/**
 * IPC Plugin Options
 */
export interface IPCPluginOptions {
  /** Enable/disable IPC emission (default: true) */
  enabled?: boolean
  /** Optional event filter function */
  filter?: (event: IPCEventType) => boolean
  /** Optional write function for testing (default: process.stdout.write) */
  writeFn?: IPCWriteFn
}

/**
 * Default write function using process.stdout
 */
const defaultWriteFn: IPCWriteFn = (message: string) => {
  process.stdout.write(message)
}

/**
 * Emit an IPC message
 */
function emitIPC(
  event: IPCEventType,
  data: unknown,
  filter?: (event: IPCEventType) => boolean,
  writeFn: IPCWriteFn = defaultWriteFn
): void {
  // Apply filter if provided
  if (filter && !filter(event)) {
    return
  }

  const message: IPCMessage = {
    type: 'ipc',
    version: '1.0',
    event,
    data,
    timestamp: Date.now(),
    messageId: randomUUID()
  }

  // Emit with special format
  writeFn(`__IPC_START__${JSON.stringify(message)}__IPC_END__\n`)
}

/**
 * Create IPC Emitter Plugin
 *
 * @example
 * ```typescript
 * import { compose, defineConfig } from 'loopwork'
 * import { createIPCPlugin } from 'loopwork/plugins/ipc'
 *
 * export default compose(
 *   createIPCPlugin({ enabled: true })
 * )(defineConfig({ ... }))
 * ```
 */
export function createIPCPlugin(options: IPCPluginOptions = {}): LoopworkPlugin {
  const {
    enabled = true,
    filter,
    writeFn = defaultWriteFn
  } = options

  return {
    name: 'ipc-emitter',
    classification: 'enhancement',

    onLoopStart(namespace) {
      if (!enabled) return

      emitIPC('loop_start', { namespace }, filter, writeFn)
    },

    onLoopEnd(stats) {
      if (!enabled) return

      emitIPC('loop_end', stats, filter, writeFn)
    },

    onTaskStart(context) {
      if (!enabled) return

      const { task, namespace, iteration } = context

      emitIPC('task_start', {
        taskId: task.id,
        title: task.title,
        namespace,
        iteration
      }, filter, writeFn)
    },

    onTaskComplete(context, result) {
      if (!enabled) return

      const { task, namespace, iteration } = context

      emitIPC('task_complete', {
        taskId: task.id,
        title: task.title,
        namespace,
        iteration,
        duration: result.duration,
        success: result.success
      }, filter, writeFn)
    },

    onTaskFailed(context, error) {
      if (!enabled) return

      const { task, namespace, iteration } = context

      emitIPC('task_failed', {
        taskId: task.id,
        title: task.title,
        namespace,
        iteration,
        error
      }, filter, writeFn)
    },

    async onStep(event) {
      if (!enabled) return

      // Emit progress updates for certain steps
      if (event.stepId.includes('progress') || event.stepId.includes('spawn')) {
        emitIPC('progress_update', {
          stepId: event.stepId,
          description: event.description,
          phase: event.phase,
          durationMs: event.durationMs,
          ...event.context
        }, filter, writeFn)
      }
    },

    capabilities: {
      promptInjection: `
# Inter-Process Communication (IPC)
You can ask structured questions to the user via Telegram/IPC.
To do this, you MUST output a JSON block with the following format:

__IPC_START__
{
  "type": "ipc",
  "event": "question",
  "data": {
    "question": "Your question here?",
    "options": [
      {"id": "opt1", "label": "Option A"},
      {"id": "opt2", "label": "Option B"}
    ],
    "timeout": 60
  }
}
__IPC_END__

After outputting this, wait for the response on standard input.
`
    }
  }
}

/**
 * Factory function with convenient naming
 */
export function withIPC(options?: IPCPluginOptions) {
  return createIPCPlugin(options)
}
