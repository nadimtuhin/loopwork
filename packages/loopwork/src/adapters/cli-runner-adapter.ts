/**
 * CLI Runner Adapter
 *
 * Bridges the existing CliExecutor to the ICliRunner interface from @loopwork-ai/agents.
 * This allows the new agent system to use the existing CLI execution infrastructure.
 */

import type { ICliRunner, CliRunOptions, CliRunResult } from '@loopwork-ai/agents'
import type { CliExecutor } from '../core/cli'
import fs from 'fs'
import path from 'path'
import os from 'os'

/** Default timeout in seconds (10 minutes) */
const DEFAULT_TIMEOUT_SECONDS = 600

/**
 * Adapts the existing CliExecutor to the ICliRunner interface
 */
export class CliRunnerAdapter implements ICliRunner {
  constructor(private readonly executor: CliExecutor) {}

  async run(options: CliRunOptions): Promise<CliRunResult> {
    const startTime = Date.now()

    try {
      // Create a temporary output file for the CLI
      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'loopwork-agent-'))
      const outputFile = path.join(tmpDir, 'output.log')

      // Execute using the existing CLI executor infrastructure
      // The executor.execute method handles model selection, retries, and streaming
      const exitCode = await this.executor.execute(
        options.prompt,
        outputFile,
        options.timeout ?? DEFAULT_TIMEOUT_SECONDS,
        undefined, // taskId
        undefined, // workerId
        options.env, // permissions/env
      )

      // Read the output from the log file
      let output = ''
      if (fs.existsSync(outputFile)) {
        output = fs.readFileSync(outputFile, 'utf-8')
      }

      // Clean up the temporary directory
      try {
        fs.rmSync(tmpDir, { recursive: true, force: true })
      } catch {
        // Ignore cleanup errors
      }

      return {
        exitCode,
        output,
        durationMs: Date.now() - startTime,
        timedOut: false,
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      const timedOut = errorMessage.includes('timeout') || errorMessage.includes('Timed out')

      return {
        exitCode: 1,
        output: errorMessage,
        durationMs: Date.now() - startTime,
        timedOut,
      }
    }
  }
}
