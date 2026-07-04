import { Pipeline } from './pipeline'
import type { PipelineContext, IHookMiddleware } from '@loopwork-ai/contracts'

export interface HookEngineConfig {
  throwOnError?: boolean
}

export class HookEngine {
  private pipelines: Map<string, Pipeline<any>> = new Map()

  constructor(private config: HookEngineConfig = {}) {}

  register(name: string, middleware: IHookMiddleware<any>): void {
    this.getOrCreatePipeline(name).use(middleware)
  }

  async execute<T extends PipelineContext>(
    name: string,
    context: T
  ): Promise<void> {
    const pipeline = this.pipelines.get(name)
    if (!pipeline) return

    try {
      await pipeline.execute(context)
    } catch (error) {
      if (this.config.throwOnError) {
        throw error
      }
    }
  }

  hasHandlers(name: string): boolean {
    return this.pipelines.has(name)
  }

  getRegisteredHooks(): string[] {
    return Array.from(this.pipelines.keys())
  }

  clear(): void {
    this.pipelines.clear()
  }

  private getOrCreatePipeline<T extends PipelineContext>(name: string): Pipeline<T> {
    if (!this.pipelines.has(name)) {
      this.pipelines.set(name, new Pipeline<T>())
    }
    return this.pipelines.get(name)!
  }
}
