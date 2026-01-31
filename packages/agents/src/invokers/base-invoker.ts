import { spawn } from 'child_process'
import { which } from '../utils/which'
import type { ICliInvoker, CliInvokeOptions, CliInvokeResult } from '../contracts/invoker'

/**
 * Parse model name with optional provider prefix
 * Examples:
 *   "google/gemini-3-flash" → { provider: "google", model: "gemini-3-flash" }
 *   "anthropic/claude-3-sonnet" → { provider: "anthropic", model: "claude-3-sonnet" }
 *   "sonnet" → { provider: undefined, model: "sonnet" }
 */
export interface ParsedModel {
  provider?: string
  model: string
}

export function parseModelName(modelString: string): ParsedModel {
  const slashIndex = modelString.indexOf('/')
  if (slashIndex === -1) {
    return { model: modelString }
  }
  return {
    provider: modelString.slice(0, slashIndex),
    model: modelString.slice(slashIndex + 1),
  }
}

/**
 * Extract just the model name, stripping any provider prefix
 */
export function stripModelPrefix(modelString: string): string {
  return parseModelName(modelString).model
}

export abstract class BaseCliInvoker implements ICliInvoker {
  abstract readonly name: string
  abstract readonly description: string
  abstract readonly command: string

  abstract getSupportedModels(): string[]
  abstract buildArgs(options: CliInvokeOptions): string[]

  async isAvailable(): Promise<boolean> {
    try {
      const path = await which(this.command)
      return !!path
    } catch {
      return false
    }
  }

  async invoke(options: CliInvokeOptions): Promise<CliInvokeResult> {
    const startTime = Date.now()
    const args = this.buildArgs(options)

    return new Promise((resolve) => {
      let output = ''
      let timedOut = false

      const proc = spawn(this.command, args, {
        cwd: options.workDir,
        env: { ...process.env, ...options.env },
        stdio: ['pipe', 'pipe', 'pipe'],
      })

      // Set up timeout
      const timeoutMs = (options.timeout ?? 600) * 1000
      const timer = setTimeout(() => {
        timedOut = true
        proc.kill('SIGTERM')
      }, timeoutMs)

      // Send prompt via stdin
      proc.stdin.write(options.prompt)
      proc.stdin.end()

      // Collect output
      proc.stdout.on('data', (data) => {
        output += data.toString()
      })
      proc.stderr.on('data', (data) => {
        output += data.toString()
      })

      proc.on('close', (code) => {
        clearTimeout(timer)
        resolve({
          exitCode: code ?? 1,
          output,
          durationMs: Date.now() - startTime,
          timedOut,
        })
      })

      proc.on('error', (error) => {
        clearTimeout(timer)
        resolve({
          exitCode: 1,
          output: error.message,
          durationMs: Date.now() - startTime,
          timedOut: false,
        })
      })
    })
  }
}
