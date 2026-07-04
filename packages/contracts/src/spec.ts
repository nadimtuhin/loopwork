/**
 * Spec Parser Interfaces
 *
 * Defines contracts for parsing task specifications from various sources (markdown, JSON, etc.).
 */

/**
 * Task definition from parsed specification
 */
export interface ITaskDefinition {
  /** Unique identifier for the task */
  id: string

  /** Task title */
  title: string

  /** Task description/goal */
  description: string

  /** List of requirements or sub-tasks */
  requirements: string[]

  /** Success criteria or acceptance conditions */
  successCriteria?: string[]

  /** Estimated completion time (optional) */
  estimatedTime?: string

  /** Task metadata or tags */
  metadata?: Record<string, unknown>

  /** Source format (e.g., 'markdown', 'json') */
  sourceFormat: string

  /** Timestamp when this definition was created */
  parsedAt: Date
}

/**
 * Validation result for spec parsing
 */
export interface ValidationResult {
  /** Whether the specification is valid */
  valid: boolean

  /** Error messages if invalid */
  errors: string[]

  /** Warning messages if any */
  warnings: string[]

  /** Parsed task definition if valid */
  task?: ITaskDefinition

  /** Suggested corrections for invalid specs */
  suggestions?: string[]
}

/**
 * Validation schema for task specifications
 */
export interface ValidationSchema {
  /** Required fields that must be present */
  requiredFields: string[]

  /** Field names that are optional */
  optionalFields: string[]

  /** Field type validators */
  fieldValidators: Record<string, (value: unknown) => boolean>

  /** Custom validation function */
  validate?: (task: ITaskDefinition) => ValidationResult
}

/**
 * Spec parser interface
 *
 * Parses task specifications from various sources and returns task definitions.
 * Implementations can parse markdown files, JSON objects, or other formats.
 */
export interface IPrdParser {
  /** Parser name for logging and identification */
  readonly name: string

  /** Parser description */
  readonly description: string

  /**
   * Parse task specification from string
   *
   * @param content - Specification content as string
   * @returns Parsed task definition
   * @throws ParseError if parsing fails
   */
  parse(content: string): Promise<ITaskDefinition>

  /**
   * Parse task specification from buffer
   *
   * @param buffer - Specification content as buffer
   * @returns Parsed task definition
   * @throws ParseError if parsing fails
   */
  parseFromBuffer(buffer: Buffer): Promise<ITaskDefinition>

  /**
   * Validate specification before parsing
   *
   * @param content - Specification content to validate
   * @returns Validation result
   */
  validate(content: string): Promise<ValidationResult>

  /**
   * Get supported file extensions
   *
   * @returns Array of file extensions (e.g., ['md', 'json'])
   */
  supportedExtensions(): string[]
}

/**
 * Parser error type
 */
export class ParseError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly originalError?: Error
  ) {
    super(message)
    this.name = 'ParseError'
  }
}

/**
 * Parser factory function type
 */
export type PrdParserFactory = () => IPrdParser
