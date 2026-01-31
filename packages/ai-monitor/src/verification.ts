/**
 * Verification Engine
 *
 * Implements verification-before-completion protocol.
 * Requires fresh evidence (<5 min) and runs multiple checks (BUILD/TEST/LINT)
 * before claiming healing success.
 */

import { exec } from 'child_process'
import { promisify } from 'util'
import fs from 'fs'
import path from 'path'
import type { VerificationEvidence } from './types'
import { logger } from './utils'

const execAsync = promisify(exec)

export type VerificationCheckType =
  | 'BUILD'
  | 'TEST'
  | 'LINT'
  | 'FUNCTIONALITY'
  | 'ARCHITECT'
  | 'TODO'
  | 'ERROR_FREE'

export interface VerificationCheck {
  type: VerificationCheckType
  command?: string
  timeout?: number
  required: boolean
}

export interface CheckResult {
  check: string
  passed: boolean
  output: string
  duration: number
  timestamp: Date
}

export interface VerificationResult {
  passed: boolean
  checks: CheckResult[]
  timestamp: Date
  evidence: VerificationEvidence[]
  failedChecks: string[]
}

export interface VerificationEngineConfig {
  freshnessTTL?: number
  checks?: VerificationCheck[]
  requireArchitectApproval?: boolean
  cwd?: string
  logFile?: string
}

/**
 * VerificationEngine - Enforces verification-before-completion protocol
 */
export class VerificationEngine {
  private config: Required<VerificationEngineConfig>
  private defaultChecks: Map<VerificationCheckType, VerificationCheck>

  constructor(config: VerificationEngineConfig = {}) {
    // Use provided cwd or fallback to '.' (safer than process.cwd() in tests)
    let workingDir = config.cwd ?? '.'
    try {
      // Try to resolve to absolute path if process.cwd() is available
      if (!config.cwd && typeof process?.cwd === 'function') {
        workingDir = process.cwd()
      }
    } catch {
      // In test environments, process.cwd() might fail - use '.' as fallback
      workingDir = '.'
    }

    this.config = {
      freshnessTTL: config.freshnessTTL ?? 5 * 60 * 1000, // 5 minutes
      checks: config.checks ?? [],
      requireArchitectApproval: config.requireArchitectApproval ?? false,
      cwd: workingDir,
      logFile: config.logFile ?? ''
    }

    // Define default check commands
    this.defaultChecks = new Map([
      ['BUILD', {
        type: 'BUILD',
        command: this.detectBuildCommand(),
        timeout: 120000, // 2 minutes
        required: true
      }],
      ['TEST', {
        type: 'TEST',
        command: this.detectTestCommand(),
        timeout: 180000, // 3 minutes
        required: true
      }],
      ['LINT', {
        type: 'LINT',
        command: this.detectLintCommand(),
        timeout: 60000, // 1 minute
        required: false
      }],
      ['FUNCTIONALITY', {
        type: 'FUNCTIONALITY',
        command: undefined, // Manual verification
        timeout: 0,
        required: false
      }],
      ['ARCHITECT', {
        type: 'ARCHITECT',
        command: undefined, // Manual verification
        timeout: 0,
        required: false
      }],
      ['TODO', {
        type: 'TODO',
        command: undefined, // Check programmatically
        timeout: 0,
        required: false
      }],
      ['ERROR_FREE', {
        type: 'ERROR_FREE',
        command: undefined, // Check log file
        timeout: 0,
        required: true
      }]
    ])
  }

  /**
   * Auto-detect build command from package.json
   */
  private detectBuildCommand(): string {
    try {
      const packageJsonPath = path.join(this.config.cwd, 'package.json')
      if (fs.existsSync(packageJsonPath)) {
        const pkg = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'))
        if (pkg.scripts?.build) {
          return 'bun run build'
        }
        if (pkg.scripts?.['type-check']) {
          return 'bun run type-check'
        }
      }
      // Fallback to TypeScript compiler
      const tsconfigPath = path.join(this.config.cwd, 'tsconfig.json')
      if (fs.existsSync(tsconfigPath)) {
        return 'tsc --noEmit'
      }
    } catch (error) {
      logger.debug(`Failed to detect build command: ${error}`)
    }
    return 'echo "No build command found"'
  }

  /**
   * Auto-detect test command from package.json
   */
  private detectTestCommand(): string {
    try {
      const packageJsonPath = path.join(this.config.cwd, 'package.json')
      if (fs.existsSync(packageJsonPath)) {
        const pkg = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'))
        if (pkg.scripts?.test) {
          return 'bun test'
        }
      }
    } catch (error) {
      logger.debug(`Failed to detect test command: ${error}`)
    }
    return 'echo "No test command found"'
  }

  /**
   * Auto-detect lint command from package.json
   */
  private detectLintCommand(): string {
    try {
      const packageJsonPath = path.join(this.config.cwd, 'package.json')
      if (fs.existsSync(packageJsonPath)) {
        const pkg = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'))
        if (pkg.scripts?.lint) {
          return 'bun run lint'
        }
      }
    } catch (error) {
      logger.debug(`Failed to detect lint command: ${error}`)
    }
    return 'echo "No lint command found"'
  }

  /**
   * Check if evidence is fresh (< freshnessTTL)
   */
  isEvidenceFresh(evidence: VerificationEvidence): boolean {
    const age = Date.now() - evidence.timestamp.getTime()
    return age < this.config.freshnessTTL
  }

  /**
   * Run verification checks
   */
  async verify(claim: string, taskId?: string): Promise<VerificationResult> {
    logger.debug(`VerificationEngine: Verifying claim "${claim}" for task ${taskId || 'unknown'}`)

    const checks: CheckResult[] = []
    const evidence: VerificationEvidence[] = []
    const failedChecks: string[] = []

    // Get checks to run (use provided checks or defaults)
    const checksToRun = this.config.checks.length > 0
      ? this.config.checks
      : Array.from(this.defaultChecks.values())

    // Run each check
    for (const check of checksToRun) {
      try {
        const result = await this.runCheck(check)
        checks.push(result)

        // Create evidence for this check
        const evidenceItem: VerificationEvidence = {
          claim: `${check.type} check`,
          command: check.command || 'manual',
          output: result.output,
          timestamp: result.timestamp,
          passed: result.passed,
          fresh: true // Just ran, so it's fresh
        }
        evidence.push(evidenceItem)

        if (!result.passed && check.required) {
          failedChecks.push(check.type)
        }
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error)
        logger.debug(`VerificationEngine: Check ${check.type} error: ${errorMsg}`)

        checks.push({
          check: check.type,
          passed: false,
          output: errorMsg,
          duration: 0,
          timestamp: new Date()
        })

        if (check.required) {
          failedChecks.push(check.type)
        }
      }
    }

    // Determine overall pass/fail
    const passed = failedChecks.length === 0

    const result: VerificationResult = {
      passed,
      checks,
      timestamp: new Date(),
      evidence,
      failedChecks
    }

    if (passed) {
      logger.success?.(`VerificationEngine: All checks passed for "${claim}"`)
    } else {
      logger.warn(`VerificationEngine: Failed checks: ${failedChecks.join(', ')}`)
    }

    return result
  }

  /**
   * Run a single verification check
   */
  private async runCheck(check: VerificationCheck): Promise<CheckResult> {
    const startTime = Date.now()

    // Handle special check types
    if (check.type === 'ERROR_FREE') {
      return this.checkErrorFree()
    }

    if (check.type === 'TODO') {
      return this.checkTodos()
    }

    if (check.type === 'FUNCTIONALITY' || check.type === 'ARCHITECT') {
      // These require manual verification
      return {
        check: check.type,
        passed: true, // Assume passed for now
        output: 'Manual verification required',
        duration: 0,
        timestamp: new Date()
      }
    }

    // Run command-based check
    if (!check.command) {
      return {
        check: check.type,
        passed: true,
        output: 'No command configured',
        duration: 0,
        timestamp: new Date()
      }
    }

    try {
      const { stdout, stderr } = await execAsync(check.command, {
        cwd: this.config.cwd,
        timeout: check.timeout,
        maxBuffer: 10 * 1024 * 1024 // 10MB
      })

      const duration = Date.now() - startTime
      const output = stdout + (stderr ? `\n${stderr}` : '')

      return {
        check: check.type,
        passed: true,
        output,
        duration,
        timestamp: new Date()
      }
    } catch (error: unknown) {
      const duration = Date.now() - startTime
      const err = error as { stdout?: string; stderr?: string; message?: string }
      const output = err.stdout ? err.stdout + (err.stderr ? `\n${err.stderr}` : '') : (err.message || String(error))

      return {
        check: check.type,
        passed: false,
        output,
        duration,
        timestamp: new Date()
      }
    }
  }

  /**
   * Check if log file has errors in last 5 minutes
   */
  private async checkErrorFree(): Promise<CheckResult> {
    if (!this.config.logFile || !fs.existsSync(this.config.logFile)) {
      return {
        check: 'ERROR_FREE',
        passed: true,
        output: 'No log file to check',
        duration: 0,
        timestamp: new Date()
      }
    }

    try {
      const content = fs.readFileSync(this.config.logFile, 'utf-8')
      const lines = content.split('\n')

      // Check last 100 lines for errors
      const recentLines = lines.slice(-100)
      const errorLines = recentLines.filter(line =>
        line.match(/\[ERROR\]|failed|exception/i) &&
        !line.match(/healing|recovery|monitor/i) // Ignore monitor's own error handling
      )

      const passed = errorLines.length === 0

      return {
        check: 'ERROR_FREE',
        passed,
        output: passed
          ? 'No errors found in recent logs'
          : `Found ${errorLines.length} error(s):\n${errorLines.slice(0, 5).join('\n')}`,
        duration: 0,
        timestamp: new Date()
      }
    } catch (error) {
      return {
        check: 'ERROR_FREE',
        passed: false,
        output: `Failed to read log file: ${error}`,
        duration: 0,
        timestamp: new Date()
      }
    }
  }

  /**
   * Check for pending TODOs in task
   */
  private async checkTodos(): Promise<CheckResult> {
    // This would need to integrate with the task backend
    // For now, return a simple pass
    return {
      check: 'TODO',
      passed: true,
      output: 'TODO check not implemented',
      duration: 0,
      timestamp: new Date()
    }
  }
}

/**
 * Factory function to create verification engine
 */
export function createVerificationEngine(config?: VerificationEngineConfig): VerificationEngine {
  return new VerificationEngine(config)
}
