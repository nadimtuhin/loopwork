import { HookEngine } from '@loopwork-ai/hook-engine'
import type { LoopworkPlugin, PipelineContext } from '@loopwork-ai/contracts'
import { logger } from './utils'

export class LoopworkRunner {
  private plugins: LoopworkPlugin[] = []
  private hookEngine: HookEngine = new HookEngine({ throwOnError: true })
  private disabledPlugins: Set<string> = new Set()
  private pluginFailureCount: Map<string, number> = new Map()
  private readonly MAX_FAILURES = 3

  constructor() {}

  registerPlugin(plugin: LoopworkPlugin): void {
    const existing = this.plugins.findIndex((p) => p.name === plugin.name)
    if (existing >= 0) {
      this.plugins[existing] = plugin
    } else {
      this.plugins.push(plugin)
    }

    this.rebuildPipelines()
  }

  private rebuildPipelines(): void {
    this.hookEngine.clear()
    
    const hooks: (keyof LoopworkPlugin)[] = [
      'onConfigLoad',
      'onBackendReady',
      'onLoopStart',
      'onLoopEnd',
      'onTaskStart',
      'onTaskComplete',
      'onTaskFailed',
      'onTaskQuarantined',
      'onTaskRetry',
      'onTaskAbort',
      'onStep',
      'onToolCall',
      'onAgentResponse',
      'onCliResult'
    ]

    for (const plugin of this.plugins) {
      for (const hook of hooks) {
        if (typeof plugin[hook] === 'function') {
          this.hookEngine.register(hook as string, this.createMiddleware(plugin, hook))
        }
      }
    }
  }

  private createMiddleware(plugin: LoopworkPlugin, hookName: keyof LoopworkPlugin) {
    return async (ctx: PipelineContext, next: () => Promise<void>) => {
      if (this.disabledPlugins.has(plugin.name)) {
        return next()
      }

      // Check if plugin should be skipped based on flags
      const args = ctx.state.args || []
      let flags: any = undefined
      for (const arg of args) {
        if (typeof arg === 'object' && arg !== null) {
          flags = arg.flags || arg.config?.flags
          if (flags) break
        }
      }

      if (this.shouldSkipPlugin(plugin, hookName, flags)) {
        return next()
      }

      const hook = plugin[hookName]
      if (typeof hook === 'function') {
        try {
          const result = await (hook as Function).apply(plugin, args)
          if (hookName === 'onConfigLoad' && result) {
            args[0] = result
          }
        } catch (error) {
          const isCritical = plugin.classification === 'critical' || (plugin as any).essential === true
          
          if (!isCritical) {
            this.recordFailure(plugin.name)
          }

          if (isCritical && (hookName === 'onTaskStart' || hookName === 'onBackendReady')) {
            throw error
          }
          logger.error(`Plugin ${plugin.name} error in ${String(hookName)}: ${error}`)
        }
      }
      
      await next()
    }
  }

  private shouldSkipPlugin(plugin: LoopworkPlugin, hookName: keyof LoopworkPlugin, flags: any): boolean {
    const isCritical = plugin.classification === 'critical' || (plugin as any).essential === true
    if (isCritical) return false

    if (flags?.reducedFunctionality) {
      const nonCriticalHooks: string[] = [
        'onConfigLoad',
        'onTaskComplete',
        'onTaskFailed',
        'onLoopEnd',
        'onTaskStart',
        'onBackendReady',
        'onLoopStart',
      ]
      if (nonCriticalHooks.includes(hookName as string)) return true
    }

    if (flags?.offlineMode && (plugin as any).requiresNetwork) return true

    return false
  }

  private recordFailure(pluginName: string): void {
    const currentCount = this.pluginFailureCount.get(pluginName) || 0
    const newCount = currentCount + 1
    this.pluginFailureCount.set(pluginName, newCount)

    if (newCount >= this.MAX_FAILURES) {
      this.disabledPlugins.add(pluginName)
      logger.warn(`Plugin ${pluginName} has failed ${this.MAX_FAILURES} times and has been auto-disabled`)
    }
  }

  async runHook(name: string, ...args: any[]): Promise<void> {
    await this.hookEngine.execute(name, { state: { args } } as any)
  }

  async applyConfigHooks(config: any): Promise<any> {
    const state = { args: [config] }
    await this.hookEngine.execute('onConfigLoad', { state } as any)
    return state.args[0]
  }

  disablePlugin(name: string): void {
    this.disabledPlugins.add(name)
  }

  enablePlugin(name: string): void {
    this.disabledPlugins.delete(name)
    this.pluginFailureCount.delete(name)
  }
}
