import type { IHookMiddleware, PipelineContext } from '@loopwork-ai/contracts'

export class PluginAdapter {
  static toMiddleware(
    plugin: any,
    hookName: string
  ): IHookMiddleware<PipelineContext> {
    return async (ctx, next) => {
      const hook = plugin[hookName]
      if (typeof hook === 'function') {
        const args = ctx.state.args || []
        await hook.apply(plugin, args)
      }
      await next()
    }
  }
}
