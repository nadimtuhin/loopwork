export interface ErrorContext {
  component?: string
  operation?: string
  taskId?: string
  namespace?: string
  metadata?: Record<string, unknown>
}

export interface ServiceError {
  code: string
  message: string
  context?: ErrorContext
  cause?: Error
  timestamp: Date
}

export class LoopworkError extends Error {
  public readonly code: string
  public readonly context?: ErrorContext
  public readonly timestamp: Date

  constructor(
    code: string,
    message: string,
    context?: ErrorContext,
    cause?: Error
  ) {
    super(message, { cause })
    this.code = code
    this.context = context
    this.timestamp = new Date()
    this.name = 'LoopworkError'
  }

  toJSON(): ServiceError {
    return {
      code: this.code,
      message: this.message,
      context: this.context,
      cause: this.cause as Error | undefined,
      timestamp: this.timestamp,
    }
  }
}

export enum ErrorCode {
  TASK_EXECUTION_FAILED = 'TASK_EXECUTION_FAILED',
  TASK_TIMEOUT = 'TASK_TIMEOUT',
  TASK_NOT_FOUND = 'TASK_NOT_FOUND',
  TASK_INVALID_STATE = 'TASK_INVALID_STATE',
  BACKEND_CONNECTION_ERROR = 'BACKEND_CONNECTION_ERROR',
  BACKEND_VALIDATION_ERROR = 'BACKEND_VALIDATION_ERROR',
  CONFIG_INVALID = 'CONFIG_INVALID',
  CONFIG_MISSING = 'CONFIG_MISSING',
  PLUGIN_LOAD_ERROR = 'PLUGIN_LOAD_ERROR',
  PLUGIN_EXECUTION_ERROR = 'PLUGIN_EXECUTION_ERROR',
  CLI_NOT_FOUND = 'CLI_NOT_FOUND',
  CLI_EXECUTION_ERROR = 'CLI_EXECUTION_ERROR',
  UNKNOWN_ERROR = 'UNKNOWN_ERROR',
  VALIDATION_ERROR = 'VALIDATION_ERROR',
}

export class ErrorService {
  private errors: ServiceError[] = []

  createError(
    code: ErrorCode | string,
    message: string,
    context?: ErrorContext,
    cause?: Error
  ): LoopworkError {
    return new LoopworkError(code, message, context, cause)
  }

  report(error: LoopworkError): void {
    this.errors.push(error.toJSON())
  }

  getErrors(): ServiceError[] {
    return [...this.errors]
  }

  clear(): void {
    this.errors = []
  }

  hasErrors(): boolean {
    return this.errors.length > 0
  }

  getErrorsByComponent(component: string): ServiceError[] {
    return this.errors.filter(
      (e) => e.context?.component === component
    )
  }

  getErrorsByCode(code: string): ServiceError[] {
    return this.errors.filter((e) => e.code === code)
  }
}

export const errorService = new ErrorService()

export function createError(
  code: ErrorCode | string,
  message: string,
  context?: ErrorContext,
  cause?: Error
): LoopworkError {
  return errorService.createError(code, message, context, cause)
}

export function reportError(error: LoopworkError): void {
  errorService.report(error)
}

export function isLoopworkError(error: unknown): error is LoopworkError {
  return error instanceof LoopworkError
}
