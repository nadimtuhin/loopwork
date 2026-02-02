import type { IRunnerAdapter, RunnerRunOptions, RunnerRunResult, ICliExecutor } from '@loopwork-ai/contracts'
import fs from 'fs'
import path from 'path'
import os from 'os'

const DEFAULT_TIMEOUT_SECONDS = 600

/**
 * Adapter that bridges ICliExecutor to IRunnerAdapter
 */
export class CliAdapter implements IRunnerAdapter {
  constructor(private readonly executor: ICliExecutor) {}

  /**
   * Run a prompt through the CLI executor
   */
  async run(options: RunnerRunOptions): Promise<RunnerRunResult> {
    const startTime = Date.now()

    try {
      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'loopwork-adapter-'))
      const outputFile = path.join(tmpDir, 'output.log')

      const exitCode = await this.executor.execute(
        options.prompt,
        outputFile,
        options.timeout ?? DEFAULT_TIMEOUT_SECONDS,
        {
          permissions: options.env,
        }
      )

      let output = ''
      if (fs.existsSync(outputFile)) {
        output = fs.readFileSync(outputFile, 'utf-8')
      }

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
