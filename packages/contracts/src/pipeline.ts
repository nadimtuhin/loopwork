/**
 * Pipeline System Contracts
 * 
 * Defines the interfaces for the Koa/Express-style middleware pipeline
 * used for the new hook engine.
 */

/**
 * Context passed through the pipeline middleware.
 * Can be extended by specific pipeline implementations.
 */
export interface PipelineContext {
  /**
   * Shared state accessible by all middleware in the pipeline
   */
  state: Record<string, any>

  /**
   * Allow additional properties
   */
  [key: string]: any
}

/**
 * Next function signature for passing control to the next middleware.
 */
export type NextFunction = () => Promise<void>

/**
 * Middleware function for the pipeline.
 * Follows the Koa/Express pattern of (context, next).
 * 
 * @example
 * const logger: IHookMiddleware = async (ctx, next) => {
 *   console.log('Start')
 *   await next()
 *   console.log('End')
 * }
 */
export type IHookMiddleware<TContext extends PipelineContext = PipelineContext> = (
  context: TContext,
  next: NextFunction
) => Promise<void> | void

/**
 * Pipeline interface for composing and executing middleware.
 */
export interface IPipeline<TContext extends PipelineContext = PipelineContext> {
  /**
   * Add middleware to the pipeline.
   * @param middleware - The middleware function to add
   */
  use(middleware: IHookMiddleware<TContext>): this

  /**
   * Execute the pipeline with the given context.
   * @param context - The context to pass through the pipeline
   */
  execute(context: TContext): Promise<void>
}
