import type { LoopworkPlugin, TaskContext } from '../contracts/plugin'
import { Debugger } from '../core/debugger'

export function createDebuggerPlugin(options: DebuggerConfig = {}): LoopworkPlugin {
  const debuggerInstance = new Debugger()

  if (options.enabled) {
    debuggerInstance.setEnabled(true)
  }

  if (options.breakpoints) {
    for (const bp of options.breakpoints) {
      debuggerInstance.addBreakpoint(bp)
    }
  }

  return {
    name: 'debugger',
    classification: 'enhancement',
    requiresNetwork: false,

    onConfigLoad(config) {
      ;(config as unknown as { debugger: Debugger }).debugger = debuggerInstance
      return config
    },

    onLoopStart(_namespace: string): void {
      if (!debuggerInstance.isEnabled()) {
        return
      }
    },

    onLoopEnd(_stats: { completed: number; failed: number; duration: number }): void {
      if (!debuggerInstance.isEnabled()) {
        return
      }
    },

    onTaskStart(context: TaskContext): void {
      debuggerInstance.setContext(context)
    },

    onTaskComplete(_context: TaskContext, _result: { duration: number; success: boolean; output?: string }): void {
      debuggerInstance.clearContext()
    },

    onTaskFailed(_context: TaskContext, _error: string): void {
      debuggerInstance.clearContext()
    },
  }
}

export function withDebugger(options: DebuggerConfig = {}) {
  return (config: { plugins?: LoopworkPlugin[] }) => {
    const plugin = createDebuggerPlugin(options)
    return {
      ...config,
      plugins: [...(config.plugins || []), plugin],
    }
  }
}

export interface DebuggerConfig {
  enabled?: boolean
  breakpoints?: Array<{
    eventType: 'LOOP_START' | 'LOOP_END' | 'TASK_START' | 'PRE_TASK' | 'POST_TASK' | 'PRE_PROMPT' | 'TOOL_CALL' | 'AGENT_RESPONSE' | 'ERROR'
    taskId?: string
    enabled: boolean
  }>
}
