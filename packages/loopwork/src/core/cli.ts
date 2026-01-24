import { spawn, spawnSync, ChildProcess } from 'child_process'
import fs from 'fs'
import path from 'path'
import { logger, StreamLogger } from './utils'
import type { Config } from './config'

export interface CliConfig {
  name: string
  displayName?: string
  cli: 'opencode' | 'claude'
  model: string
}

// Default model pools
export const EXEC_MODELS: CliConfig[] = [
  { name: 'sonnet-claude', displayName: 'claude', cli: 'claude', model: 'sonnet' },
  { name: 'sonnet-opencode', displayName: 'sonnet', cli: 'opencode', model: 'google/antigravity-claude-sonnet-4-5' },
  { name: 'gemini-3-flash', displayName: 'gemini-flash', cli: 'opencode', model: 'google/antigravity-gemini-3-flash' },
]

export const FALLBACK_MODELS: CliConfig[] = [
  { name: 'opus-claude', displayName: 'opus', cli: 'claude', model: 'opus' },
  { name: 'gemini-3-pro', displayName: 'gemini-pro', cli: 'opencode', model: 'google/antigravity-gemini-3-pro' },
]

export class CliExecutor {
  private cliPaths: Map<string, string> = new Map()
  private currentSubprocess: ChildProcess | null = null
  private execIndex = 0
  private fallbackIndex = 0
  private useFallback = false

  constructor(private config: Config) {
    this.detectClis()
  }

  private detectClis(): void {
    const home = process.env.HOME || ''
    const candidates: Record<string, string[]> = {
      opencode: [`${home}/.opencode/bin/opencode`, '/usr/local/bin/opencode'],
      claude: [
        `${home}/.nvm/versions/node/v20.18.3/bin/claude`,
        `${home}/.nvm/versions/node/v22.13.0/bin/claude`,
        '/usr/local/bin/claude',
        `${home}/.npm/bin/claude`,
      ],
    }

    for (const [cli, paths] of Object.entries(candidates)) {
      // Try PATH first
      const whichResult = spawnSync('which', [cli], { encoding: 'utf-8' })
      if (whichResult.status === 0 && whichResult.stdout?.trim()) {
        this.cliPaths.set(cli, whichResult.stdout.trim())
        continue
      }

      // Try known paths
      for (const p of paths) {
        if (fs.existsSync(p)) {
          this.cliPaths.set(cli, p)
          break
        }
      }
    }

    if (this.cliPaths.size === 0) {
      throw new Error("No AI CLI found. Install 'opencode' or 'claude'.")
    }

    logger.info(`Available CLIs: ${Array.from(this.cliPaths.keys()).join(', ')}`)
  }

  getNextCliConfig(): CliConfig {
    if (this.useFallback) {
      const config = FALLBACK_MODELS[this.fallbackIndex % FALLBACK_MODELS.length]
      this.fallbackIndex++
      return config
    }
    const config = EXEC_MODELS[this.execIndex % EXEC_MODELS.length]
    this.execIndex++
    return config
  }

  switchToFallback(): void {
    if (!this.useFallback) {
      this.useFallback = true
      logger.warn('Switching to fallback models')
    }
  }

  resetFallback(): void {
    this.useFallback = false
  }

  killCurrent(): void {
    if (this.currentSubprocess) {
      this.currentSubprocess.kill('SIGTERM')
      this.currentSubprocess = null
    }
  }

  async execute(
    prompt: string,
    outputFile: string,
    timeoutSecs: number
  ): Promise<number> {
    const promptFile = path.join(path.dirname(outputFile), 'current-prompt.md')
    fs.writeFileSync(promptFile, prompt)

    const maxAttempts = EXEC_MODELS.length + FALLBACK_MODELS.length

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      const cliConfig = this.getNextCliConfig()
      const displayName = cliConfig.displayName || cliConfig.name
      const cliPath = this.cliPaths.get(cliConfig.cli)

      if (!cliPath) {
        logger.debug(`CLI ${cliConfig.cli} not available, skipping`)
        continue
      }

      const env = { ...process.env }
      let args: string[]

      if (cliConfig.cli === 'opencode') {
        env['OPENCODE_PERMISSION'] = '{"*":"allow"}'
        args = ['run', '--model', cliConfig.model, prompt]
      } else {
        args = ['-p', '--dangerously-skip-permissions', '--model', cliConfig.model]
      }

      // Show command being executed
      const cmdDisplay = cliConfig.cli === 'opencode'
        ? `opencode run --model ${cliConfig.model} "<prompt>"`
        : `claude -p --dangerously-skip-permissions --model ${cliConfig.model}`

      logger.info(`[${displayName}] Executing: ${cmdDisplay}`)
      logger.info(`[${displayName}] Timeout: ${timeoutSecs}s`)
      logger.info(`[${displayName}] Log file: ${outputFile}`)
      logger.info('─────────────────────────────────────')
      logger.info('📝 Streaming CLI output below...')
      logger.info('─────────────────────────────────────')

      const result = await this.spawnWithTimeout(
        cliPath,
        args,
        {
          env,
          input: cliConfig.cli === 'claude' ? prompt : undefined,
          prefix: displayName,
        },
        outputFile,
        timeoutSecs
      )

      if (result.timedOut) {
        logger.error(`Timed out with ${displayName}`)
        continue
      }

      // Check for rate limits
      const output = fs.existsSync(outputFile)
        ? fs.readFileSync(outputFile, 'utf-8').slice(-2000)
        : ''

      if (/rate.*limit|too.*many.*request|429|RESOURCE_EXHAUSTED/i.test(output)) {
        logger.warn(`Rate limited on ${displayName}, waiting 30s...`)
        await new Promise(r => setTimeout(r, 30000))
        continue
      }

      if (/quota.*exceed|billing.*limit/i.test(output)) {
        logger.warn(`Quota exhausted for ${displayName}`)
        this.switchToFallback()
        continue
      }

      if (result.exitCode === 0) {
        return 0
      }

      // Non-zero exit, try next
      if (attempt >= EXEC_MODELS.length - 1 && !this.useFallback) {
        this.switchToFallback()
      }
    }

    logger.error('All CLI configurations failed')
    return 1
  }

  private spawnWithTimeout(
    command: string,
    args: string[],
    options: { env?: NodeJS.ProcessEnv; input?: string; prefix?: string },
    outputFile: string,
    timeoutSecs: number
  ): Promise<{ exitCode: number; timedOut: boolean }> {
    return new Promise((resolve) => {
      const writeStream = fs.createWriteStream(outputFile)
      let timedOut = false
      const startTime = Date.now()
      const streamLogger = new StreamLogger(options.prefix)

      const child = spawn(command, args, {
        env: options.env,
        stdio: ['pipe', 'pipe', 'pipe'],
      })

      this.currentSubprocess = child

      // Progress logging every second
      const progressInterval = setInterval(() => {
        const elapsed = Math.floor((Date.now() - startTime) / 1000)
        const remaining = Math.max(0, timeoutSecs - elapsed)

        logger.update(`⏱️  Running for ${elapsed}s (timeout in ${remaining}s)`)
      }, 1000)

      child.stdout?.on('data', (data) => {
        writeStream.write(data)
        streamLogger.log(data)
      })

      child.stderr?.on('data', (data) => {
        writeStream.write(data)
        streamLogger.log(data)
      })

      if (child.stdin) {
        if (options.input) {
          child.stdin.write(options.input)
        }
        child.stdin.end()
      }

      const timer = setTimeout(() => {
        timedOut = true
        child.kill('SIGTERM')
        setTimeout(() => child.kill('SIGKILL'), 5000)
      }, timeoutSecs * 1000)

      child.on('close', (code) => {
        clearInterval(progressInterval)
        clearTimeout(timer)
        streamLogger.flush()
        writeStream.end()
        this.currentSubprocess = null
        const totalTime = Math.floor((Date.now() - startTime) / 1000)
        const minutes = Math.floor(totalTime / 60)
        const seconds = totalTime % 60
        const timeStr = minutes > 0 ? `${minutes}m ${seconds}s` : `${seconds}s`

        // Get final file size
        let finalSize = 'N/A'
        try {
          if (fs.existsSync(outputFile)) {
            const stats = fs.statSync(outputFile)
            const sizeKB = (stats.size / 1024).toFixed(1)
            finalSize = `${sizeKB} KB`
          }
        } catch {}

        logger.info('─────────────────────────────────────')
        logger.info(`✓ CLI execution completed in ${timeStr}`)
        logger.info(`Exit code: ${code ?? 1}`)
        logger.info(`Output size: ${finalSize}`)
        logger.info(`Log file: ${outputFile}`)
        logger.info('─────────────────────────────────────')
        resolve({ exitCode: code ?? 1, timedOut })
      })

      child.on('error', (err) => {
        clearInterval(progressInterval)
        clearTimeout(timer)
        streamLogger.flush()
        writeStream.end()
        this.currentSubprocess = null
        logger.error(`Spawn error: ${err.message}`)
        resolve({ exitCode: 1, timedOut: false })
      })
    })
  }
}
