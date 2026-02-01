/**
 * CLI Detection Contracts
 *
 * Defines the interface between core and the CLI detector package.
 * Provides abstraction for finding and describing AI CLI binaries.
 */

import type { CliType } from './executor/types'

export type { CliType }

/**
 * Information about a discovered CLI binary
 */
export interface IBinaryInfo {
  /**
   * The CLI type identifier
   */
  type: CliType

  /**
   * Absolute path to the executable
   */
  path: string

  /**
   * Version string if detectable
   */
  version?: string

  /**
   * Whether the binary is accessible and executable
   */
  isExecutable: boolean

  /**
   * Source of the detection (env, config, path, default)
   */
  source: 'environment' | 'config' | 'path' | 'default'
}

/**
 * Options for CLI detection
 */
export interface IDetectionOptions {
  /**
   * Custom paths to check for each CLI type
   * Overrides default detection paths
   */
  customPaths?: Partial<Record<CliType, string[]>>

  /**
   * Whether to check environment variables
   * Default: true
   */
  checkEnvironment?: boolean

  /**
   * Whether to search system PATH
   * Default: true
   */
  searchPath?: boolean

  /**
   * Whether to check default/known locations
   * Default: true
   */
  checkDefaults?: boolean
}

/**
 * Result of a detection operation
 */
export interface IDetectionResult {
  /**
   * Map of detected CLI binaries by type
   */
  found: Map<CliType, IBinaryInfo>

  /**
   * List of CLI types that were not found
   */
  notFound: CliType[]

  /**
   * Whether any CLI was detected
   */
  hasAny: boolean
}

/**
 * Interface for CLI detector implementations
 */
export interface ICliDetector {
  /**
   * Detect all supported CLI binaries
   * @param options Detection options
   * @returns Detection result with found and not-found CLIs
   */
  detectAll(options?: IDetectionOptions): Promise<IDetectionResult>

  /**
   * Detect a specific CLI type
   * @param type The CLI type to detect
   * @param options Detection options
   * @returns Binary info if found, null otherwise
   */
  detectOne(type: CliType, options?: IDetectionOptions): Promise<IBinaryInfo | null>

  /**
   * Check if a specific CLI type is available
   * @param type The CLI type to check
   * @returns True if the CLI is available
   */
  isAvailable(type: CliType): Promise<boolean>

  /**
   * Get the path for a specific CLI type
   * @param type The CLI type
   * @returns Absolute path if available, null otherwise
   */
  getPath(type: CliType): Promise<string | null>
}

/**
 * Configuration for CLI path resolution
 */
export interface ICliPathConfig {
  /**
   * Environment variable names for each CLI type
   */
  envVars: Record<CliType, string>

  /**
   * Default candidate paths for each CLI type
   */
  defaultPaths: Record<CliType, string[]>
}

/**
 * Default CLI path configuration
 */
export const DEFAULT_CLI_PATH_CONFIG: ICliPathConfig = {
  envVars: {
    claude: 'LOOPWORK_CLAUDE_PATH',
    opencode: 'LOOPWORK_OPENCODE_PATH',
    gemini: 'LOOPWORK_GEMINI_PATH',
    droid: 'LOOPWORK_DROID_PATH',
    crush: 'LOOPWORK_CRUSH_PATH',
    kimi: 'LOOPWORK_KIMI_PATH',
    kilocode: 'LOOPWORK_KILOCODE_PATH',
  },
  defaultPaths: {
    claude: [
      '~/.nvm/versions/node/v20.18.3/bin/claude',
      '~/.nvm/versions/node/v22.13.0/bin/claude',
      '/usr/local/bin/claude',
      '~/.npm/bin/claude',
    ],
    opencode: [
      '~/.opencode/bin/opencode',
      '/usr/local/bin/opencode',
    ],
    gemini: [
      '~/.local/bin/gemini',
      '/usr/local/bin/gemini',
    ],
    droid: [
      '~/.npm/bin/droid',
      '~/.npm/bin/factory',
      '/usr/local/bin/droid',
      '/usr/local/bin/factory',
    ],
    crush: [
      '/opt/homebrew/bin/crush',
      '/usr/local/bin/crush',
      '~/.npm/bin/crush',
    ],
    kimi: [
      '~/.local/bin/kimi',
      '/usr/local/bin/kimi',
    ],
    kilocode: [
      '~/.npm/bin/kilocode',
      '/usr/local/bin/kilocode',
    ],
  },
}
