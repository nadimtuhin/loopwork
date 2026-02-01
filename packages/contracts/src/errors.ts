/**
 * Error code type - identifies specific error categories
 */
export type ErrorCode = string

/**
 * Error registry interface for managing error codes and documentation URLs
 */
export interface IErrorRegistry {
  /**
   * Register an error code with its documentation URL
   */
  register(code: ErrorCode, docsUrl: string): void

  /**
   * Get documentation URL for an error code
   */
  getDocsUrl(code: ErrorCode): string | undefined

  /**
   * Check if an error code is registered
   */
  has(code: ErrorCode): boolean

  /**
   * Get all registered error codes
   */
  getAllCodes(): ErrorCode[]
}

/**
 * Error guidance interface for generating troubleshooting information
 */
export interface IErrorGuidance {
  /**
   * Generate suggestions for resolving an error
   */
  getSuggestions(code: ErrorCode, context?: Record<string, unknown>): string[]

  /**
   * Get troubleshooting URL for an error code
   */
  getTroubleshootingUrl(code: ErrorCode): string

  /**
   * Format error message with suggestions and documentation link
   */
  formatError(code: ErrorCode, message: string, suggestions?: string[]): string
}
