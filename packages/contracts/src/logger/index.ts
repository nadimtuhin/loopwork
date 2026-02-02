import { LogLevel, OutputConfig, OutputEvent, OutputEventSubscriber } from './types'

export * from './types'

/**
 * Logger interface to decouple from UI components
 */
export interface ILogger {
  trace(message: string): void
  debug(message: string): void
  info(message: string): void
  warn(message: string): void
  error(message: string): void
  success(message: string): void
  
  /** Same-line updates for progress */
  update(message: string, percent?: number): void
  
  /** Progress/Spinner control */
  startSpinner(message: string, percent?: number): void
  stopSpinner(message?: string, symbol?: string): void
  
  /** Raw output bypass */
  raw(message: string, noNewline?: boolean): void
  
  /** Configuration */
  setLogLevel(level: LogLevel): void
}

/**
 * Renderer interface for output systems
 */
export interface IRenderer {
  readonly name: string
  readonly isSupported: boolean

  /** Render an event to the output */
  render(event: OutputEvent): void
  
  /** Render an event with filtering and notification logic */
  renderEvent(event: OutputEvent): void
  
  /** Subscribe to output events */
  subscribe(subscriber: OutputEventSubscriber): () => void
  
  /** Configure the renderer */
  configure(config: Partial<OutputConfig>): void
  
  /** Clean up resources */
  dispose(): void
}
