import type { ILogger } from './logger'

/**
 * Configuration options for changelog format
 */
export interface ChangelogConfig {
  /** Changelog format: 'keepachangelog' | 'conventional' | 'simple' */
  format: 'keepachangelog' | 'conventional' | 'simple'

  /** Include task ID in the entry */
  includeTaskId: boolean

  /** Maximum lines for generated entry */
  maxLines: number
}

/**
 * Context about a completed task for changelog generation
 */
export interface ChangelogContext {
  /** Task identifier */
  taskId: string

  /** Task title */
  title: string

  /** Task description */
  description?: string

  /** Task labels/tags */
  labels?: string[]

  /** Task execution output */
  output?: string

  /** Whether the task succeeded */
  success: boolean

  /** Error message if task failed */
  error?: string
}

/**
 * Result of changelog entry generation
 */
export interface ChangelogEntryResult {
  /** Generated entry content */
  entry: string

  /** Whether the entry was actually needed */
  noUpdateNeeded: boolean
}

/**
 * Provider interface for generating and updating changelog entries
 */
export interface IChangeLogProvider {
  /**
   * Generate a new changelog entry based on task context
   *
   * @param context - Information about the completed task
   * @param config - Changelog format configuration
   * @returns Promise resolving to the generated entry or no-update signal
   */
  generateEntry(
    context: ChangelogContext,
    config: ChangelogConfig
  ): Promise<ChangelogEntryResult>

  /**
   * Update a changelog file with a new entry
   *
   * @param filePath - Path to the CHANGELOG.md file
   * @param entry - The entry content to insert
   * @returns Promise resolving when update is complete
   */
  updateChangelog(filePath: string, entry: string): Promise<void>

  /**
   * Build the AI prompt for generating a changelog entry
   *
   * @param context - Task context information
   * @param currentContent - Current changelog content
   * @param config - Changelog configuration
   * @returns The generated prompt string
   */
  buildPrompt(
    context: ChangelogContext,
    currentContent: string,
    config: ChangelogConfig
  ): string
}

/**
 * Context for documentation generation (broader than changelog)
 */
export interface DocContext {
  /** Task identifier */
  taskId: string

  /** Task title */
  title: string

  /** Task description */
  description?: string

  /** Task labels/tags */
  labels?: string[]

  /** Task execution output */
  output?: string

  /** Whether the task succeeded */
  success: boolean

  /** Error message if task failed */
  error?: string

  /** File type being updated (README.md, CHANGELOG.md, etc.) */
  fileType?: string
}

/**
 * Result of documentation generation
 */
export interface DocGenerationResult {
  /** Generated content */
  content: string

  /** Whether generation was actually needed */
  noUpdateNeeded: boolean
}

/**
 * Configuration for documentation generation
 */
export interface DocConfig {
  /** Model to use for generation */
  model?: string

  /** CLI tool to use */
  cli?: string

  /** Maximum lines for generated content */
  maxLines?: number

  /** Include task ID in documentation */
  includeTaskId?: boolean
}

/**
 * Provider interface for generating documentation updates (README, custom files)
 */
export interface IDocGenerator {
  /**
   * Generate documentation update for a file
   *
   * @param context - Information about the completed task
   * @param filePath - Path to the file being updated
   * @param currentContent - Current file content
   * @param config - Documentation generation configuration
   * @returns Promise resolving to generated content or no-update signal
   */
  generateDoc(
    context: DocContext,
    filePath: string,
    currentContent: string,
    config: DocConfig
  ): Promise<DocGenerationResult>

  /**
   * Apply documentation update to a file
   *
   * @param filePath - Path to the file being updated
   * @param content - The content to apply
   * @param fileType - Type of file (README.md, etc.)
   * @returns Promise resolving when update is complete
   */
  applyDoc(filePath: string, content: string, fileType: string): Promise<void>

  /**
   * Build the AI prompt for generating documentation
   *
   * @param context - Task context information
   * @param fileType - Type of file being updated
   * @param currentContent - Current file content
   * @param config - Documentation configuration
   * @returns The generated prompt string
   */
  buildPrompt(
    context: DocContext,
    fileType: string,
    currentContent: string,
    config: DocConfig
  ): string
}
