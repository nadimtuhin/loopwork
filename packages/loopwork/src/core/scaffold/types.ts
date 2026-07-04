export interface TemplateEngine {
  /**
   * Render a template string with the given context
   */
  render(template: string, context: Record<string, unknown>): string;
}

export interface ScaffoldOptions {
  /** Directory containing template files */
  templateDir: string;
  /** Directory where files should be generated */
  outputDir: string;
  /** Data to pass to templates */
  context: Record<string, unknown>;
  /** If true, do not write files */
  dryRun?: boolean;
  /** If true, overwrite existing files */
  force?: boolean;
  /** Hooks to execute at various stages of scaffolding */
  hooks?: ScaffoldHooks;
  /** Validation rules for input validation */
  validation?: ValidationConfig;
}

export interface GeneratorResult {
  filesCreated: string[];
  filesSkipped: string[];
  errors: Error[];
  duration: number;
}

/**
 * Hooks that can be executed at various stages of the scaffolding process
 */
export interface ScaffoldHooks {
  /** Called before any file processing begins */
  onStart?: (context: Record<string, unknown>) => void | Promise<void>;
  /** Called after each file is created */
  onFileCreated?: (filePath: string, content: string) => void | Promise<void>;
  /** Called when a file is skipped (already exists) */
  onFileSkipped?: (filePath: string) => void | Promise<void>;
  /** Called when an error occurs processing a file */
  onFileError?: (filePath: string, error: Error) => void | Promise<void>;
  /** Called when scaffolding completes (success or with errors) */
  onComplete?: (result: GeneratorResult) => void | Promise<void>;
  /** Called only when scaffolding completes without errors */
  onSuccess?: (result: GeneratorResult) => void | Promise<void>;
  /** Called when scaffolding fails completely */
  onFailure?: (error: Error) => void | Promise<void>;
}

/**
 * Result of input validation
 */
export interface InputValidationResult {
  valid: boolean;
  errors: InputValidationError[];
  warnings: InputValidationWarning[];
}

/**
 * Individual validation error
 */
export interface InputValidationError {
  field: string;
  message: string;
  value?: unknown;
}

/**
 * Individual validation warning (non-blocking)
 */
export interface InputValidationWarning {
  field: string;
  message: string;
  value?: unknown;
}

/**
 * Validation rule definition
 */
export interface ValidationRule {
  field: string;
  validators: Validator[];
}

/**
 * Validator function type
 */
export type Validator = (value: unknown) => ValidatorResult;

/**
 * Result of a single validator
 */
export interface ValidatorResult {
  valid: boolean;
  message?: string;
}

/**
 * Configuration for input validation
 */
export interface ValidationConfig {
  /** Rules to apply */
  rules: ValidationRule[];
  /** Whether to fail on first error or collect all errors */
  failFast?: boolean;
}

/**
 * Built-in validator functions
 */
export interface BuiltInValidators {
  required: (message?: string) => Validator;
  pattern: (regex: RegExp, message?: string) => Validator;
  minLength: (min: number, message?: string) => Validator;
  maxLength: (max: number, message?: string) => Validator;
  enum: <T extends string>(allowedValues: T[], message?: string) => Validator;
  custom: (fn: Validator, message?: string) => Validator;
}

/**
 * Context passed to hooks
 */
export interface ScaffoldContext {
  templateDir: string;
  outputDir: string;
  context: Record<string, unknown>;
  result: GeneratorResult;
  startTime: number;
}
