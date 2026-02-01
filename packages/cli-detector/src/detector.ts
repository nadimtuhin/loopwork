import { existsSync, accessSync, constants } from 'fs'
import { execSync } from 'child_process'
import { join, delimiter } from 'path'
import { homedir, platform } from 'os'
import type {
  ICliDetector,
  IBinaryInfo,
  IDetectionOptions,
  IDetectionResult,
  CliType,
  DEFAULT_CLI_PATH_CONFIG,
} from '@loopwork-ai/contracts'

/**
 * Node-based CLI detector that scans PATH and standard locations
 */
export class NodeBasedCliDetector implements ICliDetector {
  private readonly pathConfig = this.getDefaultPathConfig()

  /**
   * Detect all supported CLI binaries
   */
  async detectAll(options?: IDetectionOptions): Promise<IDetectionResult> {
    const cliTypes: CliType[] = ['claude', 'opencode', 'gemini']
    const found = new Map<CliType, IBinaryInfo>()
    const notFound: CliType[] = []

    for (const type of cliTypes) {
      const info = await this.detectOne(type, options)
      if (info) {
        found.set(type, info)
      } else {
        notFound.push(type)
      }
    }

    return {
      found,
      notFound,
      hasAny: found.size > 0,
    }
  }

  /**
   * Detect a specific CLI type
   */
  async detectOne(type: CliType, options?: IDetectionOptions): Promise<IBinaryInfo | null> {
    const opts = this.normalizeOptions(options)

    // 1. Check environment variable
    if (opts.checkEnvironment) {
      const envPath = this.checkEnvironmentVariable(type)
      if (envPath) {
        const info = await this.validateBinary(type, envPath, 'environment')
        if (info) return info
      }
    }

    // 2. Check custom paths
    if (opts.customPaths?.[type]) {
      for (const customPath of opts.customPaths[type]) {
        const info = await this.validateBinary(type, customPath, 'config')
        if (info) return info
      }
    }

    // 3. Search system PATH
    if (opts.searchPath) {
      const pathResult = this.searchSystemPath(type)
      if (pathResult) {
        const info = await this.validateBinary(type, pathResult, 'path')
        if (info) return info
      }
    }

    // 4. Check default/known locations
    if (opts.checkDefaults) {
      const defaultPaths = this.pathConfig.defaultPaths[type]
      for (const defaultPath of defaultPaths) {
        const expandedPath = this.expandPath(defaultPath)
        const info = await this.validateBinary(type, expandedPath, 'default')
        if (info) return info
      }
    }

    return null
  }

  /**
   * Check if a specific CLI type is available
   */
  async isAvailable(type: CliType): Promise<boolean> {
    const info = await this.detectOne(type)
    return info !== null
  }

  /**
   * Get the path for a specific CLI type
   */
  async getPath(type: CliType): Promise<string | null> {
    const info = await this.detectOne(type)
    return info?.path ?? null
  }

  /**
   * Check environment variable for CLI path
   */
  private checkEnvironmentVariable(type: CliType): string | null {
    const envVar = this.pathConfig.envVars[type]
    const envPath = process.env[envVar]
    return envPath || null
  }

  /**
   * Search system PATH for CLI binary
   */
  private searchSystemPath(type: CliType): string | null {
    const pathEnv = process.env.PATH || ''
    const paths = pathEnv.split(delimiter)

    // On Windows, executables can have .exe, .cmd, .bat extensions
    const extensions = platform() === 'win32' ? ['.exe', '.cmd', '.bat', ''] : ['']

    for (const dir of paths) {
      for (const ext of extensions) {
        const candidate = join(dir, type + ext)
        if (this.isExecutable(candidate)) {
          return candidate
        }
      }
    }

    return null
  }

  /**
   * Validate a binary path and return info if valid
   */
  private async validateBinary(
    type: CliType,
    path: string,
    source: IBinaryInfo['source']
  ): Promise<IBinaryInfo | null> {
    if (!this.isExecutable(path)) {
      return null
    }

    const version = await this.getVersion(path)

    return {
      type,
      path,
      version,
      isExecutable: true,
      source,
    }
  }

  /**
   * Check if a file exists and is executable
   */
  private isExecutable(path: string): boolean {
    try {
      // Check file exists
      if (!existsSync(path)) {
        return false
      }

      // Check execute permission
      accessSync(path, constants.X_OK)
      return true
    } catch {
      // Permission denied or file not found
      return false
    }
  }

  /**
   * Get version string from a binary
   */
  private async getVersion(path: string): Promise<string | undefined> {
    try {
      const output = execSync(`"${path}" --version`, {
        encoding: 'utf8',
        timeout: 5000,
        stdio: ['pipe', 'pipe', 'pipe'],
      })
      return output.trim()
    } catch {
      // Version detection failed (binary might not support --version)
      return undefined
    }
  }

  /**
   * Expand ~ and environment variables in paths
   */
  private expandPath(path: string): string {
    if (path.startsWith('~/')) {
      return join(homedir(), path.slice(2))
    }
    return path
  }

  /**
   * Normalize detection options with defaults
   */
  private normalizeOptions(options?: IDetectionOptions): Required<IDetectionOptions> {
    return {
      customPaths: options?.customPaths ?? {},
      checkEnvironment: options?.checkEnvironment ?? true,
      searchPath: options?.searchPath ?? true,
      checkDefaults: options?.checkDefaults ?? true,
    }
  }

  /**
   * Get default path configuration
   */
  private getDefaultPathConfig(): typeof DEFAULT_CLI_PATH_CONFIG {
    return {
      envVars: {
        claude: 'LOOPWORK_CLAUDE_PATH',
        opencode: 'LOOPWORK_OPENCODE_PATH',
        gemini: 'LOOPWORK_GEMINI_PATH',
      },
      defaultPaths: {
        claude: [
          '~/.nvm/versions/node/v20.18.3/bin/claude',
          '~/.nvm/versions/node/v22.13.0/bin/claude',
          '/usr/local/bin/claude',
          '~/.npm/bin/claude',
          '~/.npm-global/bin/claude',
        ],
        opencode: [
          '~/.opencode/bin/opencode',
          '/usr/local/bin/opencode',
        ],
        gemini: [
          '~/.local/bin/gemini',
          '/usr/local/bin/gemini',
        ],
      },
    }
  }
}
