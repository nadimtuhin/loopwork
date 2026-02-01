/**
 * AI Monitor - Verification Engine
 *
 * Enforces the verification-before-completion protocol.
 * Ensures healing actions are truly successful by requiring fresh evidence
 * and running multiple verification checks before claiming completion.
 */

import { logger } from '../core/utils'
import { spawn } from 'child_process'
import { promisify } from 'util'
import fs from 'fs'
import path from 'path'

/**
 * Verification check type
 */
export type VerificationCheckType =
  | 'BUILD'
  | 'TEST'
  | 'LINT'
  | 'FUNCTIONALITY'
  | 'ARCHITECT'
  | 'TODO'
  | 'ERROR_FREE'

/**
 * Verification check configuration
 */
export interface VerificationCheck {
  type: VerificationCheckType
  command?: string
  timeout?: number
  required: boolean
}

/**
 * Check result
 */
export interface CheckResult {
  check: string
  passed: boolean
  output: string
  duration: number
  timestamp: Date
}

/**
 * Verification evidence
 */
export interface VerificationEvidence {
  check: VerificationCheckType
  timestamp: Date
  fresh: boolean
  data?: unknown
}

/**
 * Verification result
 */
export interface VerificationResult {
  passed: boolean
  checks: CheckResult[]
  timestamp: Date
  evidence: VerificationEvidence[]
  failedChecks: string[]
}

/**
 * Verification engine configuration
 */
export interface VerificationEngineConfig {
  freshnessTTL?: number
  checks?: VerificationCheck[]
  requireArchitectApproval?: boolean
  cwd?: string
}

/**
 * Default verification checks
 */
const DEFAULT_CHECKS: VerificationCheck[] = [
  { type: 'BUILD', command: 'bun run build', timeout: 120000, required: true },
  { type: 'TEST', command: 'bun test', timeout: 180000, required: true },
  { type: 'LINT', command: 'bun run lint', timeout: 60000, required: false },
  { type: 'ERROR_FREE', timeout: 30000, required: true },
]

/**
 * Default freshness TTL (5 minutes in milliseconds)
 */
const DEFAULT_FRESHNESS_TTL = 300000

/**
 * VerificationEngine - Enforces verification-before-completion protocol
 *
 * This engine ensures healing actions are truly successful by:
 * 1. Requiring fresh evidence (<5 minutes old by default)
 * 2. Running multiple verification checks (BUILD, TEST, LINT, etc.)
 * 3. Only marking healing as successful if all required checks pass
 */
export class VerificationEngine {
  private config: Required<VerificationEngineConfig>
  private evidenceStore: Map<string, VerificationEvidence> = new Map()

  constructor(config: VerificationEngineConfig = {}) {
    this.config = {
      freshnessTTL: config.freshnessTTL ?? DEFAULT_FRESHNESS_TTL,
      checks: config.checks ?? DEFAULT_CHECKS,
      requireArchitectApproval: config.requireArchitectApproval ?? false,
      cwd: config.cwd ?? process.cwd(),
    }
  }

  /**
   * Verify a claim by running all configured checks
   *
   * @param claim - The claim being verified (e.g., "Healing action completed")
   * @param taskId - Optional task ID for context
   * @returns VerificationResult with pass/fail status and evidence
   */
  async verify(claim: string, taskId?: string): Promise<VerificationResult> {
    logger.info(`[VerificationEngine] Starting verification for: ${claim}${taskId ? ` (task: ${taskId})` : ''}`)

    const checks: CheckResult[] = []
    const evidence: VerificationEvidence[] = []
    const failedChecks: string[] = []

    for (const check of this.config.checks) {
      const result = await this.runCheck(check, taskId)
      checks.push(result)

      const checkEvidence: VerificationEvidence = {
        check: check.type,
        timestamp: result.timestamp,
        fresh: true, // Fresh since we just ran it
        data: { passed: result.passed, duration: result.duration },
      }
      evidence.push(checkEvidence)
      this.evidenceStore.set(check.type, checkEvidence)

      if (!result.passed && check.required) {
        failedChecks.push(check.type)
        logger.warn(`[VerificationEngine] Required check failed: ${check.type}`)
      } else if (!result.passed) {
        logger.info(`[VerificationEngine] Optional check failed: ${check.type}`)
      }
    }

    const passed = failedChecks.length === 0

    const result: VerificationResult = {
      passed,
      checks,
      timestamp: new Date(),
      evidence,
      failedChecks,
    }

    if (passed) {
      logger.info(`[VerificationEngine] Verification PASSED for: ${claim}`)
    } else {
      logger.error(`[VerificationEngine] Verification FAILED for: ${claim}. Failed checks: ${failedChecks.join(', ')}`)
    }

    return result
  }

  /**
   * Check if evidence is fresh (within TTL)
   *
   * @param evidence - The evidence to check
   * @returns true if evidence is fresh, false otherwise
   */
  isEvidenceFresh(evidence: VerificationEvidence): boolean {
    const now = Date.now()
    const evidenceAge = now - evidence.timestamp.getTime()
    return evidenceAge < this.config.freshnessTTL
  }

  /**
   * Get stored evidence for a check type
   *
   * @param checkType - The type of check
   * @returns The stored evidence or undefined
   */
  getEvidence(checkType: VerificationCheckType): VerificationEvidence | undefined {
    return this.evidenceStore.get(checkType)
  }

  /**
   * Clear all stored evidence
   */
  clearEvidence(): void {
    this.evidenceStore.clear()
    logger.debug('[VerificationEngine] Evidence store cleared')
  }

  /**
   * Run a single verification check
   *
   * @param check - The check configuration
   * @param taskId - Optional task ID for context
   * @returns CheckResult with pass/fail status
   */
  private async runCheck(check: VerificationCheck, taskId?: string): Promise<CheckResult> {
    const startTime = Date.now()
    logger.debug(`[VerificationEngine] Running check: ${check.type}`)

    try {
      let passed = false
      let output = ''

      switch (check.type) {
        case 'BUILD':
          ;({ passed, output } = await this.runBuildCheck(check))
          break
        case 'TEST':
          ;({ passed, output } = await this.runTestCheck(check))
          break
        case 'LINT':
          ;({ passed, output } = await this.runLintCheck(check))
          break
        case 'FUNCTIONALITY':
          ;({ passed, output } = await this.runFunctionalityCheck(check, taskId))
          break
        case 'ARCHITECT':
          ;({ passed, output } = await this.runArchitectCheck(check))
          break
        case 'TODO':
          ;({ passed, output } = await this.runTodoCheck(check, taskId))
          break
        case 'ERROR_FREE':
          ;({ passed, output } = await this.runErrorFreeCheck(check))
          break
        default:
          output = `Unknown check type: ${check.type}`
          passed = false
      }

      const duration = Date.now() - startTime

      return {
        check: check.type,
        passed,
        output,
        duration,
        timestamp: new Date(),
      }
    } catch (error) {
      const duration = Date.now() - startTime
      const errorMessage = error instanceof Error ? error.message : String(error)

      logger.error(`[VerificationEngine] Check ${check.type} threw error: ${errorMessage}`)

      return {
        check: check.type,
        passed: false,
        output: `Error: ${errorMessage}`,
        duration,
        timestamp: new Date(),
      }
    }
  }

  /**
   * Run BUILD check
   */
  private async runBuildCheck(check: VerificationCheck): Promise<{ passed: boolean; output: string }> {
    const command = check.command || 'bun run build'
    return this.runCommand(command, check.timeout || 120000)
  }

  /**
   * Run TEST check
   */
  private async runTestCheck(check: VerificationCheck): Promise<{ passed: boolean; output: string }> {
    const command = check.command || 'bun test'
    return this.runCommand(command, check.timeout || 180000)
  }

  /**
   * Run LINT check
   */
  private async runLintCheck(check: VerificationCheck): Promise<{ passed: boolean; output: string }> {
    const command = check.command || 'bun run lint'
    const result = await this.runCommand(command, check.timeout || 60000)

    // If lint command doesn't exist, consider it a pass (optional check)
    if (result.output.includes('command not found') || result.output.includes('error: Script not found')) {
      logger.info('[VerificationEngine] No lint script found, skipping lint check')
      return { passed: true, output: 'No lint script configured' }
    }

    return result
  }

  /**
   * Run FUNCTIONALITY check
   */
  private async runFunctionalityCheck(
    check: VerificationCheck,
    taskId?: string
  ): Promise<{ passed: boolean; output: string }> {
    // Functionality check verifies the feature works as expected
    // This can be customized via command or uses default verification
    if (check.command) {
      return this.runCommand(check.command, check.timeout || 60000)
    }

    // Default: verify the task has a PRD and it's not empty
    if (taskId) {
      const prdPath = path.join(this.config.cwd, '.specs', 'tasks', `${taskId}.md`)
      try {
        const content = await fs.promises.readFile(prdPath, 'utf-8')
        const hasRequirements = content.includes('## Requirements') || content.includes('## Goal')
        return {
          passed: hasRequirements,
          output: hasRequirements ? 'PRD has requirements section' : 'PRD missing requirements section',
        }
      } catch {
        return { passed: false, output: `PRD not found for task ${taskId}` }
      }
    }

    return { passed: true, output: 'No task ID provided, functionality check skipped' }
  }

  /**
   * Run ARCHITECT check
   */
  private async runArchitectCheck(check: VerificationCheck): Promise<{ passed: boolean; output: string }> {
    // Architect approval check
    // In a real implementation, this might call an architect model
    // For now, we check if there are any obvious architectural issues

    if (!this.config.requireArchitectApproval) {
      return { passed: true, output: 'Architect approval not required' }
    }

    // Check for common architectural issues
    const issues: string[] = []

    // Check for circular dependencies (simplified check)
    try {
      const srcDir = path.join(this.config.cwd, 'src')
      if (fs.existsSync(srcDir)) {
        // This is a placeholder for actual circular dependency detection
        issues.push('Circular dependency check not implemented')
      }
    } catch {
      // Ignore errors
    }

    if (issues.length > 0) {
      return { passed: false, output: `Architectural issues found: ${issues.join(', ')}` }
    }

    return { passed: true, output: 'No obvious architectural issues detected' }
  }

  /**
   * Run TODO check
   */
  private async runTodoCheck(check: VerificationCheck, taskId?: string): Promise<{ passed: boolean; output: string }> {
    // Check for pending TODOs in the task or codebase
    const todos: string[] = []

    if (taskId) {
      const prdPath = path.join(this.config.cwd, '.specs', 'tasks', `${taskId}.md`)
      try {
        const content = await fs.promises.readFile(prdPath, 'utf-8')
        const todoMatches = content.match(/TODO[\s:].*/gi) || []
        todos.push(...todoMatches)
      } catch {
        // PRD not found
      }
    }

    // Also check for TODO comments in source files (last 5 minutes of changes)
    try {
      const srcDir = path.join(this.config.cwd, 'src')
      if (fs.existsSync(srcDir)) {
        // This is a simplified check - in production, you'd want to scan modified files
        const todoFiles = await this.findFilesWithPattern(srcDir, /TODO[\s:].*/g)
        todos.push(...todoFiles.map(f => `Found TODO in ${f}`))
      }
    } catch {
      // Ignore errors
    }

    if (todos.length > 0) {
      return {
        passed: false,
        output: `Pending TODOs found: ${todos.slice(0, 5).join(', ')}${todos.length > 5 ? ` and ${todos.length - 5} more` : ''}`,
      }
    }

    return { passed: true, output: 'No pending TODOs found' }
  }

  /**
   * Run ERROR_FREE check
   */
  private async runErrorFreeCheck(check: VerificationCheck): Promise<{ passed: boolean; output: string }> {
    // Check logs for errors in the last 5 minutes
    const logPaths = [
      path.join(this.config.cwd, '.loopwork', 'logs', 'error.log'),
      path.join(this.config.cwd, 'error.log'),
    ]

    const errors: string[] = []
    const fiveMinutesAgo = Date.now() - 5 * 60 * 1000

    for (const logPath of logPaths) {
      try {
        if (fs.existsSync(logPath)) {
          const stats = await fs.promises.stat(logPath)
          if (stats.mtime.getTime() > fiveMinutesAgo) {
            const content = await fs.promises.readFile(logPath, 'utf-8')
            const errorLines = content
              .split('\n')
              .filter(line => line.toLowerCase().includes('error') || line.toLowerCase().includes('fatal'))
              .slice(-10) // Last 10 errors
            errors.push(...errorLines)
          }
        }
      } catch {
        // Ignore errors reading logs
      }
    }

    if (errors.length > 0) {
      return {
        passed: false,
        output: `Recent errors found: ${errors.slice(0, 3).join('; ')}${errors.length > 3 ? ` and ${errors.length - 3} more` : ''}`,
      }
    }

    return { passed: true, output: 'No recent errors found in logs' }
  }

  /**
   * Run a shell command with timeout
   */
  private async runCommand(command: string, timeout: number): Promise<{ passed: boolean; output: string }> {
    return new Promise((resolve) => {
      const parts = command.split(' ')
      const cmd = parts[0]
      const args = parts.slice(1)

      logger.debug(`[VerificationEngine] Running command: ${command}`)

      const child = spawn(cmd, args, {
        cwd: this.config.cwd,
        shell: true,
        env: { ...process.env, CI: 'true' }, // CI mode for consistent output
      })

      let stdout = ''
      let stderr = ''
      let timedOut = false

      const timeoutId = setTimeout(() => {
        timedOut = true
        child.kill('SIGTERM')
        // Force kill after 5 seconds if still running
        setTimeout(() => {
          if (!child.killed) {
            child.kill('SIGKILL')
          }
        }, 5000)
      }, timeout)

      child.stdout?.on('data', (data) => {
        stdout += data.toString()
      })

      child.stderr?.on('data', (data) => {
        stderr += data.toString()
      })

      child.on('close', (code) => {
        clearTimeout(timeoutId)

        const output = stdout + stderr

        if (timedOut) {
          resolve({ passed: false, output: `Command timed out after ${timeout}ms` })
          return
        }

        // Command succeeded if exit code is 0
        resolve({ passed: code === 0, output: output.trim() || `Exit code: ${code}` })
      })

      child.on('error', (error) => {
        clearTimeout(timeoutId)
        resolve({ passed: false, output: `Failed to run command: ${error.message}` })
      })
    })
  }

  /**
   * Find files containing a pattern
   */
  private async findFilesWithPattern(dir: string, pattern: RegExp): Promise<string[]> {
    const results: string[] = []

    try {
      const entries = await fs.promises.readdir(dir, { withFileTypes: true })

      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name)

        if (entry.isDirectory() && entry.name !== 'node_modules' && !entry.name.startsWith('.')) {
          const subResults = await this.findFilesWithPattern(fullPath, pattern)
          results.push(...subResults)
        } else if (entry.isFile() && (entry.name.endsWith('.ts') || entry.name.endsWith('.js'))) {
          try {
            const content = await fs.promises.readFile(fullPath, 'utf-8')
            if (pattern.test(content)) {
              results.push(fullPath)
            }
          } catch {
            // Ignore file read errors
          }
        }
      }
    } catch {
      // Ignore directory read errors
    }

    return results
  }
}

/**
 * Create a verification engine instance
 */
export function createVerificationEngine(config?: VerificationEngineConfig): VerificationEngine {
  return new VerificationEngine(config)
}
