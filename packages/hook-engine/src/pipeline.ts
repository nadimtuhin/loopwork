import { IPipeline, IHookMiddleware, PipelineContext, NextFunction } from '@loopwork-ai/contracts'

export class Pipeline<TContext extends PipelineContext = PipelineContext> implements IPipeline<TContext> {
  private middlewares: IHookMiddleware<TContext>[] = []

  use(middleware: IHookMiddleware<TContext>): this {
    this.middlewares.push(middleware)
    return this
  }

  async execute(context: TContext): Promise<void> {
    if (this.middlewares.length === 0) {
      return
    }

    const runner = async (index: number): Promise<void> => {
      if (index === this.middlewares.length) {
        return
      }

      const middleware = this.middlewares[index]
      const next: NextFunction = () => runner(index + 1)

      await middleware(context, next)
    }

    await runner(0)
  }
}
